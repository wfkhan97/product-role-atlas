"""Side-by-side of regex share vs model share under two prompts (lenient and strict) on the same sample.

    .venv/bin/python -m pipeline.experiments.decisions_compare [--a ""] [--b strict] [--threshold 0.5]
"""
import argparse
import collections
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAX = json.load(open(os.path.join(ROOT, "pipeline", "taxonomy.json")))
SKILL = {s["id"]: s for s in TAX["skills"]}


def load(tag):
    suf = ("_" + tag) if tag else ""
    p = os.path.join(ROOT, "data", "experiments", f"decisions_results{suf}.jsonl")
    rows = [json.loads(l) for l in open(p)]
    return [r for r in rows if r["model_p"] is not None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", default="")
    ap.add_argument("--b", default="strict")
    ap.add_argument("--threshold", type=float, default=0.5)
    a = ap.parse_args()
    A, B = load(a.a), load(a.b)
    byA, byB = collections.defaultdict(list), collections.defaultdict(list)
    for r in A:
        byA[r["skill"]].append(r)
    for r in B:
        byB[r["skill"]].append(r)
    t = a.threshold
    stats = []
    for s in byA:
        ra, rb = byA[s], byB.get(s, [])
        regex = sum(r["regex"] for r in ra) / len(ra)
        ma = sum(r["model_p"] >= t for r in ra) / len(ra)
        mb = sum(r["model_p"] >= t for r in rb) / len(rb) if rb else None
        agree_b = sum(r["regex"] == (r["model_p"] >= t) for r in rb) / len(rb) if rb else None
        ro_b = sum(1 for r in rb if r["regex"] and r["model_p"] < t)
        mo_b = sum(1 for r in rb if not r["regex"] and r["model_p"] >= t)
        stats.append((s, regex, ma, mb, agree_b, ro_b, mo_b))
    stats.sort(key=lambda x: -abs((x[3] if x[3] is not None else x[1]) - x[1]))
    print(f"| skill | cluster | regex | lenient | strict | strict agreement | regex-only (strict) | model-only (strict) |")
    print("|---|---|---|---|---|---|---|---|")
    for s, regex, ma, mb, ag, ro, mo in stats:
        print(f"| {SKILL[s]['name']} | {SKILL[s]['cluster']} | {regex:.0%} | {ma:.0%} | {'' if mb is None else f'{mb:.0%}'} | {'' if ag is None else f'{ag:.0%}'} | {ro} | {mo} |")
    if all(x[4] is not None for x in stats):
        print(f"\nmean strict agreement {sum(x[4] for x in stats)/len(stats):.0%}; skills moving ≥15 pts under strict: {sum(1 for x in stats if abs(x[3]-x[1])>=0.15)} of {len(stats)}; under lenient: {sum(1 for x in stats if abs(x[2]-x[1])>=0.15)}")
        by_cl = collections.defaultdict(list)
        for s, regex, ma, mb, ag, ro, mo in stats:
            by_cl[SKILL[s]["cluster"]].append((mb - regex, ag))
        print("\ncluster: mean strict Δ vs regex, mean agreement")
        for c, v in by_cl.items():
            print(f"  {c:12s} {sum(x[0] for x in v)/len(v):+.0%}   {sum(x[1] for x in v)/len(v):.0%}")


if __name__ == "__main__":
    main()
