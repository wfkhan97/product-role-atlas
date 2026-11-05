"""Scrape product-related postings for every company in the registry.

usage: python -m pipeline.scrape [--only COMPANY ...] [--refresh] [--roles product|mba|tech] [--batch N] [--count-only FILE]
Raw results are kept per company in data/raw/jobs/<slug>.json (data/raw/jobs_mba/ for --roles mba, jobs_tech/ for tech).

The file is a backlog, not a snapshot. A company that has a file is skipped unless --refresh (or --force, the
old name) is given. A refresh never drops a posting: one the board still shows gets a new "last_seen", a new one
is added with "first_seen", and one the board no longer shows gets "closed" (the date we first missed it). A
closed posting is no longer listed as open, and it still counts in shares and statistics (pipeline/extract.py
sets how long). A fetch is incomplete when a listing page could not be read or a search ran into its page cap
(pipeline/adapters/common.py), and also when it returns far fewer postings than were open (the board or a search
probably failed). An incomplete fetch closes nothing by absence: each open posting that did not come back is asked
about one by one (the adapter's still_open), and only one the board says is gone is closed; a family without a
check closes nothing. A posting is its requisition id (external_id), or its URL on a board that gives none:
the URL alone is not stable (Bank of America puts a per-session token in every job URL; a retitled or moved
requisition gets a new one). One that comes back takes the board's current title, URL and text.
The files are not in git: the Supabase backlog is the store. When SUPABASE_DB_URL is set (.env) each file is pushed
as it is written and a full run ends with a storage snapshot (pipeline/backlog.py; --no-db to leave the database
alone, --no-snapshot to push the files without the dated copy). Run pipeline.backlog pull before a scrape on a checkout whose files are behind the database.
The MBA roles were scraped in batches; --batch N fetches only that batch's roles for companies already
cached without it and adds them to the company's file (companies with no file get every role).

The tech set (engineering, design, legal; PLAN.md "A third role set") samples instead of keeping every posting: its
roles are posted by the thousand. A posting outside the United States is dropped (on Workday before its detail is
fetched); at most CAP_PER_ROLE open postings per employer and role are kept, the ones the backlog holds first, then the
newest, and the file records under "sampled" how many were seen and not kept; search boards read three pages a query.
Nothing is ever deleted. --count-only FILE lists the boards with these rules and writes the counts to FILE, with no
detail fetch on Workday and nothing written to the backlog (Greenhouse, Lever, Ashby and Workday only).
"""
import argparse
import collections
import glob
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.adapters import ADAPTERS, CHECKS, common
from pipeline import backlog, geo, log, roles, roles_mba, roles_tech

logger = log.get(__name__)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# role set -> (title filter, cache dir)
ROLE_SETS = {
    "product": (roles.title_ok, "jobs"),
    "mba": (roles_mba.title_ok, "jobs_mba"),
    "tech": (roles_tech.title_ok, "jobs_tech"),
}
# Sampling role sets: at most this many open postings per employer and role (pipeline/balance.py already holds an
# employer to 5% of a role's weight, so a 31st posting at one employer adds rows, not information).
CAP_PER_ROLE = {"tech": 30}
PAGES = {"tech": 3}           # pages a search board reads per query
COUNTED = ("greenhouse", "lever", "ashby", "workday")  # the boards --count-only can list without detail fetches


def in_country(location, country="United States"):
    """False only for a posting the location places in another country; no location, or one that cannot be read, is
    kept (extraction reads it again with the posting's text and URL)."""
    c = geo.country(location)[0]
    return c in (None, geo.OTHER, country)


def cap_new(old, fetched, family_of, cap):
    """The fetched postings a sampling set keeps: every one the backlog already holds, then new ones, newest first,
    while the role has fewer than `cap` open postings at the employer. Returns (kept, {role: seen and not kept})."""
    held = {posting_key(j): j for j in (old or {}).get("jobs", [])}
    open_n = collections.Counter(family_of(j["title"]) for j in held.values() if not j.get("closed"))
    kept, sampled = [], collections.Counter()
    new = []
    for j in fetched:
        (kept if posting_key(j) in held else new).append(j)
    for j in sorted(new, key=lambda j: str(j.get("posted") or ""), reverse=True):
        role = family_of(j["title"])
        if open_n[role] < cap:
            open_n[role] += 1
            kept.append(j)
        else:
            sampled[role] += 1
    return kept, dict(sampled)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_registry(roles_name="product"):
    with open(os.path.join(ROOT, "data", "registry.json")) as f:
        reg = json.load(f)
    if roles_name == "product":
        return reg
    # Employers added for this role set only (consulting firms, banks, funds): discovery records, then
    # hand- or agent-verified rows, which win. They stay out of data/registry.json so the product map is unchanged.
    extra = {}
    paths = sorted(glob.glob(os.path.join(ROOT, "data", "raw", f"discovery_{roles_name}", "*.json")))
    paths += sorted(glob.glob(os.path.join(ROOT, "data", "raw", f"registry_{roles_name}_employers*.json")))
    for p in paths:
        with open(p) as f:
            rows = json.load(f)
        for r in rows if isinstance(rows, list) else [rows]:
            if r.get("verified") and r.get("ats") in ADAPTERS:
                extra[r["company"].lower()] = {k: v for k, v in r.items() if k not in ("candidates", "seconds")}
    have = {e["company"].lower() for e in reg if e.get("ats") in ADAPTERS}
    reg = [e for e in reg if e["company"].lower() not in extra or e["company"].lower() in have]
    # A Fortune company that is also on the employer list keeps the list's category; Fortune banks and investors
    # get theirs from roles_mba.FORTUNE_CATEGORIES. The category selects title rules, searches and the ladder.
    cat = dict(roles_mba.FORTUNE_CATEGORIES) if roles_name == "mba" else {}
    emp_path = os.path.join(ROOT, "data", "raw", f"{roles_name}_employers.json")
    if os.path.exists(emp_path):
        with open(emp_path) as f:
            cat.update({e["company"]: e["category"] for e in json.load(f) if e.get("category")})
    reg = [dict(e, category=cat[e["company"]]) if e["company"] in cat and not e.get("category") else e for e in reg]
    reg = reg + [dict(r, group=f"{roles_name}_employer") for k, r in extra.items() if k not in have]
    # One job board is one employer: an entry whose board an earlier entry already has is the same employer under
    # another name ("The J.M. Smucker Company") or a wrong lookup, and its postings would be read twice.
    seen, out = set(), []
    for e in reg:
        board = (e.get("ats"), json.dumps(e.get("config", {}), sort_keys=True))
        if e.get("ats") in ADAPTERS and e.get("config") and board in seen:
            continue
        seen.add(board)
        out.append(e)
    return out


def posting_key(j):
    """What identifies a posting across refreshes: its requisition id, or its URL on a board that gives none.
    The URL alone is not stable: Bank of America puts a per-session token in every job URL, and a board that
    retitles or moves a requisition gives it a new URL. pipeline.extract reads postings by the same key."""
    return j.get("external_id") or j.get("url")


FEW = 0.3  # under this share of the open postings back from a full fetch, the board or a search failed


def few_came_back(old, fetched):
    """merge's test for a failed board, before the merge: ten or more open postings and under FEW of them back."""
    back = {posting_key(j) for j in fetched}
    was_open = {posting_key(j) for j in old.get("jobs", []) if not j.get("closed")}
    return len(was_open) >= 10 and len(was_open & back) < FEW * len(was_open)


def shard(entries, spec):
    """The Kth of N parts of `entries` ("K/N"): every Nth entry from the (K-1)th, so the largest employers, which the
    registry lists near each other, spread over the parts."""
    k, n = (int(x) for x in spec.split("/"))
    if not 1 <= k <= n:
        raise ValueError(f"--shard {spec}: K must be between 1 and N")
    return entries[k - 1::n]


def merge(old, fetched, entry, today, full=True, checked=None):
    """Add what a board shows today to a company's backlog. Returns (postings, note when nothing was closed).

    old: the company's file as read (None for a new company). fetched: the postings the adapter returned.
    full: every search was run, so a posting that did not come back is closed; with one batch of searches
    (full False) nothing is closed. checked: with full False, posting_key -> what the board said about an open
    posting that did not come back, asked one by one (check_missing): True keeps it open and seen today, False
    closes an open one (a closed one keeps its date); a key that is absent or None stays as it was.
    One row per posting_key. A posting that comes back takes the board's current title, URL and text (the row
    seen last is the posting) and keeps its first_seen. Two rows of one requisition in the file (written before
    the key was the id) fold into one the same way: the one seen last wins, the first keeps its place.
    """
    was = (old.get("scraped_at") or today)[:10] if old else today
    uniq, by_key = [], {}
    for j in (old["jobs"] if old else []):
        j.setdefault("first_seen", was)  # files from before the backlog: seen on the day they were scraped
        j.setdefault("last_seen", was)
        o = by_key.get(posting_key(j))
        if o is None:
            by_key[posting_key(j)] = j
            uniq.append(j)
        elif j["last_seen"] >= o["last_seen"]:
            first = min(o["first_seen"], j["first_seen"])
            o.pop("closed", None)
            o.update(j, first_seen=first)
        else:
            o["first_seen"] = min(o["first_seen"], j["first_seen"])
    open_before = [j for j in uniq if not j.get("closed")]
    cat = entry.get("category")
    for j in fetched:
        k = posting_key(j)
        if k in by_key:
            o = by_key[k]
            text = o.get("description")
            o.update(j, last_seen=today)  # the board's current title, URL and text
            if text and not j.get("description"):
                o["description"] = text  # a fetch that lost the text keeps the stored one
            o.pop("closed", None)  # a posting that comes back is open again
            if cat:
                o["category"] = cat
            continue
        by_key[k] = j
        j["group"] = entry.get("group")
        j["investor"] = entry.get("investor")
        j["ats"] = entry["ats"]
        j["first_seen"] = j["last_seen"] = today
        if cat:
            j["category"] = cat
        uniq.append(j)
    partial = None
    if old and full:
        still = sum(1 for j in open_before if j["last_seen"] == today)
        if len(open_before) >= 10 and still < FEW * len(open_before):
            # far fewer than were open: the board or a search failed, more likely than seven in ten jobs closing
            partial = f"{still} of {len(open_before)} open postings came back; nothing was closed"
        else:
            for j in open_before:
                if j["last_seen"] != today:
                    j["closed"] = today
    elif old and checked:
        for j in uniq:
            said = checked.get(posting_key(j))
            if j["last_seen"] == today or said is None:
                continue
            if said:
                j["last_seen"] = today
                j.pop("closed", None)  # a posting closed before that the board still shows is open again
            elif not j.get("closed"):
                j["closed"] = today
    return uniq, partial


CONTROLS = 3  # postings that did come back, asked the same way first: a check that calls one of them gone is not trusted


def check_missing(still_open, company, cfg, old, fetched, closed_since=None):
    """Ask the board about each open posting of `old` that the incomplete fetch did not return, and with
    closed_since also each posting closed on or after that date that it did not return (--recheck-closed: closures
    before 2026-10-29 treated a capped search as complete). Returns (checked, note): checked as merge takes it, empty
    when the controls fail. still_open(company, cfg, posting) answers True (on the board), False (the board says it is
    gone) or None (cannot tell); an exception counts as None. The controls are postings this fetch returned, so they
    are open now: a check that calls one of them gone is not trusted."""
    def ask(j):
        try:
            return still_open(company, cfg, j)
        except Exception as e:  # a check never fails the fetch
            logger.debug("%s: check of %s failed: %s: %s", company, j.get("url"), type(e).__name__, e)
            return None

    back = {posting_key(j) for j in fetched}
    missing, keys = [], set()
    for j in old.get("jobs", []):
        k = posting_key(j)
        asked = not j.get("closed") or (closed_since and j["closed"] >= closed_since)
        if asked and k not in back and k not in keys:
            keys.add(k)
            missing.append(j)
    if not missing:
        return {}, "no open posting was missing"
    controls = [j for j in old.get("jobs", []) if posting_key(j) in back and not j.get("closed")][:CONTROLS]
    if not controls:  # nothing came back to test the check on (a board that is down answers every check alike)
        return {}, f"no open posting came back to test the check on; {len(missing)} not checked"
    for j in controls:
        if ask(j) is False:
            return {}, f"the check called a posting that came back gone ({j.get('url')}); {len(missing)} not checked"
    checked = {}
    for j in missing:
        checked[posting_key(j)] = ask(j)
        time.sleep(0.3)  # one request a posting, at the pace of the adapters' own detail requests
    said = collections.Counter(checked.values())
    note = f"{len(missing)} missing postings checked one by one: {said[True]} still open, {said[False]} gone, {said[None]} unknown"
    reopened = sum(1 for j in missing if j.get("closed") and checked[posting_key(j)])
    return checked, note + (f" ({reopened} of them closed before and reopened)" if closed_since else "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--refresh", "--force", dest="force", action="store_true", help="fetch again and merge into the backlog")
    ap.add_argument("--group")
    ap.add_argument("--ats", help="only employers on this kind of board (workday, greenhouse, ...)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--rank-from", type=int)
    ap.add_argument("--rank-to", type=int)
    ap.add_argument("--roles", choices=sorted(ROLE_SETS), default="product")
    ap.add_argument("--count-only", metavar="FILE", help="list the boards with the set's rules and write the counts to FILE; "
                    "no detail fetches on Workday, nothing written (Greenhouse, Lever, Ashby, Workday)")
    ap.add_argument("--batch", type=int, choices=sorted(roles_mba.BATCH_QUERIES))
    ap.add_argument("--no-db", action="store_true", help="do not push the files to the Supabase backlog")
    ap.add_argument("--shard", metavar="K/N", help="the Kth of N equal parts of the selected employers, in registry order "
                    "(a refresh job too long for one runner: pipeline.backlog pull --ats takes the same --shard)")
    ap.add_argument("--recheck-closed", metavar="DATE", help="on an incomplete fetch, also ask about postings closed on "
                    "or after DATE and reopen the ones the board still shows (repairs closures made before 2026-10-29)")
    ap.add_argument("--no-snapshot", action="store_true", help="push the files but skip the dated storage snapshot (a job that runs one ATS family at a time snapshots once at the end)")
    args = ap.parse_args()
    count = {} if args.count_only else None
    db = not args.no_db and backlog.configured() and count is None
    if not db:
        logger.info("SUPABASE_DB_URL not set or --no-db: the files stay local only")
    all_batches = sorted(roles_mba.BATCH_QUERIES)
    title_ok, cache = ROLE_SETS[args.roles]
    RAW = os.path.join(ROOT, "data", "raw", cache)
    if count is None:
        os.makedirs(RAW, exist_ok=True)
    reg = load_registry(args.roles)
    summary = []
    todo = []
    picked = None
    if args.shard:
        picked = {e["company"] for e in shard(
            [e for e in reg if not args.ats or e.get("ats") == args.ats], args.shard)}
    for entry in reg:
        name = entry["company"]
        if picked is not None and name not in picked:
            continue
        if args.only and name not in args.only:
            continue
        if args.group and not entry.get("group", "").startswith(args.group):
            continue
        if args.ats and entry.get("ats") != args.ats:
            continue
        if args.rank_from and (entry.get("rank") is None or entry["rank"] < args.rank_from):
            continue
        if args.rank_to and (entry.get("rank") is None or entry["rank"] > args.rank_to):
            continue
        if entry.get("ats") in (None, "unsupported") or entry["ats"] not in ADAPTERS or (count is not None and entry["ats"] not in COUNTED):
            summary.append((name, entry.get("ats"), "skipped"))
            continue
        path = os.path.join(RAW, slug(name) + ".json")
        old = None
        if os.path.exists(path):
            with open(path) as f:
                old = json.load(f)
            # files from before the batches existed hold batch 1 only
            if count is None and not args.force and not (args.batch and args.batch not in old.get("batches", [1])):
                summary.append((name, entry["ats"], f"cached {len(old.get('jobs', []))}"))
                continue
        todo.append((entry, path, old))

    logger.info("scrape --roles %s: %d employers in the registry, %d to fetch, %d cached or skipped", args.roles, len(reg), len(todo), len(summary))
    run_timer = log.Timer()
    totals = collections.Counter()
    failed = []
    lock = threading.Lock()

    def run(item):
        entry, path, old = item
        batch = args.batch if old and not args.force else None  # add one batch to an existing file, or fetch everything
        today = time.strftime("%Y-%m-%d")
        name = entry["company"]
        t = log.Timer()
        try:
            cfg, ok, cat = entry.get("config", {}), title_ok, entry.get("category")
            if args.roles == "mba":  # some title rules and searches depend on the kind of employer
                # a board shared with a parent company is narrowed by its own search text (keep_queries)
                cfg = cfg if cfg.get("keep_queries") else dict(cfg, queries=roles_mba.queries(cat, batch))
                ok = lambda t: roles_mba.title_ok(t, cat, batch)
            cap = CAP_PER_ROLE.get(args.roles)
            if cap:  # a sampling set: its own searches, a few pages, a budget per role, nothing fetched abroad
                ok = roles_tech.family   # returns the role: the Workday adapter keeps a budget per role
                if not cfg.get("keep_queries"):
                    cfg = dict(cfg, queries=roles_tech.SEARCH_QUERIES)
                cfg = dict(cfg, max_pages=PAGES[args.roles], per_role=cap + 10, keep_location=in_country, count_only=count is not None)
            common.start_fetch()
            jobs = ADAPTERS[entry["ats"]](name, cfg, ok)
            sampled = None
            if cap:
                jobs = [j for j in jobs if in_country(j.get("location"))]
                seen = collections.Counter(roles_tech.family(j["title"]) for j in jobs)
                jobs, sampled = cap_new(old, jobs, roles_tech.family, cap)
                if count is not None:
                    with lock:
                        count[name] = {"ats": entry["ats"], "group": entry.get("group"), "seen": dict(seen),
                                       "kept": dict(collections.Counter(roles_tech.family(j["title"]) for j in jobs)),
                                       "page_cap": len(common.listing_failures())}
                    return (name, entry["ats"], f"counted {sum(seen.values())} seen, {len(jobs)} kept")
            unread = common.listing_failures()
            key = posting_key
            before = {key(j): bool(j.get("closed")) for j in (old or {}).get("jobs", [])}
            # a listing page that could not be read makes the fetch incomplete: what did not come back may be open, so
            # it is closed only when the board says so for that posting
            checked, how = None, "nothing was closed"
            if not unread and old and batch is None and entry["ats"] in CHECKS and few_came_back(old, jobs):
                # a complete-looking fetch that returned under 30% of the open postings: merge would close nothing
                # and leave them open with no end, so they are asked one by one as for a capped search
                unread = [f"{len(jobs)} postings came back of {sum(1 for j in old['jobs'] if not j.get('closed'))} open"]
            if unread and old and batch is None and entry["ats"] in CHECKS:
                checked, how = check_missing(CHECKS[entry["ats"]], name, cfg, old, jobs, args.recheck_closed)
                with lock:
                    totals["checked"] += len(checked)
            uniq, partial = merge(old, jobs, entry, today, full=batch is None and not unread, checked=checked)
            if unread and old:
                partial = f"{len(unread)} listing page(s) not read ({unread[0]}); {how}"
            if unread:
                with lock:
                    totals["incomplete"] += 1
            blob = {"company": name, "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "jobs": uniq}
            if partial:
                blob["partial"] = partial
            if sampled:
                blob["sampled"] = sampled  # role -> postings seen today and not kept (the cap)
            if args.roles == "mba":
                blob["batches"] = sorted(set(old.get("batches", [1])) | {batch}) if old and batch else all_batches
            # the file is the backlog: write beside it and swap, so a failure cannot leave it empty
            with open(path + ".tmp", "w") as f:
                json.dump(blob, f)
            os.replace(path + ".tmp", path)
            counts = {"fetched": len(jobs), "kept": len(uniq), "new": sum(1 for j in uniq if key(j) not in before),
                      "reopened": sum(1 for j in uniq if before.get(key(j)) and not j.get("closed")),
                      "closed": sum(1 for j in uniq if j.get("closed") == today and before.get(key(j)) is False),
                      "open": sum(1 for j in uniq if not j.get("closed")),
                      "folded": len((old or {}).get("jobs", [])) - len(before)}  # rows of one requisition the file held twice
            with lock:
                totals.update(counts)
            logger.info("%s (%s): fetched %d, kept %d (%d open), new %d, reopened %d, closed %d, folded %d, %s", name, entry["ats"], counts["fetched"],
                        counts["kept"], counts["open"], counts["new"], counts["reopened"], counts["closed"], counts["folded"], t)
            if partial:
                logger.warning("%s: partial fetch, %s", name, partial)
            if db:
                saved, note = backlog.push_file_safely(path, args.roles)
                (logger.info if saved else logger.error)("%s", note)
            return (name, entry["ats"], f"{len(uniq)} jobs in {t.seconds:.0f}s" + (f"; PARTIAL: {partial}" if partial else ""))
        except Exception as e:
            logger.error("%s (%s) failed after %s: %s: %s", name, entry["ats"], t, type(e).__name__, e, exc_info=True)
            with lock:
                failed.append(name)
            return (name, entry["ats"], f"ERROR {type(e).__name__}: {e}")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        summary.extend(ex.map(run, todo))
    for s in summary:
        logger.debug("%s %s %s", s[0], s[1], s[2])
    logger.info("scrape done in %s: %d employers fetched (%d failed), postings fetched %d, kept %d (%d open), new %d, reopened %d, closed %d, "
                "folded %d, incomplete %d, checked one by one %d; %d requests, %d answered 429, %d answered a 5xx, %d retried after a network error", run_timer,
                len(todo), len(failed), totals["fetched"], totals["kept"], totals["open"], totals["new"], totals["reopened"], totals["closed"],
                totals["folded"], totals["incomplete"], totals["checked"], common.STATS["requests"], common.STATS["429"], common.STATS["5xx"], common.STATS["retries"])
    if failed:
        logger.error("failed employers: %s", ", ".join(sorted(failed)))
    if count is not None:
        roles_seen, roles_kept = collections.Counter(), collections.Counter()
        for c in count.values():
            roles_seen.update(c["seen"]), roles_kept.update(c["kept"])
        with open(args.count_only, "w") as f:
            json.dump({"roles": args.roles, "date": time.strftime("%Y-%m-%d"), "cap": CAP_PER_ROLE.get(args.roles),
                       "seen": dict(roles_seen), "kept": dict(roles_kept), "employers": count}, f, indent=1)
        logger.info("count-only: %d employers counted; seen %s; kept %s; written to %s", len(count), dict(roles_seen), dict(roles_kept), args.count_only)
    if db and todo and not args.only and not args.batch and not args.no_snapshot:  # a full run: keep a dated copy of the files
        try:
            backlog.snapshot(args.roles)
        except Exception as e:
            logger.error("snapshot failed: %s: %s", type(e).__name__, e)


if __name__ == "__main__":
    log.setup()
    main()
