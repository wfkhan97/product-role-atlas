"""Passages for the game Spot the real ask: short excerpts from real open US postings, cut into phrases, with the
atlas's own reading of each phrase as the answer key.

usage: python3 -m pipeline.game_passages   ->  web/data/game_passages.json (committed)
                                               data/experiments/game_passages_review.md (gitignored review sheet)

The postings come through `extract.postings()` (same title rules, same repost dedupe, same registry) and are kept
when their processed row says US and open. The text is the raw description, not the cleaned one: the cleaner
deletes the boilerplate lines the game needs. The answer key reuses, by import, the role set's patterns
(`extract.skills_for`), the years rule (`extract.years_required`, `YOE_RE`, `YOE_WORD_RE`) and the cleaner's
boilerplate rules (`BOILER_RE`, `ABOUT_RE`, the employer self-description built from `ENTITY` and `SELF_VERB`).
Nothing is re-implemented and the browser does no tagging. The spec is games/spot-the-real-ask/README.md.

Chunk shape, one array per phrase:
    [text, "a", [skill ids, primary first], share]      an ask (share of the role's postings asking for the primary skill; absent when unknown)
    [text, "f", kind]                                    filler by the cleaner's rules; kind is benefits, legal or about
    [text, "f", "filler", phrase]                        filler by the phrase list; phrase is the matched stock phrase
    [text, "f", "filler", phrase, skill id, share]       the same, when the atlas counts the phrase as a skill
    [text, "o"]                                          other: not on the atlas's list, neutral
    [text, null]                                         a separator (", ", "; ", " — ", "\\n" between list items); not focusable
Seeded and deterministic (seed 7): the same inputs give the same file.
"""
import collections
import datetime
import hashlib
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import extract, processed  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "data", "game_passages.json")
DENY = os.path.join(ROOT, "pipeline", "game_passages_deny.json")
REVIEW = os.path.join(ROOT, "data", "experiments", "game_passages_review.md")
GRAPH = {"mba": os.path.join(ROOT, "web", "data", "graph_mba.json"), "product": os.path.join(ROOT, "web", "data", "graph.json")}

SEED = 7
MAX_PER_ROLE = 12
BUDGET = 950_000           # bytes; the file loads only on #/play/spot-the-real-ask and stays under 1 MB
MAX_CHARS = 700            # a whole passage
BLOCK_CHARS = (300, 650)   # the headed block alone
BLOCK_LINES = (4, 6)
LINE_MAX = 260             # a longer line ends the block (a first line up to BLOCK_CHARS[1] is kept as prose)
FRAGMENT_MAX = 200
MAX_CHUNKS = {"easy": 12, "medium": 18, "hard": 25}
DIFFICULTIES = ("easy", "medium", "hard")
US = "United States"

# Stock phrases that describe a temperament, not something a candidate can show. From the README table, with the
# share of open US MBA postings (26,213, after cleaning) that contain each, measured 2026-10-18. Filler wins over the
# atlas's own tag of the same phrase (open question 2, option A); the reveal says the atlas counts it.
FILLER = [
    (r"fast[- ]paced", "22.3%"),
    (r"passion(?:ate)?", "20.3%"),
    (r"dynamic (?:environment|team)", "4.8%"),
    (r"self[- ]?starter", "4.9%"),
    (r"team ?player", "3.1%"),
    (r"growth mindset", "2.2%"),
    (r"work ethic", "2.1%"),
    (r"wear (?:many|multiple) hats", "0.2%"),
    # added after the first review sheet (2026-10-18): temperament phrases the requirement blocks use often
    (r"(?:can[- ]do|positive|winning) attitude", None),
    (r"hard[- ]?working", None),
    (r"(?:highly|self)[- ]motivated", None),
    (r"high[- ]energy", None),
    (r"roll(?:s|ing)? up (?:your|their|our|my) sleeves", None),
    (r"go[- ]getter", None),
    (r"hit the ground running", None),
    (r"enthusias(?:m|tic)", None),
    (r"team[- ]oriented", None),
    (r"sense of humou?r", None),
    (r"no (?:task|job) is too small", None),
    (r"hustle", None),
]
FILLER_RE = re.compile(r"\b(?:" + "|".join(p for p, _ in FILLER) + r")\b", re.I)

# Where a passage starts: the section heads the README names, on a short line of their own.
HEAD_RE = re.compile(
    r"^(?:(?:basic|minimum|required|preferred|desired|key|core|essential|the)\s+)?"
    r"(?:requirements?|qualifications|what you(?:'|’)?(?:ll| will) (?:bring|do|need)|about you|who you are|what we(?:'|’)?(?:re| are) looking for)\b",
    re.I,
)
DUTIES_RE = re.compile(r"what you(?:'|’)?(?:ll| will) do", re.I)   # a duties block is read, but only as a hard passage
BULLET_RE = re.compile(r"^(?:[-•·*–—▪●◦○■□➢✓➤►]+|\d{1,2}[.)])\s*")
# work authorisation is neither a skill nor filler for a student on a visa: neutral, never filler
WORKAUTH_RE = re.compile(r"visa sponsorship|work authori[sz]|authori[sz]ed to work|sponsorship", re.I)
BENEFITS_RE = re.compile(
    r"401\(?k\)?|dental|vision (?:insurance|coverage|plan)|paid time off|\bPTO\b|parental leave|stock (?:options|units|purchase)|\bRSUs?\b|"
    r"(?:salary|pay|compensation) ?(?:range|package)|base (?:salary|pay)|total rewards|wellness|tuition|commuter|life insurance|disability (?:insurance|benefits)|"
    r"employee assistance|benefits?\b|we offer|bonus|relocation",
    re.I,
)
ABOUT_HEAD_RE = re.compile(r"^\W*about (?:amazon|google|microsoft|the company|us\b)", re.I)
LEGAL_RE = re.compile(
    r"equal (?:opportunity|employment)|\bEEO\b|discriminat|accommodation|veteran|sexual orientation|gender identity|national origin|protected|"
    r"background check|e-?verify|drug[- ]free|affirmative action|privacy|recruitment (?:agency|agencies|fraud)|scam|criminal|fair chance|ordinance|\bADA\b|"
    r"pregnancy|export control|\bITAR\b|clearance|apply (?:now|today)",
    re.I,
)
ABOUT_WORD_RE = re.compile(r"about (?:amazon|google|microsoft|the company|us\b)|our (?:mission|values|culture)|join (?:us|our team)|inclusive|diversity|\bDEI\b|underrepresented", re.I)
MOJIBAKE = ("â€", "Ã", "�")
# letters split by a scraper ("L earn", "plu s"): a single letter other than a or I beside a lowercase run
SPLIT_RE = re.compile(r"(?<![\w'’/.&-])[B-HJ-Zb-hj-z] [a-z]{2,}\b|\b[a-z]{2,} [b-hj-z](?![\w'’/&-])")
WS_RE = re.compile(r"[      \t ]+")
WORD_RE = re.compile(r"[\w$%+]+")
WORDCH = re.compile(r"[\w'’+/-]")
# what keeps a split from landing inside a phrase: a leading preposition or article stays with the span ("in a cross-functional")
PREP_RE = re.compile(r"(?:\s(?:in|a|an|the|of|with|for|to|on|at|by|as|from|into|across|within|or)\b){1,2}\s*$", re.I)
ABBREV_RE = re.compile(r"\b(?:e\.g|i\.e|etc|vs|approx|incl|min|max)\.$", re.I)
# rule 1: split at , ; : — – ( ) and at sentence ends, keeping the punctuation as a separator
SEP_RE = re.compile(r"\s*(?:[,;:](?=\s|$)|(?<=\s)\((?=\S)|\)(?=[\s,;:.]|$)|—|–|(?<=\s)-(?=\s))\s*|(?<=[.!?])\s+(?=[A-Z0-9“\"(])")
SENT_RE = extract.SENT_RE


# ---------- text ----------
def norm(s):
    return WS_RE.sub(" ", s).strip()


def lines_of(desc):
    """(text, bulleted) per non-empty line of the raw description, whitespace normalised, bullet glyphs removed."""
    out = []
    for raw in desc.split("\n"):
        t = norm(raw)
        if not t:
            continue
        m = BULLET_RE.match(t)
        if m:
            t = t[m.end():].strip()
        if t:
            out.append((t, bool(m)))
    return out


def is_head(text):
    """A line that looks like a heading ends a block: short, no sentence end, title case or capitals, or a colon at the end."""
    if len(text) > 60:
        return False
    t = text.rstrip(":").strip()
    if not t:
        return False
    if text.endswith(":") and len(WORD_RE.findall(t)) <= 8:
        return True
    words = t.split()
    if len(words) > 6 or re.search(r"[.;,!?]$", t):
        return False
    caps = [w for w in words if w[:1].isupper() or w.lower() in ("and", "or", "of", "the", "a", "an", "to", "for", "&", "you", "we", "you'll", "you’ll")]
    return t.isupper() or len(caps) == len(words)


def section_head(text):
    """The section heading a block starts under, or None."""
    if len(text) > 60 or not HEAD_RE.match(text):
        return None
    if not is_head(text) and len(text.split()) > 6:
        return None
    label = text.rstrip(":").strip()
    return label.capitalize() if label.isupper() else label


def comma_list(text):
    parts = text.split(",")
    return len(parts) >= 4 and sum(len(WORD_RE.findall(p)) for p in parts) / len(parts) <= 2


def first_sentence(text):
    for sent in SENT_RE.split(text):
        sent = sent.strip()
        if sent:
            return sent
    return text


# ---------- spans: the answer key ----------
def bucket(n):
    return "yoe_2" if n <= 2 else "yoe_3" if n <= 4 else "yoe_5" if n <= 6 else "yoe_8" if n <= 9 else "yoe_10"


def grow(text, s, e):
    while s > 0 and WORDCH.match(text[s - 1]):
        s -= 1
    while e < len(text) and WORDCH.match(text[e]):
        e += 1
    return s, e


def spans_for(text, skills):
    """Ask spans [s, e, skill id, matched chars] and filler spans [s, e, phrase, counted skill, counted chars] in one text."""
    text = extract.norm(text)   # as extraction reads it; same length, so the spans cut the original text
    asks = []
    for sid, rx in skills:
        if sid.startswith("yoe_"):
            continue
        for m in rx.finditer(text):
            if m.end() > m.start():
                s, e = grow(text, m.start(), m.end())
                asks.append([s, e, sid, m.end() - m.start()])
    for m in extract.YOE_RE.finditer(text):
        n = int(m.group(1))
        if 1 <= n <= 25:
            s, e = grow(text, m.start(), m.end())
            asks.append([s, e, bucket(n), m.end() - m.start()])
    for m in extract.YOE_WORD_RE.finditer(text):
        s, e = grow(text, m.start(), m.end())
        asks.append([s, e, bucket(extract.WORD_NUM[m.group(1).lower()]), m.end() - m.start()])
    fillers = []
    for m in FILLER_RE.finditer(text):
        s, e = grow(text, m.start(), m.end())
        fillers.append([s, e, text[m.start():m.end()], None, 0])
    # filler wins: an ask on the same phrase is dropped, and the filler remembers the skill the atlas counts it as
    kept = []
    for a in asks:
        hit = None
        for f in fillers:
            if a[0] < f[1] and f[0] < a[1]:
                hit = f
                break
        if hit is None:
            kept.append(a)
        elif a[3] > hit[4]:
            hit[3], hit[4] = a[2], a[3]
    return kept, fillers


# ---------- chunking ----------
def pieces_of(text):
    """Rule 1: alternate pieces and separators, with offsets. [{text, s, e, sep}]"""
    out, pos = [], 0
    for m in SEP_RE.finditer(text):
        if m.end() == m.start():
            continue
        if m.start() > pos:
            out.append({"s": pos, "e": m.start(), "sep": False})
        out.append({"s": m.start(), "e": m.end(), "sep": True})
        pos = m.end()
    if pos < len(text):
        out.append({"s": pos, "e": len(text), "sep": False})
    # a sentence split after an abbreviation is not one
    merged = []
    for p in out:
        if merged and p["sep"] and merged[-1]["sep"]:
            merged[-1]["e"] = p["e"]
        elif merged and p["sep"] and not merged[-1]["sep"] and not text[p["s"]:p["e"]].strip() and ABBREV_RE.search(text[merged[-1]["s"]:merged[-1]["e"]]):
            merged[-1]["e"] = p["e"]
            merged[-1]["glue"] = True
        elif merged and not p["sep"] and merged[-1].get("glue"):
            merged[-1]["e"] = p["e"]
            merged[-1].pop("glue")
        else:
            merged.append(p)
    return [p for p in merged if p["e"] > p["s"]]


def words_in(text, s, e, spans):
    """Words of text[s:e] outside every span."""
    n = 0
    for m in WORD_RE.finditer(text, s, e):
        if not any(sp[0] <= m.start() < sp[1] for sp in spans):
            n += 1
    return n


def chunk(text, asks, fillers):
    """Rules 1 to 4 on one line or sentence. Returns [(s, e, sep)] in order, covering the text."""
    spans = [(a[0], a[1], "a") for a in asks] + [(f[0], f[1], "f") for f in fillers]
    spans.sort()
    ps = pieces_of(text)
    # rule 4: never cut through a span; pieces it crosses merge, separator included
    changed = True
    while changed:
        changed = False
        for s, e, _ in spans:
            idx = [i for i, p in enumerate(ps) if not p["sep"] and p["s"] < e and s < p["e"]]
            if len(idx) > 1:
                a, b = idx[0], idx[-1]
                ps[a]["e"] = ps[b]["e"]
                del ps[a + 1:b + 1]
                changed = True
                break
    # rule 2: split a piece around its spans when 3 or more untagged words sit before one (or the labels differ)
    out = []
    for p in ps:
        if p["sep"]:
            out.append(p)
            continue
        inside = [sp for sp in spans if sp[0] < p["e"] and p["s"] < sp[1]]
        cuts, prev_end, prev_label = [], p["s"], None
        for s, e, label in inside:
            s = max(s, p["s"])
            gap_words = words_in(text, prev_end, s, spans)
            if gap_words >= 3 or (prev_label is not None and prev_label != label):
                cut = s
                m = PREP_RE.search(text[prev_end:s])
                if m and words_in(text, prev_end, prev_end + m.start(), spans) >= 2:
                    cut = prev_end + m.start()
                while cut < s and text[cut].isspace():
                    cut += 1
                start = cuts[-1] if cuts else p["s"]
                if cut > start and text[start:cut].strip() and (prev_label is not None or words_in(text, start, cut, spans) >= 2):
                    cuts.append(cut)
            prev_end, prev_label = max(prev_end, e), label
        start = p["s"]
        for c in cuts:
            e = c
            while e > start and text[e - 1].isspace():
                e -= 1
            out.append({"s": start, "e": e, "sep": False})
            if c > e:
                out.append({"s": e, "e": c, "sep": True})
            start = c
        out.append({"s": start, "e": p["e"], "sep": False})
    ps = [p for p in out if p["e"] > p["s"]]
    # rule 3: a one-word piece joins its neighbour unless that puts an ask and a filler span in one chunk
    def label_of(p):
        inside = {sp[2] for sp in spans if sp[0] < p["e"] and p["s"] < sp[1]}
        return "f" if "f" in inside else "a" if "a" in inside else "o"
    changed = True
    while changed:
        changed = False
        for i, p in enumerate(ps):
            if p["sep"] or len(WORD_RE.findall(text[p["s"]:p["e"]])) > 1:
                continue
            mine = label_of(p)
            left = next((j for j in (i - 1, i - 2) if j >= 0 and not ps[j]["sep"]), None)
            right = next((j for j in (i + 1, i + 2) if j < len(ps) and not ps[j]["sep"]), None)
            for j in (left, right):
                if j is not None and {mine, label_of(ps[j])} != {"a", "f"}:
                    a, b = min(i, j), max(i, j)
                    ps[a]["e"] = ps[b]["e"]
                    del ps[a + 1:b + 1]
                    changed = True
                    break
            if changed:
                break
    return [(p["s"], p["e"], p["sep"]) for p in ps]


# ---------- labelling ----------
class Key:
    """The answer key of one role: the role set's patterns, the shares, the generic skills."""

    def __init__(self, roleset, role, graph, generic):
        self.roleset, self.role, self.generic = roleset, role, generic
        self.skills = extract.skills_for(roleset)
        self.by_skill = {s["id"]: (s.get("by_family") or {}) for s in graph["skills"]}

    def share(self, sid):
        v = self.by_skill.get(sid, {}).get(self.role)
        return round(v, 4) if v is not None else None

    def unit(self, text, about_rx):
        """Chunks of one line or sentence: [[text, label, ...], ...] with separators as [text, None]."""
        asks, fillers = spans_for(text, self.skills)
        if len(text) > 40:
            if WORKAUTH_RE.search(text):
                return [[text, "o"]]
            # rule 5: a whole sentence the cleaner would drop is one filler chunk. The employer describing itself
            # is filler whatever it names; a benefits or legal line only when no pattern matches in it ("wellness
            # industry" and "relocation" turn up inside real asks)
            kind = boiler_kind(text, about_rx)
            if kind == "about" or (kind and not asks):
                return [[text, "f", kind]]
        out = []
        for s, e, sep in chunk(text, asks, fillers):
            t = text[s:e]
            if sep:
                out.append([t, None])
                continue
            fs = [f for f in fillers if f[0] < e and s < f[1]]
            if fs:
                f = max(fs, key=lambda f: f[1] - f[0])
                counted = max((f for f in fs if f[3]), key=lambda f: f[4], default=None)
                row = [t, "f", "filler", f[2]]
                if counted:
                    row += [counted[3], self.share(counted[3])]
                out.append(row)
                continue
            hits = {}
            for a in asks:
                if a[0] < e and s < a[1]:
                    hits[a[2]] = hits.get(a[2], 0) + a[3]
            if hits:
                # the primary skill: most matched characters; a tie goes to the lower share (the more specific one)
                order = sorted(hits, key=lambda k: (-hits[k], self.share(k) if self.share(k) is not None else 1, k))
                row = [t, "a", order]
                if self.share(order[0]) is not None:
                    row.append(self.share(order[0]))
                out.append(row)
            else:
                out.append([t, "o"])
        return out


def boiler_kind(text, about_rx):
    text = extract.norm(text)
    if about_rx is not None and about_rx.search(text) or extract.ABOUT_RE.search(text):
        return "about"
    hits = [m.group(0) for m in extract.BOILER_RE.finditer(text)]
    # "about Google" at the head of a line is the employer's section; inside a line ("Knowledge about Google
    # products") it is part of an ask, so it counts only at the start
    if hits and not all(h.lower().startswith("about ") and not ABOUT_HEAD_RE.match(text) for h in hits):
        if LEGAL_RE.search(text):
            return "legal"
        if ABOUT_WORD_RE.search(text):
            return "about"
        if BENEFITS_RE.search(text):
            return "benefits"
        return "legal"
    return None


def about_regex(company):
    """The employer describing itself, as extract.clean builds it."""
    first = re.escape(company.split()[0])
    return re.compile(rf"^\W*(about )?(the )?({re.escape(company)}|{first}){extract.ENTITY},? {extract.SELF_VERB}", re.I)


# ---------- passages ----------
def block_from(lines, h):
    """The headed block starting after line h: (kind, [texts], last index) or None."""
    taken, i = [], h + 1
    while i < len(lines) and len(taken) < BLOCK_LINES[1]:
        t, bul = lines[i]
        if is_head(t) or section_head(t) or comma_list(t) or len(WORD_RE.findall(t)) <= 3:
            break
        if len(t) > LINE_MAX:
            if not taken and len(t) <= BLOCK_CHARS[1] and len([s for s in SENT_RE.split(t) if s.strip()]) >= 2:
                return "para", [t], i
            break
        taken.append(t)
        i += 1
    while taken and len("\n".join(taken)) > BLOCK_CHARS[1]:
        taken.pop()
    if len(taken) < BLOCK_LINES[0] or len("\n".join(taken)) < BLOCK_CHARS[0]:
        return None
    return "list", taken, h + len(taken)


def fragment_from(lines, after, about_rx, key, rng):
    """Up to two filler lines from the rest of the posting, each cut to its first sentence, in the posting's order:
    a line with a stock phrase (the gotcha) and a benefits, legal or company line that no pattern matches in, as
    the mock shows; two of one kind when the other has none."""
    phrase, boiler = [], []   # (line index, sentence)
    for i, (t, _) in enumerate(lines[after + 1:], after + 1):
        if len(t) <= 40 or is_head(t) or WORKAUTH_RE.search(t) or bad_text(t):
            continue
        sent = first_sentence(t)
        if len(sent) > FRAGMENT_MAX or len(sent) <= 40:
            continue
        kind = boiler_kind(sent, about_rx)
        if kind == "about" or (kind and not spans_for(sent, key.skills)[0]):
            boiler.append((i, sent))
        elif FILLER_RE.search(sent):
            phrase.append((i, sent))
    out = []
    for pool in (phrase, boiler, phrase, boiler):
        rest = [x for x in pool if x not in out]
        if rest and len(out) < 2:
            out.append(rng.choice(rest))
    return [sent for _, sent in sorted(out)]


def bad_text(t):
    return any(m in t for m in MOJIBAKE) or SPLIT_RE.search(t) is not None


def build(key, kind, texts, fragments, about_rx):
    """Blocks with chunks, or None when the passage does not qualify. Also returns the difficulty."""
    blocks, units = [], []   # units: chunk lists per line or sentence, for the mixed-line check
    if kind == "list":
        chunks = []
        for n, t in enumerate(texts):
            u = key.unit(t, about_rx)
            units.append(u)
            if n:
                chunks.append(["\n", None])
            chunks += u
        blocks.append({"kind": "list", "text": "\n".join(texts), "chunks": chunks})
    else:
        chunks = []
        pos, text = 0, texts[0]
        for m in list(SENT_RE.finditer(text)) + [None]:
            end = m.start() if m else len(text)
            sent = text[pos:end]
            if sent:
                u = key.unit(sent, about_rx)
                units.append(u)
                chunks += u
            if m:
                chunks.append([m.group(0), None])
                pos = m.end()
        blocks.append({"kind": "para", "text": text, "chunks": chunks})
    for fragment in fragments:
        u = key.unit(fragment, about_rx)
        units.append(u)
        blocks.append({"kind": "gap"})
        blocks.append({"kind": "para", "text": fragment, "chunks": u})
    for b in blocks:
        if b["kind"] != "gap":
            assert "".join(c[0] for c in b["chunks"]) == b["text"], b["text"]
    return blocks, units


def difficulty(blocks, units, key, duties):
    chunks = [c for b in blocks if b["kind"] != "gap" for c in b["chunks"] if c[1]]
    asks = [c for c in chunks if c[1] == "a"]
    fill = [c for c in chunks if c[1] == "f"]
    nongeneric = [c for c in asks if any(s not in key.generic for s in c[2])]
    # measured as the browser and evals/game_passages.mjs measure it (UTF-16 units: an emoji counts twice)
    chars = sum(len(b["text"].encode("utf-16-le")) // 2 for b in blocks if b["kind"] != "gap")
    if len(asks) < 3 or len(nongeneric) < 2 or not fill or len(chunks) > MAX_CHUNKS["hard"] or chars > MAX_CHARS:
        return None
    prose = any(b["kind"] == "para" for b in blocks[:1])
    # filler mixed into the asks: a stock phrase before an ask in the same line or sentence ("Self-starter with
    # strong Excel skills"); a phrase that closes a line ("in a cross-functional, fast-paced environment") is the easy case
    mixed = any(any(c[1] == "a" for c in u[k + 1:]) for u in units for k, c in enumerate(u) if c[1] == "f")
    generic_heavy = sum(1 for c in asks if all(s in key.generic for s in c[2])) * 2 >= len(asks)
    fragment = len(blocks) > 1
    hard = duties or prose or mixed or generic_heavy or len(chunks) > MAX_CHUNKS["medium"] or len(asks) > 5
    # with one filler chunk against four or more asks, marking everything scores well; a passage with fragments
    # carries at least two filler chunks so that false alarms can cost something
    if hard:
        return "hard" if len(fill) >= 2 or not fragment else None
    if not fragment and len(asks) <= 5 and len(fill) <= 2 and len(chunks) <= MAX_CHUNKS["easy"]:
        return "easy"
    if fragment and len(fill) >= 2 and len(chunks) <= MAX_CHUNKS["medium"]:
        return "medium"
    return None


def candidates(roleset, job, company, fam, key, rng):
    """Every passage one posting can give: the headed block alone, and with a filler fragment."""
    desc = job.get("description") or ""
    if any(m in desc for m in MOJIBAKE):
        return []
    lines = lines_of(desc)
    about_rx = about_regex(company)
    out = []
    for h, (t, _) in enumerate(lines):
        head = section_head(t)
        if not head:
            continue
        got = block_from(lines, h)
        if not got:
            continue
        kind, texts, last = got
        if any(bad_text(x) for x in texts):
            continue
        duties = DUTIES_RE.search(head) is not None
        frags = fragment_from(lines, last, about_rx, key, rng)
        for fragments in [frags[:n] for n in range(len(frags) + 1)]:
            blocks, units = build(key, kind, texts, fragments, about_rx)
            d = difficulty(blocks, units, key, duties)
            if d:
                out.append({"section": head, "difficulty": d, "blocks": blocks})
        break   # the first headed block of the posting
    return out


def generic_skills(M):
    """Atlas.genericSkills(): asked by most postings of at least half of the MBA roles."""
    count, fams = {}, [f for f in M["families"] if f in M["roles"]]
    for f in fams:
        r = M["roles"][f]
        for a in list(r.get("defining", [])) + list(r.get("asks", [])):
            if a["share"] >= 0.5:
                count[a["id"]] = count.get(a["id"], 0) + 1
    return {k for k, c in count.items() if c >= len(fams) / 2}


def main():
    deny = json.load(open(DENY)) if os.path.exists(DENY) else {}
    graphs = {rs: json.load(open(GRAPH[rs])) for rs in GRAPH}
    M, G = graphs["mba"], graphs["product"]
    generic = generic_skills(M)
    product_fams = {f for g in M["groups"] if g["id"] == "product" for f in g["families"]}
    roles = {}
    for g in M["groups"]:
        if g["id"] == "product":
            continue
        for f in g["families"]:
            roles[f] = {"label": M["roles"][f]["label"], "group": g["id"], "set": "mba", "n_open": M["roles"][f]["n_open"]}
    # the product set adds the families the MBA set has no role for (pmm is an MBA role of the marketing field,
    # and #/role/pmm opens that role, so its passages come from the MBA set)
    n_product = collections.Counter(j["family"] for j in G["jobs"])
    for f, label in G["families"].items():
        if f not in roles:
            roles[f] = {"label": label, "group": "product", "set": "product", "n_open": n_product[f]}

    pool = collections.defaultdict(list)   # role -> candidates
    stats = collections.Counter()
    for roleset in ("mba", "product"):
        rows = {j["id"]: j for j in processed.load(roleset)}
        keys = {}
        for company, r, j, fam, _ in extract.postings(roleset):
            if roleset == "mba" and fam in product_fams or fam not in roles or roles[fam]["set"] != roleset:
                continue
            pid = f"{company}::{j.get('external_id') or j.get('url')}"
            row = rows.get(pid)
            if not row or row.get("country") != US or row.get("open") is False:
                continue
            stats[roleset + " us open"] += 1
            if pid in deny:
                stats["denied"] += 1
                continue
            key = keys.get(fam) or keys.setdefault(fam, Key(roleset, fam, graphs[roleset], generic))
            rng = random.Random(f"{SEED}:{pid}")
            for c in candidates(roleset, j, company, fam, key, rng):
                stats[roleset + " candidates"] += 1
                pool[fam].append({"id": pid, "set": roleset, "role": fam, "group": roles[fam]["group"], "difficulty": c["difficulty"], "company": company, "title": j["title"], "url": j.get("url"), "section": c["section"], "blocks": c["blocks"]})

    # at most 12 per role, one per employer, an even split of difficulties where the pool allows (seeded shuffle)
    passages, counts = [], {}
    for fam in roles:
        cands = sorted(pool.get(fam, []), key=lambda c: (c["id"], c["difficulty"]))
        random.Random(SEED).shuffle(cands)
        by_d = {d: [c for c in cands if c["difficulty"] == d] for d in DIFFICULTIES}
        used_emp, used_id, picked = set(), set(), []
        while len(picked) < MAX_PER_ROLE and any(by_d.values()):
            for d in DIFFICULTIES:
                while by_d[d]:
                    c = by_d[d].pop(0)
                    if c["company"] in used_emp or c["id"] in used_id:
                        continue
                    used_emp.add(c["company"]); used_id.add(c["id"]); picked.append(c)
                    break
                if len(picked) >= MAX_PER_ROLE:
                    break
        picked.sort(key=lambda c: (DIFFICULTIES.index(c["difficulty"]), c["id"]))
        passages += picked
    # the file stays under BUDGET bytes: while it is over, the roles with the most passages give up their last
    # one of their most common difficulty, so thin roles keep theirs and the difficulty split stays even
    size = lambda: sum(len(json.dumps(p, ensure_ascii=False, separators=(",", ":"))) + 4 for p in passages) + len(json.dumps(roles, ensure_ascii=False)) + 120
    while size() > BUDGET:
        per = collections.Counter(p["role"] for p in passages)
        fam = max(per, key=lambda f: (per[f], f))
        mine = [p for p in passages if p["role"] == fam]
        d = collections.Counter(p["difficulty"] for p in mine).most_common(1)[0][0]
        passages.remove([p for p in mine if p["difficulty"] == d][-1])
    for fam in roles:
        counts[fam] = collections.Counter(p["difficulty"] for p in passages if p["role"] == fam)

    out = {"generated": datetime.date.today().isoformat(), "n_jobs": M["meta"]["n_jobs"], "seed": SEED, "roles": roles, "passages": passages}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write('{"generated": %s, "n_jobs": %d, "seed": %d,\n "roles": %s,\n "passages": [\n' % (json.dumps(out["generated"]), out["n_jobs"], SEED, json.dumps(roles, ensure_ascii=False)))
        f.write(",\n".join("  " + json.dumps(p, ensure_ascii=False, separators=(",", ":")) for p in passages))
        f.write("\n ]}\n")
    review(passages, roles, counts, deny, stats)

    print(f"{'role':40} easy medium hard  total   (pool)")
    for fam, c in counts.items():
        print(f"{fam:40} {c['easy']:4} {c['medium']:6} {c['hard']:4}  {sum(c.values()):5}   ({len(pool.get(fam, []))})")
    print(f"\n{len(passages)} passages over {sum(1 for c in counts.values() if c)} roles; {sum(1 for c in counts.values() if not c)} roles with none")
    print(", ".join(f"{k}: {v}" for k, v in sorted(stats.items())))
    print(f"{OUT}: {os.path.getsize(OUT):,} bytes")
    print(f"review sheet: {REVIEW}")


def review(passages, roles, counts, deny, stats):
    os.makedirs(os.path.dirname(REVIEW), exist_ok=True)
    L = ["# Spot the real ask: passages to review", "",
         f"Generated {datetime.date.today().isoformat()} by `python3 -m pipeline.game_passages`, seed {SEED}. Read every passage before a release:",
         "an ask that is not one (a false positive in the key), a key that misses most of the real asks, or broken text means a veto",
         "in `pipeline/game_passages_deny.json` (`{\"<passage id>\": \"reason\"}`) and a rerun.", "",
         "Legend: `[ask → primary skill share]`, `{filler: kind}` (`counted as` when the atlas tags the phrase), `(other)`, `…` text left out.", ""]
    if deny:
        L += ["## Vetoed", ""] + [f"- `{k}`: {v}" for k, v in deny.items()] + [""]
    L += ["## Counts", "", "| role | easy | medium | hard | total |", "|---|---|---|---|---|"]
    L += [f"| {fam} | {c['easy']} | {c['medium']} | {c['hard']} | {sum(c.values())} |" for fam, c in counts.items()]
    L += ["", ", ".join(f"{k}: {v}" for k, v in sorted(stats.items())), ""]
    by_role = collections.defaultdict(list)
    for p in passages:
        by_role[p["role"]].append(p)
    for fam, info in roles.items():
        ps = by_role.get(fam, [])
        L += [f"## {info['label']} (`{fam}`, {info['group']}): {len(ps)} passages", ""]
        for p in ps:
            L += [f"### {p['difficulty']} · {p['company']} · {p['title']}", "", f"`{p['id']}` · {p['section']} · <{p['url']}>", ""]
            for b in p["blocks"]:
                if b["kind"] == "gap":
                    L.append("…")
                    continue
                parts, line = [], "- " if b["kind"] == "list" else ""
                for c in b["chunks"]:
                    if c[1] is None:
                        if c[0] == "\n":
                            L.append(line + "".join(parts)); parts, line = [], "- "
                        else:
                            parts.append(c[0])
                    elif c[1] == "a":
                        sh = f" {round(c[3] * 100)}%" if len(c) > 3 else ""
                        parts.append(f"[{c[0]} → {c[2][0]}{sh}{' +' + ','.join(c[2][1:]) if len(c[2]) > 1 else ''}]")
                    elif c[1] == "f":
                        extra = f", counted as {c[4]} {round(c[5] * 100) if c[5] is not None else '?'}%" if len(c) > 4 else ""
                        parts.append(f"{{{c[0]}: {c[2]}{extra}}}")
                    else:
                        parts.append(f"({c[0]})")
                L.append(line + "".join(parts))
            L.append("")
    with open(REVIEW, "w") as f:
        f.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
