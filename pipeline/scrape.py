"""Scrape product-related postings for every company in the registry.

usage: python -m pipeline.scrape [--only COMPANY ...] [--force]
Raw results are cached per company in data/raw/jobs/<slug>.json.
"""
import argparse
import json
import os
import re
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.adapters import ADAPTERS
from pipeline.roles import title_ok

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "jobs")


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_registry():
    with open(os.path.join(ROOT, "data", "registry.json")) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--group")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--rank-from", type=int)
    ap.add_argument("--rank-to", type=int)
    args = ap.parse_args()
    os.makedirs(RAW, exist_ok=True)
    reg = load_registry()
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
            jobs = ADAPTERS[entry["ats"]](name, entry.get("config", {}), title_ok)
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
