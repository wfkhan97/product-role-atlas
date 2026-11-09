"""Definition, sub-skill and ladder drafts for the skills that have none, from the model read of the backlog.

    .venv/bin/python -m pipeline.experiments.postings_ladders packs            # evidence per skill and ladder, nothing sent
    .venv/bin/python -m pipeline.experiments.postings_ladders draft [--dry-run] # one Opus batch: a draft per pair
    .venv/bin/python -m pipeline.experiments.postings_ladders check            # collect; code checks; one Haiku batch: the critic
    .venv/bin/python -m pipeline.experiments.postings_ladders finish           # collect the critic; write the run files

The skills: the tech-only skills with no definition in pipeline/depth/ and the eleven MBA skills added with the later
roles (PLAN.md, "Later"). The evidence is not the regex tags: it is every US posting where the model read
(pipeline.experiments.postings_read, the Haiku read) named the skill, and the sentence its quote sits in.

The draft has the shape pipeline.depth_gen works on (sub-skills with patterns, example, evidence ids and a quote; one
or two statements a rung, each citing two employers of its own level), plus "what", a one-line definition. The claims
pass depth_gen's own code checks and its support question (asked of Haiku here, in a batch). The swap test and the
redraft round are not run. Nothing is written to pipeline/depth/: the run files under
data/experiments/postings_read/ladders/ are drafts for the data thread, which decides what to publish.
"""
import argparse
import collections
import json
import os
import random
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from pipeline import depth_gen as dg, extract, roles_mba, roles_tech, tax  # noqa: E402
from pipeline.experiments import postings_read as pr  # noqa: E402

OUT = os.path.join(pr.OUT, "ladders")
PACKS, DRAFTS, CRITIC = (os.path.join(OUT, f) for f in ("packs.json", "drafts.json", "critic.json"))
MBA_LATER = ["esg_reporting", "carbon_accounting", "decarbonization_strategy", "government_affairs", "fraud_prevention", "ats_tools",
             "technical_demos_poc", "implementation_delivery", "crisis_issues_mgmt", "editorial_writing", "research_design"]
RUNG_NAMES = dict(dg.RUNG_NAMES)
RUNG_NAMES["engineering"] = {"associate": "New grad, engineer I", "mid": "Engineer II", "senior": "Senior", "lead": "Staff, principal, manager and above"}
RUNG_NAMES["legal"] = {"associate": "Associate counsel", "mid": "Counsel", "senior": "Senior counsel", "lead": "Lead counsel, associate GC and above"}
LABELS = {"mba": {k: v["label"] for k, v in roles_mba.LADDERS.items()}, "tech": {k: v["label"] for k, v in roles_tech.LADDERS.items()}}
AUDIENCE = {"mba": "MBA and graduate students", "tech": "students and early-career people who want engineering, data, security, design and legal jobs at technology employers"}
MAX_SENTENCE = 450
DRAFT_MODEL, CRITIC_MODEL = "opus", "haiku"
DRAFT_MAX_TOKENS = 16000  # thinking and the answer; 59 drafts at the most cost about $10 at batch rates

DRAFT_SCHEMA = {
    "type": "object",
    "properties": {
        "what": {"type": "string"},
        "subskills": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string"}, "patterns": {"type": "array", "items": {"type": "string"}}, "example": {"type": "string"},
            "evidence": {"type": "array", "items": {"type": "string"}}, "quote": {"type": "string"},
        }, "required": ["name", "patterns", "example", "evidence", "quote"], "additionalProperties": False}},
        "rungs": {"type": "object", "properties": {r: {"type": "array", "items": {"type": "object", "properties": {
            "text": {"type": "string"}, "evidence": {"type": "array", "items": {"type": "string"}}, "quote": {"type": "string"},
        }, "required": ["text", "evidence", "quote"], "additionalProperties": False}} for r in dg.RUNGS},
            "required": dg.RUNGS, "additionalProperties": False},
    },
    "required": ["what", "subskills", "rungs"],
    "additionalProperties": False,
}
SUPPORT_SCHEMA = {
    "type": "object",
    "properties": {"supported": {"type": "string", "enum": ["yes", "partly", "no"]}, "unsupported_part": {"type": "string"},
                   "reason": {"type": "string"}, "employers": {"type": ["integer", "null"]}},
    "required": ["supported", "unsupported_part", "reason", "employers"],
    "additionalProperties": False,
}


def targets():
    """{set: [skill ids]}: the tech-only skills with no definition yet, and the eleven later MBA skills."""
    depth = pr.depth()
    T = json.load(open(os.path.join(ROOT, "pipeline", "taxonomy.json")))["skills"]
    T = T if isinstance(T, list) else [dict(v, id=k) for k, v in T.items()]
    return {"tech": [s["id"] for s in T if s.get("only") == ["tech"] and not (depth.get(s["id"]) or {}).get("what")], "mba": list(MBA_LATER)}, {s["id"]: s for s in T}


def ladder_of(set_, rec):
    if set_ == "tech":
        return roles_tech.ladder(rec["title"], rec.get("company"), rec.get("industry"), rec.get("family"))
    return roles_mba.ladder(rec["title"], rec.get("company"), rec.get("category"), rec.get("industry"), rec.get("family"))


def gather(set_, skills):
    """{skill: {ladder: {rung: [(record, sentence)]}}} from the Haiku read of US postings: the sentence each quote sits in."""
    vk = pr.variant_key("haiku")
    want = set(skills)
    texts = {p["id"]: p["text"] for p in pr.corpus(set_, regex=False)}
    cells = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    n = 0
    for pid, (slug, rec) in pr.cache_index(set_).items():
        ans = (rec.get("reads", {}).get(vk) or {}).get("answer")
        reg = rec.get("regex") or {}
        if not ans or reg.get("country") != "United States" or pid not in texts:
            continue
        named = [s for s in ans.get("skills") or [] if s.get("id") in want]
        rung = dg.RUNG_OF.get(reg.get("level"))
        if not named or not rung:
            continue
        lad = ladder_of(set_, rec)
        sents = [(dg.norm(s), s) for s in extract.sentences(texts[pid]) if len(s) <= MAX_SENTENCE]
        n += 1
        for s in named:
            q = dg.norm(s.get("quote") or "")
            hit = next((raw for nrm, raw in sents if q and q in nrm), None)
            cells[s["id"]][lad][rung].append(({k: rec.get(k) for k in ("id", "company", "title", "url")} | {"level": reg.get("level")}, hit))
    print(f"{set_}: {n} US postings name one of the {len(want)} skills", flush=True)
    return cells


def pack_of(skill, ladder, by_rung, seed=7):
    """depth_gen's pack: up to 40 sentences a rung, two an employer, a rung only with 8 postings from 4 employers."""
    rnd = random.Random(f"{seed}:{skill}:{ladder}")
    out = {}
    for rung, rows in by_rung.items():
        js = list({r["id"]: r for r, _ in rows}.values())
        if not dg.filled(js):
            continue
        cands = [(r, s) for r, s in rows if s]
        rnd.shuffle(cands)
        per, seen, sents = collections.Counter(), set(), []
        for r, s in sorted(cands, key=lambda c: abs(len(c[1]) - 150) // 60):
            if per[r["company"]] >= dg.PER_EMPLOYER or dg.norm(s) in seen:
                continue
            per[r["company"]] += 1
            seen.add(dg.norm(s))
            sents.append({"text": s, "company": r["company"], "title": r["title"], "url": r["url"], "level": r["level"]})
            if len(sents) >= dg.PER_CELL:
                break
        for i, s in enumerate(sents):
            s["id"] = f"{rung[:3]}{i + 1:02d}"
        if len({s["company"] for s in sents}) >= dg.MIN_EMPLOYERS:
            out[rung] = {"n_postings": len(js), "n_employers": len({j["company"] for j in js}), "sentences": sents}
    return {r: out[r] for r in dg.RUNGS if r in out}


def build_packs(all_ladders=False):
    """One pair a skill: the ladder with the most postings behind its filled rungs (every ladder with --all-ladders)."""
    tg, T = targets()
    depth = pr.depth()
    pairs = []
    for set_, skills in tg.items():
        cells = gather(set_, skills)
        for sid in skills:
            cands = []
            for lad, by_rung in cells[sid].items():
                p = pack_of(sid, lad, by_rung)
                posts = list({r["id"]: (r["company"], r["url"]) for rows in by_rung.values() for r, _ in rows}.values())
                cands.append({"set": set_, "skill": sid, "name": T[sid]["name"], "kind": T[sid].get("kind"), "cluster": T[sid].get("cluster"),
                              "what": (depth.get(sid) or {}).get("what", ""), "ladder": lad, "pack": p,
                              "n_postings": len(posts), "postings": [u for _, u in posts], "counts": {r: len({x["id"] for x, _ in rows}) for r, rows in by_rung.items()}})
            cands.sort(key=lambda c: (-len(c["pack"]), -sum(v["n_postings"] for v in c["pack"].values()), -c["n_postings"]))
            if not cands:
                pairs.append({"set": set_, "skill": sid, "name": T[sid]["name"], "kind": T[sid].get("kind"), "cluster": T[sid].get("cluster"),
                              "what": (depth.get(sid) or {}).get("what", ""), "ladder": None, "pack": {}, "n_postings": 0, "postings": [], "counts": {}})
                continue
            keep = [c for c in cands if len(c["pack"]) >= 2] if all_ladders else []
            pairs += keep or cands[:1]
    os.makedirs(OUT, exist_ok=True)
    with open(PACKS, "w") as f:
        json.dump({"generated": time.strftime("%Y-%m-%d"), "read": pr.variant_key("haiku"), "pairs": pairs}, f, indent=1, ensure_ascii=False)
    for p in pairs:
        print(f"{p['set']:4} {p['skill']:26} {str(p['ladder']):12} rungs {list(p['pack'])} postings {p['n_postings']} {p['counts']}")
    full = sum(1 for p in pairs if len(p["pack"]) >= 2)
    print(f"{len(pairs)} pairs; {full} with two levels of evidence or more (a ladder is drafted), {len(pairs) - full} with less (definition and sub-skills only)")
    return pairs


def pack_text(p, ladder):
    out = []
    for rung, cell in p.items():
        out.append(f"### {rung} = {RUNG_NAMES[ladder][rung]} ({cell['n_postings']} postings, {cell['n_employers']} employers)")
        out += [f"[{s['id']}] ({s['company']}; {s['title']}) {s['text']}" for s in cell["sentences"]]
    return "\n".join(out)


def draft_prompt(pair):
    """depth_gen.draft_prompt, for any role set's ladders, with the definition asked for as well."""
    p, ladder = pair["pack"], pair["ladder"]
    rungs = ", ".join(f'"{r}"' for r in p) or "none"
    have = f"A definition exists; copy it into \"what\" unless the sentences show it is wrong: {pair['what']}" if pair["what"] else \
        "\"what\": ONE sentence of at most 25 words that says what a person does with this skill, in the imperative, like \"Build the annual budget and keep the forecast current as the year unfolds.\" Name what the sentences name."
    ladder_part = f"""
"rungs": an object with the keys "associate", "mid", "senior", "lead". For each of {rungs}, a list of 1 or 2 statements; every other key gets an empty list. Each statement: "text" (ONE sentence that starts with "You": what postings at THIS level ask a person to do with this skill), "evidence" (2 to 4 ids of THIS level, from at least two different employers that EACH ask for what the statement says), "quote". Write a statement only when two employers ask for the same thing; do not join what one employer asks with what another asks. Look for the SPECIFIC thing two employers share: the same system, language, tool, document, counterparty, scale or number. A statement that would fit any level or any skill ("You write code") is worth nothing; leave the level empty rather than write one. The statements of a level must differ from the other levels in scope, in what is produced, in who it is for, or in the numbers.
If no two employers of a level ask for the same thing, or the sentences do not show what is different at that level, give that level an empty list.""" if len(p) >= 2 else """
"rungs": an object with the keys "associate", "mid", "senior", "lead", each an empty list: these sentences do not cover two levels."""
    return f"""You write career content for {AUDIENCE[pair['set']]}. The content says what job postings ask for. It must rest on the posting sentences below and on nothing else. Do not use what you know about the field when the sentences do not say it.

Skill: {pair['name']}{' — ' + pair['what'] if pair['what'] else ''}
Employers: {LABELS[pair['set']].get(ladder, ladder)} (US postings). Levels on this ladder: {'; '.join(f'{r} = {RUNG_NAMES[ladder][r]}' for r in p)}.

Posting sentences, by level. Each has an id in square brackets.
{pack_text(p, ladder)}

Write JSON with three keys.
{have}
"subskills": 3 to 5 parts of this skill that the sentences name. Each: "name" (2 to 5 words), "patterns" (1 to 4 regular expressions, case-insensitive, that find this part in a posting; plain words and \\b, \\s, ?, | only), "example" (one sentence that starts with "You": what a person does), "evidence" (1 to 4 ids of the sentences the claim rests on), "quote".{ladder_part}
"quote": 3 to 12 consecutive words copied exactly from one of the cited sentences, the words that best support the claim.

{dg.STYLE}"""


def batch(reqs, variant, tag, m, dry):
    """Send one batch and record it in the cache's manifest (kind "ladders": postings_read's collect leaves it alone)."""
    est = sum(len(json.dumps(r)) for r in reqs) / 3.6 * pr.VARIANTS[variant]["rates"]["in"] / 1e6 + len(reqs) * 6000 * pr.VARIANTS[variant]["rates"]["out"] / 1e6
    committed = m["spend_usd"] + sum(b.get("estimate_usd") or 0 for b in m["batches"] if not b.get("collected"))
    print(f"{tag}: {len(reqs)} requests to {pr.VARIANTS[variant]['model']}, about ${est:.2f}; spend ${m['spend_usd']:.2f}, in flight ${committed - m['spend_usd']:.2f}")
    if dry or not reqs:
        return None
    if committed + est > pr.CAP_USD:
        sys.exit(f"[stop] this would pass the cap ${pr.CAP_USD:.0f}; not sent")
    b = pr.client().messages.batches.create(requests=reqs)
    m["batches"].append({"id": b.id, "kind": "ladders", "tag": tag, "variant": variant, "model": pr.VARIANTS[variant]["model"], "effort": reqs[0]["params"]["output_config"]["effort"],
                         "prompt_hash": pr.sha(draft_prompt.__doc__ + dg.STYLE, 12), "n": len(reqs), "estimate_usd": round(est, 3), "status": b.processing_status, "collected": False})
    pr.save_manifest(m)
    print(f"[batch] {b.id}")
    return b.id


def fetch(m, tag):
    """The answers of the newest batch with this tag, or None while it runs; its cost goes into the manifest once."""
    row = next((r for r in reversed(m["batches"]) if r.get("kind") == "ladders" and r["tag"] == tag), None)
    if row is None:
        sys.exit(f"no {tag} batch was sent")
    cl = pr.client()
    b = cl.messages.batches.retrieve(row["id"])
    row["status"] = b.processing_status
    if b.processing_status != "ended":
        print(f"[wait] {row['id']} {tag}: {b.request_counts}")
        return None
    out, cost, usage = {}, 0.0, collections.Counter()
    for res in cl.messages.batches.results(row["id"]):
        if res.result.type != "succeeded":
            out[res.custom_id] = {"_error": res.result.type}
            continue
        msg = res.result.message
        u = msg.usage.model_dump()
        u = {k: u.get(k) or 0 for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")}
        usage.update(u)
        cost += pr.cost_of(u, row["variant"])
        text = next((blk.text for blk in msg.content if blk.type == "text"), "")
        try:
            out[res.custom_id] = json.loads(text)
        except json.JSONDecodeError:
            out[res.custom_id] = {"_error": f"bad json ({msg.stop_reason})"}
    row["usage"], row["usd"], row["collected"] = dict(usage), round(cost, 4), True
    m["spend_usd"] = round(sum(x.get("usd") or 0 for x in m["batches"]), 4)
    pr.save_manifest(m)
    print(f"[done] {row['id']} {tag}: {len(out)} answers, {sum(1 for v in out.values() if '_error' in v)} errors, ${cost:.2f}; spend ${m['spend_usd']:.2f}")
    return out


def key_of(pair):
    return f"lad-{pair['set']}-{pair['skill']}-{pair['ladder']}"[:64]


def draft(m, dry):
    pairs = [p for p in json.load(open(PACKS))["pairs"] if p["pack"]]
    reqs = [{"custom_id": key_of(p), "params": {
        "model": pr.VARIANTS[DRAFT_MODEL]["model"], "max_tokens": DRAFT_MAX_TOKENS, "thinking": {"type": "adaptive"},
        "output_config": {"effort": "high", "format": {"type": "json_schema", "schema": DRAFT_SCHEMA}},
        "messages": [{"role": "user", "content": draft_prompt(p)}]}} for p in pairs]
    if dry:
        print(draft_prompt(pairs[0])[:6000])
    return batch(reqs, DRAFT_MODEL, "ladders:draft", m, dry)


def cited(c, by_id):
    return [(f"({by_id[e]['company']}) " if c["kind"] == "stmt" else "") + by_id[e]["text"] for e in c["evidence"] if e in by_id]


def check(m, dry):
    """Fold the drafts in, run depth_gen's code checks on every claim, and send the claims that pass to the critic."""
    drafts = fetch(m, "ladders:draft") if not os.path.exists(DRAFTS) else json.load(open(DRAFTS))
    if drafts is None:
        return
    with open(DRAFTS, "w") as f:
        json.dump(drafts, f, indent=1, ensure_ascii=False)
    texts = {s: {p["url"]: p["text"] for p in pr.corpus(s, regex=False)} for s in ("tech", "mba")}
    results, reqs = [], []
    for pair in json.load(open(PACKS))["pairs"]:
        res = {"set": pair["set"], "skill": pair["skill"], "name": pair["name"], "kind": pair["kind"], "ladder": pair["ladder"], "pack": pair["pack"],
               "claims": [], "empty_rungs": [r for r in dg.RUNGS if r not in pair["pack"]], "omitted": [], "n_postings": pair["n_postings"]}
        d = drafts.get(key_of(pair))
        if not pair["pack"] or not d or "_error" in d:
            res["skipped"] = "no evidence" if not pair["pack"] else f"no draft: {(d or {}).get('_error', 'not sent')}"
            results.append(res)
            continue
        res["what"], res["what_from"] = d.get("what"), ("depth file" if pair["what"] and d.get("what") == pair["what"] else "draft")
        postings = [("", texts[pair["set"]].get(u, "")) for u in pair["postings"]]
        by_url = {s["url"]: s["company"] for cell in pair["pack"].values() for s in cell["sentences"]}
        postings = [(by_url.get(u, u), t) for u, (_, t) in zip(pair["postings"], postings)]   # an employer per posting where the pack knows it, else the posting itself
        by_id = {s["id"]: s for cell in pair["pack"].values() for s in cell["sentences"]}
        for c in dg.claims_of(d, pair["ladder"], "d"):
            bad = dg.code_checks(c, pair["pack"], pair["name"], postings)
            c["status"], c["why"], c["round"] = (bad[0], bad[1], 1) if bad else ("ok", "", 1)
            res["claims"].append(c)
            if c["status"] == "ok":
                reqs.append({"custom_id": f"{key_of(pair)[:52]}-{len(res['claims']):03d}", "params": {
                    "model": pr.VARIANTS[CRITIC_MODEL]["model"], "max_tokens": 2000,
                    "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": SUPPORT_SCHEMA}},
                    "messages": [{"role": "user", "content": dg.support_prompt(c, cited(c, by_id))}]}})
                c["_critic_id"] = reqs[-1]["custom_id"]
        results.append(res)
    with open(CRITIC, "w") as f:
        json.dump({"results": results}, f, indent=1, ensure_ascii=False)
    n = collections.Counter((c["kind"], c["status"]) for r in results for c in r["claims"])
    print("claims after the code checks:", dict(n))
    batch(reqs, CRITIC_MODEL, "ladders:critic", m, dry)


def finish(m):
    """Fold the critic in, make one rung a level from the statements that passed, and write a depth_gen run file a role set."""
    answers = fetch(m, "ladders:critic")
    if answers is None:
        return
    results = json.load(open(CRITIC))["results"]
    for r in results:
        by_id = {s["id"]: s for cell in r["pack"].values() for s in cell["sentences"]}
        for c in r["claims"]:
            a = answers.get(c.pop("_critic_id", None))
            if not a or "_error" in a:
                continue
            c["critic"] = a
            if a.get("supported") != "yes":
                c["status"], c["why"] = "critic", f"{a.get('supported')}: {a.get('unsupported_part') or a.get('reason')}"
            elif c["kind"] == "stmt" and isinstance(a.get("employers"), int) and a["employers"] < dg.STMT_MIN_EMPLOYERS:
                c["status"], c["why"] = "critic", f"the critic finds it in {a['employers']} employer's sentences"
        rungs = []
        for rung in r["pack"]:
            st = [c for c in r["claims"] if c["kind"] == "stmt" and c["key"] == rung]
            ok = [c for c in st if c["status"] == "ok"]
            if ok:
                rungs.append({"kind": "rung", "key": rung, "rung_name": RUNG_NAMES[r["ladder"]][rung], "text": " ".join(c["text"].strip() for c in ok),
                              "evidence": sorted({e for c in ok for e in c["evidence"] if e in by_id}), "statements": len(ok), "status": "ok", "why": "", "round": 1})
            elif st:
                rungs.append({"kind": "rung", "key": rung, "rung_name": RUNG_NAMES[r["ladder"]][rung], "text": st[0].get("text"), "evidence": [], "statements": 0,
                              "status": st[0]["status"], "why": st[0]["why"], "round": 1})
        for key, (stage, why) in dg.ladder_check([c for c in rungs if c["status"] == "ok"]).items():
            for c in rungs:
                if c["key"] == key:
                    c["status"], c["why"] = stage, why
        r["claims"] += rungs
    lines = ["# Ladder and definition drafts from the model read", "",
             f"Drafter {pr.VARIANTS[DRAFT_MODEL]['model']}, critic {pr.VARIANTS[CRITIC_MODEL]['model']} (the support question only; no swap test, no redraft). "
             "Evidence: US postings where the Haiku read named the skill. Drafts, not published.", "",
             "| set | skill | kind | ladder | postings | definition | sub-skills kept | rungs kept | dropped, by reason |", "|---|---|---|---|---|---|---|---|---|"]
    for set_ in ("tech", "mba"):
        rs = [r for r in results if r["set"] == set_]
        with open(os.path.join(OUT, f"run_{set_}.json"), "w") as f:
            json.dump({"drafter": pr.VARIANTS[DRAFT_MODEL]["model"], "critic": pr.VARIANTS[CRITIC_MODEL]["model"], "generated": time.strftime("%Y-%m-%d"),
                       "source": f"postings_read {pr.variant_key('haiku')}", "results": rs}, f, indent=1, ensure_ascii=False)
        for r in rs:
            subs = [c for c in r["claims"] if c["kind"] == "subskill"]
            rg = [c for c in r["claims"] if c["kind"] == "rung"]
            why = collections.Counter(c["status"] for c in subs + rg if c["status"] != "ok")
            lines.append(f"| {set_} | {r['skill']} | {r['kind']} | {r['ladder']} | {r['n_postings']} | {r.get('what') or r.get('skipped') or ''} | "
                         f"{sum(c['status'] == 'ok' for c in subs)} of {len(subs)} | {', '.join(c['key'] for c in rg if c['status'] == 'ok') or 'none'} of {', '.join(r['pack']) or 'none'} | "
                         f"{', '.join(f'{k} {v}' for k, v in why.items())} |")
    with open(os.path.join(OUT, "report.md"), "w") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["packs", "draft", "check", "finish"])
    ap.add_argument("--all-ladders", action="store_true", help="packs: every ladder with two levels of evidence, not only a skill's largest")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    m = pr.manifest()
    if args.cmd == "packs":
        build_packs(args.all_ladders)
    elif args.cmd == "draft":
        draft(m, args.dry_run)
    elif args.cmd == "check":
        check(m, args.dry_run)
    elif args.cmd == "finish":
        finish(m)


if __name__ == "__main__":
    main()
