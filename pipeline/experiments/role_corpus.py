"""Working corpus for taxonomy work on a role set: one JSON line per kept posting with its cleaned text.

    .venv/bin/python -m pipeline.experiments.role_corpus --roles mba [--country "United States"]

Writes data/experiments/corpus_<roles>.jsonl (gitignored). role_terms.py and skill_probe.py read it, so
patterns can be drafted and checked against real postings without re-reading the raw cache each time.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from pipeline import extract


def path(roleset):
    return os.path.join(ROOT, "data", "experiments", f"corpus_{roleset}.jsonl")


def load(roleset):
    with open(path(roleset)) as f:
        return [json.loads(line) for line in f]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", choices=sorted(extract.ROLE_SETS), default="mba")
    ap.add_argument("--country", default="United States", help="keep one country ('' keeps all)")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(path(args.roles)), exist_ok=True)
    n = 0
    with open(path(args.roles), "w") as f:
        for company, r, j, fam, cleaned in extract.postings(args.roles):
            country = extract.geo(j.get("location", ""), j["title"])[0]
            if args.country and country != args.country:
                continue
            f.write(json.dumps({"company": company, "title": j["title"], "family": fam, "country": country,
                                "category": j.get("category"), "text": j["title"] + "\n" + cleaned}) + "\n")
            n += 1
    print(n, "postings ->", path(args.roles))


if __name__ == "__main__":
    main()
