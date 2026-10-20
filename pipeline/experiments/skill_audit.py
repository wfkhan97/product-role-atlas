"""Model audit of a role set's skills: when the patterns tag a posting, does the posting really ask for the skill?

    .venv/bin/python -m pipeline.experiments.skill_audit --roles mba --dry-run       # write the requests, send nothing
    .venv/bin/python -m pipeline.experiments.skill_audit --roles mba                 # live (OPENAI_API_KEY in .env)
    .venv/bin/python -m pipeline.experiments.skill_audit --roles mba --reuse         # after a taxonomy change: keep the
                                                                                     # model's answers, recompute the regex side

For every skill it draws --k postings the patterns tagged (how many does the model accept: precision) and --k
postings from the skill's three most common roles that the patterns did not tag (how many does the model say
ask for it: misses). One request per posting carries the questions for the skills sampled on it, using the same
lenient predicate question as decisions_audit.py. Postings are public text. Answers are kept in
data/experiments/skill_audit_<roles>.jsonl (gitignored); the summary goes to evals/extraction_audit_<roles>.md.
Needs data/processed/jobs_<roles>.json (pipeline.extract) and the corpus from role_corpus.py.
"""
import argparse
import collections
import glob
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from pipeline import processed, tax
from pipeline.experiments import role_corpus
from pipeline.experiments.decisions_audit import ENDPOINT, MODEL
from pipeline.env import load_env

DEPTH = {}
for _f in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
    DEPTH.update(json.load(open(_f)))


def question(s):
    what = DEPTH.get(s["id"], {}).get("what", "")
    return {"type": "predicate", "name": s["id"], "instructions": (
        f"Does this job posting ask the person in the role to have or use the skill '{s['name']}'"
        f"{' (' + what + ')' if what else ''}? Count it only when it is part of the role's responsibilities "
        "or qualifications. Do not count mentions in the company description, mission statement, benefits, "
        "equal-opportunity or legal boilerplate, or lists of other teams.")}


def paths(roleset):
    d = os.path.join(ROOT, "data", "experiments")
    return os.path.join(d, f"skill_audit_{roleset}_requests.jsonl"), os.path.join(d, f"skill_audit_{roleset}.jsonl")


def tagged_by_url(roleset):
    jobs = processed.load(roleset)
    return {j["url"]: j for j in jobs if j.get("url")}


def report(roleset, rows, skills):
    name = {s["id"]: s for s in skills}
    lines = [f"# Extraction audit: the {roleset.upper()} role set, regex against model judgment", "",
             f"Produced by `pipeline/experiments/skill_audit.py` on {time.strftime('%Y-%m-%d')}. For each skill, a sample of postings the patterns"
             " tagged (accepted = the model agrees the posting asks for it) and a sample from the skill's three most common roles that the patterns"
             " did not tag (missed = the model says the posting asks for it). Model answers at probability 0.5 or more count as yes. The samples are"
             " small, so read each row as a flag, not a measurement. After a taxonomy change rerun with `--reuse` to recompute the regex side"
             " without new model calls.", ""]
    stats = []
    for s in skills:
        rs = [r for r in rows if r["skill"] == s["id"] and r["model_p"] is not None]
        hit = [r for r in rs if r["regex"]]
        miss = [r for r in rs if not r["regex"]]
        if not rs:
            continue
        acc = sum(r["model_p"] >= 0.5 for r in hit)
        mis = sum(r["model_p"] >= 0.5 for r in miss)
        stats.append((acc / len(hit) if hit else 1.0, s, len(hit), acc, len(miss), mis))
    th, ta = sum(x[2] for x in stats), sum(x[3] for x in stats)
    tm, tmm = sum(x[4] for x in stats), sum(x[5] for x in stats)
    lines += [f"Across {len(stats)} skills: the model accepts {ta:,} of {th:,} tagged samples ({ta / max(th, 1):.0%}) and finds the skill in"
              f" {tmm:,} of {tm:,} untagged samples from the same roles ({tmm / max(tm, 1):.0%}).", "",
              "| skill | cluster | tagged: accepted | untagged: missed |", "|---|---|---|---|"]
    for p, s, nh, acc, nm, mis in sorted(stats, key=lambda x: (x[0], x[1]["id"])):
        lines.append(f"| {s['name']} | {s['cluster']} | {acc}/{nh} ({p:.0%}) | {mis}/{nm} |")
    out = os.path.join(ROOT, "evals", f"extraction_audit_{roleset}.md")
    with open(out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print("wrote", os.path.relpath(out, ROOT), f"| accepted {ta}/{th}, missed {tmm}/{tm}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--skills", help="comma-separated ids (default: the skills specific to the role set)")
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--max-chars", type=int, default=12000)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--reuse", action="store_true")
    a = ap.parse_args()
    t = tax.for_roles(a.roles)
    skills = [s for s in t["skills"] if (s["id"] in a.skills.split(",") if a.skills else s.get("only"))]
    req_path, res_path = paths(a.roles)
    tagged = tagged_by_url(a.roles)

    if a.reuse:
        rows = []
        for line in open(res_path):
            r = json.loads(line)
            j = tagged.get(r["url"])
            if j is not None:  # postings dropped since the answers were recorded fall out
                rows.append({**r, "regex": r["skill"] in j["skills"]})
        with open(res_path, "w") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        return report(a.roles, rows, [s for s in t["skills"] if s["id"] in {r["skill"] for r in rows}])

    corpus = {r["url"]: r for r in role_corpus.load(a.roles) if r.get("url")}
    pool = [j for u, j in tagged.items() if u in corpus]
    by_role = collections.defaultdict(list)
    for j in pool:
        by_role[j["family"]].append(j)
    rng = random.Random(a.seed)
    ask = collections.defaultdict(list)  # url -> skills to ask about
    for s in skills:
        sid = s["id"]
        hits = [j for j in pool if sid in j["skills"]]
        for j in rng.sample(hits, min(a.k, len(hits))):
            ask[j["url"]].append(s)
        top = sorted(by_role, key=lambda f: -sum(sid in j["skills"] for j in by_role[f]) / len(by_role[f]))[:3]
        misses = [j for f in top for j in by_role[f] if sid not in j["skills"]]
        for j in rng.sample(misses, min(a.k, len(misses))):
            ask[j["url"]].append(s)
    reqs = [{"model": MODEL, "input": corpus[u]["text"][:a.max_chars], "questions": [question(s) for s in ss], "_url": u} for u, ss in ask.items()]
    with open(req_path, "w") as f:
        for r in reqs:
            f.write(json.dumps(r) + "\n")
    nq = sum(len(r["questions"]) for r in reqs)
    print(f"{len(reqs)} requests, {nq} questions over {len(skills)} skills -> {os.path.relpath(req_path, ROOT)}")
    if a.dry_run:
        return
    load_env()
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit("OPENAI_API_KEY not set (.env); use --dry-run to inspect requests")

    def send(r):
        body = {k: v for k, v in r.items() if not k.startswith("_")}
        for attempt in range(4):
            try:
                resp = requests.post(ENDPOINT, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json=body, timeout=90)
            except requests.RequestException:
                time.sleep(2 ** attempt); continue
            if resp.status_code in (429, 500, 502, 503):
                time.sleep(2 ** attempt); continue
            break
        else:
            return r, None, "no response"
        if resp.status_code != 200:
            return r, None, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return r, {x["name"]: x for x in resp.json().get("answers", [])}, None

    rows, failed = [], 0
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for i, (r, answers, err) in enumerate(ex.map(send, reqs)):
            if err:
                failed += 1
                if failed <= 5:
                    print(f"[{i}] {err}")
                continue
            j = tagged[r["_url"]]
            for q in r["questions"]:
                ans = answers.get(q["name"], {})
                rows.append({"url": r["_url"], "company": j["company"], "title": j["title"], "family": j["family"], "skill": q["name"],
                             "regex": q["name"] in j["skills"], "model_p": ans.get("probability") if ans.get("type") == "predicate" else None,
                             "refusal": ans.get("type") == "refusal"})
            if i % 200 == 0:
                print(f"[{i}/{len(reqs)}]", flush=True)
    if not rows:
        sys.exit(f"no answers ({failed} failed requests); nothing written")
    with open(res_path, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"{len(rows)} answers, {failed} failed requests -> {os.path.relpath(res_path, ROOT)}")
    report(a.roles, rows, skills)


if __name__ == "__main__":
    main()
