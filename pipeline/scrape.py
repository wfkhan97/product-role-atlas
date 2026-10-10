"""Scrape product-related postings for every company in the registry.

usage: python -m pipeline.scrape [--only COMPANY ...] [--force] [--roles product|mba]
Raw results are cached per company in data/raw/jobs/<slug>.json (data/raw/jobs_mba/ for --roles mba).
"""
import argparse
import glob
import json
import os
import re
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.adapters import ADAPTERS
from pipeline import roles, roles_mba

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# role set -> (title filter, search queries for search-based ATSes or None for the adapter defaults, cache dir)
ROLE_SETS = {
    "product": (roles.title_ok, None, "jobs"),
    "mba": (roles_mba.title_ok, roles_mba.SEARCH_QUERIES, "jobs_mba"),
}


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
    return reg + [dict(r, group=f"{roles_name}_employer") for k, r in extra.items() if k not in have]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--group")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--rank-from", type=int)
    ap.add_argument("--rank-to", type=int)
    ap.add_argument("--roles", choices=sorted(ROLE_SETS), default="product")
    args = ap.parse_args()
    title_ok, queries, cache = ROLE_SETS[args.roles]
    RAW = os.path.join(ROOT, "data", "raw", cache)
    os.makedirs(RAW, exist_ok=True)
    reg = load_registry(args.roles)
    summary = []
    todo = []
    for entry in reg:
        name = entry["company"]
        if args.only and name not in args.only:
            continue
        if args.group and not entry.get("group", "").startswith(args.group):
            continue
        if args.rank_from and (entry.get("rank") is None or entry["rank"] < args.rank_from):
            continue
        if args.rank_to and (entry.get("rank") is None or entry["rank"] > args.rank_to):
            continue
        if entry.get("ats") in (None, "unsupported") or entry["ats"] not in ADAPTERS:
            summary.append((name, entry.get("ats"), "skipped"))
            continue
        path = os.path.join(RAW, slug(name) + ".json")
        if os.path.exists(path) and not args.force:
            with open(path) as f:
                n = len(json.load(f).get("jobs", []))
            summary.append((name, entry["ats"], f"cached {n}"))
            continue
        todo.append((entry, path))

    def run(item):
        entry, path = item
        name = entry["company"]
        t0 = time.time()
        try:
            cfg = entry.get("config", {})
            if queries:
                cfg = dict(cfg, queries=queries)
            jobs = ADAPTERS[entry["ats"]](name, cfg, title_ok)
            seen, uniq = set(), []
            for j in jobs:
                k = j.get("url") or j.get("external_id")
                if k in seen:
                    continue
                seen.add(k)
                j["group"] = entry.get("group")
                j["investor"] = entry.get("investor")
                j["ats"] = entry["ats"]
                uniq.append(j)
            with open(path, "w") as f:
                json.dump({"company": name, "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "jobs": uniq}, f)
            print(f"[ok] {name:28s} {entry['ats']:14s} {len(uniq):4d} jobs {time.time()-t0:5.0f}s", flush=True)
            return (name, entry["ats"], f"{len(uniq)} jobs in {time.time()-t0:.0f}s")
        except Exception as e:
            print(f"[err] {name:28s} {entry['ats']:14s} {type(e).__name__}: {e}", flush=True)
            traceback.print_exc(limit=2)
            return (name, entry["ats"], f"ERROR {type(e).__name__}: {e}")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        summary.extend(ex.map(run, todo))
    print("\n== summary")
    for s in summary:
        print(f"{s[0]:30s} {str(s[1]):14s} {s[2]}")


if __name__ == "__main__":
    main()
