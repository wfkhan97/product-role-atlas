"""Try draft skills against a role set's postings before they go into the taxonomy.

    .venv/bin/python -m pipeline.experiments.skill_probe --skills draft.json [--skill id] [--samples 8] [--roles mba]

draft.json is a list of skills in taxonomy.json's shape (id, name, cluster, patterns). For each skill it prints
the share of postings tagged, the roles that ask for it most, each pattern's own share, and random sentences
that matched, which is where over-broad patterns show. Needs the corpus from role_corpus.py.
"""
import argparse
import collections
import json
import random
import re

from pipeline import extract
from pipeline.experiments import role_corpus


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skills", required=True)
    ap.add_argument("--skill", help="one id, or several separated by commas")
    ap.add_argument("--samples", type=int, default=8)
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--brief", action="store_true", help="one line per skill, no samples")
    args = ap.parse_args()
    draft = json.load(open(args.skills))
    if args.skill:
        draft = [s for s in draft if s["id"] in set(args.skill.split(","))]
    rows = role_corpus.load(args.roles)
    per_role = collections.Counter(r["family"] for r in rows)
    rng = random.Random(args.seed)
    for s in draft:
        pats = []
        for p in s["patterns"]:
            try:
                pats.append((p, re.compile(p, re.I)))
            except re.error as e:
                print(f"!! {s['id']}: pattern does not compile: {p!r} ({e})")
        if not pats:
            continue
        rx = re.compile("|".join(f"(?:{p})" for p, _ in pats), re.I)
        hit_roles, hits, by_pat = collections.Counter(), [], collections.Counter()
        for r in rows:
            if rx.search(r["text"]):
                hit_roles[r["family"]] += 1
                hits.append(r)
                for p, prx in pats:
                    if prx.search(r["text"]):
                        by_pat[p] += 1
        top = sorted(((hit_roles[f] / per_role[f], f) for f in hit_roles if per_role[f] >= 15), reverse=True)[:6]
        print(f"\n== {s['id']} ({s['name']}; {s.get('cluster')}): {len(hits) / len(rows):.1%} of {len(rows)} postings")
        print("   top roles: " + ", ".join(f"{f} {v:.0%}" for v, f in top))
        if args.brief:
            continue
        for p, _ in pats:
            print(f"   {by_pat[p] / len(rows):6.1%}  {p}")
        shown = 0
        for r in rng.sample(hits, min(len(hits), args.samples * 4)):
            for sent in extract.sentences(r["text"]):
                if rx.search(sent):
                    print(f"   - [{r['family']}] {sent[:220]}")
                    shown += 1
                    break
            if shown >= args.samples:
                break


if __name__ == "__main__":
    main()
