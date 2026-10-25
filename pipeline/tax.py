"""The skill taxonomy (pipeline/taxonomy.json) and the part of it each role set uses.

One vocabulary serves every role set. A skill with "only": [role sets] belongs to those sets alone; a skill
without it is shared. A shared skill with "patterns_for": {role set: [patterns]} uses those patterns for that set. The product map keeps its original skills until its interface is redesigned for more.

Every skill carries a "kind" (KINDS below): what sort of thing it is, which decides how a resume shows it and how the
interface should treat it. The patterns tag postings; the kind says nothing to extraction. Two hand-written files beside
this one complete the stratification: pipeline/evidence.json (how a resume shows each skill) and pipeline/fields.json
(what a skill that most fields ask for means in each field). They sit outside pipeline/depth/ on purpose: every loader
of the depth files globs that folder by skill id. `validate` checks all three.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "pipeline", "taxonomy.json")
EVIDENCE_PATH = os.path.join(ROOT, "pipeline", "evidence.json")
FIELDS_PATH = os.path.join(ROOT, "pipeline", "fields.json")

# The kinds of skill. `form` is how a resume shows a skill of that kind by default (FORMS); `how` is the one rule a
# student can act on. Order is the order the interface should list them in: what the work is, then what carries it.
KINDS = {
    "method": {"label": "Craft", "form": "artefact",
               "meaning": "A way of doing the work of the field, with a procedure and a thing it produces.",
               "how": "Name the thing you produced and what changed because of it."},
    "practice": {"label": "Working with people", "form": "scope",
                 "meaning": "Getting work done through other people and structures: partners, stakeholders, teams, programmes.",
                 "how": "Say who you worked with, how many, and what you were trusted with."},
    "behaviour": {"label": "How you work", "form": "through",
                  "meaning": "A way of working that every field asks for and no one lists. Shown through how the other work was done.",
                  "how": "Never a line of its own: let a line about real work show it."},
    "technical": {"label": "Technical", "form": "built",
                  "meaning": "Fluency with systems, data and software as a subject, not a tool.",
                  "how": "Say what you built, queried, shipped or decided on technical grounds."},
    "knowledge": {"label": "Domain", "form": "context",
                  "meaning": "An industry, a market or a body of rules the work sits in.",
                  "how": "Name the industry, product or rule set in the lines of work that touched it."},
    "tool": {"label": "Tools", "form": "named",
             "meaning": "Named software.",
             "how": "Name the tool inside the line of work that used it, not only in a skills list."},
    "credential": {"label": "Credentials", "form": "named",
                   "meaning": "Degrees, licences, certifications, years and backgrounds.",
                   "how": "Name it once, with its date, where a reader looks for it."},
}

# How a resume shows a skill. A skill's evidence entry takes its kind's form unless it says otherwise.
FORMS = {
    "through": "Shown through lines about other work; never its own line.",
    "scope": "Who you worked with or led, how many, what size, what you were trusted with.",
    "artefact": "The thing you produced, and what changed because of it.",
    "outcome": "A number you owned and moved.",
    "built": "What you built, queried or shipped.",
    "context": "The industry, product or rule set the work sat in.",
    "named": "Naming it is the evidence.",
}

# Kinds whose skills can carry a behaviour or a practice: a resume line about one of them is the evidence.
CARRIER_KINDS = {"method", "practice", "technical", "knowledge"}


def load():
    with open(PATH) as f:
        return json.load(f)


def load_evidence():
    with open(EVIDENCE_PATH) as f:
        return json.load(f)


def load_fields():
    with open(FIELDS_PATH) as f:
        return json.load(f)


def for_roles(roleset, tax=None):
    """The taxonomy as one role set sees it: its skills, and the clusters those skills use."""
    tax = tax or load()
    skills = [_for(s, roleset) for s in tax["skills"] if roleset in s.get("only", [roleset])]
    used = {s["cluster"] for s in skills}
    return {"clusters": {c: v for c, v in tax["clusters"].items() if c in used}, "skills": skills}


def _for(skill, roleset):
    """A shared skill may be worded more strictly for one role set ("patterns_for": {"mba": [...]}): postings of
    the MBA roles say "prioritize" and "infrastructure" in passing, where product postings mean the skill."""
    s = {k: v for k, v in skill.items() if k != "patterns_for"}
    if roleset in skill.get("patterns_for", {}):
        s["patterns"] = skill["patterns_for"][roleset]
    return s


def dump(tax, path=PATH):
    with open(path, "w") as f:
        f.write(json.dumps(tax, indent=1, ensure_ascii=False) + "\n")


def validate(tax=None, evidence=None, fields=None, groups=None):
    """Every rule the three files must keep. Returns a list of problems; empty when all hold.

    groups: the field ids the fields file may name (the MBA index's groups, which include "product")."""
    tax = tax or load()
    evidence = load_evidence() if evidence is None else evidence
    fields = load_fields() if fields is None else fields
    out = []
    ids = {s["id"] for s in tax["skills"]}
    kind = {}
    for s in tax["skills"]:
        k = s.get("kind")
        if k not in KINDS:
            out.append(f"{s['id']}: kind {k!r} is not one of {sorted(KINDS)}")
        kind[s["id"]] = k
    for sid in ids - set(evidence):
        out.append(f"{sid}: no entry in evidence.json")
    for sid, e in evidence.items():
        if sid not in ids:
            out.append(f"evidence.json: {sid} is not a skill")
            continue
        form = e.get("form")
        if form not in FORMS:
            out.append(f"{sid}: evidence form {form!r} is not one of {sorted(FORMS)}")
        for key in ("artefacts", "counterparts", "measures", "verbs", "shown_by"):
            if not isinstance(e.get(key), list):
                out.append(f"{sid}: evidence {key} must be a list")
        for other in e.get("shown_by", []):
            if other not in ids:
                out.append(f"{sid}: shown_by names {other}, not a skill")
            elif other == sid:
                out.append(f"{sid}: shown_by names itself")
            elif kind.get(other) not in CARRIER_KINDS:
                out.append(f"{sid}: shown_by names {other}, a {kind.get(other)}; only {sorted(CARRIER_KINDS)} carry a skill")
        if kind.get(sid) == "behaviour" and len(e.get("shown_by", [])) < 3:
            out.append(f"{sid}: a behaviour needs at least three skills that show it")
        if kind.get(sid) in ("tool", "credential") and form != "named":
            out.append(f"{sid}: a {kind[sid]} is shown by naming it")
    for sid, per in fields.items():
        if sid not in ids:
            out.append(f"fields.json: {sid} is not a skill")
            continue
        if kind.get(sid) in ("tool", "credential"):
            out.append(f"fields.json: {sid} is a {kind[sid]}; it means the same in every field")
        for g, entry in per.items():
            if groups is not None and g not in groups:
                out.append(f"fields.json: {sid}.{g} is not a field")
            words = lambda t: len((t or "").split())
            if not entry.get("reads_as") or words(entry["reads_as"]) > 25:
                out.append(f"fields.json: {sid}.{g} reads_as missing or over 25 words")
            if not entry.get("line") or words(entry["line"]) > 30:
                out.append(f"fields.json: {sid}.{g} line missing or over 30 words")
            elif not any(ch.isdigit() for ch in entry["line"]):
                out.append(f"fields.json: {sid}.{g} line has no number: a resume line that shows a skill carries a measure")
            sb = entry.get("shown_by")
            if not isinstance(sb, list) or not 2 <= len(sb) <= 6:
                out.append(f"fields.json: {sid}.{g} shown_by needs two to six skills")
            else:
                for other in sb:
                    if other not in ids:
                        out.append(f"fields.json: {sid}.{g} shown_by names {other}, not a skill")
                    elif other == sid:
                        out.append(f"fields.json: {sid}.{g} shown_by names itself")
                    elif kind.get(other) not in CARRIER_KINDS:
                        out.append(f"fields.json: {sid}.{g} shown_by names {other}, a {kind.get(other)}")
    return out
