"""Experiment: would a model judgment (OpenAI Decisions API) tag postings better than the regexes?

Samples product postings from the local cache, asks one `predicate` question per skill over each
posting, and compares the answers with the regex tags in web/data/graph.json. Writes a review file
with every disagreement and its context so a human can label a few hundred and set thresholds.

    .venv/bin/python -m pipeline.experiments.decisions_audit --n 50 --skills public_sector,ai_ml --dry-run
    OPENAI_API_KEY=... .venv/bin/python -m pipeline.experiments.decisions_audit --n 200

--dry-run writes the requests it would send to data/experiments/decisions_requests.jsonl and stops.
Needs OPENAI_API_KEY in the environment for a live run. Postings are public text; no resumes are sent.

NOT YET RUN AGAINST THE LIVE ENDPOINT. The request shape follows the Decisions API guide
(https://developers.openai.com/api/docs/guides/decisions): POST /v1/decisions with `model`, `input`
and `questions` [{type: "predicate", name, instructions}]; answers come back as
{answers: [{name, type: "predicate" | "refusal", probability}]}. Check the first live response.
"""
import argparse
import glob
import json
import os
import random
import sys
import time

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TAX = json.load(open(os.path.join(ROOT, "pipeline", "taxonomy.json")))
SKILL = {s["id"]: s for s in TAX["skills"]}
G = json.load(open(os.path.join(ROOT, "web", "data", "graph.json")))
DEPTH = {}
for f in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
    DEPTH.update(json.load(open(f)))

# The skills whose regex share looked suspicious in the 2026-10-10 audit (evals/NOTES.md), plus a
# couple of clean ones as controls.
DEFAULT_SKILLS = ["public_sector", "automotive_autonomy", "supply_chain", "hardware", "system_architecture", "ai_ml", "roadmap", "cross_functional"]
MODEL = "gpt-6-luna"
ENDPOINT = "https://api.openai.com/v1/decisions"


def question(skill_id):
    s = SKILL[skill_id]
    what = DEPTH.get(skill_id, {}).get("what", "")
    return {
        "type": "predicate",
        "name": skill_id,
        "instructions": (
            f"Does this job posting ask the person in the role to have or use the skill '{s['name']}'"
            f"{' (' + what + ')' if what else ''}? Count it only when it is part of the role's responsibilities "
            "or qualifications. Do not count mentions in the company description, mission statement, benefits, "
            "equal-opportunity or legal boilerplate, or lists of other teams."
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--family", default="pm")
    ap.add_argument("--skills", default=",".join(DEFAULT_SKILLS))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--max-chars", type=int, default=12000)
    a = ap.parse_args()
    skills = [s for s in a.skills.split(",") if s in SKILL]
    out_dir = os.path.join(ROOT, "data", "experiments")
    os.makedirs(out_dir, exist_ok=True)

    tagged = {j["url"]: j for j in G["jobs"] if j["family"] == a.family}
    ids = G["skill_ids"]
    cache = []
    for f in glob.glob(os.path.join(ROOT, "data", "raw", "jobs", "*.json")):
        d = json.load(open(f))
        cache += [j for j in (d if isinstance(d, list) else d.get("jobs", [])) if j.get("url") in tagged]
    random.seed(a.seed)
    sample = random.sample(cache, min(a.n, len(cache)))
    qs = [question(s) for s in skills]

    reqs = []
    for j in sample:
        reqs.append({"model": MODEL, "input": j["description"][: a.max_chars], "questions": qs, "_url": j["url"]})
    with open(os.path.join(out_dir, "decisions_requests.jsonl"), "w") as f:
        for r in reqs:
            f.write(json.dumps(r) + "\n")
    print(f"{len(reqs)} requests × {len(qs)} questions written to data/experiments/decisions_requests.jsonl")
    if a.dry_run:
        return
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("OPENAI_API_KEY not set; use --dry-run to inspect requests")

    rows = []
    for i, r in enumerate(reqs):
        body = {k: v for k, v in r.items() if not k.startswith("_")}
        for attempt in range(3):
            resp = requests.post(ENDPOINT, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json=body, timeout=60)
            if resp.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            break
        if resp.status_code != 200:
            print(f"[{i}] HTTP {resp.status_code}: {resp.text[:300]}")
            continue
        answers = {x["name"]: x for x in resp.json().get("answers", [])}
        j = tagged[r["_url"]]
        regex = {ids[k] for k in j["skills"]}
        for s in skills:
            ans = answers.get(s, {})
            p = ans.get("probability") if ans.get("type") == "predicate" else None
            rows.append({"url": r["_url"], "company": j["company"], "title": j["title"], "skill": s, "regex": s in regex, "model_p": p, "refusal": ans.get("type") == "refusal"})
        if i % 10 == 0:
            print(f"[{i}/{len(reqs)}] ok")

    with open(os.path.join(out_dir, "decisions_results.jsonl"), "w") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")

    # summary: agreement at p >= 0.5 and the two kinds of disagreement, per skill
    print("\nskill                  n   regex%  model%  both  regex-only  model-only")
    for s in skills:
        rs = [r for r in rows if r["skill"] == s and r["model_p"] is not None]
        if not rs:
            continue
        both = sum(1 for r in rs if r["regex"] and r["model_p"] >= 0.5)
        ro = sum(1 for r in rs if r["regex"] and r["model_p"] < 0.5)
        mo = sum(1 for r in rs if not r["regex"] and r["model_p"] >= 0.5)
        print(f"{s:22s} {len(rs):3d}   {sum(r['regex'] for r in rs)/len(rs):5.0%}   {sum(r['model_p']>=0.5 for r in rs)/len(rs):5.0%}   {both:3d}   {ro:5d}       {mo:5d}")
    print("\nReview file: data/experiments/decisions_results.jsonl (label a few hundred disagreements to set per-skill thresholds).")


if __name__ == "__main__":
    main()
