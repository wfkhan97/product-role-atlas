"""Evals for the stratified taxonomy: the kinds, the evidence file and the field entries against the postings.

    .venv/bin/python evals/run_taxonomy.py              # report; exit 1 when a check fails
    .venv/bin/python evals/run_taxonomy.py --baseline   # also rewrite evals/taxonomy_baseline.md

What is checked (evals/README.md, "Taxonomy evals"):

shape      pipeline.tax.validate: every skill has a kind; every skill has an evidence entry whose form, lists and
           carriers are valid; every field entry names a field, a carrier set of two to six, a one-sentence reading and
           a resume line with a number.
coverage   A skill that at least four fields ask for (mean share over the field's roles at least 25%) has a field entry
           for every field that asks for it; a tool or a credential has none. No entry is written for a field that asks
           for the skill in under 10% of its postings.
grounding  Each carrier named in a field entry is asked for together with the skill in at least 15% of the field's US
           postings that ask for the skill (company-balanced weights). The entry says what carries the skill in that
           field; the postings must agree.
published  web/data/graph.json and web/data/graph_mba.json carry what the source files say: every skill node has the
           taxonomy's kind and the evidence entry under how_shown, the field entries of fields.json appear as `fields`
           with the postings' side beside them (product: the product entry only), meta.kinds is the KINDS table, and
           web/data/taxonomy*.json carry the kind. A build that is older than the files fails here.
carriers   Each skill a behaviour's evidence names as showing it is asked for together with the behaviour in at least 10%
           of some field's postings that ask for the behaviour: a carrier is field-specific (pitch books carry
           communication in banking), so the check is the maximum over fields, not the pooled share.

The fields and the shares come from data/processed/jobs_mba.json.gz, the same file the graph is built from, so the eval
moves with a data refresh; the baseline records the numbers of the day.
"""
import argparse
import collections
import math
import os
import statistics
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from pipeline import balance, processed, roles_mba, tax  # noqa: E402

ASKS = 0.25        # a field asks for a skill when the mean share over its roles reaches this
MIN_FIELDS = 4     # a skill asked for by this many fields gets field entries
TOO_LOW = 0.10     # no entry for a field that asks for the skill less than this
CO_SHARE = 0.15    # a carrier must be asked for together with the skill at least this often in the field
BEHAVIOUR_CO = 0.10
lines, totals = [], collections.Counter()


def out(s=""):
    lines.append(s)
    print(s)


def check(part, ok, msg):
    totals[(part, "pass" if ok else "fail")] += 1
    if not ok:
        out(f"  FAIL {msg}")


def load_jobs():
    """US postings of the MBA set with company-balanced weights, grouped by field."""
    fam2grp = {f: g for g, (_, fs) in roles_mba.GROUPS.items() for f in fs}
    jobs = [j for j in processed.load("mba") if j["country"] == "United States" and j["family"] in fam2grp]
    by_role = collections.defaultdict(list)
    for j in jobs:
        by_role[j["family"]].append(j)
    for js in by_role.values():
        for j, w in zip(js, balance.weights(js)):
            j["w"] = w
    by_group = collections.defaultdict(list)
    for j in jobs:
        by_group[fam2grp[j["family"]]].append(j)
    return jobs, by_role, by_group, fam2grp


def wshare(js, sid):
    tot = sum(j["w"] for j in js)
    return sum(j["w"] for j in js if sid in j["skills"]) / tot if tot else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true")
    args = ap.parse_args()
    t0 = time.time()
    T = tax.load()
    kind = {s["id"]: s["kind"] for s in T["skills"]}
    name = {s["id"]: s["name"] for s in T["skills"]}
    evidence = tax.load_evidence()
    fields = tax.load_fields()
    groups = list(roles_mba.GROUPS)
    out(f"# Taxonomy baseline ({time.strftime('%Y-%m-%d')})")
    out()
    out("Kinds, evidence and field entries of `pipeline/taxonomy.json`, `pipeline/evidence.json` and `pipeline/fields.json`, "
        "checked against the US postings of the MBA set (`evals/run_taxonomy.py`).")
    out()
    out("## Shape")
    problems = tax.validate(tax=T, evidence=evidence, fields=fields, groups=set(groups))
    check("shape", not problems, f"{len(problems)} problems")
    for p in problems:
        out(f"  - {p}")
    counts = collections.Counter(kind.values())
    out("  kinds: " + ", ".join(f"{k} {counts[k]}" for k in tax.KINDS))
    out(f"  evidence entries: {len(evidence)}; with carriers: {sum(1 for e in evidence.values() if e['shown_by'])}")
    out(f"  field entries: {sum(len(v) for v in fields.values())} on {len(fields)} skills")

    jobs, by_role, by_group, fam2grp = load_jobs()
    role_share = {f: {sid: wshare(js, sid) for sid in kind} for f, js in by_role.items()}
    # a field's share of a skill: the mean over its roles, as the index's by_family reads
    field_share = {g: {sid: statistics.mean(role_share[f][sid] for f in fs if f in role_share) for sid in kind} for g, (_, fs) in roles_mba.GROUPS.items()}

    out()
    out("## Coverage")
    out(f"A field asks for a skill when the mean share over its roles is at least {ASKS:.0%}; a skill asked for by {MIN_FIELDS} fields or more gets an entry per asking field.")
    rows = []
    for sid in kind:
        asking = [g for g in groups if field_share[g][sid] >= ASKS]
        if kind[sid] in ("tool", "credential"):
            check("coverage", sid not in fields, f"{sid} is a {kind[sid]} and has field entries")
            continue
        has = set(fields.get(sid, {}))
        if len(asking) >= MIN_FIELDS:
            missing = [g for g in asking if g not in has]
            check("coverage", not missing, f"{sid}: asked for by {len(asking)} fields, no entry for {missing}")
            rows.append((sid, asking, sorted(has)))
        for g in has:
            check("coverage", field_share[g][sid] >= TOO_LOW, f"{sid}.{g}: entry written for a field that asks for it in {field_share[g][sid]:.0%} of postings")
    out()
    out("| skill | kind | fields asking | entries |")
    out("|---|---|---|---|")
    for sid, asking, has in sorted(rows, key=lambda r: (-len(r[1]), r[0])):
        out(f"| {name[sid]} | {kind[sid]} | {len(asking)} | {len(has)} |")

    out()
    out("## Grounding")
    out(f"Each carrier an entry names is asked for together with the skill in at least {CO_SHARE:.0%} of the field's postings that ask for the skill.")
    out()
    out("| skill | field | asks | carriers (co-share) | top co-occurring skills in the postings |")
    out("|---|---|---|---|---|")
    base_with = {}
    for sid, per in fields.items():
        base = [j for j in jobs if sid in j["skills"]]
        for g, entry in per.items():
            withT = [j for j in by_group[g] if sid in j["skills"]]
            co = {c: wshare(withT, c) for c in entry["shown_by"]}
            for c, v in co.items():
                check("grounding", v >= CO_SHARE, f"{sid}.{g}: carrier {c} co-occurs in {v:.0%} of the field's postings that ask for {sid}")
            # the postings' own view: share × log-lift against the skill's postings everywhere
            if sid not in base_with:
                base_with[sid] = {c: wshare(base, c) for c in kind}
            top = sorted(((wshare(withT, c) * math.log((wshare(withT, c) + 0.02) / (base_with[sid][c] + 0.02)), c) for c in kind
                          if c != sid and kind[c] in tax.CARRIER_KINDS and wshare(withT, c) >= 0.3), reverse=True)[:5]
            out(f"| {name[sid]} | {g} | {field_share[g][sid]:.0%} | " + ", ".join(f"{name[c]} {v:.0%}" for c, v in co.items()) + " | " + ", ".join(name[c] for _, c in top) + " |")

    out()
    out("## Behaviour carriers")
    out(f"Each skill a behaviour's evidence names as showing it is asked for together with the behaviour in at least {BEHAVIOUR_CO:.0%} of some field's postings that ask for the behaviour (the field in brackets).")
    for sid in kind:
        if kind[sid] != "behaviour":
            continue
        withB = {g: [j for j in js if sid in j["skills"]] for g, js in by_group.items()}
        parts = []
        for c in evidence[sid]["shown_by"]:
            v, g = max((wshare(js, c), g) for g, js in withB.items())
            check("carriers", v >= BEHAVIOUR_CO, f"{sid}: carrier {c} is on at most {v:.0%} of any field's postings that ask for {sid} ({g})")
            parts.append(f"{name[c]} {v:.0%} ({g})")
        out(f"- **{name[sid]}**: " + ", ".join(parts))

    out()
    out("## Published")
    out("The indexes the interface reads carry the kinds, the evidence and the field entries of the source files.")
    import json as _json
    for fn, which in (("graph.json", "product"), ("graph_mba.json", "mba")):
        path = os.path.join(ROOT, "web", "data", fn)
        G = _json.load(open(path))
        check("published", G["meta"].get("kinds") == tax.KINDS and G["meta"].get("forms") == tax.FORMS, f"{fn}: meta.kinds or meta.forms is not the current table")
        bad_kind = [s["id"] for s in G["skills"] if s.get("kind") != kind.get(s["id"])]
        check("published", not bad_kind, f"{fn}: kind differs from the taxonomy on {bad_kind[:5]}")
        bad_ev = [s["id"] for s in G["skills"] if s.get("how_shown") != evidence.get(s["id"])]
        check("published", not bad_ev, f"{fn}: how_shown differs from evidence.json on {bad_ev[:5]}")
        for s in G["skills"]:
            want = fields.get(s["id"], {})
            want = {g: e for g, e in want.items() if g == "product"} if which == "product" else want
            have = s.get("fields") or {}
            check("published", set(have) == set(want), f"{fn}: {s['id']} fields {sorted(have)} vs source {sorted(want)}")
            for g, e in want.items():
                h = have.get(g) or {}
                check("published", all(h.get(k) == v for k, v in e.items()), f"{fn}: {s['id']}.{g} text differs from fields.json")
                check("published", isinstance(h.get("with"), list) and isinstance(h.get("subs"), list) and "n" in h, f"{fn}: {s['id']}.{g} lacks the postings' side")
        tpath = os.path.join(ROOT, "web", "data", "taxonomy.json" if which == "product" else "taxonomy_mba.json")
        TW = _json.load(open(tpath))
        check("published", all(s.get("kind") == kind.get(s["id"]) for s in TW["skills"]), f"{os.path.basename(tpath)}: a skill lacks its kind")
        out(f"- {fn}: {len(G['skills'])} skills with kind and how_shown; {sum(1 for s in G['skills'] if s.get('fields'))} with field entries; {os.path.basename(tpath)} carries the kind")

    out()
    out("## Totals")
    for part in ("shape", "coverage", "grounding", "carriers", "published"):
        out(f"- {part}: {totals[(part, 'pass')]} pass, {totals[(part, 'fail')]} fail")
    out(f"- {time.time() - t0:.0f}s")
    if args.baseline:
        with open(os.path.join(HERE, "taxonomy_baseline.md"), "w") as f:
            f.write("\n".join(lines) + "\n")
        print(f"wrote {os.path.join(HERE, 'taxonomy_baseline.md')}")
    return 1 if any(v for (p, s), v in totals.items() if s == "fail") else 0


if __name__ == "__main__":
    sys.exit(main())
