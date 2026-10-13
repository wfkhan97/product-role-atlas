"""Build steps ("how to build it") for a skill on a ladder. Pilot. Two keys, or no step:

    key 1, demand   US postings choose the TARGET: a certification, tool, document or qualification that three
                    employers name at entry level for the skill on that ladder (code, no model)
    key 2, content  a source on the allow-list says what the target contains (data/raw/build_sources.json)

    .venv/bin/python -m pipeline.build_steps targets --pairs valuation:bank,...   # key 1 only, no model
    .venv/bin/python -m pipeline.build_steps run --pairs ... [--dry-run]          # targets, draft, checks, critic
    .venv/bin/python -m pipeline.build_steps check [--tag build_pilot]            # the code checks on a finished run
    .venv/bin/python -m pipeline.build_steps report [--tag build_pilot]           # readable report

A step fills one of three templates (learn, practise, prove). The model chooses a target, a passage of a source
and the slot values; it does not write free prose. A skill gets fewer than three steps, or none, when the
evidence gives fewer. Nothing is padded.

A target found in the skill's own sentences is "skill" level. A target found elsewhere in the posting (the
qualifications block) is "role" level: it grounds "postings that ask for this skill also ask for X", not more.

Output goes to data/experiments/depth/ (gitignored). Needs data/processed/jobs_<roles>.json, the corpus from
pipeline.experiments.role_corpus and, for `run`, OPENROUTER_API_KEY in .env.
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
from pipeline import extract, tax  # noqa: E402

OUT = os.path.join(ROOT, "data", "experiments", "depth")
LEXICON = os.path.join(ROOT, "pipeline", "build_lexicon.json")
SOURCES = os.path.join(ROOT, "data", "raw", "build_sources.json")
DRAFTER = "openai/gpt-6.1-sol"
CRITIC = "anthropic/claude-haiku-5.5"
MAX_REQUESTS = 250

ENTRY, NEXT = "associate", "mid"
MIN_EMPLOYERS = 3          # a target needs three employers
THIN = (30, 8)             # fewer entry postings or employers than this: next-level postings may add targets
ROLE_SHARE, ROLE_LIFT = 0.05, 1.5   # a role-level target: in 5% of the skill's postings and 1.5 times the ladder's rate
PER_EMPLOYER, PER_TARGET = 1, 8     # evidence sentences kept per target
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
    """{target id: {"skill": [(job, sentence)], "role": [(job, sentence)]}} with negated sentences left out."""
    hits = collections.defaultdict(lambda: {"skill": [], "role": [], "negated": 0})
    for j in js:
        for s in all_sentences(corpus.get(j["url"], "")):
            in_skill = bool(rx.search(s))
            for t in lex:
                if not t["re"].search(s):
                    continue
                if NEGATION.search(s):
                    hits[t["id"]]["negated"] += 1
                    continue
                hits[t["id"]]["skill" if in_skill else "role"].append((j, s))
    return hits


def find_targets(jobs, corpus, skill, ladder, lex, base_cache):
    rx = extract.SKILL_RX[skill]
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
        key = (ladder, level)
        if key not in base_cache:   # how often each target is named in ALL postings of this ladder and level
            allj = [j for j in jobs.values() if j["ladder"] == ladder and j["level"] == level]
            cnt = collections.Counter()
            for j in allj:
                text = corpus.get(j["url"], "")
                for t in lex:
                    if t["re"].search(text):
                        cnt[t["id"]] += 1
            base_cache[key] = (len(allj), cnt)
        n_all, base = base_cache[key]
        hits = scan(js, corpus, rx, lex)
        for t in lex:
            h = hits.get(t["id"])
            if not h:
                continue
            for scope in ("skill", "role"):
                rows = h[scope]
                if scope == "role":   # a role-level target must not already stand at skill level
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
                ok = len(emps) >= MIN_EMPLOYERS and (scope == "skill" or (share >= ROLE_SHARE and lift >= ROLE_LIFT))
                if level == NEXT and any(x["id"] == t["id"] and x["level"] == ENTRY for x in res["targets"]):
                    continue   # entry level already has it
                if not ok:
                    if len(emps) >= 2 and scope == "skill":
                        res["below_threshold"].append({k: row[k] for k in ("id", "scope", "level", "employers", "postings")})
                    continue
                # evidence sentences: one per employer, those nearest 140 characters first, preferring ones that state a deadline
                seen, ev = set(), []
                for j, s in sorted(rows, key=lambda r: (not DEADLINE.search(r[1]), abs(len(r[1]) - 140))):
                    if j["company"] in seen:
                        continue
                    seen.add(j["company"])
                    ev.append({"text": s, "company": j["company"], "title": j["title"], "url": j["url"], "level": j["level"],
                               "in_skill_sentence": bool(rx.search(s)), "preferred": bool(PREFERRED.search(s))})
                    if len(ev) >= PER_TARGET:
                        break
                for i, e in enumerate(ev):
                    e["id"] = f"{t['id']}.{level[:3]}.{scope[0]}{i + 1}"
                row["deadline_employers"] = len({j["company"] for j, s in rows if DEADLINE.search(s)})
                row["preferred_share"] = round(sum(1 for _, s in rows if PREFERRED.search(s)) / len(rows), 2)
                row["evidence"] = ev
                res["targets"].append(row)
    res["targets"].sort(key=lambda r: (r["level"] != ENTRY, r["scope"] != "skill", -r["employers"]))
    return res




def targets_of(args, write=True):
    jobs, corpus = load(args.roles)
    lex = lexicon()
    cache, out = {}, []
    for pair in args.pairs.split(","):
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
    return d


def publisher_short(src):
    return {"us_government": "", "regulator": src["publisher"].split(" (")[0], "certification_body": src["publisher"].split(" (")[0]}[src["publisher_class"]]


def content_for(target, pair, reg, lex_by_id):
    """What the registry holds about a target, for one pair: [{source, item, kind, text}]. No model."""
    rx = lex_by_id[target["id"]]["re"]
    out = []
    for s in reg["sources"]:
        if pair not in s["pairs"]:
            continue
        if s["licence_class"] == "title_only":
            if target["id"] in s.get("about", []):
                out.append({"source": s["id"], "item": "", "use": "exam", "text": ""})
            continue
        for p in s["passages"]:
            if target["id"] in p.get("about", []) or ("about" not in p and rx.search(p["text"])):
                out.append({"source": s["id"], "item": p["id"], "use": "tool" if p["section"] == "Technology Skills" else p["use"], "text": p["text"]})
    return out[:8]


# ---- (c) templates: the model fills slots, the code writes the sentence --------------------------------------------
SUBJECTS = ["a public company", "a company you choose", "a product you choose", "a purchase you choose", "a student club"]
TEMPLATES = {
    "learn_outline":  {"kind": "learn", "needs": "exam", "text": 'Study "{section}" in the {outline} from {publisher}.'},
    "learn_outline_whole": {"kind": "learn", "needs": "exam", "text": "Study the {outline} from {publisher}."},
    "learn_read":     {"kind": "learn", "needs": "content", "text": 'Read "{section}" in the {short_title}. Note {items}.'},
    "learn_course":   {"kind": "learn", "needs": "content", "text": "Take a course in {items}."},
    "learn_tool":     {"kind": "learn", "needs": "tool", "text": "Learn {tool}. O*NET lists it under {category} for {occupation}."},
    "practise_make":  {"kind": "practise", "needs": "content", "text": "Make {artefact} for {subject}. Include {items}."},
    "practise_input": {"kind": "practise", "needs": "input", "text": "Make {artefact} for a public company. Use {items} from {section} of its Form 10-K."},
    "prove_exam":     {"kind": "prove", "needs": "exam", "text": "Pass the {exam} from {publisher}. {fact}"},
}
VERBS = {"Study", "Read", "Take", "Learn", "Make", "Pass"}


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
         "artefact": artefact_name(target["label"]), "tool": target["label"], "items": join_items(sl.get("items") or []), "subject": sl.get("subject") or "",
         "section": sl.get("section") or (p["section"] if p else ""), "fact": "", "category": "", "occupation": ""}
    name = step["template"]
    if t["needs"] == "exam":
        if src["licence_class"] != "title_only":
            return None, "this template needs an exam source"
        if name == "learn_outline" and v["section"] not in src.get("sections", []):
            return None, "the section is not a section title of the source"
        if name.startswith("learn") and not v["outline"]:
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
        if name == "learn_tool":
            if p["section"] != "Technology Skills" or " — " not in p["text"]:
                return None, "not a Technology Skills line"
            v["category"] = p["text"].split(" — ")[0].strip()
            v["category"] = v["category"][0].lower() + v["category"][1:]
            v["occupation"] = src["short_title"].replace("O*NET summary for ", "")
        if name == "practise_make" and v["subject"] not in SUBJECTS:
            return None, "the subject is not on the list"
        if name != "learn_tool" and not v["items"]:
            return None, "no items"
    return t["text"].format(**v), None


def demand_line(t, ladder):
    where = "in sentences about this skill" if t["scope"] == "skill" else "elsewhere in postings that ask for this skill"
    s = f"{t['employers']} employers name it {where} ({t['postings']} of {t['of_postings']} US {LEVEL_NAMES[ladder][t['level']]}-level postings)."
    if t.get("deadline_employers", 0) >= MIN_EMPLOYERS:
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
    parts = [src["title"], src["short_title"], src.get("outline_title") or "", src.get("exam") or "", " ".join(src.get("sections", [])),
             " ".join(f["text"] for f in src.get("facts", [])), publisher_short(src)]
    if p:
        parts += [p["text"], p["section"]]
    return " ".join(parts)


def check_step(step, pair, reg, lex_by_id):
    """Every code check on one step. Returns {check: reason} for the checks it fails (empty: it passes all)."""
    bad = {}
    skill, ladder = pair["skill"], pair["ladder"]
    target = next((t for t in pair["targets"] if t["id"] == step.get("target") and t["scope"] == step.get("scope") and t["level"] == step.get("level")), None) \
        or next((t for t in pair["targets"] if t["id"] == step.get("target")), None)
    src = reg["by_id"].get(step.get("source") or "")
    # 1 demand: three employers name the target in postings of this skill and ladder, in sentences with no negation
    if not target:
        bad["demand"] = "the target is not among the targets that three employers name for this pair"
    else:
        rx = lex_by_id[target["id"]]["re"]
        ev = {e["id"]: e for e in target["evidence"]}
        cited = [ev[i] for i in step.get("evidence") or [] if i in ev]
        named = {e["company"] for e in target["evidence"] if rx.search(e["text"]) and not NEGATION.search(e["text"])}
        if target["employers"] < MIN_EMPLOYERS or len(named) < MIN_EMPLOYERS:
            bad["demand"] = f"{len(named)} employers name the target in the stored sentences; a target needs {MIN_EMPLOYERS}"
        elif len({e["company"] for e in cited}) < 2:
            bad["demand"] = "the step cites fewer than two posting sentences of different employers"
        elif step.get("scope") != target["scope"] or step.get("level") != target["level"]:
            bad["demand"] = "the step's scope or level label differs from the target's"
    # 2 source: on the allow-list, right domain, reachable when read
    if not src:
        bad["source"] = "the source is not in the registry"
        return bad
    host = re.sub(r"^https?://([^/]+).*", r"\1", src["url"])
    if src["publisher_class"] not in reg["allowed_publisher_classes"] or not host.endswith(ALLOW_DOMAINS.get(src["publisher_class"], ())):
        bad["source"] = f"{host} is not on the allow-list for {src['publisher_class']}"
    elif src.get("status_when_read") != 200 or not src.get("date_read") or not src.get("terms_note"):
        bad["source"] = "the source was not reachable when read, or has no date or terms note"
    elif f"{skill}:{ladder}" not in src["pairs"]:
        bad["source"] = "the source is not mapped to this skill and ladder"
    if not target:
        return bad
    # 3 skill link: the cited part of the source is about the target
    p = {x["id"]: x for x in src["passages"]}.get(step.get("item") or "")
    rx = lex_by_id[target["id"]]["re"]
    if src["licence_class"] == "title_only":
        if target["id"] not in src.get("about", []):
            bad["skill_link"] = "the source is not about this target"
    elif not p or not (target["id"] in p.get("about", []) or ("about" not in p and rx.search(p["text"]))):
        bad["skill_link"] = "the passage is not about this target"
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
    use = "exam" if src["licence_class"] == "title_only" else ("tool" if p["section"] == "Technology Skills" else p["use"])
    if use != tpl["needs"]:
        bad["template"] = f"the template needs a source used as '{tpl['needs']}', this one is '{use}'"
    if tpl["kind"] == "practise" and (target["kind"] != "document" or target.get("activity")):
        bad["template"] = "the target is not a thing a student can make (a tool, a credential or an activity)"
    if step["template"] == "learn_course" and (not p or not re.search(r"\bcourse", p["text"], re.I)):
        bad["template"] = "the passage does not speak of courses"
    # 5 quote and 6 licence: each item and quoted phrase is word for word in the stored text; title-only sources give titles only
    body = norm(p["text"]) if p else ""
    items = (step.get("slots") or {}).get("items") or []
    if src["licence_class"] == "title_only":
        if items or step.get("quote"):
            bad["licence"] = "a title-only source gives a title and a link, no quoted words"
    else:
        for it in items + ([step["quote"]] if step.get("quote") else []):
            if norm(it) not in body:
                bad["quote"] = f"\"{it}\" is not word for word in the stored passage"
            elif len(norm(it).split()) > MAX_QUOTE:
                bad["quote"] = f"\"{it[:40]}...\" is longer than {MAX_QUOTE} words"
        if tpl["needs"] in ("content", "input") and not items:
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
    # 9 not a job duty: a student can do it without holding the job (the code part; the critic asks again)
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


CHECKS = ["demand", "source", "skill_link", "template", "quote", "licence", "vendor", "style", "not_a_duty", "access", "slots_only", "numbers", "different"]


def different(steps):
    """Final steps of a pair: one per kind, each on its own target. Returns ids that break the rule."""
    seen_k, seen_t, out = set(), set(), []
    for s in steps:
        if s["kind"] in seen_k or s["target"] in seen_t:
            out.append(s["n"])
        seen_k.add(s["kind"])
        seen_t.add(s["target"])
    return out


# ---- model calls: cached, counted, capped -------------------------------------------------------------------------
class Models:
    """As pipeline.depth_gen.Models, with its own cache file and a hard cap on requests sent (every attempt counts)."""
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

    def ask(self, model, prompt, kind):
        import hashlib
        key = hashlib.sha256(f"{model}\n{prompt}".encode()).hexdigest()
        if key in self.cache:
            return self.cache[key]["answer"]
        self.would_send[kind] += 1
        if self.dry:
            return None
        import requests
        body = {"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}, "max_tokens": 2000 if model == DRAFTER else 1400}   # a small reserve: the key is shared with another run
        answer, d = {"_error": "not sent"}, {}
        if model in self.refused:
            return {"_error": "not sent: " + self.refused[model]}
        for attempt in range(1):   # no retry: every attempt counts against the cap; a rerun asks again, answers are cached
            with self.lock:
                if self.attempts >= self.cap:
                    return {"_error": f"request cap of {self.cap} reached"}
                self.attempts += 1
                with open(self.log, "a") as f:
                    f.write(json.dumps({"n": self.attempts, "model": model, "kind": kind, "time": time.strftime("%Y-%m-%dT%H:%M:%S")}) + "\n")
            try:
                r = requests.post(self.ENDPOINT, headers={"Authorization": f"Bearer {self.key}"}, json=body, timeout=180)
                d = r.json()
                answer = json.loads(re.search(r"\{.*\}", d["choices"][0]["message"]["content"], re.S).group(0))
                break
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
        with ThreadPoolExecutor(1) as pool:   # one at a time: OpenRouter refuses requests when in-flight ones reserve the credit
            return list(pool.map(lambda p: self.ask(model, p, kind), prompts))

    def cost(self):
        return sum((r["usage"].get("cost") or 0) for r in self.cache.values())


# ---- prompts ------------------------------------------------------------------------------------------------------
MAX_CANDIDATES = 4


def menu(pair, reg, lex_by_id):
    """Per target: what the registry holds about it. Targets with nothing are listed as 'demand without content'."""
    key = f"{pair['skill']}:{pair['ladder']}"
    have, none = [], []
    for t in pair["targets"]:
        c = content_for(t, key, reg, lex_by_id)
        (have if c else none).append((t, c))
    return have, none


def draft_prompt(pair, name, what, have, reg, tried=None, kept=(), missing=()):
    blocks = []
    for t, cont in have:
        lines = [f"TARGET {t['id']} — {t['label']} ({'activity, not a thing to make: no practise step' if t.get('activity') else t['kind']}; scope {t['scope']}; level {t['level']}; {t['employers']} employers)"]
        lines += [f"  posting [{e['id']}] ({e['company']}) {e['text']}" for e in t["evidence"][:4]]
        for s_id in dict.fromkeys(c["source"] for c in cont):
            s = reg["by_id"][s_id]
            if s["licence_class"] == "title_only":
                lines.append(f"  SOURCE {s_id} (title only) — {s['publisher']}: {s['title']}. Exam: {s.get('exam')}. Outline: {s.get('outline_title') or 'none named'}.")
                if s.get("sections"):
                    lines.append("    section titles: " + " | ".join(s["sections"]))
                lines += [f"    fact [{f['id']}] {f['text']}" for f in s.get("facts", [])]
                lines.append(f"    a person with no employer can take it: {'yes' if s.get('student_can_take') is True else 'no' if s.get('student_can_take') is False else 'not stated'}")
            else:
                lines.append(f"  SOURCE {s_id} — {s['publisher']}: {s['title']}")
                lines += [f"    passage [{c['item']}] (use: {c['use']}) {c['text']}" for c in cont if c["source"] == s_id]
        blocks.append("\n".join(lines))
    tpl = "\n".join(f"- {k} ({v['kind']}; needs a source used as {v['needs']}): {v['text']}" for k, v in TEMPLATES.items())
    again = ""
    if tried is not None:
        again = "\n\nA first draft was checked. Steps kept:\n" + ("\n".join(f"- ({s['kind']}) {s['text']}" for s in kept) or "- none") + \
                "\nSteps dropped:\n" + ("\n".join(f"- {s['text'] or s.get('template')} — {s['why']}" for s in tried) or "- none") + \
                f"\nKinds still missing: {', '.join(missing)}. Give at most 2 NEW steps, of the missing kinds only, on targets that the kept steps do not use. " \
                "Fix the reason of a dropped step if you can. A role-scope target is acceptable here. If no source grounds a missing kind, give an empty list."
    return f"""You choose "how to build it" steps for a skill, for MBA and graduate students. You do not write prose. You pick a target, a source and slot values; a program writes the sentence from a template.

Skill: {name} — {what}
Employers: {pair['ladder']} ladder, US postings.

Rules.
- A step needs two keys: a TARGET that postings name (below), and a SOURCE record that says what the target contains, what public input to use, or who can take the exam.
- Use only the targets, sources, passages, section titles and facts listed below. Do not use what you know about the field. If the sources do not ground a step, do not give it. Fewer steps, or none, is a correct answer.
- Choose targets that are specific to THIS skill. Prefer scope "skill" (named in the skill's own sentences) over scope "role" (named elsewhere in the posting).
- A student must be able to do the step with no job: no employer's clients, deals, systems or sponsorship.
- At most {MAX_CANDIDATES} steps, each on a different target. Aim for one learn, one practise and one prove step, and give a kind only when a source grounds it. At most 2 of one kind.

Templates (slots in braces):
{tpl}
Slot rules: "section" for learn_outline is one of the source's section titles, copied exactly. "items" is a list of 2 to 4 short phrases (1 to 5 words each) COPIED EXACTLY from the passage; only for sources that are not title-only. "subject" for practise_make is one of: {' | '.join(SUBJECTS)}. "fact" for prove_exam is a fact id. learn_tool needs a Technology Skills passage that names the tool; learn_course needs a passage about courses. Each sentence must stay within 20 words.

Targets and what the sources hold:
{chr(10).join(blocks)}{again}

Answer in JSON: {{"steps": [{{"template": "...", "target": "target id", "source": "source id", "item": "passage id, or empty for a title-only source", "slots": {{"section": "", "items": [], "subject": "", "fact": ""}}, "quote": "3 to 12 consecutive words copied exactly from the passage (empty for a title-only source)", "evidence": ["2 to 4 posting ids of that target, from different employers"], "why_this_skill": "one short sentence"}}]}}"""


def source_view(src, item):
    if src["licence_class"] == "title_only":
        return (f"{src['publisher']}: \"{src['title']}\" ({src['url']}). Only the title, section titles and facts in our own words are held.\n"
                f"Section titles: {' | '.join(src.get('sections', [])) or 'none held'}\nOutline named: {src.get('outline_title') or 'none'}\n"
                "Facts: " + " ".join(f["text"] for f in src.get("facts", [])))
    p = {x["id"]: x for x in src["passages"]}[item]
    return f"{src['publisher']}: \"{src['title']}\" ({src['url']}), section \"{p['section']}\":\n{p['text']}"


def support_prompt(step, target, src):
    return f"""A study step for students, the source record it rests on, and the job-posting sentences that name its target. Judge from these only, not from what you know.

Step: {step['text']}
Target: {target['label']}

Source record:
{source_view(src, step.get('item'))}

Posting sentences:
{chr(10).join('- (' + e['company'] + ') ' + e['text'] for e in target['evidence'] if e['id'] in step['evidence'])}

Answer in JSON: {{"source_supports": "yes" | "partly" | "no", "unsupported_part": "the words of the step the source record does not support, or empty", "says_what_target_contains": "yes" | "no", "postings_name_target": "yes" | "no", "reason": "one sentence"}}
"source_supports": does the source record support everything the step says about the source, the exam, the document or the tool? The subject of an exercise ("for a public company", "for a company you choose", "for a product you choose") is set by the program and is not a claim about the source: do not judge it. "says_what_target_contains": does the source record itself say what the target ({target['label']}) contains or covers, as opposed to only naming it or only naming an input for it?"""


def student_prompt(step, target, src):
    return f"""A study step written for an MBA or graduate student who does not hold the job yet.

Step: {step['text']}

What the source record says about access:
{source_view(src, step.get('item')) if src['licence_class'] == 'title_only' else 'A public document: ' + src['title'] + ' (' + src['url'] + ')'}

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
        depth.update(json.load(open(f)))
    reg, lex_by_id = registry(), {t["id"]: t for t in lexicon()}
    tdoc = targets_of(args)
    M = Models(args.dry_run, args.env)
    start = M.attempts
    results = []
    for pair in tdoc["pairs"]:
        skill, ladder = pair["skill"], pair["ladder"]
        name, what = T[skill]["name"], depth.get(skill, {}).get("what", "")
        have, none = menu(pair, reg, lex_by_id)
        res = {"skill": skill, "ladder": ladder, "name": name, "targets_total": len(pair["targets"]), "targets_with_content": [t["id"] for t, _ in have],
               "targets_without_content": [t["id"] for t, _ in none], "candidates": [], "final": []}
        results.append(res)
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
                c = {"n": f"{rnd_no}.{len(cands) + 1}", "round": rnd_no, "template": s.get("template"), "kind": (TEMPLATES.get(s.get("template")) or {}).get("kind"),
                     "target": s.get("target"), "scope": t["scope"] if t else None, "level": t["level"] if t else None, "source": s.get("source"), "item": s.get("item") or "",
                     "slots": {k: v for k, v in (s.get("slots") or {}).items() if v}, "quote": s.get("quote") or "", "evidence": s.get("evidence") or [],
                     "why_this_skill": s.get("why_this_skill"), "text": None, "status": "ok", "why": ""}
                if t and src:
                    if src["licence_class"] == "title_only":
                        c["quote"], c["item"] = "", ""
                        c["slots"].pop("items", None)
                    c["text"] = render(c, t, src)[0]
                    c["demand_line"] = demand_line(t, ladder)
                    c["source_url"], c["source_title"], c["licence_class"] = src["url"], src["title"], src["licence_class"]
                    c["grounding"] = {"exam": "title and facts", "content": "content", "input": "input only", "tool": "names the tool"}[TEMPLATES[c["template"]]["needs"]] if c["template"] in TEMPLATES else None
                c["code_checks"] = check_step(c, pair, reg, lex_by_id)
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
                if a.get("source_supports") != "yes":
                    c["status"], c["why"] = "critic:support", f"{a.get('source_supports')}: {a.get('unsupported_part') or a.get('reason')}"
                elif a.get("postings_name_target") != "yes":
                    c["status"], c["why"] = "critic:support", "the critic does not find the target in the posting sentences"
                elif b.get("student_can_do") != "yes" or b.get("is_job_duty") == "yes":
                    c["status"], c["why"] = "critic:student", b.get("needs") or b.get("reason") or "a job duty"
                elif c["scope"] == "skill" and not (0 <= i < 4 and o[i] == name):
                    c["status"], c["why"] = "critic:specific", f"read as another skill ({c['picked']})"
                c["content_grounded"] = a.get("says_what_target_contains") == "yes"
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
        if len(kinds_ok) < 3:   # one more try (also when the first request got no answer) for the kinds that are missing
            kept = [c for c in cands if c["status"] == "ok"]
            raw2 = M.ask(DRAFTER, draft_prompt(pair, name, what, have, reg, tried=dropped, kept=kept, missing=[k for k in ("learn", "practise", "prove") if k not in kinds_ok]), "redraft")
            if raw2 and "_error" in raw2:
                res.setdefault("errors", []).append("second drafting request: " + raw2["_error"])
            elif raw2 is not None and not raw2.get("steps"):
                res["redraft_empty"] = True   # the drafter was asked for the missing kinds and gave none
            cands += judge(raw2, 2)
        res["candidates"] = cands
        # final: one step per kind, each on its own target; skill-level targets first, then the order drafted
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
           "requests": {"sent_this_run": M.attempts - start, "sent_in_all": M.attempts, "answered_in_all": len(M.cache), "cap": M.cap, "would_send_dry": dict(M.would_send), "cost_usd": round(M.cost(), 4)}}
    if not args.dry_run:
        json.dump(doc, open(os.path.join(OUT, f"{args.tag}.json"), "w"), indent=1, ensure_ascii=False)
        print("wrote", os.path.join(OUT, f"{args.tag}.json"))
    print("requests:", doc["requests"])


# ---- 3. the eval: all code checks on a finished run, no model ------------------------------------------------------
def check_cmd(args):
    """Exit 0 when every published (final) step passes every code check. Later: evals/, on the published files."""
    reg, lex_by_id = registry(), {t["id"]: t for t in lexicon()}
    run = json.load(open(os.path.join(OUT, f"{args.tag}.json")))
    pairs = {(p["skill"], p["ladder"]): p for p in json.load(open(os.path.join(OUT, f"{args.tag}_targets.json")))["pairs"]}
    fails, n, per = [], 0, collections.Counter()
    for s in reg["sources"]:   # the registry itself
        for k in ("id", "publisher", "publisher_class", "title", "url", "date_read", "read_with", "status_when_read", "licence_class", "terms_note", "may_quote"):
            if s.get(k) in (None, ""):
                fails.append(("registry", s.get("id"), f"no {k}"))
        if s["licence_class"] == "title_only" and s["passages"]:
            fails.append(("registry", s["id"], "a title-only source holds text"))
        if reg["vendor_rx"].search(s["publisher"] + " " + s["title"]):
            fails.append(("registry", s["id"], "a blocked vendor"))
    for r in run["results"]:
        pair = pairs[(r["skill"], r["ladder"])]
        final = [c for c in r["candidates"] if c["n"] in r["final"]]
        for c in final:
            n += 1
            bad = check_step(c, pair, reg, lex_by_id)
            for k in CHECKS[:-1]:
                per[k] += k not in bad
            for k, why in bad.items():
                fails.append((f"{r['skill']}:{r['ladder']}", c["n"], f"{k}: {why}"))
            if c.get("status") != "ok":
                fails.append((f"{r['skill']}:{r['ladder']}", c["n"], "published with a status other than ok"))
        d = different(final)
        per["different"] += len(final) - len(d)
        fails += [(f"{r['skill']}:{r['ladder']}", x, "different: same kind or same target as another step") for x in d]
        if len(final) > 3:
            fails.append((f"{r['skill']}:{r['ladder']}", "-", "more than three steps"))
    print(f"build check: {n} published steps in {len(run['results'])} pairs, {len(reg['sources'])} sources")
    for k in CHECKS:
        print(f"  {k:12} {per[k]}/{n}")
    for f in fails:
        print("  FAIL", *f)
    print("PASS" if not fails else f"{len(fails)} failures")
    sys.exit(1 if fails else 0)


# ---- readable report ----------------------------------------------------------------------------------------------
def report_cmd(args):
    reg = registry()
    run = json.load(open(os.path.join(OUT, f"{args.tag}.json")))
    pairs = {(p["skill"], p["ladder"]): p for p in json.load(open(os.path.join(OUT, f"{args.tag}_targets.json")))["pairs"]}
    L = [f"# Build steps pilot: {len(run['results'])} skill and ladder pairs", "",
         f"Generated {run['generated']}. Drafter `{run['drafter']}`, critic `{run['critic']}`. Requests sent in all: {run['requests']['sent_in_all']} of a cap of {run['requests']['cap']} ({run['requests'].get('answered_in_all', '?')} answered; the others were refused and not billed); "
         f"cost ${run['requests']['cost_usd']:.2f}. Everything here is measured by `pipeline/build_steps.py`; nothing is published.", ""]
    allc = [c for r in run["results"] for c in r["candidates"]]
    fin = [(r, c) for r in run["results"] for c in r["candidates"] if c["n"] in r["final"]]
    by_n = collections.Counter(len(r["final"]) for r in run["results"])
    L += ["## Totals", "", f"- Targets that three employers name: {sum(r['targets_total'] for r in run['results'])}; with a source in the registry: {sum(len(r['targets_with_content']) for r in run['results'])}.",
          f"- Steps drafted: {len(allc)}. By outcome: " + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['status'] for c in allc).most_common()) + ".",
          f"- Final steps: {len(fin)}. By kind: " + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['kind'] for _, c in fin).items()) + ". By grounding: "
          + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['grounding'] for _, c in fin).items()) + ". By target scope: "
          + ", ".join(f"{k} {v}" for k, v in collections.Counter(c['scope'] for _, c in fin).items()) + ".",
          "- Pairs by number of final steps: " + ", ".join(f"{k} steps: {by_n[k]}" for k in (3, 2, 1, 0)) + ".",
          f"- Final steps the critic calls skill-specific (it picks this skill among four of the ladder, and no other fits): {sum(1 for _, c in fin if c.get('skill_specific'))} of {len(fin)}.",
          f"- Final steps where the critic says the source itself says what the target contains: {sum(1 for _, c in fin if c.get('content_grounded'))} of {len(fin)}.", ""]
    L += ["| Pair | Entry postings (employers) | Targets | With a source | Drafted | Pass code checks | Pass support | Pass student test | Pass specificity | Final |", "|---|---|---|---|---|---|---|---|---|---|"]
    for r in run["results"]:
        p, cs = pairs[(r["skill"], r["ladder"])], r["candidates"]
        code_ok = [c for c in cs if not c["code_checks"]]
        sup = [c for c in code_ok if c["status"] != "critic:support" and c["status"] != "critic:error"]
        stu = [c for c in sup if c["status"] != "critic:student"]
        spe = [c for c in stu if c["status"] != "critic:specific"]
        L.append(f"| {r['skill']}:{r['ladder']} | {p['entry_postings']} ({p['entry_employers']}) | {r['targets_total']} | {len(r['targets_with_content'])} | {len(cs)} | {len(code_ok)} | {len(sup)} | {len(stu)} | {len(spe)} | {len(r['final'])} |")
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
            L += [f"- **{c['kind']}** — {c['text']}", f"  - Demand ({c['scope']} level, target `{c['target']}`): {c['demand_line']}",
                  f"  - Source: {c['source_title']} — {c['source_url']} ({c['licence_class']}; grounding: {c['grounding']}; critic: source says what the target contains = {'yes' if c.get('content_grounded') else 'no'}; skill-specific = {'yes' if c.get('skill_specific') else 'no'})"]
        L += ["", "**Targets** (three employers or more)", "", "| Target | Kind | Scope | Level | Employers | Postings | Lift | Source in registry |", "|---|---|---|---|---|---|---|---|"]
        for t in p["targets"]:
            L.append(f"| {t['label']}{' (broad)' if t['broad'] else ''} | {t['kind']} | {t['scope']} | {t['level']} | {t['employers']} | {t['postings']}/{t['of_postings']} | {t['lift']} | {'yes' if t['id'] in r['targets_with_content'] else 'no'} |")
        L += ["", "**Drafted steps and what happened**", ""]
        for c in r["candidates"]:
            L.append(f"- [{c['n']}] {c['kind']} / `{c['target']}` / `{c['source']}`: {c['text'] or '(no text: ' + str(c.get('template')) + ')'} — **{c['status']}**{': ' + c['why'] if c['why'] else ''}")
        if not r["candidates"]:
            L.append("- nothing drafted")
        L.append("")
    L += ["## Sources", "", "| Id | Publisher | Class | Licence | Read with | Terms note |", "|---|---|---|---|---|---|"]
    used = {c["source"] for _, c in fin}
    for s in reg["sources"]:
        L.append(f"| {s['id']}{' (used in a final step)' if s['id'] in used else ''} | {s['publisher']} | {s['publisher_class']} | {s['licence_class']} | {s['read_with']} | {s['terms_note']} |")
    L += ["", "Tried and not usable:", ""] + [f"- {x['id']} ({x['url']}): {x['why']}" for x in reg["tried_and_not_usable"]]
    path = os.path.join(OUT, f"{args.tag}_report.md")
    open(path, "w").write("\n".join(L) + "\n")
    print("wrote", path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["targets", "run", "check", "report"])
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--pairs")
    ap.add_argument("--tag", default="build_pilot")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--env", default=os.path.join(ROOT, ".env"), help="file with OPENROUTER_API_KEY")
    args = ap.parse_args()
    {"targets": targets_cmd, "run": run_cmd, "check": check_cmd, "report": report_cmd}[args.cmd](args)


if __name__ == "__main__":
    main()
