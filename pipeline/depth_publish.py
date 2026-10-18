"""Publish checked skill depth for a role set into pipeline/depth/<roles>_*.json.

    .venv/bin/python -m pipeline.depth_publish --depth full [--build build_all] [--dry-run]

Reads the finished runs in data/experiments/depth/ (pipeline.depth_gen: sub-skills and ladder rungs;
pipeline.build_steps: build steps of skills and of roles) and writes, per skill, the shape the product skills use:

    what        the one-line definition (kept as it is)
    subskills   [{id, name, patterns, example}]: the kept sub-skills of every ladder, merged (one list per skill)
    ladder      {ladder: {rung: text}}: one ladder per industry (corporate, bank, consulting); only ladders with
                two or more rungs are shown (PLAN.md, step 8); an empty rung stays empty
    build       {ladder: [{kind, text, target, source, url, grounding, demand}]}
    provenance  for every statement: posting ids, employers, the quoted phrase and the cited sentences; for every
                sub-skill and build step the same; and the reason of every empty rung

and pipeline/depth/<roles>_roles.json: per role and ladder, the licences, exams and degrees employers ask for,
with their steps (decision 1 of the build-steps pilot).

Checks done here, beyond the runs' own (counted in the publish report):
- a sub-skill pattern is cleaned of inline flags (JavaScript has none) and must compile;
- a sub-skill's patterns must match at least one of its own cited sentences;
- a sub-skill must be a part of the skill, not the whole of it (its patterns match at most half of the skill's
  US postings) and not another skill of the taxonomy (same name, or the same postings as another skill);
- the same sub-skill drafted on two ladders is published once (same name, or the same postings).
evals/run_depth.py checks the published files again with no model.
"""
import argparse
import collections
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from pipeline import depth_gen, extract, roles_mba, tax  # noqa: E402

OUT = depth_gen.OUT
MIN_RUNGS = 2             # a ladder with fewer kept rungs shows the definition only (PLAN.md, step 8)
SUB_MAX_SHARE = 0.5       # a sub-skill is a part of the skill: its patterns match at most this share of the skill's postings
SAME_POSTINGS = 0.6       # two sub-skills (or a sub-skill and a skill) with this Jaccard overlap of matched postings are the same thing
INLINE_FLAGS = re.compile(r"\(\?[a-zA-Z]+\)")


def slug(name, n=32):
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", name.lower())).strip("_")[:n].rstrip("_")


def clean_patterns(patterns):
    """Patterns as the taxonomy stores them: no inline flags (the web matcher compiles with the i flag), each one compiles."""
    out = []
    for p in patterns or []:
        p = INLINE_FLAGS.sub("", p).strip()
        if not p:
            continue
        try:
            re.compile(p, re.I)
        except re.error:
            return None
        out.append(p)
    return out or None


def hits_of(patterns, postings):
    rx = re.compile("|".join(f"(?:{p})" for p in patterns), re.I)
    return {u for u, t in postings if rx.search(t)}


def load_runs(depth_tag, build_tag):
    runs = {"depth": json.load(open(os.path.join(OUT, f"{depth_tag}.json")))}
    for name, path in (("build", f"{build_tag}.json"), ("build_targets", f"{build_tag}_targets.json"), ("roles", "build_roles.json")):
        p = os.path.join(OUT, path)
        runs[name] = json.load(open(p)) if os.path.exists(p) else None
    return runs


def statement_provenance(c, by_id, ids):
    sents = [by_id[e] for e in c["evidence"] if e in by_id]
    return {"text": c["text"], "quote": c.get("quote") or "", "postings": sorted({ids.get(s["url"], s["url"]) for s in sents}),
            "employers": sorted({s["company"] for s in sents}), "sentences": [{"posting": ids.get(s["url"], s["url"]), "employer": s["company"], "text": s["text"]} for s in sents]}


def publish_skill(skill, results, jobs, corpus, ids, T, report):
    """One skill's subskills, ladder, provenance from its (skill, ladder) results."""
    sub_cands, ladder, prov = [], {}, {"ladder": {}, "subskills": {}, "runs": {}}
    for r in results:
        lad = r["ladder"]
        by_id = {s["id"]: s for cell in r["pack"].values() for s in cell["sentences"]}
        prov["runs"][lad] = {"drafter": r.get("_drafter"), "critic": r.get("_critic"), "generated": r.get("_generated"),
                             "postings_per_rung": {k: {"n": v["n_postings"], "employers": v["n_employers"]} for k, v in r["pack"].items()}}
        # rungs
        fr = depth_gen.final_rungs(r)
        rungs, lp = {}, {}
        for rung, (st, c) in fr.items():
            if st == "ok":
                stmts = [x for x in r["claims"] if x["kind"] == "stmt" and x["key"] == rung and x["status"] == "ok" and x["round"] == c["round"]]
                rungs[rung] = c["text"]
                lp[rung] = {"statements": [statement_provenance(x, by_id, ids) for x in stmts], "postings": sorted({ids.get(by_id[e]["url"], by_id[e]["url"]) for e in c["evidence"] if e in by_id}),
                            "employers": sorted({by_id[e]["company"] for e in c["evidence"] if e in by_id})}
            else:
                lp[rung] = {"empty": st, "why": depth_gen.DROP_WHY.get(st, "") + ((": " + c["why"]) if c and c.get("why") else "")}
        report["rungs_kept"][lad] += len(rungs)
        if len(rungs) >= MIN_RUNGS:
            ladder[lad] = {k: rungs[k] for k in depth_gen.RUNGS if k in rungs}
            report["ladders_shown"][lad] += 1
        elif rungs:
            report["ladders_one_rung"][lad] += 1
            for k in rungs:
                lp[k] = {**lp[k], "not_shown": f"the ladder has {len(rungs)} rung, fewer than {MIN_RUNGS}"}
        prov["ladder"][lad] = {k: lp[k] for k in depth_gen.RUNGS if k in lp}
        # sub-skills
        for c in depth_gen.final_subskills(r):
            if c["status"] == "ok":
                sub_cands.append((lad, c, by_id))
    # sub-skills: clean, bound, merge
    postings = [(u, corpus.get(u, "")) for u, j in jobs.items() if skill in j["skills"]]
    others = {sid: {u for u, j in jobs.items() if sid in j["skills"]} for sid in T if sid != skill}
    other_names = {depth_gen.norm(T[sid]["name"].split(" (")[0]) for sid in T if sid != skill}
    kept, used_ids = [], set()
    for lad, c, by_id in sorted(sub_cands, key=lambda x: -len({x[2][e]["company"] for e in x[1]["evidence"] if e in x[2]})):
        pats = clean_patterns(c.get("patterns"))
        if not pats:
            report["subs_dropped"]["pattern does not compile"] += 1
            continue
        hit = hits_of(pats, postings)
        rx = re.compile("|".join(f"(?:{p})" for p in pats), re.I)
        if not any(rx.search(by_id[e]["text"]) for e in c["evidence"] if e in by_id):
            report["subs_dropped"]["patterns match none of its own cited sentences"] += 1
            continue
        if len(hit) > SUB_MAX_SHARE * len(postings):
            report["subs_dropped"]["matches more than half of the skill's postings"] += 1
            continue
        if len(hit) < depth_gen.SUB_MIN_SHARE * len(postings) or len({jobs[u]["company"] for u in hit}) < depth_gen.SUB_MIN_EMPLOYERS:
            report["subs_dropped"]["matches too few postings on the current data"] += 1
            continue
        name_n = depth_gen.norm(c["name"])
        if name_n in other_names or any(len(hit & o) / len(hit | o) >= SAME_POSTINGS for o in others.values() if o):
            report["subs_dropped"]["is another skill of the taxonomy"] += 1
            continue
        same = next((k for k in kept if depth_gen.norm(k["name"]) == name_n or len(hit & k["_hit"]) / max(1, len(hit | k["_hit"])) >= SAME_POSTINGS), None)
        if same:
            same["_ladders"].add(lad)
            report["subs_merged"] += 1
            continue
        sid = f"{skill}_{slug(c['name'])}"
        while sid in used_ids:
            sid += "_"
        used_ids.add(sid)
        kept.append({"id": sid, "name": c["name"], "patterns": pats, "example": c["example"], "_hit": hit, "_ladders": {lad},
                     "_prov": {**statement_provenance({"text": c["example"], "evidence": c["evidence"], "quote": c.get("quote")}, by_id, ids), "ladders": None}})
    subs = []
    for k in kept:
        p = k.pop("_prov")
        p["ladders"] = sorted(k.pop("_ladders"))
        p["share"] = round(len(k.pop("_hit")) / max(1, len(postings)), 3)
        prov["subskills"][k["id"]] = p
        subs.append(k)
    report["subs_kept"] += len(subs)
    return subs, ladder, prov


def build_of(skill, runs, ids, report):
    """{ladder: [steps]} and its provenance for one skill, from the build run's final candidates."""
    if not runs["build"]:
        return {}, {}
    targets = {(p["skill"], p["ladder"]): {t["id"]: t for t in p["targets"]} for p in runs["build_targets"]["pairs"]}
    build, prov = {}, {}
    for r in runs["build"]["results"]:
        if r["skill"] != skill:
            continue
        steps, sp = [], []
        for c in r["candidates"]:
            if c["n"] not in r["final"] or c["status"] != "ok":
                continue
            t = targets[(skill, r["ladder"])][c["target"]]
            ev = [e for e in t["evidence"] if e["id"] in c["evidence"]]
            steps.append({"kind": c["kind"], "text": c["text"], "target": c["target"], "target_label": t["label"], "scope": c["scope"], "level": c["level"], "source": c["source"],
                          "source_title": c["source_title"], "url": c["source_url"], "grounding": c["grounding"], "demand": c["demand_line"]})
            sp.append({"postings": sorted({e.get("id_posting") or ids.get(e["url"], e["url"]) for e in ev}), "employers": sorted({e["company"] for e in ev}),
                       "sentences": [{"posting": e.get("id_posting") or ids.get(e["url"], e["url"]), "employer": e["company"], "text": e["text"]} for e in ev],
                       "target_sentences": [{"posting": e.get("id_posting") or ids.get(e["url"], e["url"]), "employer": e["company"], "text": e["text"]} for e in t["evidence"]],
                       "target_employers": t["employers"], "item": c.get("item") or "", "quote": c.get("quote") or "", "template": c["template"], "slots": c.get("slots") or {}})
        if steps:
            build[r["ladder"]], prov[r["ladder"]] = steps, sp
            report["steps_published"][r["ladder"]] += len(steps)
    return build, prov


def roles_file(runs, ids):
    out = {}
    for rt in (runs["roles"] or {}).get("results", []):
        steps, sp = [], []
        for c in rt["steps"]:
            if c["n"] not in rt["final"]:
                continue
            t = next(x for x in rt["targets"] if x["id"] == c["target"])
            ev = [e for e in t["evidence"] if e["id"] in c["evidence"]]
            steps.append({"kind": c["kind"], "text": c["text"], "target": c["target"], "target_label": t["label"], "scope": "role", "level": t["level"], "source": c["source"],
                          "source_title": c["source_title"], "url": c["source_url"], "grounding": c["grounding"], "demand": c["demand_line"]})
            sp.append({"postings": sorted({e.get("id_posting") or ids.get(e["url"], e["url"]) for e in ev}), "employers": sorted({e["company"] for e in ev}),
                       "sentences": [{"posting": e.get("id_posting") or ids.get(e["url"], e["url"]), "employer": e["company"], "text": e["text"]} for e in ev],
                       "target_sentences": [{"posting": e.get("id_posting") or ids.get(e["url"], e["url"]), "employer": e["company"], "text": e["text"]} for e in t["evidence"]],
                       "target_employers": t["employers"], "template": c["template"], "slots": c.get("slots") or {}})
        asks = [{"target": t["id"], "label": t["label"], "kind": t["kind"], "level": t["level"], "employers": t["employers"], "postings": t["postings"], "of_postings": t["of_postings"],
                 **({"note": t["access_note"]} if t.get("access_note") else {})} for t in rt["targets"]]
        out.setdefault(rt["family"], {})[rt["ladder"]] = {"asks": asks, "build": steps, "provenance": {"build": sp, "entry_postings": rt["entry_postings"], "entry_employers": rt["entry_employers"]}}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--depth", default="full", help="tag of the depth_gen run")
    ap.add_argument("--build", default="build_all", help="tag of the build_steps run")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()
    runs = load_runs(args.depth, args.build)
    jobs, corpus = depth_gen.load(args.roles)
    ids = {u: j["id"] for u, j in jobs.items()}
    T = {s["id"]: s for s in tax.for_roles(args.roles)["skills"]}
    D = runs["depth"]
    by_skill = collections.defaultdict(list)
    for r in D["results"]:
        r["_drafter"], r["_critic"], r["_generated"] = D["drafter"], D["critic"], D["generated"]
        by_skill[r["skill"]].append(r)
    report = {"rungs_kept": collections.Counter(), "ladders_shown": collections.Counter(), "ladders_one_rung": collections.Counter(), "subs_dropped": collections.Counter(),
              "subs_merged": 0, "subs_kept": 0, "steps_published": collections.Counter(), "skills_with_ladder": 0, "skills_with_subskills": 0}
    import glob
    files = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "pipeline", "depth", f"{args.roles}_*.json"))):
        if p.endswith(f"{args.roles}_roles.json"):
            continue
        files[p] = json.load(open(p))
    for path, d in files.items():
        for sid, entry in d.items():
            new = {"what": entry.get("what", "")}
            if sid in by_skill:
                subs, ladder, prov = publish_skill(sid, by_skill[sid], jobs, corpus, ids, T, report)
                build, bprov = build_of(sid, runs, ids, report)
                if subs:
                    new["subskills"] = subs
                    report["skills_with_subskills"] += 1
                if ladder:
                    new["ladder"] = ladder
                    report["skills_with_ladder"] += 1
                if build:
                    new["build"] = build
                prov["build"] = bprov
                new["provenance"] = prov
            d[sid] = new
    roles = roles_file(runs, ids)
    L = [f"# Publish report ({time.strftime('%Y-%m-%d')}): depth run `{args.depth}`, build run `{args.build}`", "",
         f"- Skills with a ladder shown: {report['skills_with_ladder']} of {sum(len(d) for d in files.values())}; with sub-skills: {report['skills_with_subskills']}.",
         "- Rungs published per ladder: " + ", ".join(f"{k} {v}" for k, v in report["rungs_kept"].items()) + ".",
         "- Ladders shown (two rungs or more): " + ", ".join(f"{k} {v}" for k, v in report["ladders_shown"].items()) + "; ladders with one rung, not shown: " + ", ".join(f"{k} {v}" for k, v in report["ladders_one_rung"].items()) + ".",
         f"- Sub-skills published: {report['subs_kept']}; merged across ladders: {report['subs_merged']}; dropped here: " + (", ".join(f"{k} {v}" for k, v in report["subs_dropped"].items()) or "none") + ".",
         "- Build steps published per ladder: " + (", ".join(f"{k} {v}" for k, v in report["steps_published"].items()) or "none") + ".",
         f"- Roles with credential asks: {sum(len(v) for v in roles.values())} role-and-ladder pairs; with a step: {sum(1 for v in roles.values() for x in v.values() if x['build'])}."]
    print("\n".join(L))
    if args.dry_run:
        return
    for path, d in files.items():
        with open(path, "w") as f:
            f.write(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
    with open(os.path.join(ROOT, "pipeline", "depth", f"{args.roles}_roles.json"), "w") as f:
        f.write(json.dumps(roles, indent=1, ensure_ascii=False) + "\n")
    with open(os.path.join(OUT, "publish_report.md"), "w") as f:
        f.write("\n".join(L) + "\n")
    print("wrote", len(files), "depth files and", os.path.join("pipeline", "depth", f"{args.roles}_roles.json"))


if __name__ == "__main__":
    main()
