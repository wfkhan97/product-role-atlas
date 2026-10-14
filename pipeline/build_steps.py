"""Build steps ("how to build it") for the MBA skills. Two keys, or no step:

    key 1, demand   US postings choose the TARGET: a document or a tool that employers name at entry level for the
                    skill on that ladder, or a licence, exam or degree that employers name for a ROLE on a ladder
                    (code, no model)
    key 2, content  a source on the allow-list says what the target contains (data/raw/build_sources.json)

    .venv/bin/python -m pipeline.build_steps targets --pairs valuation:bank,...|all   # key 1 for skills, no model
    .venv/bin/python -m pipeline.build_steps roles                                    # key 1 and the steps for roles, no model
    .venv/bin/python -m pipeline.build_steps needs --pairs all                         # targets with no source: what to collect by hand
    .venv/bin/python -m pipeline.build_steps run --pairs ... [--dry-run] [--cap N]     # skill steps: draft, checks, critic
    .venv/bin/python -m pipeline.build_steps check [--tag build_pilot] [--selftest]    # the code checks on a finished run
    .venv/bin/python -m pipeline.build_steps report [--tag build_pilot]                # readable report

Decided by the owner (2026-10-13, evals/NOTES.md "Build steps pilot"):
1. A licence, an exam or a degree is a step of the ROLE, stored once per role and ladder (`roles`), not under
   each skill. Those steps are written by code from the source record: no model.
2. A tool is not a target unless a source says what to learn about it. There is no "Learn X" step.
3. A ladder on hold in the registry (`ladders_on_hold`, consulting) gets no step until a source is agreed.
4. Certification bodies and regulators are named and linked, never quoted: a `title_only` source gives its
   title, the name of its outline and facts in our own words. Course vendors are never named.
5. Fewer than three steps, or none, is a valid result. Nothing is padded.

A step fills one of the templates below. For skill steps the model chooses a target, a passage and the slot
values; it does not write prose. A step rests on a passage that says what the target contains ("content"), or
on a passage that names a public input for it, and then it is labelled "input only". A target found in the
skill's own sentences is "skill" scope and needs three employers; one found elsewhere in the posting is "role"
scope and needs five.

Output goes to data/experiments/depth/ (gitignored); pipeline.depth_publish writes the checked steps into
pipeline/depth/. Needs data/processed/jobs_<roles>.json, the corpus from pipeline.experiments.role_corpus and,
for `run`, OPENROUTER_API_KEY in .env. Every answer is cached; the cap counts answered requests only.
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
from pipeline import extract, roles_mba, tax  # noqa: E402

OUT = os.path.join(ROOT, "data", "experiments", "depth")
LEXICON = os.path.join(ROOT, "pipeline", "build_lexicon.json")
SOURCES = os.path.join(ROOT, "data", "raw", "build_sources.json")
DRAFTER = "openai/gpt-6.1-sol"
CRITIC = "anthropic/claude-haiku-5.5"
MAX_REQUESTS = 600                   # answered requests, over all runs; --cap raises it for a full run

ENTRY, NEXT = "associate", "mid"
MIN_EMPLOYERS = {"skill": 3, "role": 5}   # employers that must name a target: in the skill's sentences, or elsewhere in the posting
THIN = (30, 8)                       # fewer entry postings or employers than this: next-level postings may add targets
ROLE_SHARE, ROLE_LIFT = 0.05, 1.5    # a role-scope target: in 5% of the skill's postings and 1.5 times the ladder's rate
PER_EMPLOYER, PER_TARGET = 1, 8      # evidence sentences kept per target
CREDENTIAL_KINDS = ("certification", "qualification")   # steps of the role, not of a skill
LEVEL_NAMES = {"bank": {"associate": "analyst", "mid": "associate"}, "consulting": {"associate": "analyst", "mid": "consultant"},
               "corporate": {"associate": "analyst or associate", "mid": "manager"}}

NEGATION = re.compile(r"\b(not|no longer|n't) (be )?(required|necessary|needed|sponsor\w*|supported|a requirement)|\bno\b[^.]{0,30}\b(required|necessary|needed)"
                      r"|\bwill not\b|\bwithout\b|\bin lieu of\b|\bnot eligible\b|\bdoes not\b", re.I)
PREFERRED = re.compile(r"\b(preferred|a plus|nice to have|desired|desirable|bonus|helpful|advantage)\b", re.I)
DEADLINE = re.compile(r"within (\d+|\w+) (days|months|weeks)[^.,;]{0,40}|prior to (start|hire)[^.,;]{0,20}|upon hire", re.I)
SPLIT = re.compile(r"(?<=[.!?])\s+|\n+|\s+[•·▪●]\s+")


def lexicon():
    out = []
    for t in json.load(open(LEXICON))["targets"]:
        t["re"] = re.compile(t["rx"], 0 if t.get("cs") else re.I)
        out.append(t)
    return out


def all_sentences(text):
    """Every sentence or bullet of a posting, short ones too: a qualification line is often five words."""
    for s in SPLIT.split(text):
        s = s.strip(" -•·*\t")
        if 12 <= len(s) <= 320 and not extract.BOILER_RE.search(s):
            yield s


def load(roleset):
    jobs = {j["url"]: j for j in json.load(open(os.path.join(ROOT, "data", "processed", f"jobs_{roleset}.json"))) if j["country"] == "United States"}
    corpus = {}
    with open(os.path.join(ROOT, "data", "experiments", f"corpus_{roleset}.jsonl")) as f:
        for line in f:
            r = json.loads(line)
            if r["url"] in jobs:
                corpus[r["url"]] = r["text"]
    return jobs, corpus


# ---- (a) target finder: code only -------------------------------------------------------------------------------
def scan(js, corpus, rx, lex):
    """{target id: {"skill": [(job, sentence)], "role": [(job, sentence)]}} with negated sentences left out.
    rx is the skill's pattern (None for a role: every sentence counts as "role")."""
    hits = collections.defaultdict(lambda: {"skill": [], "role": [], "negated": 0})
    for j in js:
        for s in all_sentences(corpus.get(j["url"], "")):
            in_skill = bool(rx and rx.search(s))
            for t in lex:
                if not t["re"].search(s):
                    continue
                if NEGATION.search(s):
                    hits[t["id"]]["negated"] += 1
                    continue
                hits[t["id"]]["skill" if in_skill else "role"].append((j, s))
    return hits


def evidence_rows(rows, rx):
    """One sentence per employer, those nearest 140 characters first, preferring ones that state a deadline."""
    seen, ev = set(), []
    for j, s in sorted(rows, key=lambda r: (not DEADLINE.search(r[1]), abs(len(r[1]) - 140))):
        if j["company"] in seen:
            continue
        seen.add(j["company"])
        ev.append({"text": s, "company": j["company"], "title": j["title"], "url": j["url"], "id_posting": j["id"], "level": j["level"],
                   "in_skill_sentence": bool(rx and rx.search(s)), "preferred": bool(PREFERRED.search(s))})
        if len(ev) >= PER_TARGET:
            break
    return ev


def base_rate(jobs, corpus, lex, ladder, level, cache):
    """How often each target is named in ALL postings of a ladder and level (for the lift of a role-scope target)."""
    key = (ladder, level)
    if key not in cache:
        allj = [j for j in jobs.values() if j["ladder"] == ladder and j["level"] == level]
        cnt = collections.Counter()
        for j in allj:
            text = corpus.get(j["url"], "")
            for t in lex:
                if t["re"].search(text):
                    cnt[t["id"]] += 1
        cache[key] = (len(allj), cnt)
    return cache[key]


def find_targets(jobs, corpus, skill, ladder, lex, base_cache):
    """Targets of a skill on a ladder: documents and tools that employers name at entry level. Credentials are
    left to the role (find_role_targets)."""
    rx = extract.SKILL_RX[skill]
    lex = [t for t in lex if t["kind"] not in CREDENTIAL_KINDS]
    by_level = collections.defaultdict(list)
    for j in jobs.values():
        if j["ladder"] == ladder and skill in j["skills"]:
            by_level[j["level"]].append(j)
    entry = by_level[ENTRY]
    n_emp = len({j["company"] for j in entry})
    thin = len(entry) < THIN[0] or n_emp < THIN[1]
    res = {"skill": skill, "ladder": ladder, "entry_postings": len(entry), "entry_employers": n_emp, "thin": thin,
           "next_postings": len(by_level[NEXT]), "next_employers": len({j["company"] for j in by_level[NEXT]}), "targets": [], "below_threshold": []}
    for level in ([ENTRY, NEXT] if thin else [ENTRY]):
        js = by_level[level]
        if not js:
            continue
        n_all, base = base_rate(jobs, corpus, lex, ladder, level, base_cache)
        hits = scan(js, corpus, rx, lex)
        for t in lex:
            h = hits.get(t["id"])
            if not h:
                continue
            for scope in ("skill", "role"):
                rows = h[scope]
                if scope == "role":   # a role-scope target must not already stand at skill scope
                    if any(x["id"] == t["id"] and x["level"] == level and x["scope"] == "skill" for x in res["targets"]):
                        continue
                    rows = h["skill"] + h["role"]
                emps = sorted({j["company"] for j, _ in rows})
                posts = {j["url"] for j, _ in rows}
                if not emps:
                    continue
                share = len(posts) / len(js)
                lift = share / max(base[t["id"]] / max(1, n_all), 1e-9)
                row = {"id": t["id"], "label": t["label"], "kind": t["kind"], "broad": bool(t.get("broad")), "activity": bool(t.get("activity")), "scope": scope, "level": level,
                       "employers": len(emps), "postings": len(posts), "of_postings": len(js), "share": round(share, 3), "lift": round(lift, 2),
                       "negated_sentences": h["negated"], "employer_names": emps}
                ok = len(emps) >= MIN_EMPLOYERS[scope] and (scope == "skill" or (share >= ROLE_SHARE and lift >= ROLE_LIFT))
                if level == NEXT and any(x["id"] == t["id"] and x["level"] == ENTRY for x in res["targets"]):
                    continue   # entry level already has it
                if not ok:
                    if len(emps) >= 2 and scope == "skill":
                        res["below_threshold"].append({k: row[k] for k in ("id", "scope", "level", "employers", "postings")})
                    continue
                ev = evidence_rows(rows, rx)
                for i, e in enumerate(ev):
                    e["id"] = f"{t['id']}.{level[:3]}.{scope[0]}{i + 1}"
                row["deadline_employers"] = len({j["company"] for j, s in rows if DEADLINE.search(s)})
                row["preferred_share"] = round(sum(1 for _, s in rows if PREFERRED.search(s)) / len(rows), 2)
                row["evidence"] = ev
                res["targets"].append(row)
    res["targets"].sort(key=lambda r: (r["level"] != ENTRY, r["scope"] != "skill", -r["employers"]))
    return res


def find_role_targets(jobs, corpus, family, ladder, lex):
    """Licences, exams and degrees that employers name in entry-level postings of one role on one ladder (decision 1).
    Five employers and 5% of the postings; the next level is read too when the entry level is thin."""
    lex = [t for t in lex if t["kind"] in CREDENTIAL_KINDS]
    by_level = collections.defaultdict(list)
    for j in jobs.values():
        if j["ladder"] == ladder and j["family"] == family:
            by_level[j["level"]].append(j)
    entry = by_level[ENTRY]
    n_emp = len({j["company"] for j in entry})
    thin = len(entry) < THIN[0] or n_emp < THIN[1]
    res = {"family": family, "ladder": ladder, "entry_postings": len(entry), "entry_employers": n_emp, "thin": thin,
           "next_postings": len(by_level[NEXT]), "next_employers": len({j["company"] for j in by_level[NEXT]}), "targets": []}
    for level in ([ENTRY, NEXT] if thin else [ENTRY]):
        js = by_level[level]
        if not js:
            continue
        hits = scan(js, corpus, None, lex)
        for t in lex:
            h = hits.get(t["id"])
            if not h:
                continue
            rows = h["role"]
            emps = sorted({j["company"] for j, _ in rows})
            posts = {j["url"] for j, _ in rows}
            share = len(posts) / len(js)
            if len(emps) < MIN_EMPLOYERS["role"] or share < ROLE_SHARE:
                continue
            if level == NEXT and any(x["id"] == t["id"] for x in res["targets"]):
                continue
            ev = evidence_rows(rows, None)
            for i, e in enumerate(ev):
                e["id"] = f"{t['id']}.{level[:3]}.r{i + 1}"
            res["targets"].append({"id": t["id"], "label": t["label"], "kind": t["kind"], "scope": "role", "level": level, "employers": len(emps), "postings": len(posts),
                                   "of_postings": len(js), "share": round(share, 3), "negated_sentences": h["negated"], "employer_names": emps,
                                   "deadline_employers": len({j["company"] for j, s in rows if DEADLINE.search(s)}),
                                   "preferred_share": round(sum(1 for _, s in rows if PREFERRED.search(s)) / len(rows), 2), "evidence": ev})
    res["targets"].sort(key=lambda r: (r["level"] != ENTRY, -r["employers"]))
    return res


def all_pairs(jobs, roleset):
    """Every (skill, ladder) of the role set's own skills with an entry cell (or a thin one plus the next level) of four employers."""
    T = tax.for_roles(roleset)["skills"]
    out = []
    for s in T:
        if not s.get("only") or s["cluster"] in ("credentials", "tools"):
            continue
        for ladder in roles_mba.LADDERS:
            js = [j for j in jobs.values() if j["ladder"] == ladder and s["id"] in j["skills"] and j["level"] in (ENTRY, NEXT)]
            if len({j["company"] for j in js}) >= THIN[1] and len(js) >= THIN[0]:
                out.append(f"{s['id']}:{ladder}")
    return out


def pairs_of(args, jobs):
    return all_pairs(jobs, args.roles) if args.pairs == "all" else args.pairs.split(",")


def targets_of(args, write=True):
    jobs, corpus = load(args.roles)
    lex = lexicon()
    cache, out = {}, []
    for pair in pairs_of(args, jobs):
        skill, ladder = pair.split(":")
        out.append(find_targets(jobs, corpus, skill, ladder, lex, cache))
    doc = {"generated": time.strftime("%Y-%m-%d"), "min_employers": MIN_EMPLOYERS, "pairs": out}
    if write:
        os.makedirs(OUT, exist_ok=True)
        json.dump(doc, open(os.path.join(OUT, f"{args.tag}_targets.json"), "w"), indent=1, ensure_ascii=False)
    return doc


def targets_cmd(args):
    for r in targets_of(args)["pairs"]:
        print(f"\n{r['skill']}:{r['ladder']}: {r['entry_postings']} entry postings, {r['entry_employers']} employers{' (thin: next level added)' if r['thin'] else ''}")
        for t in r["targets"]:
            print(f"  {t['scope']:5} {t['level'][:3]} {t['kind'][:5]:5} {t['id']:22} {t['employers']:3} employers {t['postings']:3} postings  share {t['share']:.2f} lift {t['lift']:.1f}{'  broad' if t['broad'] else ''}")
    print("\nwrote", os.path.join(OUT, f"{args.tag}_targets.json"))


# ---- (b) source registry ----------------------------------------------------------------------------------------
ALLOW_DOMAINS = {"us_government": (".gov", "onetonline.org", "onetcenter.org"),   # O*NET OnLine is the Department of Labor's site
                 "regulator": ("finra.org", "nasaa.org"),
                 "certification_body": ("shrm.org", "hrci.org", "asq.org", "aicpa-cima.com", "imaglobal.org", "cfainstitute.org", "pmi.org", "ascm.org", "theiia.org", "garp.org", "ismworld.org")}


def registry():
    d = json.load(open(SOURCES))
    d["by_id"] = {s["id"]: s for s in d["sources"]}
    d["vendor_rx"] = re.compile(r"\b(" + "|".join(re.escape(v) for v in d["blocked_vendors"]) + r")\b")
    d.setdefault("ladders_on_hold", {})
    return d


def publisher_short(src):
    return {"us_government": "", "regulator": src["publisher"].split(" (")[0], "certification_body": src["publisher"].split(" (")[0]}[src["publisher_class"]]


def passage_use(p):
    return p.get("use")


def content_for(target, pair, reg):
    """What the registry holds about a target, for one pair: [{source, item, use, text}]. A passage counts only
    when its record says it is about the target (`about`); a passage that merely mentions the target does not.
    Title-only sources serve roles (decision 1), not skills. No model."""
    out = []
    for s in reg["sources"]:
        if pair not in s["pairs"] or s["licence_class"] == "title_only":
            continue
        for p in s["passages"]:
            if target["id"] in p.get("about", []) and passage_use(p) in ("content", "input"):
                out.append({"source": s["id"], "item": p["id"], "use": passage_use(p), "text": p["text"]})
    return out[:8]


# ---- (c) templates: the model (skills) or the code (roles) fills slots, the code writes the sentence ---------------
SUBJECTS = ["a public company", "a company you choose", "a product you choose", "a purchase you choose", "a student club"]
TEMPLATES = {
    "learn_outline_whole": {"kind": "learn", "needs": "exam", "text": "Study the {outline} from {publisher}."},
    "learn_read":     {"kind": "learn", "needs": "content", "text": 'Read "{section}" in the {short_title}. Note {items}.'},
    "learn_course":   {"kind": "learn", "needs": "content", "text": "Take a course in {items}."},
    "practise_make":  {"kind": "practise", "needs": "content", "text": "Make {artefact} for {subject}. Include {items}."},
    "practise_input": {"kind": "practise", "needs": "input", "text": "Make {artefact} for a public company. Use {items} from {section} of its Form 10-K."},
    "prove_exam":     {"kind": "prove", "needs": "exam", "text": "Pass the {exam} from {publisher}. {fact}"},
}
VERBS = {"Study", "Read", "Take", "Make", "Pass"}
GROUNDING = {"exam": "title and facts", "content": "content", "input": "input only"}


def join_items(items):
    items = [str(i).strip() for i in items if str(i).strip()]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1] if items else ""


def artefact_name(label):
    label = re.sub(r"^[\w ]+\((DCF|LBO)\)", r"\1", label).replace(" (accretion/dilution)", "")
    first = label.split()[0]
    an = first[0] in "AEFHILMNORSX" if first.isupper() else first[0].lower() in "aeiou"
    return ("an " if an else "a ") + label


def render(step, target, src):
    """The sentence of a step from its template and slots. Returns (text, problem)."""
    t = TEMPLATES.get(step.get("template"))
    if not t:
        return None, "unknown template"
    sl = step.get("slots") or {}
    p = {x["id"]: x for x in src["passages"]}.get(step.get("item") or "")
    v = {"publisher": publisher_short(src), "short_title": src["short_title"], "outline": src.get("outline_title") or "", "exam": src.get("exam") or "",
         "artefact": artefact_name(target["label"]), "items": join_items(sl.get("items") or []), "subject": sl.get("subject") or "",
         "section": sl.get("section") or (p["section"] if p else ""), "fact": ""}
    name = step["template"]
    if t["needs"] == "exam":
        if src["licence_class"] != "title_only":
            return None, "this template needs an exam source"
        if name == "learn_outline_whole" and not v["outline"]:
            return None, "the source names no outline"
        if name == "prove_exam":
            f = {x["id"]: x["text"] for x in src.get("facts", [])}.get(sl.get("fact") or "")
            if not f:
                return None, "the fact is not in the source record"
            v["fact"] = f
    else:
        if not p:
            return None, "the passage is not in the source"
        if name in ("learn_read", "practise_input"):
            v["section"] = p["section"]
        if name == "practise_make" and v["subject"] not in SUBJECTS:
            return None, "the subject is not on the list"
        if not v["items"]:
            return None, "no items"
    return t["text"].format(**v), None


def demand_line(t, ladder):
    if t["scope"] == "role" and t["kind"] in CREDENTIAL_KINDS:
        s = f"{t['employers']} employers name it in {t['postings']} of {t['of_postings']} US {LEVEL_NAMES[ladder][t['level']]}-level postings for this role."
    else:
        where = "in sentences about this skill" if t["scope"] == "skill" else "elsewhere in postings that ask for this skill"
        s = f"{t['employers']} employers name it {where} ({t['postings']} of {t['of_postings']} US {LEVEL_NAMES[ladder][t['level']]}-level postings)."
    if t.get("deadline_employers", 0) >= MIN_EMPLOYERS["skill"]:
        s += f" {t['deadline_employers']} of them set a deadline after hire."
    return s


# ---- (d) code checks ----------------------------------------------------------------------------------------------
STOP = set("""a an the and or of to in on for with by at from as is are be this that these those it its their your you our we they them into across within over under per each every all any
both more most other such than then when where which who will can may must should not no also about between through during before after up down out off new use used using make makes include note
study read take learn pass course courses exam outline public company lists list under its form""".split())
TOKEN = re.compile(r"[A-Za-z][A-Za-z&/+*'’.-]{2,}|\$?\d[\d,.]*%?")
FILLER = re.compile(r"\b(leveraging|utili[sz]\w+|robust|seamless\w*|world[- ]class|best[- ]in[- ]class|cutting[- ]edge|synerg\w+|in order to|as well as|deep dive|fast[- ]paced|passion\w*|"
                    r"hands[- ]on|real[- ]world|essential|crucial|key to|master\w*|comprehensive)\b", re.I)
PASSIVE = re.compile(r"\b(is|are|was|were|be|been|being|gets?|got)\s+(\w+ly\s+)?(\w{3,}ed|built|made|done|given|known|shown|written|run|held|led|set|sent|kept|taken|drawn)\b", re.I)
DUTY = re.compile(r"\b(practi[cs]e|gain exposure|develop your|assist\w*|support the|help the|shadow|on the job|live (deals?|transactions?)|"
                  r"(for|with) (a |the |your )?(clients?|employer|manager|deal teams?|senior bankers?)|your (firm|bank|employer|team|manager))\b", re.I)
MAX_WORDS, MAX_QUOTE = 20, 12


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def terms(s):
    out = set()
    for t in TOKEN.findall(re.sub(r"[.,;:]+(\s|$)", " ", s)):
        low = t.lower().strip(".-'’")
        if low in STOP:
            continue
        if t[0].isdigit() or t[0] == "$" or (t.isupper() and len(t) >= 2) or len(low) >= 4:
            out.add(re.sub(r"(’s|'s|s)$", "", low) if len(low) > 4 else low)
    return out


def sentences_of(text):
    return [s for s in re.split(r'(?<=[.!?])\s+(?=[A-Z"0-9])', text.strip()) if s]


def source_text(src, item):
    """Everything of a source that a step may take words from."""
    p = {x["id"]: x for x in src["passages"]}.get(item or "")
    parts = [src["title"], src["short_title"], src.get("outline_title") or "", src.get("exam") or "",
             " ".join(f["text"] for f in src.get("facts", [])), publisher_short(src)]
    if p:
        parts += [p["text"], p["section"]]
    return " ".join(parts)


def check_step(step, targets, reg, lex_by_id, ladder, held=()):
    """Every code check on one step. Returns {check: reason} for the checks it fails (empty: it passes all).
    targets: the target rows of the pair or the role; held: ladders on hold."""
    bad = {}
    target = next((t for t in targets if t["id"] == step.get("target") and t["scope"] == step.get("scope") and t["level"] == step.get("level")), None) \
        or next((t for t in targets if t["id"] == step.get("target")), None)
    src = reg["by_id"].get(step.get("source") or "")
    is_role = step.get("for") == "role"
    # 1 demand: enough employers name the target in postings of this skill (or role) and ladder, in sentences with no negation
    if not target:
        bad["demand"] = "the target is not among the targets that employers name for this pair"
    else:
        rx = lex_by_id[target["id"]]["re"]
        ev = {e["id"]: e for e in target["evidence"]}
        cited = [ev[i] for i in step.get("evidence") or [] if i in ev]
        named = {e["company"] for e in target["evidence"] if rx.search(e["text"]) and not NEGATION.search(e["text"])}
        need = MIN_EMPLOYERS[target["scope"]]
        if target["employers"] < need or len(named) < min(need, PER_TARGET):
            bad["demand"] = f"{len(named)} employers name the target in the stored sentences; a {target['scope']}-scope target needs {need}"
        elif len({e["company"] for e in cited}) < 2:
            bad["demand"] = "the step cites fewer than two posting sentences of different employers"
        elif step.get("scope") != target["scope"] or step.get("level") != target["level"]:
            bad["demand"] = "the step's scope or level label differs from the target's"
    # 1b credential: a licence, exam or degree is a step of the role, never of a skill (decision 1)
    if target and (target["kind"] in CREDENTIAL_KINDS) != is_role:
        bad["credential"] = "a credential target under a skill, or a document or tool under a role"
    # 1c hold: a ladder with no agreed source gets no step (decision 3)
    if ladder in held:
        bad["hold"] = f"the {ladder} ladder is on hold: {held[ladder]}" if isinstance(held, dict) else f"the {ladder} ladder is on hold"
    # 2 source: on the allow-list, right domain, reachable when read, with a hash of what was read
    if not src:
        bad["source"] = "the source is not in the registry"
        return bad
    host = re.sub(r"^https?://([^/]+).*", r"\1", src["url"])
    if src["publisher_class"] not in reg["allowed_publisher_classes"] or not host.endswith(ALLOW_DOMAINS.get(src["publisher_class"], ())):
        bad["source"] = f"{host} is not on the allow-list for {src['publisher_class']}"
    elif src.get("status_when_read") != 200 or not src.get("date_read") or not src.get("terms_note"):
        bad["source"] = "the source was not reachable when read, or has no date or terms note"
    elif not src.get("record_sha256"):
        bad["source"] = "the source record has no hash (run pipeline.build_sources verify)"
    elif any(x.get("found") is False for x in src["passages"] if x["id"] == step.get("item")):
        bad["source"] = "the stored passage was not found at the URL when the source was last verified"
    elif not is_role and f"{step.get('skill')}:{ladder}" not in src["pairs"]:
        bad["source"] = "the source is not mapped to this skill and ladder"
    if not target:
        return bad
    # 3 skill link and grounding: the cited part of the source is about the target; content, or labelled input only
    p = {x["id"]: x for x in src["passages"]}.get(step.get("item") or "")
    if src["licence_class"] == "title_only":
        if target["id"] not in src.get("about", []):
            bad["skill_link"] = "the source is not about this target"
    elif not p or target["id"] not in p.get("about", []):
        bad["skill_link"] = "the passage record does not say it is about this target"
    use = "exam" if src["licence_class"] == "title_only" else (passage_use(p) if p else None)
    if use not in GROUNDING:
        bad["grounding"] = f"a passage used as '{use}' grounds no step"
    elif step.get("grounding") != GROUNDING[use]:
        bad["grounding"] = f"the step is labelled '{step.get('grounding')}'; its passage grounds '{GROUNDING[use]}'"
    # 4 template: the text is what the template gives for the slots
    text, problem = render(step, target, src)
    if problem:
        bad["template"] = problem
        return bad
    if step.get("text") != text:
        bad["template"] = "the stored text is not the template's text"
    tpl = TEMPLATES[step["template"]]
    if step.get("kind") != tpl["kind"]:
        bad["template"] = "the kind does not match the template"
    if use in GROUNDING and use != tpl["needs"]:
        bad["template"] = f"the template needs a source used as '{tpl['needs']}', this one is '{use}'"
    if tpl["kind"] == "practise" and (target["kind"] != "document" or target.get("activity")):
        bad["template"] = "the target is not a thing a student can make (a tool, a credential or an activity)"
    if step["template"] == "learn_course" and (not p or not re.search(r"\bcourse", p["text"], re.I)):
        bad["template"] = "the passage does not speak of courses"
    # 5 quote and 6 licence: each item and quoted phrase is word for word in the stored text; title-only sources give titles only
    body = norm(p["text"]) if p else ""
    items = (step.get("slots") or {}).get("items") or []
    if src["licence_class"] == "title_only":
        if items or step.get("quote") or '"' in text:
            bad["licence"] = "a title-only source gives a title and a link, no quoted words"
    else:
        for it in items + ([step["quote"]] if step.get("quote") else []):
            if norm(it) not in body:
                bad["quote"] = f"\"{it}\" is not word for word in the stored passage"
            elif len(norm(it).split()) > MAX_QUOTE:
                bad["quote"] = f"\"{it[:40]}...\" is longer than {MAX_QUOTE} words"
        if not items:
            bad["quote"] = "no words of the source in the step"
    for q in re.findall(r'"([^"]+)"', text):
        if norm(q) not in norm(source_text(src, step.get("item"))):
            bad["quote"] = f"the quoted \"{q}\" is not in the stored source"
    # 7 vendor block-list
    m = reg["vendor_rx"].search(text) or reg["vendor_rx"].search(src["title"] + " " + src["publisher"])
    if m:
        bad["vendor"] = f"names a paid course vendor ({m.group(0)})"
    # 8 style
    sents = sentences_of(text)
    long = [s for s in sents if len(re.findall(r"[A-Za-z0-9&$%'’/*+-]+", s)) > MAX_WORDS]
    m = FILLER.search(text) or PASSIVE.search(text)
    if long:
        bad["style"] = f"a sentence has more than {MAX_WORDS} words"
    elif len(sents) > 2 or ";" in text or "(" in text:
        bad["style"] = "more than two sentences, or a semicolon or bracket"
    elif text.split()[0] not in VERBS:
        bad["style"] = "does not start with a verb of the templates"
    elif m:
        bad["style"] = f"filler or passive voice: \"{m.group(0)}\""
    # 9 not a job duty: a student can do it without holding the job (the code part; the critic asks again for skill steps)
    m = DUTY.search(text)
    if m:
        bad["not_a_duty"] = f"reads as a job duty: \"{m.group(0)}\""
    elif not (terms(text) & (terms(target["label"]) | terms(src["short_title"]) | terms(src.get("exam") or "") | terms(src.get("outline_title") or ""))):
        bad["not_a_duty"] = "names neither the target nor the source"
    if tpl["kind"] == "prove" and src.get("student_can_take") is not True:
        bad["access"] = "the source does not say that a person with no employer can take this exam" if src.get("student_can_take") is None \
            else "the exam needs an employer's sponsorship or work experience"
    # 10 slots only: every content word comes from the template, the target or the stored source
    allowed = terms(source_text(src, step.get("item"))) | terms(target["label"]) | terms(" ".join(SUBJECTS)) | terms(" ".join(t["text"] for t in TEMPLATES.values()))
    extra = terms(text) - allowed
    if extra:
        bad["slots_only"] = "words from neither the source nor the target: " + ", ".join(sorted(extra))
    # 11 numbers come from the source
    nums = set(re.findall(r"\d[\d,.]*", text)) - set(re.findall(r"\d[\d,.]*", source_text(src, step.get("item")) + " 10-K"))
    if nums:
        bad["numbers"] = "a number that is not in the source: " + ", ".join(sorted(nums))
    return bad


CHECKS = ["demand", "credential", "hold", "source", "skill_link", "grounding", "template", "quote", "licence", "vendor", "style", "not_a_duty", "access", "slots_only", "numbers", "different"]


def different(steps, by_target=False):
    """Final steps of a pair: one per kind, each on its own target (by_target: one per kind and target, for a role).
    Returns ids that break the rule."""
    seen, out = set(), []
    for s in steps:
        keys = [(s["kind"], s["target"])] if by_target else [("kind", s["kind"]), ("target", s["target"])]
        if any(k in seen for k in keys):
            out.append(s["n"])
        seen.update(keys)
    return out


def with_source(c, src, target, ladder):
    c["demand_line"] = demand_line(target, ladder)
    c["source_url"], c["source_title"], c["licence_class"] = src["url"], src["title"], src["licence_class"]
    c["publisher"] = src["publisher"]
    return c


# ---- (e) role steps: licences, exams and degrees, written by code from the source record ---------------------------
def role_steps(rt, reg, lex_by_id):
    """Steps of one role on one ladder, from its credential targets and the title-only records (exam bodies, regulators)
    about them. No model: the record says the outline's name, whether a person with no firm can sit the exam, and the
    fact to show. A degree or coursework target is listed as an ask; no source on the list says what a degree contains."""
    ladder = rt["ladder"]
    out = []
    for t in rt["targets"]:
        for s in reg["sources"]:
            if t["id"] not in s.get("about", []):
                continue
            ev = [e["id"] for e in t["evidence"][:4]]
            base = {"for": "role", "family": rt["family"], "ladder": ladder, "target": t["id"], "scope": "role", "level": t["level"], "source": s["id"], "item": "",
                    "slots": {}, "quote": "", "evidence": ev, "status": "ok", "why": "", "round": 0}
            cands = []
            if s["licence_class"] != "title_only":
                continue   # a page about one occupation (BLS, O*NET) does not ground a step for every role that asks for the degree
            if s.get("outline_title"):
                cands.append({**base, "n": f"{t['id']}.learn", "template": "learn_outline_whole", "kind": "learn", "grounding": "title and facts"})
            if s.get("student_can_take") is True and s.get("access_fact"):
                cands.append({**base, "n": f"{t['id']}.prove", "template": "prove_exam", "kind": "prove", "grounding": "title and facts", "slots": {"fact": s["access_fact"]}})
            for c in cands:
                c["text"] = render(c, t, s)[0]
                with_source(c, s, t, ladder)
                c["code_checks"] = check_step(c, rt["targets"], reg, lex_by_id, ladder, reg["ladders_on_hold"])
                if c["code_checks"]:
                    k = next(iter(c["code_checks"]))
                    c["status"], c["why"] = "code:" + k, c["code_checks"][k]
                out.append(c)
            note = next((f["text"] for f in s.get("facts", []) if f["id"] == s.get("access_fact")), "") if s.get("student_can_take") is False else ""
            if note:
                t["access_note"] = note
    return out


def roles_cmd(args):
    """Every role on every ladder: credential targets (five employers), their steps, and what is asked with no source."""
    jobs, corpus = load(args.roles)
    reg, lex = registry(), lexicon()
    lex_by_id = {t["id"]: t for t in lex}
    results = []
    for family in roles_mba.FAMILY_LABELS:
        for ladder in roles_mba.LADDERS:
            rt = find_role_targets(jobs, corpus, family, ladder, lex)
            if not rt["targets"]:
                continue
            steps = role_steps(rt, reg, lex_by_id)
            final = []
            seen = set()
            for c in sorted([c for c in steps if c["status"] == "ok"], key=lambda c: (c["kind"] != "learn", c["n"])):
                if (c["kind"], c["target"]) in seen:
                    continue
                seen.add((c["kind"], c["target"]))
                final.append(c["n"])
            rt["steps"] = steps
            rt["final"] = final
            rt["asks_without_source"] = [t["id"] for t in rt["targets"] if not any(c["target"] == t["id"] for c in steps)]
            results.append(rt)
            print(f"{family}:{ladder}  targets {[t['id'] for t in rt['targets']]}  steps {len(final)}  no source: {rt['asks_without_source']}", flush=True)
    doc = {"generated": time.strftime("%Y-%m-%d"), "min_employers": MIN_EMPLOYERS["role"], "share": ROLE_SHARE, "results": results}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "build_roles.json")
    json.dump(doc, open(path, "w"), indent=1, ensure_ascii=False)
    n = sum(len(r["final"]) for r in results)
    print(f"\n{len(results)} role-and-ladder pairs with a credential target; {n} steps; wrote {path}")


def needs_cmd(args):
    """What a hand must collect: targets that pass the demand rule and have no source, by the pairs and roles they would serve."""
    tdoc = targets_of(args, write=False)
    reg = registry()
    jobs, corpus = load(args.roles)
    lex = lexicon()
    need, served, no_target = collections.defaultdict(lambda: {"pairs": set(), "employers": 0}), collections.Counter(), []
    for pair in tdoc["pairs"]:
        key = f"{pair['skill']}:{pair['ladder']}"
        if not pair["targets"]:
            no_target.append(key)
        for t in pair["targets"]:
            if t["kind"] == "tool":
                continue
            if content_for(t, key, reg):
                served[key] += 1
            else:
                need[t["id"]]["pairs"].add(key)
                need[t["id"]]["employers"] = max(need[t["id"]]["employers"], t["employers"])
    rneed = collections.defaultdict(set)
    for family in roles_mba.FAMILY_LABELS:
        for ladder in roles_mba.LADDERS:
            rt = find_role_targets(jobs, corpus, family, ladder, lex)
            for t in rt["targets"]:
                if not any(t["id"] in s.get("about", []) for s in reg["sources"]):
                    rneed[t["id"]].add(f"{family}:{ladder}")
    print(f"{len(tdoc['pairs'])} pairs; {len(served)} have at least one document target with a source; {len(no_target)} have no target at all")
    print("\nDocument targets with no source, by the pairs they would serve (hand effort: one source record each):")
    for tid, v in sorted(need.items(), key=lambda x: -len(x[1]["pairs"])):
        print(f"  {tid:24} {len(v['pairs']):3} pairs  (most employers in one pair: {v['employers']})")
    print("\nCredential targets of roles with no source:")
    for tid, v in sorted(rneed.items(), key=lambda x: -len(x[1])):
        print(f"  {tid:24} {len(v):3} role-and-ladder pairs")
    print("\nPairs with no target:", ", ".join(no_target) or "none")


# ---- model calls: cached, counted, capped -------------------------------------------------------------------------
class Models:
    """As pipeline.depth_gen.Models, with its own cache file. The cap counts answered requests over all runs; a
    request that fails or is refused is logged and not counted."""
    ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(self, dry, env, cap=MAX_REQUESTS):
        import threading
        self.dry, self.cap, self.lock = dry, cap, threading.Lock()
        self.path = os.path.join(OUT, "build_cache.jsonl")
        self.log = os.path.join(OUT, "build_requests.jsonl")   # one line per request sent, also failed ones
        self.cache = {}
        if os.path.exists(self.path):
            for line in open(self.path):
                r = json.loads(line)
                self.cache[r["key"]] = r
        self.attempts = sum(1 for _ in open(self.log)) if os.path.exists(self.log) else 0
        self.key = None
        if env and os.path.exists(env):
            for line in open(env):
                if line.startswith("OPENROUTER_API_KEY="):
                    self.key = line.split("=", 1)[1].strip().strip("\"'")
        if not dry and not self.key:
            sys.exit("OPENROUTER_API_KEY not found; pass --env or use --dry-run")
        self.would_send = collections.Counter()
        self.refused = {}   # model -> message, once OpenRouter refuses it for lack of credit: nothing more is sent to it in this run

    def answered(self):
        return len(self.cache)

    def ask(self, model, prompt, kind):
        import hashlib
        key = hashlib.sha256(f"{model}\n{prompt}".encode()).hexdigest()
        if key in self.cache:
            return self.cache[key]["answer"]
        self.would_send[kind] += 1
        if self.dry:
            return None
        import requests
        body = {"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}, "max_tokens": 2000 if model == DRAFTER else 1400}
        answer, d = {"_error": "not sent"}, {}
        if model in self.refused:
            return {"_error": "not sent: " + self.refused[model]}
        with self.lock:
            if self.answered() >= self.cap:
                return {"_error": f"cap of {self.cap} answered requests reached"}
            self.attempts += 1
            with open(self.log, "a") as f:
                f.write(json.dumps({"n": self.attempts, "model": model, "kind": kind, "time": time.strftime("%Y-%m-%dT%H:%M:%S")}) + "\n")
        try:
            r = requests.post(self.ENDPOINT, headers={"Authorization": f"Bearer {self.key}"}, json=body, timeout=180)
            d = r.json()
            answer = json.loads(re.search(r"\{.*\}", d["choices"][0]["message"]["content"], re.S).group(0))
        except Exception as e:
            answer = {"_error": type(e).__name__ + (": " + str(d.get("error"))[:120] if isinstance(d, dict) and d.get("error") else "")}
        if "credits" in answer.get("_error", ""):
            self.refused[model] = "OpenRouter refused this model for lack of credit"
        u = (d.get("usage") or {}) if isinstance(d, dict) else {}
        if "_error" not in answer:
            rec = {"key": key, "model": model, "kind": kind, "answer": answer, "usage": {k: u.get(k) for k in ("prompt_tokens", "completion_tokens", "cost")}}
            with self.lock:
                self.cache[key] = rec
                with open(self.path, "a") as f:
                    f.write(json.dumps(rec) + "\n")
        return answer

    def many(self, model, prompts, kind):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(2) as pool:   # few at a time: OpenRouter refuses requests when in-flight ones reserve the credit
            return list(pool.map(lambda p: self.ask(model, p, kind), prompts))

    def cost(self):
        return sum((r["usage"].get("cost") or 0) for r in self.cache.values())


# ---- prompts ------------------------------------------------------------------------------------------------------
MAX_CANDIDATES = 4


def menu(pair, reg):
    """Per target: what the registry holds about it. Targets with nothing are listed as 'demand without content'."""
    key = f"{pair['skill']}:{pair['ladder']}"
    have, none = [], []
    for t in pair["targets"]:
        c = content_for(t, key, reg)
        (have if c else none).append((t, c))
    return have, none


def draft_prompt(pair, name, what, have, reg, tried=None, kept=(), missing=()):
    blocks = []
    for t, cont in have:
        lines = [f"TARGET {t['id']} — {t['label']} ({'activity, not a thing to make: no practise step' if t.get('activity') else t['kind']}; scope {t['scope']}; level {t['level']}; {t['employers']} employers)"]
        lines += [f"  posting [{e['id']}] ({e['company']}) {e['text']}" for e in t["evidence"][:4]]
        for s_id in dict.fromkeys(c["source"] for c in cont):
            s = reg["by_id"][s_id]
            lines.append(f"  SOURCE {s_id} — {s['publisher']}: {s['title']}")
            lines += [f"    passage [{c['item']}] (use: {c['use']}) {c['text']}" for c in cont if c["source"] == s_id]
        blocks.append("\n".join(lines))
    tpl = "\n".join(f"- {k} ({v['kind']}; needs a passage used as {v['needs']}): {v['text']}" for k, v in TEMPLATES.items() if v["needs"] != "exam")
    again = ""
    if tried is not None:
        again = "\n\nA first draft was checked. Steps kept:\n" + ("\n".join(f"- ({s['kind']}) {s['text']}" for s in kept) or "- none") + \
                "\nSteps dropped:\n" + ("\n".join(f"- {s['text'] or s.get('template')} — {s['why']}" for s in tried) or "- none") + \
                f"\nKinds still missing: {', '.join(missing)}. Give at most 2 NEW steps, of the missing kinds only, on targets that the kept steps do not use. " \
                "Fix the reason of a dropped step if you can. A role-scope target is acceptable here. If no source grounds a missing kind, give an empty list."
    return f"""You choose "how to build it" steps for a skill, for MBA and graduate students. You do not write prose. You pick a target, a source passage and slot values; a program writes the sentence from a template.

Skill: {name} — {what}
Employers: {pair['ladder']} ladder, US postings.

Rules.
- A step needs two keys: a TARGET that postings name (below), and a SOURCE passage that says what the target contains (use: content) or names a public input for it (use: input).
- Use only the targets, sources and passages listed below. Do not use what you know about the field. If the passages do not ground a step, do not give it. Fewer steps, or none, is a correct answer.
- Choose targets that are specific to THIS skill. Prefer scope "skill" (named in the skill's own sentences) over scope "role" (named elsewhere in the posting).
- A student must be able to do the step with no job: no employer's clients, deals, systems or sponsorship.
- At most {MAX_CANDIDATES} steps, each on a different target. Aim for one learn and one practise step, and give a kind only when a passage grounds it. At most 2 of one kind.

Templates (slots in braces):
{tpl}
Slot rules: "items" is a list of 2 to 4 short phrases (1 to 5 words each) COPIED EXACTLY from the passage. "subject" for practise_make is one of: {' | '.join(SUBJECTS)}. learn_course needs a passage about courses. Each sentence must stay within 20 words.

Targets and what the sources hold:
{chr(10).join(blocks)}{again}

Answer in JSON: {{"steps": [{{"template": "...", "target": "target id", "source": "source id", "item": "passage id", "slots": {{"items": [], "subject": ""}}, "quote": "3 to 12 consecutive words copied exactly from the passage", "evidence": ["2 to 4 posting ids of that target, from different employers"], "why_this_skill": "one short sentence"}}]}}"""


def source_view(src, item):
    p = {x["id"]: x for x in src["passages"]}[item]
    return f"{src['publisher']}: \"{src['title']}\" ({src['url']}), section \"{p['section']}\":\n{p['text']}"


def support_prompt(step, target, src):
    return f"""A study step for students, the source passage it rests on, and the job-posting sentences that name its target. Judge from these only, not from what you know.

Step: {step['text']}
Target: {target['label']}

Source passage:
{source_view(src, step.get('item'))}

Posting sentences:
{chr(10).join('- (' + e['company'] + ') ' + e['text'] for e in target['evidence'] if e['id'] in step['evidence'])}

Answer in JSON: {{"source_supports": "yes" | "partly" | "no", "unsupported_part": "the words of the step the source passage does not support, or empty", "says_what_target_contains": "yes" | "no", "postings_name_target": "yes" | "no", "reason": "one sentence"}}
"source_supports": does the passage support everything the step says about the document or the tool? The subject of an exercise ("for a public company", "for a company you choose", "for a product you choose") is set by the program and is not a claim about the source: do not judge it. "says_what_target_contains": does the passage itself say what the target ({target['label']}) contains or covers, as opposed to only naming it or only naming an input for it?"""


def student_prompt(step, target, src):
    return f"""A study step written for an MBA or graduate student who does not hold the job yet.

Step: {step['text']}

Source: a public document, {src['title']} ({src['url']}).

Can a student do this step without holding the job: with no employer's clients, deals, internal systems, data or sponsorship? Is it an action with an end (something made, read or passed), not a job duty?
Answer in JSON: {{"student_can_do": "yes" | "no", "is_job_duty": "yes" | "no", "needs": "what the student would lack, or empty", "reason": "one sentence"}}"""


def swap_prompt(step, options):
    return f"""This study step was written for ONE of four skills. Which one?

"{step['text']}"

{chr(10).join(f'{chr(65 + i)}. {o}' for i, o in enumerate(options))}

Answer in JSON: {{"answer": "A" | "B" | "C" | "D", "could_also_be": "letters of other options that fit as well, or empty"}}"""


# ---- the run ------------------------------------------------------------------------------------------------------
def run_cmd(args):
    import glob
    import random
    T = {s["id"]: s for s in tax.for_roles(args.roles)["skills"]}
    depth = {}
    for f in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
        if not f.endswith("_roles.json"):
            depth.update(json.load(open(f)))
    reg, lex_by_id = registry(), {t["id"]: t for t in lexicon()}
    tdoc = targets_of(args)
    M = Models(args.dry_run, args.env, args.cap)
    start, answered0 = M.attempts, M.answered()
    results = []
    for pair in tdoc["pairs"]:
        skill, ladder = pair["skill"], pair["ladder"]
        name, what = T[skill]["name"], depth.get(skill, {}).get("what", "")
        have, none = menu(pair, reg)
        res = {"skill": skill, "ladder": ladder, "name": name, "targets_total": len(pair["targets"]), "targets_with_content": [t["id"] for t, _ in have],
               "targets_without_content": [t["id"] for t, _ in none], "candidates": [], "final": []}
        results.append(res)
        if ladder in reg["ladders_on_hold"]:
            res["note"] = f"held: {reg['ladders_on_hold'][ladder]}"
            print(f"{skill}:{ladder}  on hold, nothing drafted", flush=True)
            continue
        if not have:
            res["note"] = "no target of this pair has a source: nothing drafted, no request sent"
            print(f"{skill}:{ladder}  no source for any target", flush=True)
            continue
        tmap = {t["id"]: t for t, _ in have}
        others = [T[p["skill"]]["name"] for p in tdoc["pairs"] if p["ladder"] == ladder and p["skill"] != skill][:3]

        def judge(raw, rnd_no):
            cands = []
            for s in (raw or {}).get("steps", [])[:MAX_CANDIDATES if rnd_no == 1 else 2]:
                if not isinstance(s, dict):
                    continue
                t, src = tmap.get(s.get("target")), reg["by_id"].get(s.get("source") or "")
                c = {"n": f"{rnd_no}.{len(cands) + 1}", "round": rnd_no, "for": "skill", "skill": skill, "template": s.get("template"), "kind": (TEMPLATES.get(s.get("template")) or {}).get("kind"),
                     "target": s.get("target"), "scope": t["scope"] if t else None, "level": t["level"] if t else None, "source": s.get("source"), "item": s.get("item") or "",
                     "slots": {k: v for k, v in (s.get("slots") or {}).items() if v}, "quote": s.get("quote") or "", "evidence": s.get("evidence") or [],
                     "why_this_skill": s.get("why_this_skill"), "text": None, "status": "ok", "why": "", "grounding": None}
                if t and src:
                    c["text"] = render(c, t, src)[0]
                    p = {x["id"]: x for x in src["passages"]}.get(c["item"])
                    c["grounding"] = GROUNDING.get(passage_use(p)) if p else None
                    with_source(c, src, t, ladder)
                c["code_checks"] = check_step(c, pair["targets"], reg, lex_by_id, ladder, reg["ladders_on_hold"])
                if c["code_checks"]:
                    k = next(iter(c["code_checks"]))
                    c["status"], c["why"] = "code:" + k, c["code_checks"][k]
                cands.append(c)
            ok = [c for c in cands if c["status"] == "ok"]
            sup = M.many(CRITIC, [support_prompt(c, tmap[c["target"]], reg["by_id"][c["source"]]) for c in ok], "support")
            stu = M.many(CRITIC, [student_prompt(c, tmap[c["target"]], reg["by_id"][c["source"]]) for c in ok], "student")
            rnd = random.Random(f"swap:{skill}:{ladder}:{rnd_no}")
            opts = []
            for c in ok:
                o = [name] + others
                rnd.shuffle(o)
                opts.append(o)
            swp = M.many(CRITIC, [swap_prompt(c, o) for c, o in zip(ok, opts)], "swap")
            for c, a, b, w, o in zip(ok, sup, stu, swp, opts):
                c["critic"] = {"support": a, "student": b, "swap": w}
                if a is None or b is None or w is None:
                    continue
                if any("_error" in x for x in (a, b, w)):
                    c["status"], c["why"] = "critic:error", "no answer from the critic"
                    continue
                i = "ABCD".find((w.get("answer") or "?")[:1])
                c["skill_specific"] = 0 <= i < 4 and o[i] == name and not w.get("could_also_be")
                c["picked"] = o[i] if 0 <= i < 4 else None
                c["content_grounded"] = a.get("says_what_target_contains") == "yes"
                if a.get("source_supports") != "yes":
                    c["status"], c["why"] = "critic:support", f"{a.get('source_supports')}: {a.get('unsupported_part') or a.get('reason')}"
                elif a.get("postings_name_target") != "yes":
                    c["status"], c["why"] = "critic:support", "the critic does not find the target in the posting sentences"
                elif c["grounding"] == "content" and not c["content_grounded"]:   # enforced: a content step's passage must say what the target contains
                    c["status"], c["why"] = "critic:content", "the critic says the passage does not say what the target contains: " + (a.get("reason") or "")
                elif b.get("student_can_do") != "yes" or b.get("is_job_duty") == "yes":
                    c["status"], c["why"] = "critic:student", b.get("needs") or b.get("reason") or "a job duty"
                elif c["scope"] == "skill" and not (0 <= i < 4 and o[i] == name):
                    c["status"], c["why"] = "critic:specific", f"read as another skill ({c['picked']})"
            return cands

        raw = M.ask(DRAFTER, draft_prompt(pair, name, what, have, reg), "draft")
        if raw is None:
            print(f"{skill}:{ladder}  dry run", flush=True)
            continue
        if "_error" in raw:
            res["errors"] = ["first drafting request: " + raw["_error"]]
        cands = judge(raw, 1)
        kinds_ok = {c["kind"] for c in cands if c["status"] == "ok"}
        dropped = [c for c in cands if c["status"] != "ok"]
        if len(kinds_ok) < 2:   # one more try (also when the first request got no answer) for the kinds that are missing
            kept = [c for c in cands if c["status"] == "ok"]
            raw2 = M.ask(DRAFTER, draft_prompt(pair, name, what, have, reg, tried=dropped, kept=kept, missing=[k for k in ("learn", "practise") if k not in kinds_ok]), "redraft")
            if raw2 and "_error" in raw2:
                res.setdefault("errors", []).append("second drafting request: " + raw2["_error"])
            elif raw2 is not None and not raw2.get("steps"):
                res["redraft_empty"] = True   # the drafter was asked for the missing kinds and gave none
            cands += judge(raw2, 2)
        res["candidates"] = cands
        # final: one step per kind, each on its own target; skill-scope targets first, content before input only, then the order drafted
        seen_k, seen_t = set(), set()
        for c in sorted([c for c in cands if c["status"] == "ok"], key=lambda c: (c["scope"] != "skill", c["grounding"] == "input only", c["n"])):
            if c["kind"] in seen_k or c["target"] in seen_t:
                c["status"], c["why"] = "not chosen", "another step of this kind or on this target was kept"
                continue
            seen_k.add(c["kind"])
            seen_t.add(c["target"])
            res["final"].append(c["n"])
        print(f"{skill}:{ladder}  drafted {len(cands)}  " + str(dict(collections.Counter(c['status'] for c in cands))) + f"  final {len(res['final'])}", flush=True)
    doc = {"generated": time.strftime("%Y-%m-%d"), "drafter": DRAFTER, "critic": CRITIC, "pairs": args.pairs, "results": results,
           "requests": {"sent_this_run": M.attempts - start, "answered_this_run": M.answered() - answered0, "sent_in_all": M.attempts, "answered_in_all": M.answered(), "cap": M.cap,
                        "would_send_dry": dict(M.would_send), "cost_usd": round(M.cost(), 4)}}
    if not args.dry_run:
        json.dump(doc, open(os.path.join(OUT, f"{args.tag}.json"), "w"), indent=1, ensure_ascii=False)
        print("wrote", os.path.join(OUT, f"{args.tag}.json"))
    print("requests:", doc["requests"])


# ---- 3. the eval: all code checks on a finished run, no model ------------------------------------------------------
def registry_faults(reg):
    fails = []
    for s in reg["sources"]:
        for k in ("id", "publisher", "publisher_class", "title", "url", "date_read", "read_with", "status_when_read", "licence_class", "terms_note", "may_quote", "record_sha256"):
            if s.get(k) in (None, ""):
                fails.append(("registry", s.get("id"), f"no {k}"))
        if s["licence_class"] == "title_only" and s["passages"]:
            fails.append(("registry", s["id"], "a title-only source holds text"))
        if s["licence_class"] == "title_only" and s.get("student_can_take") is not None and not s.get("access_fact"):
            fails.append(("registry", s["id"], "says who can take the exam but names no access fact"))
        if s.get("access_fact") and s["access_fact"] not in {f["id"] for f in s.get("facts", [])}:
            fails.append(("registry", s["id"], "the access fact is not among its facts"))
        if reg["vendor_rx"].search(s["publisher"] + " " + s["title"]):
            fails.append(("registry", s["id"], "a blocked vendor"))
    return fails


def check_run(run, pairs_by_key, reg, lex_by_id, roles_doc=None):
    """(fails, n, per) for a finished skill run and, when given, the role steps."""
    fails, n, per = registry_faults(reg), 0, collections.Counter()
    for r in run["results"]:
        pair = pairs_by_key[(r["skill"], r["ladder"])]
        final = [c for c in r["candidates"] if c["n"] in r["final"]]
        for c in final:
            n += 1
            bad = check_step(c, pair["targets"], reg, lex_by_id, r["ladder"], reg["ladders_on_hold"])
            for k in CHECKS[:-1]:
                per[k] += k not in bad
            for k, why in bad.items():
                fails.append((f"{r['skill']}:{r['ladder']}", c["n"], f"{k}: {why}"))
            if c.get("status") != "ok":
                fails.append((f"{r['skill']}:{r['ladder']}", c["n"], "published with a status other than ok"))
            if c.get("grounding") == "content" and not c.get("content_grounded"):
                fails.append((f"{r['skill']}:{r['ladder']}", c["n"], "grounding: a content step the critic did not confirm"))
        d = different(final)
        per["different"] += len(final) - len(d)
        fails += [(f"{r['skill']}:{r['ladder']}", x, "different: same kind or same target as another step") for x in d]
        if len(final) > 3:
            fails.append((f"{r['skill']}:{r['ladder']}", "-", "more than three steps"))
    for rt in (roles_doc or {}).get("results", []):
        final = [c for c in rt["steps"] if c["n"] in rt["final"]]
        for c in final:
            n += 1
            bad = check_step(c, rt["targets"], reg, lex_by_id, rt["ladder"], reg["ladders_on_hold"])
            for k in CHECKS[:-1]:
                per[k] += k not in bad
            for k, why in bad.items():
                fails.append((f"{rt['family']}:{rt['ladder']}", c["n"], f"{k}: {why}"))
        d = different(final, by_target=True)   # a role may study for two exams: one step per kind and target
        per["different"] += len(final) - len(d)
        fails += [(f"{rt['family']}:{rt['ladder']}", x, "different: same kind and target as another step") for x in d]
    return fails, n, per


def check_cmd(args):
    """Exit 0 when every final step passes every code check. evals/run_depth.py runs the same checks on the published files."""
    reg, lex_by_id = registry(), {t["id"]: t for t in lexicon()}
    if args.selftest:
        return selftest(reg, lex_by_id)
    run = json.load(open(os.path.join(OUT, f"{args.tag}.json")))
    pairs = {(p["skill"], p["ladder"]): p for p in json.load(open(os.path.join(OUT, f"{args.tag}_targets.json")))["pairs"]}
    rp = os.path.join(OUT, "build_roles.json")
    roles_doc = json.load(open(rp)) if os.path.exists(rp) else None
    fails, n, per = check_run(run, pairs, reg, lex_by_id, roles_doc)
    print(f"build check: {n} final steps in {len(run['results'])} pairs" + (f" and {len(roles_doc['results'])} roles" if roles_doc else "") + f", {len(reg['sources'])} sources")
    for k in CHECKS:
        print(f"  {k:12} {per[k]}/{n}")
    for f in fails:
        print("  FAIL", *f)
    print("PASS" if not fails else f"{len(fails)} failures")
    sys.exit(1 if fails else 0)


def selftest(reg, lex_by_id):
    """Plant one fault at a time in a good step and assert that the named check catches it."""
    import copy
    src = reg["by_id"]["occ_rcr"]
    p = next(x for x in src["passages"] if x["id"] == "fsa")
    target = {"id": "financial_statements", "label": "financial statement analysis", "kind": "document", "activity": False, "scope": "skill", "level": "associate", "employers": 8, "postings": 12, "of_postings": 147,
              "evidence": [{"id": f"financial_statements.ass.s{i}", "company": c, "text": f"Analyze financial statements and credit metrics {i}", "preferred": False} for i, c in enumerate(["A", "B", "C", "D"], 1)]}
    items = [w for w in ("balance sheet", "income statement") if norm(w) in norm(p["text"])]
    good = {"n": "1.1", "for": "skill", "skill": "credit_analysis", "template": "learn_read", "kind": "learn", "target": "financial_statements", "scope": "skill", "level": "associate", "source": "occ_rcr", "item": "fsa",
            "slots": {"items": items}, "quote": items[0], "evidence": ["financial_statements.ass.s1", "financial_statements.ass.s2"], "grounding": "content"}
    good["text"] = render(good, target, src)[0]
    base = check_step(good, [target], reg, lex_by_id, "bank", {})
    assert not base, f"the good step fails: {base}"
    # every check reads the text the template renders from the slots, so a fault is planted in the slots (or the records)
    def retarget(s, t, tid, label, kind="document"):
        t.update(id=tid, label=label, kind=kind)
        s["target"] = tid
        for e in t["evidence"]:
            e["text"] = f"{label} skills {e['text']}"
    faults = {
        "demand": lambda s, t: s.update(evidence=["financial_statements.ass.s1"]),
        "credential": lambda s, t: t.update(kind="certification"),
        "hold": None,
        "source": lambda s, t: s.update(source="nowhere"),
        "skill_link": lambda s, t: retarget(s, t, "pitch_book", "pitch book"),
        "grounding": lambda s, t: s.update(grounding="input only"),
        "template": lambda s, t: s.update(text=s["text"] + " Then more."),
        "quote": lambda s, t: s["slots"].update(items=["words not in the passage"]),
        "licence": None,
        "vendor": lambda s, t: s["slots"].update(items=["Coursera"]),
        "style": lambda s, t: s["slots"].update(items=[" ".join(["word"] * 8), " ".join(["word"] * 8), " ".join(["word"] * 8)]),
        "not_a_duty": lambda s, t: s["slots"].update(items=["figures with your manager"]),
        "slots_only": lambda s, t: s["slots"].update(items=["quarterly"]),
        "numbers": lambda s, t: s["slots"].update(items=["42 days"]),
    }
    caught = 0
    for name, plant in faults.items():
        s, t, held = copy.deepcopy(good), copy.deepcopy(target), {}
        if name == "hold":
            held = {"bank": "test"}
        elif name == "licence":
            retarget(s, t, "sie", "SIE exam", "certification")
            s.update(source="finra_sie", item="", template="learn_outline_whole", grounding="title and facts", quote="x", slots={})
            s["for"] = "role"
        else:
            plant(s, t)
        if name != "template":
            s["text"] = render(s, t, reg["by_id"].get(s["source"], src))[0] or s["text"]
        bad = check_step(s, [t], reg, lex_by_id, "bank", held)
        ok = name in bad
        caught += ok
        print(f"  {'caught' if ok else 'MISSED'} {name:12} -> {dict(bad) if not ok else bad[name][:70]}")
    # different: two steps of one kind
    d = different([dict(good, n="1.1"), dict(good, n="1.2")])
    print(f"  {'caught' if d == ['1.2'] else 'MISSED'} different")
    caught += d == ["1.2"]
    print(f"selftest: {caught} of {len(faults) + 1} planted faults caught")
    sys.exit(0 if caught == len(faults) + 1 else 1)


# ---- readable report ----------------------------------------------------------------------------------------------
def report_cmd(args):
    reg = registry()
    run = json.load(open(os.path.join(OUT, f"{args.tag}.json")))
    pairs = {(p["skill"], p["ladder"]): p for p in json.load(open(os.path.join(OUT, f"{args.tag}_targets.json")))["pairs"]}
    rp = os.path.join(OUT, "build_roles.json")
    roles_doc = json.load(open(rp)) if os.path.exists(rp) else None
    L = [f"# Build steps: {len(run['results'])} skill and ladder pairs", "",
         f"Generated {run['generated']}. Drafter `{run['drafter']}`, critic `{run['critic']}`. Requests answered in all: {run['requests'].get('answered_in_all', '?')} of a cap of {run['requests']['cap']} ({run['requests']['sent_in_all']} sent; failed ones are not billed and not counted); "
         f"cost ${run['requests']['cost_usd']:.2f}. Everything here is measured by `pipeline/build_steps.py`.", ""]
    allc = [c for r in run["results"] for c in r["candidates"]]
    fin = [(r, c) for r in run["results"] for c in r["candidates"] if c["n"] in r["final"]]
    by_n = collections.Counter(len(r["final"]) for r in run["results"])
    L += ["## Totals", "", f"- Targets (documents and tools) that employers name: {sum(r['targets_total'] for r in run['results'])}; with a source in the registry: {sum(len(r['targets_with_content']) for r in run['results'])}.",
          f"- Steps drafted: {len(allc)}. By outcome: " + (", ".join(f"{k} {v}" for k, v in collections.Counter(c['status'] for c in allc).most_common()) or "none") + ".",
          f"- Final steps: {len(fin)}. By kind: " + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['kind'] for _, c in fin).items()) + ". By grounding: "
          + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['grounding'] for _, c in fin).items()) + ". By target scope: "
          + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['scope'] for _, c in fin).items()) + ".",
          "- Pairs by number of final steps: " + ", ".join(f"{k} steps: {by_n[k]}" for k in (3, 2, 1, 0)) + "; on hold: " + str(sum(1 for r in run['results'] if str(r.get('note', '')).startswith('held'))) + ".",
          f"- Final steps the critic calls skill-specific (it picks this skill among four of the ladder, and no other fits): {sum(1 for _, c in fin if c.get('skill_specific'))} of {len(fin)}.",
          f"- Final content steps, each confirmed by the critic as saying what the target contains: {sum(1 for _, c in fin if c.get('grounding') == 'content')}; input-only steps: {sum(1 for _, c in fin if c.get('grounding') == 'input only')}.", ""]
    L += ["| Pair | Entry postings (employers) | Targets | With a source | Drafted | Pass code checks | Pass support | Pass content | Pass student test | Pass specificity | Final |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in run["results"]:
        p, cs = pairs[(r["skill"], r["ladder"])], r["candidates"]
        code_ok = [c for c in cs if not c["code_checks"]]
        sup = [c for c in code_ok if c["status"] not in ("critic:support", "critic:error")]
        con = [c for c in sup if c["status"] != "critic:content"]
        stu = [c for c in con if c["status"] != "critic:student"]
        spe = [c for c in stu if c["status"] != "critic:specific"]
        L.append(f"| {r['skill']}:{r['ladder']} | {p['entry_postings']} ({p['entry_employers']}) | {r['targets_total']} | {len(r['targets_with_content'])} | {len(cs)} | {len(code_ok)} | {len(sup)} | {len(con)} | {len(stu)} | {len(spe)} | {len(r['final'])} |")
    L.append("")
    for r in run["results"]:
        p = pairs[(r["skill"], r["ladder"])]
        L += [f"## {r['name']} — {r['ladder']}", "", f"{p['entry_postings']} entry-level US postings, {p['entry_employers']} employers" + (f"; thin, so {p['next_postings']} next-level postings were read too" if p["thin"] else "") + ".", "",
              "**Final steps**", ""]
        final = [c for c in r["candidates"] if c["n"] in r["final"]]
        if r.get("errors"):
            L += ["*Incomplete: the model gave no answer to " + "; ".join(r["errors"]) + ". Rerun to ask again.*", ""]
        if not final:
            L += ["None. " + (r.get("note") or ("Nothing was drafted." if not r["candidates"] else "No drafted step passed every check.")), ""]
        for c in final:
            L += [f"- **{c['kind']}** — {c['text']}", f"  - Demand ({c['scope']} scope, target `{c['target']}`): {c['demand_line']}",
                  f"  - Source: {c['source_title']} — {c['source_url']} ({c['licence_class']}; grounding: {c['grounding']}; skill-specific = {'yes' if c.get('skill_specific') else 'no'})"]
        L += ["", "**Targets** (documents and tools: three employers at skill scope, five at role scope)", "", "| Target | Kind | Scope | Level | Employers | Postings | Lift | Source in registry |", "|---|---|---|---|---|---|---|---|"]
        for t in p["targets"]:
            L.append(f"| {t['label']}{' (broad)' if t['broad'] else ''} | {t['kind']} | {t['scope']} | {t['level']} | {t['employers']} | {t['postings']}/{t['of_postings']} | {t['lift']} | {'yes' if t['id'] in r['targets_with_content'] else 'no'} |")
        L += ["", "**Drafted steps and what happened**", ""]
        for c in r["candidates"]:
            L.append(f"- [{c['n']}] {c['kind']} / `{c['target']}` / `{c['source']}`: {c['text'] or '(no text: ' + str(c.get('template')) + ')'} — **{c['status']}**{': ' + c['why'] if c['why'] else ''}")
        if not r["candidates"]:
            L.append("- nothing drafted")
        L.append("")
    if roles_doc:
        L += ["## Steps of the roles: licences, exams and degrees", "", f"Five employers and 5% of the entry-level postings of the role on the ladder; written by code from the source record, no model. {len(roles_doc['results'])} role-and-ladder pairs have such a target.", "",
              "| Role | Ladder | Entry postings (employers) | Targets (employers) | Steps | Asked, no source |", "|---|---|---|---|---|---|"]
        for rt in roles_doc["results"]:
            final = [c for c in rt["steps"] if c["n"] in rt["final"]]
            L.append(f"| {roles_mba.FAMILY_LABELS[rt['family']]} | {rt['ladder']} | {rt['entry_postings']} ({rt['entry_employers']}) | " + ", ".join(f"{t['label']} ({t['employers']})" for t in rt["targets"]) + " | " + "<br>".join(c["text"] for c in final) + " | " + ", ".join(rt["asks_without_source"]) + " |")
        L.append("")
    L += ["## Sources", "", "| Id | Publisher | Class | Licence | Read with | Hash | Terms note |", "|---|---|---|---|---|---|---|"]
    used = {c["source"] for _, c in fin} | {c["source"] for rt in (roles_doc or {}).get("results", []) for c in rt["steps"] if c["n"] in rt["final"]}
    for s in reg["sources"]:
        L.append(f"| {s['id']}{' (used)' if s['id'] in used else ''} | {s['publisher']} | {s['publisher_class']} | {s['licence_class']} | {s['read_with']} | {(s.get('document_sha256') or s.get('record_sha256') or '')[:12]} | {s['terms_note']} |")
    L += ["", "Tried and not usable:", ""] + [f"- {x['id']} ({x['url']}): {x['why']}" for x in reg["tried_and_not_usable"]]
    L += ["", "Ladders on hold: " + (", ".join(f"{k} ({v})" for k, v in reg["ladders_on_hold"].items()) or "none")]
    path = os.path.join(OUT, f"{args.tag}_report.md")
    open(path, "w").write("\n".join(L) + "\n")
    print("wrote", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["targets", "roles", "needs", "run", "check", "report"])
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--pairs", help="skill:ladder,... or all")
    ap.add_argument("--tag", default="build_pilot")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--cap", type=int, default=MAX_REQUESTS, help="answered requests allowed over all runs")
    ap.add_argument("--selftest", action="store_true", help="check: plant faults and see that each check catches its own")
    ap.add_argument("--env", default=os.path.join(ROOT, ".env"), help="file with OPENROUTER_API_KEY")
    args = ap.parse_args()
    {"targets": targets_cmd, "roles": roles_cmd, "needs": needs_cmd, "run": run_cmd, "check": check_cmd, "report": report_cmd}[args.cmd](args)


if __name__ == "__main__":
    main()
