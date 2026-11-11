"""Structure evals for the standards index (pipeline/standards.json), with no model and no network.

    .venv/bin/python evals/run_standards.py                 # report; exit 1 when a check fails
    .venv/bin/python evals/run_standards.py --baseline      # also rewrite evals/standards_baseline.md
    .venv/bin/python evals/run_standards.py --only shows    # one part: structure, shows, skills, freshness
    .venv/bin/python evals/run_standards.py --skip freshness  # what CI runs: freshness depends on the date, not on the change

What is checked (evals/README.md, "The standards index"):

structure  source ids are unique; every record has its fields, with known values for kind, publisher_class, verified,
           access and, on a program, status; every role id exists in a role set; a prep vendor or a gap is never
           first-party; no record keeps a quotation; no publisher or URL is on the blocked-vendor list of
           data/raw/build_sources.json; verify's fields, where present, are well formed
shows      every role in `roles` exists in the role sets it names, with the set's label; every role has a list, is served by another role's, or is in `no_list` with the reason; a listed role has a
           `shows` list; item ids are unique in a role; every source id resolves and serves that role (or a role in
           also_serves); an item with no fetched source that is not a prep vendor carries a `weak` note
skills     every skill id is in pipeline/taxonomy.json and in the taxonomy of one of the role's sets
freshness  no `shows` item rests only on sources that are stale (read more than 12 months ago), programs not re-read
           since the last 1 August, or closed programs (pipeline.standards.citable); the date decides, so the monthly
           workflow runs it and CI does not

Labels are the file itself: a record that fails is fixed by a person who re-reads the page. Whether a generated
quest matches what a role's loops ask for is judged by the owner on a sample; no check here reads a quest.
"""
import argparse
import collections
import datetime
import json
import os
import re
import sys
import time
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from pipeline import roles, roles_mba, roles_tech, standards, tax  # noqa: E402

PARTS = ("structure", "shows", "skills", "freshness")
SETS = {"product": roles.FAMILY_LABELS, "mba": roles_mba.FAMILY_LABELS, "tech": roles_tech.FAMILY_LABELS}
REQUIRED = ("id", "kind", "role_ids", "name", "publisher", "publisher_class", "url", "date_read", "verified", "access",
            "first_party", "why_standard", "what_they_test", "artifacts", "notes")
STAGES = ("foundation", "build")
lines, totals = [], collections.Counter()


def out(s=""):
    lines.append(s)
    print(s)


def check(part, ok, msg):
    totals[(part, "pass" if ok else "fail")] += 1
    if not ok:
        out(f"  FAIL {msg}")


def blocked_by(src, blocked):
    """The blocked vendor a record names as publisher or links to, or None."""
    hosts = [urlparse(u).netloc.lower() for u in [src["url"]] + [t.get("source_url") or "" for t in src.get("what_they_test", [])]]
    squeezed = [re.sub(r"[^a-z0-9]", "", h) for h in hosts]
    for b in blocked:
        if re.search(r"\b" + re.escape(b.lower()) + r"\b", src["publisher"].lower()):
            return b
        key = re.sub(r"[^a-z0-9]", "", b.lower())
        if len(key) > 4 and any(key in h for h in squeezed):
            return b
    return None


def strong(src):
    return src["verified"] == "fetched" and src["publisher_class"] != "prep_vendor"


def structure(d, blocked):
    S = d["sources"]
    out(f"\n== structure ({len(S)} sources)")
    ids = collections.Counter(s.get("id") for s in S)
    check("structure", max(ids.values()) == 1, f"source ids repeat: {[k for k, v in ids.items() if v > 1][:6]}")
    every = set().union(*SETS.values())
    for s in S:
        i = s.get("id")
        missing = [k for k in REQUIRED if k not in s]
        check("structure", not missing, f"{i}: no {missing}")
        if missing:
            continue
        check("structure", s["kind"] in standards.KINDS and s["publisher_class"] in standards.PUBLISHER_CLASSES
              and s["verified"] in standards.VERIFIED and s["access"] in standards.ACCESS, f"{i}: an unknown kind, publisher_class, verified or access")
        check("structure", (s["kind"] == "program") == ("status" in s) and s.get("status", "open") in standards.STATUS, f"{i}: status is for programs, one of {standards.STATUS}")
        check("structure", re.fullmatch(r"\d{4}-\d\d-\d\d", s["date_read"]) is not None and s["url"].startswith(("http://", "https://")), f"{i}: date_read or url is malformed")
        check("structure", s["role_ids"] and set(s["role_ids"]) <= every, f"{i}: role ids in no role set: {sorted(set(s['role_ids']) - every)}")
        check("structure", isinstance(s["first_party"], bool) and not (s["first_party"] and (s["publisher_class"] == "prep_vendor" or s["kind"] == "gap")), f"{i}: a prep vendor or a gap marked first-party")
        check("structure", "quote" not in s, f"{i}: keeps a quotation")
        check("structure", s["why_standard"] and isinstance(s["artifacts"], list) and all(t.get("dimension") and t.get("summary") for t in s["what_they_test"]), f"{i}: an empty why_standard, or a what_they_test row with no dimension or summary")
        b = blocked_by(s, blocked)
        check("structure", b is None, f"{i}: a blocked vendor ({b})")
        c = s.get("check")
        check("structure", c is None or (c.get("outcome") in standards.OUTCOMES and re.fullmatch(r"\d{4}-\d\d-\d\d", c.get("date", ""))), f"{i}: a malformed check")
        check("structure", ("read_sha256" in s) == ("read_sha256_date" in s), f"{i}: read_sha256 without its date, or the reverse")
    out("  by kind: " + ", ".join(f"{k} {v}" for k, v in collections.Counter(s["kind"] for s in S).most_common()))
    out("  by publisher class: " + ", ".join(f"{k} {v}" for k, v in collections.Counter(s["publisher_class"] for s in S).most_common()))
    out(f"  first-party {sum(s['first_party'] for s in S)}; fetched {sum(s['verified'] == 'fetched' for s in S)}; role ids served {len({r for s in S for r in s['role_ids']})} of {len(every)}")
    p, f = totals[("structure", "pass")], totals[("structure", "fail")]
    out(f"  {p} pass, {f} fail")


def shows(d):
    by = {s["id"]: s for s in d["sources"]}
    R = d["roles"]
    out(f"\n== shows ({len(R)} roles with a list, {sum(len(r['shows']) for r in R.values())} items)")
    every = set().union(*SETS.values())
    served = set(R) | {x for r in R.values() for x in r.get("also_serves", [])}
    none = d.get("no_list", {})
    check("shows", set(none) == every - served, f"no_list is not the roles without a list: {sorted(set(none) ^ (every - served))}")
    check("shows", all(isinstance(v, str) and v.strip() for v in none.values()), "no_list: a role without its reason")
    for rid, r in R.items():
        check("shows", r.get("role_sets") and all(rid in SETS.get(k, {}) for k in r["role_sets"]), f"{rid}: not a role of {r.get('role_sets')}")
        check("shows", any(SETS[k].get(rid) == r.get("label") for k in r.get("role_sets", []) if k in SETS), f"{rid}: the label is not the role set's")
        check("shows", set(r.get("also_serves", [])) <= every, f"{rid}: also_serves names no role: {sorted(set(r.get('also_serves', [])) - every)}")
        check("shows", bool(r.get("shows")) and bool(r.get("summary")), f"{rid}: no shows list or no summary")
        ids = collections.Counter(it["id"] for it in r.get("shows", []))
        check("shows", not ids or max(ids.values()) == 1, f"{rid}: item ids repeat")
        served = {rid, *r.get("also_serves", [])}
        for it in r.get("shows", []):
            w = f"{rid}/{it.get('id')}"
            check("shows", it.get("label") and it.get("means") and it.get("artifacts") and it.get("stage") in STAGES, f"{w}: no label, means or artifacts, or a stage outside {STAGES}")
            check("shows", bool(it.get("sources")), f"{w}: no source")
            for x in it.get("sources", []):
                check("shows", x in by, f"{w}: source {x} does not resolve")
                if x in by:
                    check("shows", bool(served & set(by[x]["role_ids"])), f"{w}: source {x} serves {by[x]['role_ids']}, not this role")
            has_strong = any(strong(by[x]) for x in it.get("sources", []) if x in by)
            check("shows", has_strong or bool(it.get("weak")), f"{w}: no fetched source that is not a prep vendor, and no `weak` note")
            check("shows", "weak" not in it or (isinstance(it["weak"], str) and it["weak"].strip()), f"{w}: `weak` is not a note")
    out(f"  {totals[('shows', 'pass')]} pass, {totals[('shows', 'fail')]} fail")


def skills(d):
    out("\n== skills")
    T = {s["id"] for s in tax.load()["skills"]}
    per_set = {k: {s["id"] for s in tax.for_roles(k)["skills"]} for k in SETS}
    n = 0
    for rid, r in d["roles"].items():
        own = set().union(*(per_set[k] for k in r["role_sets"] if k in per_set))
        for it in r["shows"]:
            check("skills", bool(it.get("skills")), f"{rid}/{it['id']}: no skill")
            for sk in it.get("skills", []):
                n += 1
                check("skills", sk in T, f"{rid}/{it['id']}: {sk} is not in pipeline/taxonomy.json")
                check("skills", sk not in T or sk in own, f"{rid}/{it['id']}: {sk} is not a skill of the role's set ({r['role_sets']})")
    out(f"  {n} skill ids on the items")
    out(f"  {totals[('skills', 'pass')]} pass, {totals[('skills', 'fail')]} fail")


def freshness(d, today):
    S = d["sources"]
    by = {s["id"]: s for s in S}
    out(f"\n== freshness (on {today.isoformat()}; programs are due when read before {standards.last_august_first(today).isoformat()})")
    out(f"  stale {sum(standards.stale(s, today) for s in S)}; programs due {sum(standards.program_due(s, today) for s in S)}; closed programs {sum(s.get('status') == 'closed' for s in S)}")
    for rid, r in d["roles"].items():
        for it in r["shows"]:
            srcs = [by[x] for x in it["sources"] if x in by]
            check("freshness", any(standards.citable(s, today) for s in srcs), f"{rid}/{it['id']}: every source is stale, due or closed: {it['sources']}")
    out(f"  {totals[('freshness', 'pass')]} pass, {totals[('freshness', 'fail')]} fail")


def summary(d):
    by = {s["id"]: s for s in d["sources"]}
    rows = ["| Role | Also serves | Items | Foundation / build | Sources cited | First-party | Weak items |", "|---|---|---|---|---|---|---|"]
    for rid, r in d["roles"].items():
        cited = {x for it in r["shows"] for x in it["sources"]}
        st = collections.Counter(it["stage"] for it in r["shows"])
        rows.append(f"| {rid} | {', '.join(r['also_serves']) or '-'} | {len(r['shows'])} | {st['foundation']} / {st['build']} | {len(cited)} | {sum(by[x]['first_party'] for x in cited if x in by)} | {sum(bool(it.get('weak')) for it in r['shows'])} |")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--only", choices=PARTS)
    ap.add_argument("--skip", choices=PARTS)
    args = ap.parse_args()
    want = lambda p: (not args.only or args.only == p) and args.skip != p
    d = standards.load()
    blocked = json.load(open(os.path.join(ROOT, "data", "raw", "build_sources.json")))["blocked_vendors"]
    if want("structure"):
        structure(d, blocked)
    if want("shows"):
        shows(d)
    if want("skills"):
        skills(d)
    if want("freshness"):
        freshness(d, datetime.date.today())
    p = sum(v for (_, k), v in totals.items() if k == "pass")
    f = sum(v for (_, k), v in totals.items() if k == "fail")
    out(f"\nTOTAL: {p} pass, {f} fail")
    if args.baseline:
        if args.only or args.skip or f:
            sys.exit("the baseline is written from a full run with no failures")
        md = ["# Standards index baseline", "",
              f"Generated by `.venv/bin/python evals/run_standards.py --baseline` on {time.strftime('%Y-%m-%d')}. Do not edit by hand.", "",
              "What the quest generator reads per role. A change that lowers a count has removed grounding; say why in the commit.", "",
              *summary(d), "", "```", *lines, "```"]
        with open(os.path.join(HERE, "standards_baseline.md"), "w") as fh:
            fh.write("\n".join(md) + "\n")
        print("wrote evals/standards_baseline.md")
    sys.exit(1 if f else 0)


if __name__ == "__main__":
    main()
