"""The raw postings backlog in Supabase: push the files up, pull them back, verify the round trip.

usage: python -m pipeline.backlog push   [--roles product|mba|all] [--only SLUG ...] [--workers N] [--no-snapshot]
       python -m pipeline.backlog pull   [--roles ...] [--only SLUG ...] [--out DIR] [--force]
       python -m pipeline.backlog verify [--roles ...]
       python -m pipeline.backlog snapshot [--roles ...]
       python -m pipeline.backlog status [--roles ...]

data/raw/jobs/ and data/raw/jobs_mba/ are not in git: together they pass 350 MB and a refresh rewrites every
file. The database of the GradBuddy Supabase project is the store. One `backlog_files` row per employer file
(its top-level keys except "jobs", in file order), one `postings` row per posting: typed columns for queries,
the posting itself in `doc` (json, key order kept) with its description in its own compressed column. `pull`
writes a file byte for byte as `pipeline.scrape` wrote it, and `verify` proves it. The scrape pushes each
file as it writes it, so an interrupted run has already saved what it fetched.

Nothing here deletes a posting. `push` refuses a file that lacks a posting the database holds for that
employer; `pull` refuses to overwrite a local file that holds a posting the database lacks (--force takes
the database's version). Each `push` and each full scrape also puts the gzipped files in the `backlog`
storage bucket under <role set>/<date>/ and keeps the newest four dates.

.env: SUPABASE_DB_URL (the session-pooler connection string of the project), SUPABASE_SERVICE_ROLE_KEY (for
the storage snapshots), SUPABASE_URL (default: the GradBuddy project).
"""
import argparse
import datetime
import gzip
import io
import json
import os
import re
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.env import load_env

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROLE_DIRS = {"product": "jobs", "mba": "jobs_mba"}
DEFAULT_URL = "https://joanndudsiqrfoemwogm.supabase.co"
BUCKET = "backlog"
KEEP_SNAPSHOTS = 4
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
COLS = ["role_set", "slug", "key", "pos", "company", "title", "url", "location", "posted", "external_id", "ats",
        "employer_group", "investor", "category", "first_seen", "last_seen", "closed", "description", "doc"]
_lock = threading.Lock()


def configured():
    load_env()
    return bool(os.environ.get("SUPABASE_DB_URL"))


def connect():
    load_env()
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("SUPABASE_DB_URL is not set: put the project's session-pooler connection string in .env")
    import psycopg  # installed with: .venv/bin/pip install "psycopg[binary]"
    return psycopg.connect(url, connect_timeout=30)


def raw_dir(role_set):
    return os.path.join(ROOT, "data", "raw", ROLE_DIRS[role_set])


def role_sets(arg):
    return list(ROLE_DIRS) if arg == "all" else [arg]


def key_of(j):
    return j.get("url") or j.get("external_id")


def date_or_none(v):
    return v if isinstance(v, str) and DATE.match(v) else None


def rows_of(blob, role_set, slug):
    """The postings rows of a file: typed columns for queries, the posting whole in doc (description set apart)."""
    out = []
    for pos, j in enumerate(blob["jobs"]):
        doc = dict(j)
        if "description" in doc:
            doc["description"] = None
        out.append((role_set, slug, key_of(j), pos, j.get("company"), j.get("title"), j.get("url"), j.get("location"),
                    j.get("posted"), j.get("external_id"), j.get("ats"), j.get("group"), j.get("investor"),
                    j.get("category"), date_or_none(j.get("first_seen")), date_or_none(j.get("last_seen")),
                    date_or_none(j.get("closed")), j.get("description"), json.dumps(doc)))
    return out


def file_row(blob, role_set, slug):
    keys = list(blob)
    meta = {k: v for k, v in blob.items() if k != "jobs"}
    return (role_set, slug, blob["company"], blob.get("scraped_at"), json.dumps(meta), keys.index("jobs"), len(blob["jobs"]))


def rebuild(meta, jobs_pos, jobs):
    """The file as the scrape wrote it: meta's keys in order, jobs where they sat."""
    out = {}
    for i, (k, v) in enumerate(meta.items()):
        if i == jobs_pos:
            out["jobs"] = jobs
        out[k] = v
    if "jobs" not in out:
        out["jobs"] = jobs
    return out


def push_file(path, role_set, conn=None):
    """One file into the database. Returns (slug, n_postings, note). Never deletes: a file that lacks a posting
    the database holds for that employer is refused."""
    slug = os.path.basename(path)[:-5]
    with open(path) as f:
        blob = json.load(f)
    rows = rows_of(blob, role_set, slug)
    own = conn is None
    if own:
        conn = connect()
    try:
        with conn.transaction():
            cur = conn.cursor()
            cur.execute("create temp table t_in (like public.postings including defaults) on commit drop")
            with cur.copy(f"copy t_in ({', '.join(COLS)}) from stdin") as copy:
                for r in rows:
                    copy.write_row(r)
            cur.execute("select count(*) from public.postings p where p.role_set = %s and p.slug = %s "
                        "and not exists (select 1 from t_in where t_in.key = p.key)", (role_set, slug))
            missing = cur.fetchone()[0]
            if missing:
                raise ValueError(f"refused: the database holds {missing} posting(s) for {slug} that the file lacks")
            cur.execute("insert into public.backlog_files (role_set, slug, company, scraped_at, meta, jobs_pos, n_jobs) "
                        "values (%s, %s, %s, %s, %s, %s, %s) on conflict (role_set, slug) do update set "
                        "company = excluded.company, scraped_at = excluded.scraped_at, meta = excluded.meta, "
                        "jobs_pos = excluded.jobs_pos, n_jobs = excluded.n_jobs, pushed_at = now()",
                        file_row(blob, role_set, slug))
            sets = ", ".join(f"{c} = excluded.{c}" for c in COLS if c not in ("role_set", "slug", "key"))
            cur.execute(f"insert into public.postings ({', '.join(COLS)}) select {', '.join(COLS)} from t_in "
                        f"on conflict (role_set, slug, key) do update set {sets}, pushed_at = now()")
    finally:
        if own:
            conn.close()
    return slug, len(rows), ""


def push_file_safely(path, role_set):
    """For pipeline.scrape: one file, one connection, serialised, never raising."""
    with _lock:
        try:
            slug, n, _ = push_file(path, role_set)
            return f"[db] {slug}: {n} postings saved"
        except Exception as e:  # the file on disk is the backlog; the database catches up on the next push
            return f"[db] {os.path.basename(path)}: not saved ({type(e).__name__}: {e})"


def push(role_set, slugs=None, workers=4):
    paths = sorted(p for p in os.listdir(raw_dir(role_set)) if p.endswith(".json"))
    if slugs:
        paths = [p for p in paths if p[:-5] in slugs]
    t0 = time.time()
    done, refused = 0, []

    def one(name):
        conn = connect()
        try:
            return push_file(os.path.join(raw_dir(role_set), name), role_set, conn)
        except ValueError as e:
            return name[:-5], 0, str(e)
        finally:
            conn.close()

    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, (slug, n, note) in enumerate(ex.map(one, paths), 1):
            if note:
                refused.append((slug, note))
                print(f"[skip] {slug}: {note}", flush=True)
            else:
                done += 1
            if i % 100 == 0 or i == len(paths):
                print(f"  {i}/{len(paths)} files, {time.time()-t0:.0f}s", flush=True)
    print(f"push {role_set}: {done} files saved, {len(refused)} refused, {time.time()-t0:.0f}s")
    return refused


def pull(role_set, out_dir=None, slugs=None, force=False):
    """Write the files from the database. Returns (written, skipped). A local file that holds a posting the
    database lacks is kept unless force."""
    out_dir = out_dir or raw_dir(role_set)
    os.makedirs(out_dir, exist_ok=True)
    written, skipped = 0, []
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("select slug, meta::text, jobs_pos, n_jobs from public.backlog_files where role_set = %s order by slug", (role_set,))
        files = cur.fetchall()
        for slug, meta, jobs_pos, n_jobs in files:
            if slugs and slug not in slugs:
                continue
            cur.execute("select doc::text, description from public.postings where role_set = %s and slug = %s order by pos", (role_set, slug))
            jobs = []
            for doc, desc in cur.fetchall():
                j = json.loads(doc)
                if "description" in j:
                    j["description"] = desc
                jobs.append(j)
            if len(jobs) != n_jobs:
                raise RuntimeError(f"{slug}: {len(jobs)} postings in the database, header says {n_jobs}")
            path = os.path.join(out_dir, slug + ".json")
            if os.path.exists(path) and not force:
                with open(path) as f:
                    local = json.load(f)
                have = {key_of(j) for j in jobs}
                extra = [key_of(j) for j in local.get("jobs", []) if key_of(j) not in have]
                if extra:
                    skipped.append((slug, len(extra)))
                    print(f"[keep] {slug}: the local file has {len(extra)} posting(s) the database lacks; push it first", flush=True)
                    continue
            with open(path + ".tmp", "w") as f:
                json.dump(rebuild(json.loads(meta), jobs_pos, jobs), f)
            os.replace(path + ".tmp", path)
            written += 1
    print(f"pull {role_set}: {written} files written to {os.path.relpath(out_dir, ROOT)}, {len(skipped)} kept as they were")
    return written, skipped


def verify(role_set):
    """Pull into a scratch directory and compare with the local files, byte for byte."""
    tmp = tempfile.mkdtemp(prefix=f"backlog_{role_set}_")
    pull(role_set, out_dir=tmp, force=True)
    local = {p for p in os.listdir(raw_dir(role_set)) if p.endswith(".json")}
    pulled = {p for p in os.listdir(tmp) if p.endswith(".json")}
    same, as_json, differ = 0, [], []
    for name in sorted(local & pulled):
        a = open(os.path.join(raw_dir(role_set), name), "rb").read()
        b = open(os.path.join(tmp, name), "rb").read()
        if a == b:
            same += 1
        elif json.loads(a) == json.loads(b):
            as_json.append(name)
        else:
            differ.append(name)
    only_local, only_db = sorted(local - pulled), sorted(pulled - local)
    print(f"verify {role_set}: {same} files identical, {len(as_json)} equal as JSON but not byte for byte, "
          f"{len(differ)} differ, {len(only_local)} only local, {len(only_db)} only in the database")
    for name in as_json[:10]:
        print(f"  json-equal {name}")
    for name in differ[:10]:
        print(f"  DIFFERS    {name}")
    for name in only_local[:10]:
        print(f"  not pushed {name}")
    for name in only_db[:10]:
        print(f"  not local  {name}")
    ok = not differ and not only_local
    return ok


# --- storage snapshots -------------------------------------------------------------------------------------

def storage():
    load_env()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        return None
    import requests
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {key}", "apikey": key})
    return s, os.environ.get("SUPABASE_URL", DEFAULT_URL).rstrip("/") + "/storage/v1"


def snapshot(role_set, date=None):
    """Gzip every file of the role set into the bucket under <role_set>/<date>/ and keep the newest dates."""
    st = storage()
    if not st:
        print("[snapshot] SUPABASE_SERVICE_ROLE_KEY is not set; no storage snapshot", flush=True)
        return False
    s, base = st
    date = date or datetime.date.today().isoformat()
    names = sorted(p for p in os.listdir(raw_dir(role_set)) if p.endswith(".json"))
    t0, n_bytes = time.time(), 0
    for i, name in enumerate(names, 1):
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz, open(os.path.join(raw_dir(role_set), name), "rb") as f:
            gz.write(f.read())
        data = buf.getvalue()
        n_bytes += len(data)
        r = s.post(f"{base}/object/{BUCKET}/{role_set}/{date}/{name}.gz", data=data,
                   headers={"Content-Type": "application/gzip", "x-upsert": "true"}, timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"snapshot {name}: HTTP {r.status_code} {r.text[:200]}")
        if i % 200 == 0:
            print(f"  snapshot {i}/{len(names)}", flush=True)
    print(f"snapshot {role_set}/{date}: {len(names)} files, {n_bytes/1e6:.0f} MB gzipped, {time.time()-t0:.0f}s", flush=True)
    prune(role_set, s, base)
    return True


def list_objects(s, base, prefix, limit=10000):
    r = s.post(f"{base}/object/list/{BUCKET}", json={"prefix": prefix, "limit": limit, "offset": 0,
                                                     "sortBy": {"column": "name", "order": "asc"}}, timeout=60)
    r.raise_for_status()
    return r.json()


def prune(role_set, s, base):
    dates = sorted(e["name"] for e in list_objects(s, base, f"{role_set}/") if DATE.match(e["name"]))
    for old in dates[:-KEEP_SNAPSHOTS]:
        paths = [f"{role_set}/{old}/{e['name']}" for e in list_objects(s, base, f"{role_set}/{old}/")]
        for i in range(0, len(paths), 500):
            r = s.delete(f"{base}/object/{BUCKET}", json={"prefixes": paths[i:i + 500]}, timeout=120)
            r.raise_for_status()
        print(f"  pruned snapshot {role_set}/{old} ({len(paths)} files)", flush=True)


def status(role_set):
    with connect() as conn:
        cur = conn.cursor()
        cur.execute("select count(*), coalesce(sum(n_jobs), 0), max(pushed_at) from public.backlog_files where role_set = %s", (role_set,))
        n_files, n_jobs, last = cur.fetchone()
        cur.execute("select count(*) filter (where closed is null) from public.postings where role_set = %s", (role_set,))
        n_open = cur.fetchone()[0]
        cur.execute("select pg_size_pretty(pg_total_relation_size('public.postings')), pg_size_pretty(pg_database_size(current_database()))")
        size, db = cur.fetchone()
    local = [p for p in os.listdir(raw_dir(role_set)) if p.endswith(".json")] if os.path.isdir(raw_dir(role_set)) else []
    print(f"{role_set}: database {n_files} files, {n_jobs} postings ({n_open} open), last push {last}; "
          f"local {len(local)} files; postings table {size}, database {db}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("command", choices=["push", "pull", "verify", "snapshot", "status"])
    ap.add_argument("--roles", choices=["product", "mba", "all"], default="all")
    ap.add_argument("--only", nargs="*", help="file names without .json")
    ap.add_argument("--out", help="pull: write here instead of data/raw/<dir>")
    ap.add_argument("--force", action="store_true", help="pull: overwrite local files even when they hold postings the database lacks")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--no-snapshot", action="store_true", help="push: rows only, no storage snapshot")
    a = ap.parse_args()
    ok = True
    for rs in role_sets(a.roles):
        if a.command == "push":
            refused = push(rs, a.only, a.workers)
            ok = ok and not refused
            if not a.no_snapshot and not a.only:
                snapshot(rs)
        elif a.command == "pull":
            pull(rs, a.out, a.only, a.force)
        elif a.command == "verify":
            ok = verify(rs) and ok
        elif a.command == "snapshot":
            snapshot(rs)
        else:
            status(rs)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
