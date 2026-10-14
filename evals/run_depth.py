"""Content evals for skill depth: the published files of a role set, checked with no model.

    .venv/bin/python evals/run_depth.py               # report; exit 1 when a check fails
    .venv/bin/python evals/run_depth.py --baseline    # also rewrite evals/depth_baseline_mba.md
    .venv/bin/python evals/run_depth.py --only style  # one part: shape, style, specificity, evidence, ladder, subskills, build, roles
    .venv/bin/python evals/run_depth.py --with-corpus # also check every cited sentence against the posting's text (needs the corpus)

What is checked, on pipeline/depth/<roles>_*.json (evals/README.md, "Content evals for skill depth"):

shape        every skill of the role set has a definition; ids are unique; sub-skill patterns compile and carry no inline
             flag; ladders and rungs use the known names; a shown ladder has two rungs or more; every statement, sub-skill
             and step has provenance
style        definitions, examples, rungs and steps: sentence length (25 words; 20 for a step), one or two sentences, active
             voice, no filler, "You ..." for a rung or an example
specificity  a rung names at least two content terms of its cited sentences, from two employers; a step names its target
             or its source
evidence     every statement cites two employers; its postings exist, are US postings of this ladder and this level, and
             carry the skill; the quote is word for word in a cited sentence; a cited sentence is the posting's (with the
             corpus)
ladder       within a ladder, a higher rung does not say what the rung below says
subskills    on the current processed file, a sub-skill is tagged in 5% to 50% of the skill's US postings, at 3 employers;
             its patterns match its own cited sentences; it is not another skill of the taxonomy
build        every step passes the code checks of pipeline.build_steps (demand, source, grounding, template, quote, licence,
             vendor, style, duty, access, slots, numbers) against its stored provenance; at most three per ladder, one per
             kind; none on a ladder on hold; a content step was confirmed by the critic
roles        the role file: five employers per ask; every step passes the same checks

Labels are the published files themselves: a claim that fails is removed from the file, not patched, and the run
that made it is fixed. The baseline lists the counts per ladder so a regression shows as a drop.
"""
import argparse
import collections
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from pipeline import build_steps, depth_gen, roles_mba, tax  # noqa: E402

ROLES = "mba"
lines, totals = [], collections.Counter()
MAX_WORDS = {"what": 30, "example": 25, "rung": 25, "step": 20}
RUNGS = depth_gen.RUNGS


def out(s=""):
    lines.append(s)
    print(s)


def check(part, ok, msg):
    totals[(part, "pass" if ok else "fail")] += 1
    if not ok:
        out(f"  FAIL {msg}")


def load_depth():
    import glob
    depth, roles = {}, {}
    for p in sorted(glob.glob(os.path.join(ROOT, "pipeline", "depth", f"{ROLES}_*.json"))):
        d = json.load(open(p))
        if p.endswith(f"{ROLES}_roles.json"):
            roles = d
        else:
            for sid, e in d.items():
                depth[sid] = (os.path.basename(p), e)
    return depth, roles


def words(s):
    return re.findall(r"[A-Za-z0-9&$%'’/+-]+", s)


def sentences(s):
    return [x for x in re.split(r"(?<=[.!?])\s+", s.strip()) if x]


def style_of(text, kind):
    """The first style rule a text breaks, or None."""
    if not text or not isinstance(text, str):
        return "no text"
    sents = sentences(text)
    if any(len(words(x)) > MAX_WORDS[kind] for x in sents):
        return f"a sentence has more than {MAX_WORDS[kind]} words"
    if len(sents) > 2 or ";" in text or ("(" in text and kind != "what"):
        return "more than two sentences, or a semicolon or bracket"
    if kind in ("rung", "example") and not text.startswith("You "):
        return "does not start with 'You'"
    m = depth_gen.BANNED.search(text) or depth_gen.PASSIVE.search(text)
    if m:
        return f"filler or passive voice: \"{m.group(0)}\""
    return None


# ---- parts -------------------------------------------------------------------------------------------------------
def shape(depth, roles, T):
    out(f"\n== shape ({len(depth)} skills in the depth files)")
    own = {s["id"] for s in T["skills"] if s.get("only")}
    check("shape", set(depth) == own, f"depth files and taxonomy differ: {sorted(set(depth) ^ own)[:6]}")
    check("shape", all(e.get("what") for _, e in depth.values()), f"skills with no definition: {[k for k, (_, e) in depth.items() if not e.get('what')][:6]}")
    ids = collections.Counter(s["id"] for _, e in depth.values() for s in e.get("subskills", []))
    check("shape", not ids or max(ids.values()) == 1, f"sub-skill ids repeat: {[k for k, v in ids.items() if v > 1][:6]}")
    bad_rx = []
    for sid, (_, e) in depth.items():
        for s in e.get("subskills", []):
            if any(re.search(r"\(\?[a-zA-Z]+\)", p) for p in s["patterns"]):
                bad_rx.append((s["id"], "inline flag"))
            try:
                re.compile("|".join(f"(?:{p})" for p in s["patterns"]), re.I)
            except re.error as ex:
                bad_rx.append((s["id"], str(ex)))
            check("shape", s.get("name") and s.get("example") and s.get("patterns") and s["id"] in e.get("provenance", {}).get("subskills", {}), f"{sid}/{s.get('id')}: a sub-skill lacks name, example, patterns or provenance")
    check("shape", not bad_rx, f"sub-skill patterns that do not compile or carry inline flags: {bad_rx[:4]}")
    n_rungs = 0
    for sid, (_, e) in depth.items():
        lad = e.get("ladder") or {}
        prov = e.get("provenance", {}).get("ladder", {})
        check("shape", set(lad) <= set(roles_mba.LADDERS), f"{sid}: a ladder outside the list: {set(lad) - set(roles_mba.LADDERS)}")
        for l, rungs in lad.items():
            n_rungs += len(rungs)
            check("shape", set(rungs) <= set(RUNGS) and list(rungs) == [r for r in RUNGS if r in rungs], f"{sid}/{l}: rungs outside the list or out of order: {list(rungs)}")
            check("shape", len(rungs) >= 2, f"{sid}/{l}: a shown ladder with {len(rungs)} rung")
            for r, text in rungs.items():
                p = prov.get(l, {}).get(r)
                check("shape", p and p.get("statements") and all(st.get("postings") and st.get("employers") and st.get("sentences") for st in p["statements"]), f"{sid}/{l}/{r}: a rung with no provenance")
                check("shape", p and " ".join(st["text"].strip() for st in p.get("statements", [])) == text, f"{sid}/{l}/{r}: the rung text is not its statements joined")
        for l, steps in (e.get("build") or {}).items():
            sp = e.get("provenance", {}).get("build", {}).get(l, [])
            check("shape", len(sp) == len(steps) and all(k in s for s in steps for k in ("kind", "text", "target", "source", "url", "grounding", "demand")), f"{sid}/{l}: build steps lack fields or provenance")
    for f, by in roles.items():
        check("shape", f in roles_mba.FAMILY_LABELS and set(by) <= set(roles_mba.LADDERS), f"roles file: unknown role or ladder under {f}")
        for l, x in by.items():
            check("shape", len(x.get("provenance", {}).get("build", [])) == len(x.get("build", [])) and all(a.get("employers") for a in x.get("asks", [])), f"roles file {f}/{l}: steps without provenance, or asks without counts")
    out(f"  {n_rungs} rungs on {sum(len(e.get('ladder') or {}) for _, e in depth.values())} shown ladders; {sum(len(e.get('subskills', [])) for _, e in depth.values())} sub-skills; "
        f"{sum(len(s) for _, e in depth.values() for s in (e.get('build') or {}).values())} skill steps; {sum(len(x['build']) for by in roles.values() for x in by.values())} role steps")
    out(f"  {totals[('shape', 'pass')]} pass, {totals[('shape', 'fail')]} fail")


def style(depth, roles):
    out("\n== style")
    n = collections.Counter()
    for sid, (_, e) in depth.items():
        n["what"] += 1
        check("style", style_of(e["what"], "what") is None, f"{sid}: definition: {style_of(e['what'], 'what')}")
        for s in e.get("subskills", []):
            n["example"] += 1
            check("style", style_of(s["example"], "example") is None, f"{sid}/{s['id']}: example: {style_of(s['example'], 'example')}")
        for l, rungs in (e.get("ladder") or {}).items():
            for r, text in rungs.items():
                n["rung"] += 1
                for st in e["provenance"]["ladder"][l][r]["statements"]:
                    check("style", style_of(st["text"], "rung") is None and len(sentences(st["text"])) == 1, f"{sid}/{l}/{r}: {style_of(st['text'], 'rung') or 'a statement of two sentences'}")
        for l, steps in (e.get("build") or {}).items():
            for s in steps:
                n["step"] += 1
                check("style", style_of(s["text"], "step") is None, f"{sid}/{l}: step: {style_of(s['text'], 'step')}")
    for f, by in roles.items():
        for l, x in by.items():
            for s in x["build"]:
                n["step"] += 1
                check("style", style_of(s["text"], "step") is None, f"{f}/{l}: step: {style_of(s['text'], 'step')}")
    out("  checked: " + ", ".join(f"{k} {v}" for k, v in n.items()))
    out(f"  {totals[('style', 'pass')]} pass, {totals[('style', 'fail')]} fail")


def specificity(depth, T):
    out("\n== specificity")
    names = {s["id"]: s["name"] for s in T["skills"]}
    for sid, (_, e) in depth.items():
        for l, rungs in (e.get("ladder") or {}).items():
            for r in rungs:
                for st in e["provenance"]["ladder"][l][r]["statements"]:
                    why = depth_gen.specificity(st["text"], [(s["employer"], s["text"]) for s in st["sentences"]], names[sid], True)
                    check("specificity", why is None, f"{sid}/{l}/{r}: {why}: \"{st['text']}\"")
        for s in e.get("subskills", []):
            p = e["provenance"]["subskills"][s["id"]]
            why = depth_gen.specificity(s["example"] + " " + s["name"], [(x["employer"], x["text"]) for x in p["sentences"]], names[sid], False)
            check("specificity", why is None, f"{sid}/{s['id']}: {why}")
        for l, steps in (e.get("build") or {}).items():
            for s in steps:
                check("specificity", build_steps.terms(s["text"]) & (build_steps.terms(s["target_label"]) | build_steps.terms(s["source_title"])), f"{sid}/{l}: a step that names neither its target nor its source: \"{s['text']}\"")
    out(f"  {totals[('specificity', 'pass')]} pass, {totals[('specificity', 'fail')]} fail")


def evidence(depth, jobs, corpus):
    out("\n== evidence" + (" (with the corpus)" if corpus else ""))
    by_id = {j["id"]: j for j in jobs}
    n = 0
    for sid, (_, e) in depth.items():
        for l, rungs in (e.get("ladder") or {}).items():
            for r in rungs:
                for st in e["provenance"]["ladder"][l][r]["statements"]:
                    n += 1
                    check("evidence", len(st["employers"]) >= depth_gen.STMT_MIN_EMPLOYERS, f"{sid}/{l}/{r}: a statement cites {len(st['employers'])} employer")
                    missing = [p for p in st["postings"] if p not in by_id]
                    check("evidence", not missing, f"{sid}/{l}/{r}: cited postings not in the processed file: {missing[:3]}")
                    wrong = [p for p in st["postings"] if p in by_id and not (by_id[p]["country"] == "United States" and by_id[p]["ladder"] == l and depth_gen.RUNG_OF[by_id[p]["level"]] == r and sid in by_id[p]["skills"])]
                    check("evidence", not wrong, f"{sid}/{l}/{r}: cited postings that are not US postings of this skill, ladder and level: {wrong[:3]}")
                    q = depth_gen.norm(st.get("quote") or "")
                    check("evidence", len(q.split()) >= 3 and any(q in depth_gen.norm(s["text"]) for s in st["sentences"]), f"{sid}/{l}/{r}: the quote is not in a cited sentence: \"{st.get('quote')}\"")
                    check("evidence", {s["posting"] for s in st["sentences"]} == set(st["postings"]) and {s["employer"] for s in st["sentences"]} == set(st["employers"]), f"{sid}/{l}/{r}: sentences, postings and employers disagree")
                    if corpus:
                        gone = [s["posting"] for s in st["sentences"] if depth_gen.norm(s["text"]) not in depth_gen.norm(corpus.get(by_id.get(s["posting"], {}).get("url"), ""))]
                        check("evidence", not gone, f"{sid}/{l}/{r}: cited sentences no longer in the posting: {gone[:3]}")
        for s in e.get("subskills", []):
            p = e["provenance"]["subskills"][s["id"]]
            q = depth_gen.norm(p.get("quote") or "")
            check("evidence", len(q.split()) >= 3 and any(q in depth_gen.norm(x["text"]) for x in p["sentences"]), f"{sid}/{s['id']}: the quote is not in a cited sentence")
            rx = re.compile("|".join(f"(?:{x})" for x in s["patterns"]), re.I)
            check("evidence", any(rx.search(x["text"]) for x in p["sentences"]), f"{sid}/{s['id']}: its patterns match none of its own cited sentences")
    out(f"  {n} statements checked")
    out(f"  {totals[('evidence', 'pass')]} pass, {totals[('evidence', 'fail')]} fail")


def ladder(depth):
    out("\n== ladder order")
    for sid, (_, e) in depth.items():
        for l, rungs in (e.get("ladder") or {}).items():
            keys = [r for r in RUNGS if r in rungs]
            for a, b in zip(keys, keys[1:]):
                ta, tb = depth_gen.terms(rungs[a]), depth_gen.terms(rungs[b])
                check("ladder", not (ta and tb and len(ta & tb) / len(ta | tb) >= 0.6), f"{sid}/{l}: the {b} rung says nearly the same as the {a} rung")
    out(f"  {totals[('ladder', 'pass')]} pass, {totals[('ladder', 'fail')]} fail")


def subskills(depth, jobs, T):
    out("\n== sub-skills on the processed file")
    us = [j for j in jobs if j["country"] == "United States"]
    by_skill = collections.defaultdict(list)
    for j in us:
        for k in j["skills"]:
            by_skill[k].append(j)
    names = {depth_gen.norm(s["name"].split(" (")[0]): s["id"] for s in T["skills"]}
    rows = []
    for sid, (_, e) in depth.items():
        js = by_skill[sid]
        for s in e.get("subskills", []):
            hit = [j for j in js if s["id"] in j.get("sub", [])]
            share = len(hit) / max(1, len(js))
            emp = len({j["company"] for j in hit})
            rows.append((sid, s["id"], share, emp))
            check("subskills", share >= depth_gen.SUB_MIN_SHARE and emp >= depth_gen.SUB_MIN_EMPLOYERS, f"{sid}/{s['id']}: tagged in {share:.1%} of the skill's postings at {emp} employers")
            check("subskills", share <= 0.5, f"{sid}/{s['id']}: tagged in {share:.1%} of the skill's postings: it is the skill, not a part of it")
            check("subskills", names.get(depth_gen.norm(s["name"])) in (None, sid), f"{sid}/{s['id']}: named like the skill {names.get(depth_gen.norm(s['name']))}")
    if rows:
        shares = sorted(r[2] for r in rows)
        out(f"  {len(rows)} sub-skills; share of the skill's postings: median {shares[len(shares) // 2]:.1%}, min {shares[0]:.1%}, max {shares[-1]:.1%}")
    out(f"  {totals[('subskills', 'pass')]} pass, {totals[('subskills', 'fail')]} fail")


def target_row(step, p, lex_by_id):
    """A target row rebuilt from a step's provenance, for pipeline.build_steps.check_step."""
    t = lex_by_id[step["target"]]
    return {"id": step["target"], "label": step["target_label"], "kind": t["kind"], "activity": bool(t.get("activity")), "scope": step["scope"], "level": step.get("level") or "associate",
            "employers": p["target_employers"], "evidence": [{"id": f"e{i}", "company": s["employer"], "text": s["text"]} for i, s in enumerate(p["sentences"])]}


def step_record(step, p, skill, role):
    return {"n": step["text"][:30], "for": "role" if role else "skill", "skill": skill, "family": role, "template": p["template"], "kind": step["kind"], "target": step["target"], "scope": step["scope"],
            "level": step.get("level") or "associate", "source": step["source"], "item": p.get("item", ""), "slots": p.get("slots") or {}, "quote": p.get("quote", ""),
            "evidence": [f"e{i}" for i in range(len(p["sentences"]))], "text": step["text"], "grounding": step["grounding"]}


def build(depth, roles):
    out("\n== build steps")
    reg, lex_by_id = build_steps.registry(), {t["id"]: t for t in build_steps.lexicon()}
    n = 0
    for sid, (_, e) in depth.items():
        for l, steps in (e.get("build") or {}).items():
            check("build", len(steps) <= 3 and len({s["kind"] for s in steps}) == len(steps) and len({s["target"] for s in steps}) == len(steps), f"{sid}/{l}: more than three steps, or two of one kind or on one target")
            check("build", l not in reg["ladders_on_hold"], f"{sid}/{l}: a step on a ladder on hold")
            for s, p in zip(steps, e["provenance"]["build"][l]):
                n += 1
                rec = step_record(s, p, sid, None)
                bad = build_steps.check_step(rec, [target_row(s, p, lex_by_id)], reg, lex_by_id, l, {})
                check("build", not bad, f"{sid}/{l}: \"{s['text']}\": " + "; ".join(f"{k}: {v}" for k, v in bad.items()))
                check("build", s["grounding"] in ("content", "input only"), f"{sid}/{l}: a skill step with grounding '{s['grounding']}'")
    for f, by in roles.items():
        for l, x in by.items():
            check("roles", all(a["employers"] >= build_steps.MIN_EMPLOYERS["role"] for a in x["asks"]), f"{f}/{l}: an ask with fewer than {build_steps.MIN_EMPLOYERS['role']} employers")
            for s, p in zip(x["build"], x["provenance"]["build"]):
                n += 1
                rec = step_record(s, p, None, f)
                bad = build_steps.check_step(rec, [target_row(s, p, lex_by_id)], reg, lex_by_id, l, {})
                check("roles", not bad, f"{f}/{l}: \"{s['text']}\": " + "; ".join(f"{k}: {v}" for k, v in bad.items()))
    out(f"  {n} steps checked against {len(reg['sources'])} source records")
    out(f"  {totals[('build', 'pass')]} pass, {totals[('build', 'fail')]} fail; roles: {totals[('roles', 'pass')]} pass, {totals[('roles', 'fail')]} fail")


def summary(depth, roles):
    """Counts per ladder for the baseline."""
    rows = []
    for l in roles_mba.LADDERS:
        shown = [(sid, e["ladder"][l]) for sid, (_, e) in depth.items() if l in (e.get("ladder") or {})]
        rungs = collections.Counter(r for _, x in shown for r in x)
        subs = sum(1 for _, e in depth.values() for s in e.get("subskills", []) if l in e["provenance"]["subskills"][s["id"]]["ladders"])
        steps = sum(len((e.get("build") or {}).get(l, [])) for _, e in depth.values())
        rsteps = sum(len(by[l]["build"]) for by in roles.values() if l in by)
        rasks = sum(len(by[l]["asks"]) for by in roles.values() if l in by)
        rows.append(f"| {roles_mba.LADDERS[l]['label']} | {len(shown)} | {sum(rungs.values())} | " + ", ".join(f"{r} {rungs[r]}" for r in RUNGS) + f" | {subs} | {steps} | {rasks} / {rsteps} |")
    return ["| Ladder | Skills with a ladder shown | Rungs | By rung | Sub-skills drafted on it | Skill steps | Role asks / steps |", "|---|---|---|---|---|---|---|"] + rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--only")
    ap.add_argument("--with-corpus", action="store_true")
    args = ap.parse_args()
    want = lambda p: not args.only or args.only == p
    depth, roles = load_depth()
    T = tax.for_roles(ROLES)
    jobs = json.load(open(os.path.join(ROOT, "data", "processed", f"jobs_{ROLES}.json")))
    corpus = None
    if args.with_corpus:
        corpus = {}
        with open(os.path.join(ROOT, "data", "experiments", f"corpus_{ROLES}.jsonl")) as f:
            for line in f:
                r = json.loads(line)
                corpus[r["url"]] = r["text"]
    if want("shape"):
        shape(depth, roles, T)
    if want("style"):
        style(depth, roles)
    if want("specificity"):
        specificity(depth, T)
    if want("evidence"):
        evidence(depth, jobs, corpus)
    if want("ladder"):
        ladder(depth)
    if want("subskills"):
        subskills(depth, jobs, T)
    if want("build") or want("roles"):
        build(depth, roles)
    p = sum(v for (_, k), v in totals.items() if k == "pass")
    f = sum(v for (_, k), v in totals.items() if k == "fail")
    out(f"\nTOTAL: {p} pass, {f} fail")
    if args.baseline:
        if args.only or f:
            sys.exit("the baseline is written from a full run with no failures")
        md = ["# Depth content baseline: the MBA role set", "",
              f"Generated by `.venv/bin/python evals/run_depth.py --baseline` on {time.strftime('%Y-%m-%d')}. Do not edit by hand.", "",
              "What is published per ladder. A change that lowers a count has removed content; say why in the commit.", "", *summary(depth, roles), "", "```", *lines, "```"]
        with open(os.path.join(HERE, f"depth_baseline_{ROLES}.md"), "w") as fh:
            fh.write("\n".join(md) + "\n")
        print(f"wrote evals/depth_baseline_{ROLES}.md")
    sys.exit(1 if f else 0)


if __name__ == "__main__":
    main()
