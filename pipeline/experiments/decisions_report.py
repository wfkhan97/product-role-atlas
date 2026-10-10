"""Summarise data/experiments/decisions_results.jsonl: per-skill regex share vs model share, agreement,
and disagreement examples with the regex-matched snippet so each case can be judged by eye.

    .venv/bin/python -m pipeline.experiments.decisions_report [--threshold 0.5] [--examples 3]
"""
import argparse
import collections
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAX = json.load(open(os.path.join(ROOT, "pipeline", "taxonomy.json")))
SKILL = {s["id"]: s for s in TAX["skills"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--examples", type=int, default=2)
    ap.add_argument("--tag", default="")
    ap.add_argument("--md", default=None)
    a = ap.parse_args()
    suf = ("_" + a.tag) if a.tag else ""
    a.md = a.md or os.path.join(ROOT, "data", "experiments", f"decisions_report{suf}.md")
    rows = [json.loads(l) for l in open(os.path.join(ROOT, "data", "experiments", f"decisions_results{suf}.jsonl"))]
    rows = [r for r in rows if r["model_p"] is not None]
    urls = {r["url"] for r in rows}
    text = {}
    for f in glob.glob(os.path.join(ROOT, "data", "raw", "jobs", "*.json")):
        d = json.load(open(f))
        for j in (d if isinstance(d, list) else d.get("jobs", [])):
            if j.get("url") in urls:
                text[j["url"]] = j["description"]
    n_post = len(urls)
    by = collections.defaultdict(list)
    for r in rows:
        by[r["skill"]].append(r)

    out = []
    out.append(f"# Regex vs Decisions API on {n_post} PM postings (threshold {a.threshold})\n")
    out.append("Share = fraction of postings tagged. Regex-only = regex tagged it, model said no. Model-only = the reverse. "
               "Agreement = both yes or both no. Sorted by how much the share would change.\n")
    out.append("| skill | regex share | model share | Δ | agreement | regex-only | model-only |")
    out.append("|---|---|---|---|---|---|---|")
    stats = []
    for s, rs in by.items():
        n = len(rs)
        rg = sum(r["regex"] for r in rs) / n
        md = sum(r["model_p"] >= a.threshold for r in rs) / n
        agree = sum((r["regex"] == (r["model_p"] >= a.threshold)) for r in rs) / n
        ro = sum(1 for r in rs if r["regex"] and r["model_p"] < a.threshold)
        mo = sum(1 for r in rs if not r["regex"] and r["model_p"] >= a.threshold)
        stats.append((s, rg, md, agree, ro, mo))
    stats.sort(key=lambda x: -abs(x[1] - x[2]))
    for s, rg, md, agree, ro, mo in stats:
        out.append(f"| {SKILL[s]['name']} (`{s}`) | {rg:.0%} | {md:.0%} | {md - rg:+.0%} | {agree:.0%} | {ro} | {mo} |")
    tot_agree = sum(x[3] for x in stats) / len(stats)
    out.append(f"\nMean per-skill agreement: {tot_agree:.0%}. Skills where the share moves by 15 points or more: "
               f"{sum(1 for x in stats if abs(x[1] - x[2]) >= 0.15)} of {len(stats)}.\n")

    out.append("## Disagreement examples\n")
    out.append("For regex-only cases the snippet is what the regex matched. For model-only cases it is the first qualification-like line mentioning a pattern word, if any.\n")
    for s, rg, md, agree, ro, mo in stats:
        if abs(rg - md) < 0.1 and ro + mo < 5:
            continue
        rx = re.compile("|".join(f"(?:{p})" for p in SKILL[s]["patterns"]), re.I)
        out.append(f"### {SKILL[s]['name']} — regex {rg:.0%} → model {md:.0%}\n")
        shown = 0
        for r in sorted(by[s], key=lambda r: r["model_p"]):
            if r["regex"] and r["model_p"] < a.threshold and shown < a.examples:
                m = rx.search(text.get(r["url"], ""))
                snip = text[r["url"]][max(0, m.start() - 90): m.end() + 90].replace("\n", " ") if m else ""
                out.append(f"- regex-only, model p={r['model_p']:.2f} — {r['company']}, {r['title']}: …{snip}…")
                shown += 1
        shown = 0
        for r in sorted(by[s], key=lambda r: -r["model_p"]):
            if not r["regex"] and r["model_p"] >= a.threshold and shown < a.examples:
                out.append(f"- model-only, p={r['model_p']:.2f} — {r['company']}, {r['title']} ({r['url']})")
                shown += 1
        out.append("")
    open(a.md, "w").write("\n".join(out))
    print("\n".join(out[:len(stats) + 6]))
    print(f"\nfull report with examples: {os.path.relpath(a.md, ROOT)}")


if __name__ == "__main__":
    main()
