"""One store for what git ignores: the sample resumes, the model caches and the run logs, in one private bucket.

usage: python -m pipeline.store push <store> [--only PATH]
       python -m pipeline.store pull <store> [--only PATH]
       python -m pipeline.store status [<store>]
       python -m pipeline.store bootstrap

A store is a named prefix of the `atlas-store` bucket with one or more local roots (STORES):

    evals    evals/resumes/external/ (the published sample resumes the calibration reads; several were fetched by
             hand and carry terms, so the copies are private and never served) and evals/resumes/private/ (real
             resumes kept private)
    caches   data/experiments/, except scratch/ and _trash/: the model answers that cost money to regenerate
             (pipeline.depth_gen and pipeline.build_steps in depth/, pipeline.experiments.role_corpus,
             skill_audit, decisions_audit and decisions_report, pipeline.game_passages' review sheet)
    logs     logs/: the run logs, pushed by the scheduled jobs

Each store keeps `<store>/manifest.json` in the bucket: for every file its path, sha256, bytes and mtime. The files
sit under `<store>/files/<path>`. `push` uploads only files whose hash is not the manifest's and never deletes a
remote file (the manifest only grows); `pull` writes only files whose hash differs and never overwrites a local
file that is newer than the manifest's copy (it prints those as [keep] and leaves them: push them, or delete them
and pull again). `status` counts local-only, remote-only and differing files per store. `bootstrap` is what a
fresh machine runs: `pipeline.backlog pull` for both role sets, then `pull evals` and `pull caches`.

Two machines pushing the same store at the same time can each write the manifest; the later one wins and the
earlier one's entries are repaired by its next push (the files themselves are already in the bucket).

.env: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (default: the project pipeline.backlog uses). Without the key every
command says so and exits 0, so a checkout without secrets runs the tests and the evals as before.
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import backlog
from pipeline.env import load_env

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUCKET = "atlas-store"
# store -> [(prefix inside the store, local root relative to ROOT)]
STORES = {
    "evals": [("external", "evals/resumes/external"), ("private", "evals/resumes/private")],
    "caches": [("", "data/experiments")],
    "logs": [("", "logs")],
}
EXCLUDE_DIRS = {"scratch", "_trash", "node_modules", "__pycache__"}
MAX_BYTES = 50 * 1024 * 1024  # the bucket's default per-object limit; a bigger file is reported and left out
NEWER_SECONDS = 1.0  # mtime slack: file systems round, and a pulled file gets the manifest's mtime
TIMEOUT = 300


# --- the bucket ----------------------------------------------------------------------------------------------

class Bucket:
    """Objects of one Storage bucket, read and written with the service role. Nothing here deletes."""

    def __init__(self, base, key, bucket=BUCKET):
        self.base = base.rstrip("/") + "/storage/v1"
        self.key = key
        self.bucket = bucket

    def _request(self, method, path, data=None, content_type=None):
        req = urllib.request.Request(f"{self.base}/object/{self.bucket}/{path}", data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("apikey", self.key)
        if data is not None:
            req.add_header("Content-Type", content_type or "application/octet-stream")
            req.add_header("x-upsert", "true")
        return urllib.request.urlopen(req, timeout=TIMEOUT)

    def get(self, path):
        """The object's bytes, or None when the bucket has no such object."""
        try:
            with self._request("GET", path) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            body = e.read()[:300].decode("utf-8", "replace")
            if e.code in (400, 404) and ("not_found" in body or "not found" in body.lower()):
                return None
            raise RuntimeError(f"GET {self.bucket}/{path}: HTTP {e.code} {body}") from None

    def put(self, path, data, content_type=None):
        try:
            with self._request("POST", path, data, content_type) as r:
                r.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"PUT {self.bucket}/{path}: HTTP {e.code} {e.read()[:300].decode('utf-8', 'replace')}") from None


def storage():
    """The bucket, or None when SUPABASE_SERVICE_ROLE_KEY is not set."""
    load_env()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        return None
    return Bucket(os.environ.get("SUPABASE_URL", backlog.DEFAULT_URL), key)


# --- files and manifests -------------------------------------------------------------------------------------

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def rel_of(prefix, rel_in_root):
    return f"{prefix}/{rel_in_root}" if prefix else rel_in_root


def local_path(store, rel):
    """Where a store path lives on disk: the store's root whose prefix it carries."""
    for prefix, root in STORES[store]:
        if not prefix:
            return os.path.join(ROOT, root, rel)
        if rel.startswith(prefix + "/"):
            return os.path.join(ROOT, root, rel[len(prefix) + 1:])
    raise ValueError(f"{store}: no root for {rel}")


def local_files(store):
    """store path -> absolute path, for every file under the store's roots (hidden files and EXCLUDE_DIRS left out)."""
    out = {}
    for prefix, root in STORES[store]:
        base = os.path.join(ROOT, root)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS and not d.startswith("."))
            for name in sorted(filenames):
                if name.startswith("."):
                    continue
                path = os.path.join(dirpath, name)
                out[rel_of(prefix, os.path.relpath(path, base).replace(os.sep, "/"))] = path
    return out


def only_prefix(store, only):
    """--only PATH as a store path prefix: a repository path under one of the roots, or a store path as it is."""
    if not only:
        return None
    only = only.strip("/").replace(os.sep, "/")
    for prefix, root in STORES[store]:
        if only == root:
            return prefix
        if only.startswith(root + "/"):
            return rel_of(prefix, only[len(root) + 1:])
    return only


def selected(rel, prefix):
    return not prefix or rel == prefix or rel.startswith(prefix.rstrip("/") + "/")


def load_manifest(bucket, store):
    data = bucket.get(f"{store}/manifest.json")
    if data is None:
        return {"store": store, "updated": None, "files": {}}
    return json.loads(data)


def save_manifest(bucket, store, manifest):
    manifest["updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    bucket.put(f"{store}/manifest.json", json.dumps(manifest, indent=1, sort_keys=True).encode(), "application/json")


# --- commands ------------------------------------------------------------------------------------------------

def push(store, bucket, only=None):
    """Upload the files whose hash the manifest lacks. Returns (uploaded, unchanged, left_out)."""
    prefix = only_prefix(store, only)
    manifest = load_manifest(bucket, store)
    files = manifest["files"]
    uploaded, unchanged, left_out = 0, 0, 0
    t0 = time.time()
    for rel, path in local_files(store).items():
        if not selected(rel, prefix):
            continue
        size = os.path.getsize(path)
        if size > MAX_BYTES:
            print(f"[big] {rel}: {size / 1e6:.0f} MB, over the {MAX_BYTES >> 20} MB object limit; left out", flush=True)
            left_out += 1
            continue
        h = sha256(path)
        if files.get(rel, {}).get("sha256") == h:
            unchanged += 1
            continue
        with open(path, "rb") as f:
            bucket.put(f"{store}/files/{rel}", f.read())
        files[rel] = {"sha256": h, "bytes": size, "mtime": round(os.path.getmtime(path), 2)}
        uploaded += 1
        if uploaded % 50 == 0:
            print(f"  {uploaded} uploaded, {time.time() - t0:.0f}s", flush=True)
    if uploaded:
        save_manifest(bucket, store, manifest)
    print(f"[push] {store}: {uploaded} uploaded, {unchanged} unchanged, {left_out} left out; "
          f"{len(files)} files in the store, {time.time() - t0:.0f}s", flush=True)
    return uploaded, unchanged, left_out


def pull(store, bucket, only=None):
    """Write the files whose hash differs. Returns (written, unchanged, kept): kept are local files newer than the
    manifest's copy, printed and left alone."""
    prefix = only_prefix(store, only)
    manifest = load_manifest(bucket, store)
    files = manifest["files"]
    if not files:
        print(f"[pull] {store}: nothing in the store yet", flush=True)
        return 0, 0, 0
    written, unchanged, kept = 0, 0, 0
    t0 = time.time()
    for rel in sorted(files):
        if not selected(rel, prefix):
            continue
        meta = files[rel]
        path = local_path(store, rel)
        if os.path.exists(path):
            if sha256(path) == meta["sha256"]:
                unchanged += 1
                continue
            if os.path.getmtime(path) > meta["mtime"] + NEWER_SECONDS:
                print(f"[keep] {rel}: the local file is newer than the store's copy; push it, or delete it and pull again", flush=True)
                kept += 1
                continue
        data = bucket.get(f"{store}/files/{rel}")
        if data is None:
            print(f"[missing] {rel}: in the manifest but not in the bucket", flush=True)
            continue
        if hashlib.sha256(data).hexdigest() != meta["sha256"]:
            raise RuntimeError(f"{store}/files/{rel}: the bucket's bytes do not match the manifest's hash")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path + ".tmp", "wb") as f:
            f.write(data)
        os.replace(path + ".tmp", path)
        os.utime(path, (meta["mtime"], meta["mtime"]))
        written += 1
        if written % 50 == 0:
            print(f"  {written} written, {time.time() - t0:.0f}s", flush=True)
    print(f"[pull] {store}: {written} written, {unchanged} unchanged, {kept} kept as they were, {time.time() - t0:.0f}s", flush=True)
    return written, unchanged, kept


def status(store, bucket):
    """Counts per store: local only, remote only, differing (and how many of those are newer here), same."""
    files = load_manifest(bucket, store)["files"]
    local = local_files(store)
    local_only = sorted(set(local) - set(files))
    remote_only = sorted(set(files) - set(local))
    differ, newer, same = [], 0, 0
    for rel in sorted(set(local) & set(files)):
        if sha256(local[rel]) == files[rel]["sha256"]:
            same += 1
        else:
            differ.append(rel)
            if os.path.getmtime(local[rel]) > files[rel]["mtime"] + NEWER_SECONDS:
                newer += 1
    print(f"{store}: {len(local_only)} local only, {len(remote_only)} remote only, {len(differ)} differ ({newer} newer here), {same} same; "
          f"{len(files)} files in the store ({sum(m['bytes'] for m in files.values()) / 1e6:.0f} MB)")
    for rel in local_only[:5]:
        print(f"  not pushed {rel}")
    for rel in remote_only[:5]:
        print(f"  not pulled {rel}")
    for rel in differ[:5]:
        print(f"  differs    {rel}")
    return {"local_only": local_only, "remote_only": remote_only, "differ": differ, "newer": newer, "same": same}


def bootstrap(bucket):
    """What a fresh machine runs: the backlog for both role sets, then the resumes and the caches."""
    if backlog.configured():
        for rs in backlog.ROLE_DIRS:
            backlog.pull(rs)
    else:
        print("[bootstrap] SUPABASE_DB_URL is not set: the raw postings backlog is not pulled (pipeline.backlog)", flush=True)
    pull("evals", bucket)
    pull("caches", bucket)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("command", choices=["push", "pull", "status", "bootstrap"])
    ap.add_argument("store", nargs="?", choices=sorted(STORES))
    ap.add_argument("--only", help="push, pull: one file or folder (a repository path or a path inside the store)")
    a = ap.parse_args()
    if a.command in ("push", "pull") and not a.store:
        ap.error(f"{a.command} needs a store: {', '.join(sorted(STORES))}")
    bucket = storage()
    if bucket is None:
        print("[store] SUPABASE_SERVICE_ROLE_KEY is not set: put the project's service-role key in .env (see .env.example); nothing done")
        sys.exit(0)
    if a.command == "push":
        push(a.store, bucket, a.only)
    elif a.command == "pull":
        pull(a.store, bucket, a.only)
    elif a.command == "status":
        for store in ([a.store] if a.store else sorted(STORES)):
            status(store, bucket)
    else:
        bootstrap(bucket)


if __name__ == "__main__":
    main()
