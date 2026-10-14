"""Skill depth from postings: draft with one model, keep only what the postings and a second model support.

    .venv/bin/python -m pipeline.depth_gen --list                       # which (skill, ladder) pairs have enough postings
    .venv/bin/python -m pipeline.depth_gen --pairs valuation:bank,...   # run those pairs ("all": every pair with two levels of evidence)
    .venv/bin/python -m pipeline.depth_gen --pairs ... --dry-run        # evidence packs and requests only, nothing sent
    .venv/bin/python -m pipeline.depth_gen --rejudge anthropic/claude-haiku-5.5   # a cheaper critic on the same claims

Build steps are not drafted here: a pilot showed that postings give duties, not ways to learn (evals/NOTES.md).

The unit is a claim: one sub-skill or one ladder rung, with the posting sentences it rests on and
a phrase quoted from one of them. Steps (PLAN.md, "Skill depth for the MBA skills"):

1. evidence packs   sentences of US postings that matched the skill, per ladder and rung (code)
2. draft            model 1 writes claims from one pack
3. code checks      evidence (quote is in a cited sentence; every statement of a rung cites its own level and
                    two employers that both ask for it; sub-skill patterns match postings), specificity (names terms of its evidence), style (length, active voice), ladder
                    (adjacent rungs differ)
4. critic           model 2, another model family: do the cited sentences support the claim? A swap test: can it
                    tell the rung's skill and level from the text alone?
5. redraft          once, for dropped claims and for what the critic says the draft left out; then 3 and 4 again

Needs OPENROUTER_API_KEY in .env, data/processed/jobs_<roles>.json and the corpus from
pipeline.experiments.role_corpus. Answers are cached in data/experiments/depth/ (gitignored), so a rerun sends
only new requests. Nothing is written to pipeline/depth/: publishing checked content is a separate step.
"""
import argparse
import collections
import hashlib
import json
import os
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from pipeline import extract, processed, roles_mba, tax  # noqa: E402

OUT = os.path.join(ROOT, "data", "experiments", "depth")
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
DRAFTER = "openai/gpt-6.1-sol"
CRITIC = "anthropic/claude-haiku-5.5"   # agreed with claude-sonnet-5.5 on 128 of 130 pilot claims, at a twentieth of the price
RUNGS = ["associate", "mid", "senior", "lead"]
RUNG_OF = {"associate": "associate", "mid": "mid", "senior": "senior", "staff": "lead", "group": "lead", "director": "lead", "vp": "lead", "cpo": "lead"}
RUNG_NAMES = {
    "corporate": {"associate": "Analyst or associate", "mid": "Manager", "senior": "Senior manager", "lead": "Lead, director and above"},
    "bank": {"associate": "Analyst", "mid": "Associate", "senior": "Vice President", "lead": "Director, Managing Director"},
    "consulting": {"associate": "Analyst", "mid": "Consultant", "senior": "Senior consultant or manager", "lead": "Engagement manager, principal, partner"},
}
MIN_POSTINGS, MIN_EMPLOYERS = 8, 4   # a rung with less evidence gets no text
STMT_MIN_EMPLOYERS = 2               # every statement of a rung must be asked for by this many employers, not by one posting
PER_EMPLOYER, PER_CELL = 2, 40       # sentences in a pack: with 14, two employers rarely named the same specific thing
SUB_MIN_SHARE, SUB_MIN_EMPLOYERS = 0.05, 3
MAX_WORDS = {"stmt": 25, "subskill": 25}

STOP = set("""a an the and or of to in on for with by at from as is are be this that these those it its their your you our we they them
into across within over under per each every all any both more most other such than then when where which who will can may must should
not no also about between through during before after up down out off new use used using make makes work works working team teams role
level levels skill skills ability experience strong help helps support supports include includes including ensure ensures provide provides
manage manages managing lead leads leading develop develops developing build builds building drive drives own owns business company
senior junior associate analyst manager director partner principal consultant vice president one two three first""".split())
BANNED = re.compile(r"\b(leverag\w+|utili[sz]\w+|robust|seamless\w*|world[- ]class|best[- ]in[- ]class|cutting[- ]edge|synerg\w+|in order to|as well as|"
                    r"hit the ground|wear many hats|deep dive|move the needle|low[- ]hanging|game[- ]chang\w+|fast[- ]paced|passion\w*|rock ?star|ninja)\b", re.I)
PASSIVE = re.compile(r"\b(is|are|was|were|be|been|being|gets?|got)\s+(\w+ly\s+)?(\w{3,}ed|built|made|done|given|known|shown|written|run|held|led|set|sent|kept|taken|drawn)\b", re.I)
TOKEN = re.compile(r"[A-Za-z][A-Za-z&/+.-]{2,}|\$?\d[\d,.]*[%xkKmMbB]?")


def words(s):
    return [w for w in re.findall(r"[A-Za-z0-9&$%'’/+-]+", s)]


def terms(s):
    """Content terms of a text: words of four letters or more that are not everyday words, acronyms, numbers."""
    out = set()
    for t in TOKEN.findall(s):
        low = t.lower().strip(".-")
        if low in STOP:
            continue
        if t[0].isdigit() or t[0] == "$" or (t.isupper() and len(t) >= 2) or len(low) >= 4:
            out.add(low)
    return out


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# ---- 1. evidence packs ------------------------------------------------------------------------------------------
def load(roleset):
    jobs = {j["url"]: j for j in processed.load(roleset) if j["country"] == "United States"}
    corpus = {}
    with open(os.path.join(ROOT, "data", "experiments", f"corpus_{roleset}.jsonl")) as f:
        for line in f:
            r = json.loads(line)
            if r["url"] in jobs:
                corpus[r["url"]] = r["text"]
    return jobs, corpus


def cells(jobs, skill):
    """{ladder: {rung: [postings tagged with the skill]}}"""
    out = collections.defaultdict(lambda: collections.defaultdict(list))
    for j in jobs.values():
        if skill in j["skills"]:
            out[j["ladder"]][RUNG_OF[j["level"]]].append(j)
    return out


def filled(js):
    return len(js) >= MIN_POSTINGS and len({j["company"] for j in js}) >= MIN_EMPLOYERS


def pack(jobs, corpus, skill, ladder, seed=7):
    """Evidence sentences per rung for one skill on one ladder: {rung: [{id, text, company, title, url, level}]}"""
    rx = extract.SKILL_RX[skill]
    rnd = random.Random(f"{seed}:{skill}:{ladder}")
    out = {}
    for rung, js in cells(jobs, skill)[ladder].items():
        if not filled(js):
            continue
        cands = []
        for j in js:
            sents = [s for s in extract.sentences(corpus.get(j["url"], "")) if rx.search(s)]
            sents.sort(key=lambda s: (-len(rx.findall(s)), abs(len(s) - 150)))
            for s in sents[:PER_EMPLOYER]:
                cands.append((j, s))
        rnd.shuffle(cands)
        per, seen, rows = collections.Counter(), set(), []
        for j, s in sorted(cands, key=lambda c: abs(len(c[1]) - 150) // 60):
            if per[j["company"]] >= PER_EMPLOYER or norm(s) in seen:
                continue
            per[j["company"]] += 1
            seen.add(norm(s))
            rows.append({"text": s, "company": j["company"], "title": j["title"], "url": j["url"], "level": j["level"]})
            if len(rows) >= PER_CELL:
                break
        for i, r in enumerate(rows):
            r["id"] = f"{rung[:3]}{i + 1:02d}"
        out[rung] = {"n_postings": len(js), "n_employers": len({j["company"] for j in js}), "sentences": rows}
    return {r: out[r] for r in RUNGS if r in out}


# ---- 2 and 5. prompts -------------------------------------------------------------------------------------------
STYLE = """Style rules (Simplified Technical English, loosely):
- Short sentences. One idea in each sentence. At most 25 words in a sentence.
- Active voice, simple present. Address the reader as "you" ("You build ...").
- No idioms, no filler ("leverage", "robust", "fast-paced"). No semicolons, no brackets.
- Keep the field's own terms (DCF, CIM, S&OP). Name the tool, the document, the counterparty or the number."""


def pack_text(p, ladder):
    out = []
    for rung, cell in p.items():
        out.append(f"### {rung} = {RUNG_NAMES[ladder][rung]} ({cell['n_postings']} postings, {cell['n_employers']} employers)")
        out += [f"[{s['id']}] ({s['company']}; {s['title']}) {s['text']}" for s in cell["sentences"]]
    return "\n".join(out)


def draft_prompt(skill, what, ladder, p):
    rungs = ", ".join(f'"{r}"' for r in p)
    return f"""You write career content for MBA and graduate students. The content says what job postings ask for. It must rest on the posting sentences below and on nothing else. Do not use what you know about the field when the sentences do not say it.

Skill: {skill} — {what}
Employers: {roles_mba.LADDERS[ladder]['label']} (US postings). Levels on this ladder: {'; '.join(f'{r} = {RUNG_NAMES[ladder][r]}' for r in p)}.

Posting sentences, by level. Each has an id in square brackets.
{pack_text(p, ladder)}

Write JSON with two keys.
"subskills": 3 to 5 parts of this skill that the sentences name. Each: "name" (2 to 5 words), "patterns" (1 to 4 regular expressions, case-insensitive, that find this part in a posting; plain words and \\b, \\s, ?, | only), "example" (one sentence that starts with "You": what a person does), "evidence" (ids), "quote".
"rungs": for each of {rungs}, a list of 1 or 2 statements. Each statement: "text" (ONE sentence that starts with "You": what postings at THIS level ask a person to do with this skill), "evidence" (2 to 4 ids of THIS level, from at least two different employers that EACH ask for what the statement says), "quote". Write a statement only when two employers ask for the same thing; do not join what one employer asks with what another asks. Look for the SPECIFIC thing two employers share: the same document, model, tool, counterparty, approval or number. A statement that would fit any level or any skill ("You support forecasting") is worth nothing; leave the level empty rather than write one. The statements of a level must differ from the other levels in scope, in the document produced, in who it is for, or in the numbers.
"evidence": for a sub-skill, 1 to 4 ids of the sentences the claim rests on. "quote": 3 to 12 consecutive words copied exactly from one of those sentences, the words that best support the claim.
If no two employers of a level ask for the same thing, or the sentences do not show what is different at that level, give that level an empty list.

{STYLE}"""


def redraft_prompt(skill, what, ladder, p, dropped, omitted):
    lines = [f"- {'rung' if c['kind'] == 'stmt' else c['kind']} {c['key']}: \"{c.get('text') or c.get('name')}\" — dropped: {c['why']}" for c in dropped]
    return f"""{draft_prompt(skill, what, ladder, p)}

A first draft was checked. These claims were dropped:
{chr(10).join(lines) or '- none'}
A reviewer says the sentences also show this, and the draft left it out:
{chr(10).join('- ' + o for o in omitted) or '- nothing'}

Write the JSON again with ONLY replacements for the dropped claims (same kind; for a rung the same level) and at most two new sub-skills for what was left out. Fix the reason each was dropped. A sub-skill dropped because its patterns match too few postings keeps its name and example and gets broader patterns: the one or two words postings use for it, not a long phrase. If the sentences cannot support a replacement, leave it out."""


def support_prompt(claim, sents):
    return f"""A claim about what job postings ask for, and the posting sentences it cites. Judge from these sentences only.

Claim: {claim.get('text') or claim.get('name') + ': ' + claim.get('example', '')}

Cited sentences:
{chr(10).join('- ' + s for s in sents)}

Answer in JSON: {{"supported": "yes" | "partly" | "no", "unsupported_part": "the words of the claim the sentences do not support, or empty", "reason": "one sentence"}}
The level is known from the job titles of the postings. Do not judge it, and do not expect the sentences to state it.
"yes": every part of the claim is stated or plainly shown by the sentences. "partly": the main point is there, and a detail (a tool, a number, an audience, a scope) is not. "no": the main point is not there.
{'Each sentence starts with its employer. Also give "employers": the number of different employers whose own sentence shows the whole claim.' if claim['kind'] == 'stmt' else ''}"""


def swap_prompt(text, options):
    return f"""This sentence describes what job postings ask for, for one skill at one level. Which skill and level is it?

"{text}"

{chr(10).join(f'{chr(65 + i)}. {o}' for i, o in enumerate(options))}

Answer in JSON: {{"answer": "A" | "B" | "C" | "D", "could_also_be": "a letter if a second option fits as well, else empty"}}"""


def omit_prompt(skill, what, ladder, p, draft):
    listed = [s["name"] for s in draft.get("subskills", [])] + [f"{r}: {x.get('text')}" for r, v in (draft.get("rungs") or {}).items() for x in (v if isinstance(v, list) else [v]) if isinstance(x, dict)]
    return f"""Posting sentences about the skill "{skill}" ({what}) and a draft summary of them. List what the sentences clearly show that the draft does not say: a part of the skill named by at least three sentences, or a difference between levels. Judge from the sentences only.

{pack_text(p, ladder)}

Draft:
{chr(10).join('- ' + str(x) for x in listed)}

Answer in JSON: {{"omitted": ["one short sentence each, with the ids that show it", ...]}} (an empty list when the draft covers the sentences; at most 4)"""


# ---- model calls ------------------------------------------------------------------------------------------------
class Models:
    def __init__(self, dry):
        self.dry = dry
        self.path = os.path.join(OUT, "cache.jsonl")
        self.cache = {}
        if os.path.exists(self.path):
            for line in open(self.path):
                r = json.loads(line)
                self.cache[r["key"]] = r
        import threading
        self.lock = threading.Lock()
        self.sent = collections.Counter()
        self.usage = collections.Counter()
        self.key = None
        env = os.path.join(ROOT, ".env")
        if os.path.exists(env):
            for line in open(env):
                if line.startswith("OPENROUTER_API_KEY="):
                    self.key = line.split("=", 1)[1].strip().strip("\"'")
        if not dry and not self.key:
            sys.exit("OPENROUTER_API_KEY is not in .env; use --dry-run")

    def ask(self, model, prompt, kind):
        key = hashlib.sha256(f"{model}\n{prompt}".encode()).hexdigest()
        if key in self.cache:
            return self.cache[key]["answer"]
        self.sent[kind] += 1
        if self.dry:
            return None
        import requests
        body = {"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}, "max_tokens": 6000}
        for attempt in range(4):
            try:
                r = requests.post(ENDPOINT, headers={"Authorization": f"Bearer {self.key}"}, json=body, timeout=180)
                d = r.json()
                text = d["choices"][0]["message"]["content"]
                m = re.search(r"\{.*\}", text, re.S)
                answer = json.loads(m.group(0))
                break
            except Exception as e:  # a bad reply is retried, then recorded as no answer
                answer = {"_error": str(e)[:200]}
                time.sleep(2 + 3 * attempt)
        u = (d.get("usage") or {}) if isinstance(d, dict) else {}
        rec = {"key": key, "model": model, "kind": kind, "answer": answer, "usage": {k: u.get(k) for k in ("prompt_tokens", "completion_tokens", "cost")}}
        if "_error" not in answer:
            with self.lock:
                self.cache[key] = rec
                with open(self.path, "a") as f:
                    f.write(json.dumps(rec) + "\n")
        return answer

    def many(self, model, prompts, kind):
        with ThreadPoolExecutor(6) as pool:
            return list(pool.map(lambda p: self.ask(model, p, kind), prompts))

    def cost(self):
        return sum((r["usage"].get("cost") or 0) for r in self.cache.values())

    def per_pair(self):
        """Mean cost of one pair, from the cache: one draft, and the redraft, omission check, support and swap calls that follow it."""
        n, c = collections.Counter(), collections.Counter()
        for r in self.cache.values():
            if r["model"] in (DRAFTER, CRITIC):
                n[r["kind"]] += 1
                c[r["kind"]] += r["usage"].get("cost") or 0
        if not n["draft"]:
            return 0.0
        return sum(c.values()) / n["draft"]


# ---- 3. code checks ---------------------------------------------------------------------------------------------
def claims_of(draft, ladder, source):
    out = []
    for i, s in enumerate(draft.get("subskills") or []):
        out.append({"kind": "subskill", "key": f"{source}{i + 1}", **{k: s.get(k) for k in ("name", "patterns", "example", "evidence", "quote")}})
    for rung, lst in (draft.get("rungs") or {}).items():
        if rung not in RUNGS:
            continue
        lst = lst if isinstance(lst, list) else [lst] if lst else []
        if not lst:
            out.append({"kind": "stmt", "key": rung, "n": 0, "text": None, "evidence": [], "quote": ""})
        for i, v in enumerate(lst[:2]):
            if isinstance(v, dict):
                out.append({"kind": "stmt", "key": rung, "n": i + 1, **{k: v.get(k) for k in ("text", "evidence", "quote")}})
    return out


def code_checks(c, p, skill_name, postings):
    """Returns (stage, reason) for the first check a claim fails, or None. postings: [(company, text)] of the skill on this ladder."""
    by_id = {s["id"]: (rung, s) for rung, cell in p.items() for s in cell["sentences"]}
    text = c.get("text") if c["kind"] != "subskill" else c.get("example")
    if c["kind"] == "stmt" and c.get("text") is None:
        return ("drafter", "the drafter found nothing that two employers ask at this level")
    if not text or not isinstance(text, str):
        return ("evidence", "no text")
    ev = [e for e in (c.get("evidence") or []) if e in by_id]
    if not ev:
        return ("evidence", "cites no sentence of the pack")
    if c["kind"] == "stmt" and any(by_id[e][0] != c["key"] for e in ev):
        return ("evidence", "a rung cites sentences of another level")
    if c["kind"] == "stmt" and len({by_id[e][1]["company"] for e in ev}) < STMT_MIN_EMPLOYERS:
        return ("evidence", f"cites {len({by_id[e][1]['company'] for e in ev})} employer; a statement needs {STMT_MIN_EMPLOYERS}")
    quote = norm(c.get("quote") or "")
    if len(quote.split()) < 3 or not any(quote in norm(by_id[e][1]["text"]) for e in ev):
        return ("evidence", "the quoted phrase is not in a cited sentence")
    if c["kind"] == "subskill":
        try:
            rx = re.compile("|".join(f"(?:{x})" for x in c.get("patterns") or ["(?!)"]), re.I)
        except re.error:
            return ("evidence", "a pattern does not compile")
        hit = [co for co, t in postings if rx.search(t)]
        if len(hit) < SUB_MIN_SHARE * len(postings) or len(set(hit)) < SUB_MIN_EMPLOYERS:
            return ("evidence", f"its patterns match {len(hit)} of {len(postings)} postings at {len(set(hit))} employers")
    why = specificity(text if c["kind"] != "subskill" else text + " " + (c.get("name") or ""), [(by_id[e][1]["company"], by_id[e][1]["text"]) for e in ev], skill_name, c["kind"] == "stmt")
    if why:
        return ("specificity", why)
    sents = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
    limit = MAX_WORDS[c["kind"]]
    if any(len(words(s)) > limit for s in sents):
        return ("style", f"a sentence has more than {limit} words")
    if len(sents) > (1 if c["kind"] == "stmt" else 2) or ";" in text or "(" in text:
        return ("style", "too many sentences, or a semicolon or bracket")
    m = BANNED.search(text) or PASSIVE.search(text)
    if m:
        return ("style", f"filler or passive voice: \"{m.group(0)}\"")
    return None


def specificity(text, sentences, skill_name, two_employers):
    """The rule a claim's wording must pass, shared with evals/run_depth.py. sentences: [(employer, text)]. A statement
    must share a term with the sentences of two different employers (both ask for it), and any claim must name two
    terms of its evidence, not only the words of the skill's name. Returns the reason it fails, or None."""
    cited = set().union(*(terms(t) for _, t in sentences)) if sentences else set()
    if two_employers:
        per = collections.defaultdict(set)
        for co, t in sentences:
            per[co] |= terms(t) & terms(text)
        if sum(1 for v in per.values() if v) < STMT_MIN_EMPLOYERS:
            return "its terms come from one employer's sentence only"
    shared = terms(text) & cited
    if len(shared) < 2 or not (shared - terms(skill_name)):
        return f"names {len(shared)} terms of its evidence ({', '.join(sorted(shared)) or 'none'})"
    return None


def ladder_check(kept):
    """Adjacent rungs that say nearly the same: drop the higher one."""
    out = {}
    rungs = [c for c in kept if c["kind"] == "rung"]
    rungs.sort(key=lambda c: RUNGS.index(c["key"]))
    for a, b in zip(rungs, rungs[1:]):
        ta, tb = terms(a["text"]), terms(b["text"])
        if ta and tb and len(ta & tb) / len(ta | tb) >= 0.6:
            out[b["key"]] = ("ladder", f"says nearly the same as the {a['key']} rung")
    return out


# ---- the run ----------------------------------------------------------------------------------------------------
def run_pair(M, jobs, corpus, T, depth, skill, ladder, others):
    name = T[skill]["name"]
    what = depth.get(skill, {}).get("what", "")
    p = pack(jobs, corpus, skill, ladder)
    res = {"skill": skill, "name": name, "ladder": ladder, "pack": p, "claims": [], "empty_rungs": [r for r in RUNGS if r not in p], "omitted": []}
    if len(p) < 2:
        res["skipped"] = "fewer than two levels have enough postings"
        return res
    postings = [(j["company"], corpus.get(j["url"], "")) for j in jobs.values() if skill in j["skills"] and j["ladder"] == ladder]
    by_id = {s["id"]: s for cell in p.values() for s in cell["sentences"]}

    def judge(claims):
        for c in claims:
            bad = code_checks(c, p, name, postings)
            c["status"], c["why"] = (bad[0], bad[1]) if bad else ("ok", "")
        ok = [c for c in claims if c["status"] == "ok"]
        ans = M.many(CRITIC, [support_prompt(c, cited(c)) for c in ok], "support")
        for c, a in zip(ok, ans):
            if a is None:
                continue
            c["critic"] = a
            if a.get("supported") != "yes":
                c["status"], c["why"] = "critic", f"{a.get('supported')}: {a.get('unsupported_part') or a.get('reason')}"
            elif c["kind"] == "stmt" and isinstance(a.get("employers"), int) and a["employers"] < STMT_MIN_EMPLOYERS:
                c["status"], c["why"] = "critic", f"the critic finds it in {a['employers']} employer's sentences"
        return claims

    def cited(c):
        return [(f"({by_id[e]['company']}) " if c["kind"] == "stmt" else "") + by_id[e]["text"] for e in c["evidence"] if e in by_id]

    def rungs_of(claims, rnd_no):
        """One rung per level from its statements that passed; a level with none keeps the reason of its first statement."""
        out = []
        for rung in p:
            st = [c for c in claims if c["kind"] == "stmt" and c["key"] == rung]
            ok = [c for c in st if c["status"] == "ok"]
            if not st:
                continue
            if ok:
                out.append({"kind": "rung", "key": rung, "rung_name": RUNG_NAMES[ladder][rung], "text": " ".join(c["text"].strip() for c in ok),
                            "evidence": sorted({e for c in ok for e in c["evidence"] if e in by_id}), "statements": len(ok), "status": "ok", "why": "", "round": rnd_no})
            else:
                out.append({"kind": "rung", "key": rung, "rung_name": RUNG_NAMES[ladder][rung], "text": st[0].get("text"), "evidence": [], "statements": 0,
                            "status": st[0]["status"], "why": st[0]["why"], "round": rnd_no})
        return out

    draft = M.ask(DRAFTER, draft_prompt(name, what, ladder, p), "draft")
    if draft is None:
        return res
    first = judge(claims_of(draft, ladder, "d"))
    for c in first:
        c["round"] = 1
    first += rungs_of(first, 1)
    om = M.ask(CRITIC, omit_prompt(name, what, ladder, p, draft), "omitted") or {}
    res["omitted"] = (om.get("omitted") or [])[:4]
    dropped = [c for c in first if c["kind"] != "stmt" and c["status"] not in ("ok", "drafter")]
    second = []
    if dropped or res["omitted"]:
        re_d = M.ask(DRAFTER, redraft_prompt(name, what, ladder, p, dropped, res["omitted"]), "redraft") or {}
        have = {c["key"] for c in first if c["kind"] == "rung" and c["status"] == "ok"}
        second = judge([c for c in claims_of(re_d, ladder, "r") if not (c["kind"] == "stmt" and (c["key"] in have or c["text"] is None))])
        for c in second:
            c["round"] = 2
        second += rungs_of(second, 2)
    allc = first + second
    kept = [c for c in allc if c["status"] == "ok"]
    for key, (stage, why) in ladder_check(kept).items():
        for c in kept:
            if c["kind"] == "rung" and c["key"] == key:
                c["status"], c["why"] = stage, why
    # swap test: the critic sees the rung alone and must name its skill and level
    rungs = [c for c in allc if c["kind"] == "rung" and c["status"] == "ok"]
    rnd = random.Random(f"swap:{skill}:{ladder}")
    prompts = []
    for c in rungs:
        other_rung = rnd.choice([r for r in p if r != c["key"]])
        other = rnd.choice(others)
        opts = [(name, c["key"]), (name, other_rung), (other, c["key"]), (other, other_rung)]
        rnd.shuffle(opts)
        c["_opts"] = opts
        masked = re.sub(re.escape(name.split(" (")[0]), "this skill", c["text"], flags=re.I)
        prompts.append(swap_prompt(masked, [f"{s} — {RUNG_NAMES[ladder][r]}" for s, r in opts]))
    for c, a in zip(rungs, M.many(CRITIC, prompts, "swap")):
        opts = c.pop("_opts")
        if a is None:
            continue
        i = "ABCD".find((a.get("answer") or "?")[:1])
        got = opts[i] if 0 <= i < 4 else (None, None)
        c["swap"] = {"skill_right": got[0] == name, "level_right": got[1] == c["key"], "also": a.get("could_also_be") or ""}
        if got[0] != name:
            c["status"], c["why"] = "swap", f"read as another skill ({got[0]})"
        elif got[1] != c["key"]:
            c["status"], c["why"] = "swap", f"read as the {got[1]} level"
    res["claims"] = allc
    return res


def rejudge(M, tag, model):
    """Ask another critic the same support questions and count how often it agrees with the first."""
    d = json.load(open(os.path.join(OUT, f"{tag}.json")))
    items = []
    for r in d["results"]:
        by_id = {x["id"]: x for cell in r["pack"].values() for x in cell["sentences"]}
        for c in r["claims"]:
            if c.get("critic"):
                items.append((c, support_prompt(c, [(f"({by_id[e]['company']}) " if c["kind"] == "stmt" else "") + by_id[e]["text"] for e in c["evidence"] if e in by_id])))
    answers = M.many(model, [p for _, p in items], "support")
    table = collections.Counter()
    for (c, _), a in zip(items, answers):
        if a is not None:
            c.setdefault("critic_other", {})[model] = a
            table[(c["critic"].get("supported"), a.get("supported"))] += 1
    with open(os.path.join(OUT, f"{tag}.json"), "w") as f:
        json.dump(d, f, indent=1, ensure_ascii=False)
    n = sum(table.values())
    same = sum(v for (x, y), v in table.items() if (x == "yes") == (y == "yes"))
    print(f"{model} against {d['critic']} on {n} claims: same keep-or-drop decision on {same} ({same / max(1, n):.0%})")
    for (x, y), v in sorted(table.items()):
        print(f"  first critic {x:6} | {model.split('/')[1]} {y}: {v}")


DROP_WHY = {"no evidence": "fewer than 8 postings from 4 employers at this level", "not drafted": "the drafter gave no answer (request failed or not sent)",
            "drafter": "the drafter found nothing that two employers ask at this level", "evidence": "cites one employer, another level, or a quote not in the sentence",
            "specificity": "its terms come from one employer, or it names too few terms of its evidence", "style": "sentence length, passive voice or filler",
            "critic": "the critic finds it unsupported, or in one employer's sentences only", "ladder": "says nearly the same as the rung below",
            "swap": "read as another level or another skill when shown alone"}


def final_rungs(r):
    """{rung: (status, claim)} for one pair: ok when any round kept the rung, else the last round's reason."""
    out = {}
    for rung in RUNGS:
        if rung not in r["pack"]:
            out[rung] = ("no evidence", None)
            continue
        cs = [c for c in r["claims"] if c["kind"] == "rung" and c["key"] == rung]
        ok = [c for c in cs if c["status"] == "ok"]
        if ok:
            out[rung] = ("ok", ok[-1])
        elif cs:
            out[rung] = (cs[-1]["status"], cs[-1])
        else:
            out[rung] = ("not drafted", None)
    return out


def final_subskills(r):
    return [c for c in r["claims"] if c["kind"] == "subskill"]


def report(tag):
    """Release report (PLAN.md step 8): rungs and sub-skills kept per ladder, why the rest were dropped, examples, empty pairs."""
    d = json.load(open(os.path.join(OUT, f"{tag}.json")))
    R = d["results"]
    L = [f"# Skill depth run `{tag}`: {len(R)} skill-and-ladder pairs", "",
         f"Generated {d['generated']}. Drafter `{d['drafter']}`, critic `{d['critic']}`. Rule: every statement of a rung is asked for by two employers; an empty rung stays empty.", ""]
    for ladder in ("corporate", "bank", "consulting"):
        rs = [r for r in R if r["ladder"] == ladder]
        drafted = [r for r in rs if r["claims"]]
        rung_status, sub = collections.Counter(), collections.Counter()
        with_ev = kept = 0
        no_rungs = []
        for r in rs:
            fr = final_rungs(r)
            for rung, (st, _) in fr.items():
                rung_status[st] += 1
                with_ev += st != "no evidence"
                kept += st == "ok"
            if r["claims"] and not any(st == "ok" for st, _ in fr.values()):
                no_rungs.append(r)
            for c in final_subskills(r):
                sub[c["status"]] += 1
        in_drafted = sum(1 for r in drafted for st, _ in final_rungs(r).values() if st != "no evidence")
        L += [f"## {roles_mba.LADDERS[ladder]['label']} ladder: {len(rs)} pairs, {len(drafted)} drafted", "",
              f"- Rungs with evidence: {with_ev} of {len(rs) * 4} cells. Kept: **{kept}** ({kept / max(1, with_ev):.0%} of rungs with evidence; {kept / max(1, in_drafted):.0%} of the {in_drafted} in drafted pairs).",
              f"- Sub-skills: {sub['ok']} kept of {sum(sub.values())} drafted.",
              f"- Pairs with no rung kept: {len(no_rungs)} of {len(drafted)} drafted.", "", "Why rungs were dropped:", ""]
        for st, n in rung_status.most_common():
            if st != "ok":
                L.append(f"- {st}: {n} — {DROP_WHY.get(st, '')}")
        L += ["", "Why sub-skills were dropped:", ""]
        for st, n in sub.most_common():
            if st != "ok":
                L.append(f"- {st}: {n} — {DROP_WHY.get(st, '')}")
        L += ["", "### Three examples", ""]
        ranked = sorted(drafted, key=lambda r: (-sum(1 for st, _ in final_rungs(r).values() if st == "ok"), -sum(1 for c in final_subskills(r) if c["status"] == "ok")))
        shown, seen = [], set()
        for r in ranked:
            cl = r["skill"].split("_")[0]
            if cl in seen and len(ranked) > 6:
                continue
            seen.add(cl)
            shown.append(r)
            if len(shown) == 3:
                break
        for r in shown:
            L += example_md(r)
        L += ["### Pairs drafted that ended with no rungs", ""]
        for r in no_rungs:
            L.append(f"- {r['name']} (`{r['skill']}`): " + "; ".join(f"{k} {st}" for k, (st, _) in final_rungs(r).items() if st != "no evidence"))
        if not no_rungs:
            L.append("- none")
        L += ["", "### All pairs", "", "| Skill | Rungs with evidence | Kept | Dropped (reason) | Sub-skills kept / drafted |", "|---|---|---|---|---|"]
        for r in sorted(rs, key=lambda r: r["name"]):
            fr = final_rungs(r)
            ev = [k for k, (st, _) in fr.items() if st != "no evidence"]
            ok = [k for k, (st, _) in fr.items() if st == "ok"]
            dropped = ", ".join(f"{k} ({st})" for k, (st, _) in fr.items() if st not in ("ok", "no evidence"))
            ss = final_subskills(r)
            L.append(f"| {r['name']} | {', '.join(ev) or '–'} | {', '.join(ok) or '–'} | {dropped or '–'} | {sum(1 for c in ss if c['status'] == 'ok')} / {len(ss)} |")
        L.append("")
    path = os.path.join(OUT, f"{tag}_report.md")
    with open(path, "w") as f:
        f.write("\n".join(L) + "\n")
    print("wrote", path)


def example_md(r):
    by_id = {s["id"]: s for cell in r["pack"].values() for s in cell["sentences"]}
    L = [f"**{r['name']}** (`{r['skill']}`). Postings per level: " + ", ".join(f"{k} {v['n_postings']} ({v['n_employers']} employers)" for k, v in r["pack"].items()) + ".", "", "Sub-skills kept:", ""]
    for c in final_subskills(r):
        if c["status"] == "ok":
            L.append(f"- *{c['name']}* — {c['example']} Patterns: `{'`, `'.join(c['patterns'] or [])}`. Quote: \"{c['quote']}\" ({', '.join(sorted({by_id[e]['company'] for e in c['evidence'] if e in by_id}))})")
    L += ["", "Rungs:", ""]
    for rung, (st, c) in final_rungs(r).items():
        if st == "ok":
            emp = sorted({by_id[e]["company"] for e in c["evidence"] if e in by_id})
            L.append(f"- **{c['rung_name']}**: {c['text']} — evidence from {', '.join(emp)}")
            for e in c["evidence"][:4]:
                if e in by_id:
                    L.append(f"  - ({by_id[e]['company']}; {by_id[e]['title']}) {by_id[e]['text']}")
        else:
            L.append(f"- {RUNG_NAMES[r['ladder']][rung]}: empty — {st}: {DROP_WHY.get(st, '')}" + (f" ({c['why']})" if c and c.get("why") else ""))
    L.append("")
    return L


def listing(jobs, T):
    rows = []
    for sid, s in T.items():
        if not s.get("only") or s["cluster"] in ("credentials", "tools"):
            continue
        for ladder, by in cells(jobs, sid).items():
            ok = [r for r in RUNGS if filled(by.get(r, []))]
            if len(ok) >= 3:
                rows.append((ladder, len(ok), sum(len(by[r]) for r in ok), sid, s["cluster"], {r: len(by.get(r, [])) for r in RUNGS}))
    for row in sorted(rows, key=lambda r: (r[0], -r[1], -r[2])):
        print(*row)
    print(len(rows), "pairs with at least three levels of evidence")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--pairs", help="skill:ladder,skill:ladder,...")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--tag", default="pilot")
    ap.add_argument("--workers", type=int, default=6, help="pairs run at the same time")
    ap.add_argument("--rejudge", metavar="MODEL", help="ask another critic the support questions of a finished run")
    ap.add_argument("--report", action="store_true", help="write the release report of a finished run (--tag) and stop")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if args.report:
        return report(args.tag)
    jobs, corpus = load(args.roles)
    T = {s["id"]: s for s in tax.for_roles(args.roles)["skills"]}
    if args.list:
        return listing(jobs, T)
    import glob
    depth = {}
    for f in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
        if not f.endswith("_roles.json"):
            depth.update(json.load(open(f)))
    M = Models(args.dry_run)
    if args.rejudge:
        rejudge(M, args.tag, args.rejudge)
        return print("requests sent this run:", dict(M.sent), f"| spend so far: ${M.cost():.2f}")
    pairs = [tuple(x.split(":")) for x in args.pairs.split(",")] if args.pairs != "all" else []
    if args.pairs == "all":
        pairs = [(sid, ladder) for sid, t in T.items() if t.get("only") and t["cluster"] not in ("credentials", "tools")
                 for ladder, by in cells(jobs, sid).items() if sum(1 for r in RUNGS if filled(by.get(r, []))) >= 2]
        print(len(pairs), "pairs of skill and ladder with at least two levels of evidence")

    def one(pair):
        skill, ladder = pair
        same = [T[x]["name"] for x, l in pairs if l == ladder and x != skill and T[x]["cluster"] == T[skill]["cluster"]]
        others = same or [T[x]["name"] for x, l in pairs if l == ladder and x != skill] \
            or [x["name"] for x in T.values() if x["cluster"] == T[skill]["cluster"] and x["id"] != skill]
        try:
            r = run_pair(M, jobs, corpus, T, depth, skill, ladder, others)
        except Exception as e:  # one pair must not stop the run
            r = {"skill": skill, "name": T[skill]["name"], "ladder": ladder, "pack": {}, "claims": [], "omitted": [], "skipped": f"error: {e}"}
        c = collections.Counter(x["status"] for x in r["claims"] if x["kind"] != "stmt")
        print(f"{skill}:{ladder}  levels with evidence {list(r['pack'])}  {dict(c)}", flush=True)
        return r
    with ThreadPoolExecutor(args.workers) as pool:
        results = list(pool.map(one, pairs))
    with open(os.path.join(OUT, f"{args.tag}.json"), "w") as f:
        json.dump({"drafter": DRAFTER, "critic": CRITIC, "generated": time.strftime("%Y-%m-%d"), "results": results}, f, indent=1, ensure_ascii=False)
    print("requests sent this run:", dict(M.sent), "| answers cached:", len(M.cache), f"| spend so far: ${M.cost():.2f}")
    if args.dry_run:
        print(f"a draft starts a pair: with the critic calls and the redraft that follow, about ${M.per_pair():.3f} per pair at the cached rate, "
              f"so about ${M.per_pair() * M.sent['draft']:.2f} for the {M.sent['draft']} drafts still missing")
    print("wrote", os.path.join(OUT, f"{args.tag}.json"))


if __name__ == "__main__":
    main()
