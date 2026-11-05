"""Evals for the data layer of a role set: what the pipeline reads from a posting, and what the graph build writes.

    .venv/bin/python evals/run_pipeline.py               # report; exit 1 when a check fails
    .venv/bin/python evals/run_pipeline.py --baseline    # also rewrite evals/pipeline_baseline_mba.md
    .venv/bin/python evals/run_pipeline.py --only titles # one part: backlog, titles, entry, countries, golden, sponsorship, integrity, graph, js, matcher

Labels are the spec. They were written by reading titles, locations and postings before the code was run on
them. A row with "sure": false is one a reader could label either way: it is reported, not counted. A row with
"known_miss" (titles: "known_miss_role", "known_miss_level") is a wrong answer we accept for now, with the reason; it fails only if it starts to pass (then
remove the mark).

0. backlog    pipeline.scrape.merge: a refresh adds new postings, closes missing ones, reopens returning ones, drops none; a posting is its requisition id
1. titles     evals/titles_mba.json   the role each title must get (or none), and its level on its ladder
1b. entry     evals/entry_mba.json    who enters at each posting: an MBA graduate, a pre-MBA graduate or neither; internship or not
2. countries  evals/countries.json    the country each location must get
3. golden     evals/golden_mba.json   skills each posting must get and must not get; floors guard against regressions
4. integrity  registry, processed file: no shared job board, no repeated URL, known skill ids, every role has postings
5. graph      web/data/graph_mba*: US only, counts add up, shares are company-balanced, ids resolve, product files untouched
6. js         web/data/roles_mba.json read by evals/roles_mba.mjs gives the same role and level as pipeline/roles_mba.py
7. matcher    web/match.js reads every role's graph unchanged (node evals/graph_mba.mjs)
"""
import argparse
import collections
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from pipeline import balance, extract, geo, processed, roles, roles_mba, tax  # noqa: E402
from pipeline.scrape import load_registry  # noqa: E402

ROLES = "mba"
lines, totals = [], collections.Counter()


def out(s=""):
    lines.append(s)
    print(s)


def check(part, ok, msg):
    totals[(part, "pass" if ok else "fail")] += 1
    if not ok:
        out(f"  FAIL {msg}")


def load(name):
    with open(os.path.join(HERE, name)) as f:
        return json.load(f)


def labelled(part, rows, got_of, want_key, show, miss_key="known_miss"):
    """Count rows against their label; known misses and unsure rows are reported apart."""
    unsure = known = 0
    for r in rows:
        got, want = got_of(r), r[want_key]
        if not r.get("sure", True):
            unsure += got != want
            continue
        if r.get(miss_key):
            known += 1
            check(part, got != want, f"known miss now passes, remove the mark: {show(r)}")
            continue
        check(part, got == want, f"{show(r)}: want {want}, got {got}")
    return unsure, known


def titles():
    rows = load("titles_mba.json")["rows"]
    fam = lambda r: roles_mba.family(r["title"], r["category"], r["company"])
    show = lambda r: f"{r['title']!r} at {r['company']} ({r['category'] or 'no category'})"
    out(f"\n== titles: role ({len(rows)} titles, {sum(1 for r in rows if r['role'] is None)} of them must get no role)")
    unsure, _ = labelled("titles", rows, fam, "role", show, "known_miss_role")
    out(f"  {totals[('titles', 'pass')]} pass, {totals[('titles', 'fail')]} fail; {sum(1 for r in rows if not r.get('sure', True))} unsure rows not counted ({unsure} of them differ from their label)")
    # level: only where the role is right and the labeller gave a level
    lv = [r for r in rows if r["role"] and r["level"] and fam(r) == r["role"]]
    got = lambda r: roles_mba.level(r["title"], r["company"], r["category"], r.get("industry"))
    out(f"\n== levels ({len(lv)} titles with a role and a level; by ladder: {dict(collections.Counter(roles_mba.ladder(r['title'], r['company'], r['category'], r.get('industry')) for r in lv))})")
    unsure, known = labelled("levels", lv, got, "level", show, "known_miss_level")
    out(f"  {totals[('levels', 'pass')]} pass, {totals[('levels', 'fail')]} fail; {known} known misses; {sum(1 for r in lv if not r.get('sure', True))} unsure rows not counted ({unsure} differ)")


def entry_text(r):
    """The cleaned text and the years asked, as extraction hands them to roles_mba.entry (None when the row has no text)."""
    if not r.get("description"):
        return None, None
    text = extract.norm(extract.clean(r["description"], r["company"], extract.ROLE_SETS[ROLES].get("split_long", False)))
    return text, extract.years_required(text)


def entry():
    rows = load("entry_mba.json")["rows"]
    out(f"\n== entry mark ({len(rows)} postings: {sum(1 for r in rows if r['entry'] == 'mba')} mba, {sum(1 for r in rows if r['entry'] == 'pre_mba')} pre_mba, "
        f"{sum(1 for r in rows if r['entry'] is None)} none; {sum(1 for r in rows if r.get('description'))} read with their text, {sum(1 for r in rows if r.get('written'))} written)")
    src = collections.Counter()

    def got(r):
        text, yoe = entry_text(r)
        e, intern, s = roles_mba.entry(r["title"], r["company"], r["category"], r.get("industry"), text=text, yoe=yoe)
        if r.get("sure", True) and not r.get("known_miss"):
            src[(s or "none", (e, e and intern) == r["want"])] += 1
        return (e, e and intern)  # intern is compared only where there is a mark
    for r in rows:
        r["want"] = (r["entry"], r["entry"] and r["intern"])
    check("entry", all(r["entry"] in roles_mba.ENTRY_VALUES + (None,) and isinstance(r["intern"], bool) for r in rows), "a label is outside the allowed values")
    unsure, known = labelled("entry", rows, got, "want", lambda r: f"{r['title']!r} at {r['company']} ({r['category'] or 'no category'})")
    out(f"  {totals[('entry', 'pass')]} pass, {totals[('entry', 'fail')]} fail; {known} known misses; {sum(1 for r in rows if not r.get('sure', True))} unsure rows not counted ({unsure} of them differ from their label)")
    out("  sure rows by the evidence the rule used (right / all): " + ", ".join(f"{s} {src[(s, True)]}/{src[(s, True)] + src[(s, False)]}" for s in ("firm", "title", "text", "category", "none")))
    # the table itself: every row has a source, and every pattern compiles (the import did that) and is used
    E = roles_mba.ENTRY
    check("entry", all(f.get("source") and f.get("basis") in ("primary", "secondary") for f in E["firms"] + E["categories"]), "a row of the firm or category table has no source or no basis")
    check("entry", all(t["entry"] in roles_mba.ENTRY_VALUES for f in E["firms"] + E["categories"] for t in f["titles"]), "a row of the table gives a mark outside the allowed values")
    known_cats = set(roles_mba.EMPLOYER_RE) | set(roles_mba.FORTUNE_CATEGORIES.values())
    check("entry", all(c["category"] in known_cats and set(c["families"]) <= set(roles_mba.FAMILY_LABELS) for c in E["categories"]), "the category table names a category or a role that does not exist")
    reg = {r["company"] for r in load_registry(ROLES)}
    check("entry", all(f["firm"] in reg for f in E["firms"]), f"the firm table names employers that are not in the registry: {[f['firm'] for f in E['firms'] if f['firm'] not in reg]}")


def countries():
    rows = load("countries.json")["rows"]
    out(f"\n== countries ({len(rows)} locations)")
    unsure, known = labelled("countries", rows, lambda r: geo.country(r["location"])[0], "country", lambda r: repr(r["location"]))
    old = sum(1 for r in rows if r.get("sure", True) and extract.geo(r["location"])[0] != r["country"])
    out(f"  {totals[('countries', 'pass')]} pass, {totals[('countries', 'fail')]} fail; {known} known misses; {unsure} unsure rows differ."
        f" The product reader (extract.geo, unchanged) misses {old} of the same rows.")
    for url, want in [("https://careers.capgemini.com/job/Dallas%2C-TX-Capgemini-Invent-Sr_-Project-Management-Consultant-TX-75201/1426739033/", "United States"),
                      ("https://careers.ey.com/ey/job/Gurugram-Associate-Consultant-Business-Consulting-Risk-GOV-CNS-Risk-Risk-Management-Gurgaon-HR-122003/1433611033/", "India"),
                      ("https://jobs.supermicro.com/job/San-Jose-FP&amp;A-Manager-Cali/1415332500/", "United States")]:
        got = geo.country("", url=url, ats="successfactors")[0]
        check("countries", got == want, f"location from URL {url}: want {want}, got {got}")


def golden():
    d = load("golden_mba.json")
    rows, floors = d["rows"], d["floors"]
    skills = extract.skills_for(ROLES)
    known = {sid for sid, _ in skills}
    miss, false = collections.Counter(), collections.Counter()
    n_must = n_not = 0
    per = []
    for r in rows:
        tags = set(extract.tag(r["title"] + "\n" + extract.clean(r["description"], r["company"], extract.ROLE_SETS[ROLES].get("split_long", False)), skills))
        bad = [k for k in r["must"] + r["must_not"] if k not in known]
        check("golden", not bad, f"{r['title']!r}: labels name skills that are not in the taxonomy: {bad}")
        m = [k for k in r["must"] if k not in tags]
        f = [k for k in r["must_not"] if k in tags]
        n_must += len(r["must"]); n_not += len(r["must_not"])
        miss.update(m); false.update(f)
        per.append((r, m, f))
    found, tagged = 1 - sum(miss.values()) / n_must, sum(false.values()) / n_not
    out(f"\n== golden postings ({len(rows)} postings, {n_must} must, {n_not} must-not)")
    out(f"  must found: {found:.1%} (floor {floors['must_found']:.0%})   must-not tagged: {tagged:.1%} (ceiling {floors['must_not_tagged']:.0%})")
    check("golden", found >= floors["must_found"], f"must found fell to {found:.1%}, below the floor {floors['must_found']:.0%}")
    check("golden", tagged <= floors["must_not_tagged"], f"must-not tagged rose to {tagged:.1%}, above the ceiling {floors['must_not_tagged']:.0%}")
    only = {s["id"] for s in tax.for_roles(ROLES)["skills"] if s.get("only")}
    mark = lambda k: k if k in only else k + "*"
    out("  missed most (* = shared with the product map): " + ", ".join(f"{mark(k)} {v}" for k, v in miss.most_common(15)))
    out("  wrongly tagged most: " + ", ".join(f"{mark(k)} {v}" for k, v in false.most_common(15)))
    return per


def sponsorship_part():
    """Visa sponsorship as a posting fact (PLAN.md v16, step 8): the reader against the labelled postings."""
    from pipeline import sponsorship
    d = load("sponsorship.json")
    rows = d["rows"]
    got = collections.Counter()
    for r in rows:
        v = sponsorship.read(r["text"])
        got[v or "silent"] += 1
        check("sponsorship", v == r["label"], f"{r['title']!r} ({r['company']}): want {r['label']}, got {v}: {r['note']}")
    want = collections.Counter((r["label"] or "silent") for r in rows)
    out(f"\n== sponsorship ({len(rows)} labelled postings: yes {want['yes']}, no {want['no']}, silent {want['silent']})")
    out(f"  read as yes {got['yes']}, no {got['no']}, silent {got['silent']}")
    # the processed file: every value in the allowed set when the field is there (a file older than the field has none)
    jobs = processed.load(ROLES)
    vals = collections.Counter(j.get("sponsorship", "absent") for j in jobs)
    check("sponsorship", all(k in ("yes", "no", None, "absent") for k in vals), f"unknown sponsorship values in the processed file: {dict(vals)}")
    out(f"  processed file: " + ", ".join(f"{k} {v}" for k, v in vals.most_common()) + ("  (the field is not in this file yet: re-extract)" if vals.get("absent") else ""))


def backlog():
    """The raw files are a backlog: a refresh adds and closes, and never drops."""
    from pipeline.scrape import merge
    out("\n== backlog: what a refresh does to a company's postings")
    e = {"company": "X", "ats": "greenhouse", "group": "g", "category": "Investment banking"}
    job = lambda u: {"title": "t", "url": u}
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a"), job("b"), job("c")]}
    jobs, note = merge(old, [job("a"), job("d")], e, "2026-10-17")
    by = {j["url"]: j for j in jobs}
    check("backlog", set(by) == {"a", "b", "c", "d"}, "a refresh dropped a posting")
    check("backlog", by["a"]["first_seen"] == "2026-10-10" and by["a"]["last_seen"] == "2026-10-17" and "closed" not in by["a"], "a posting still shown is not open with a new last_seen")
    check("backlog", by["b"].get("closed") == "2026-10-17" and by["b"]["last_seen"] == "2026-10-10", "a posting no longer shown is not closed")
    check("backlog", by["d"]["first_seen"] == "2026-10-17" and by["d"]["category"] == "Investment banking" and "closed" not in by["d"], "a new posting is not added as open")
    jobs, _ = merge({"scraped_at": "2026-10-17T09:00:00", "jobs": jobs}, [job("b")], e, "2026-10-24")
    by = {j["url"]: j for j in jobs}
    check("backlog", "closed" not in by["b"] and by["a"].get("closed") == "2026-10-24" and by["c"].get("closed") == "2026-10-17", "a posting that comes back is not reopened, or a closed date moved")
    many = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job(str(i)) for i in range(20)]}
    jobs, note = merge(many, [job("0"), job("1")], e, "2026-10-17")
    check("backlog", note and not any(j.get("closed") for j in jobs), "a refresh that returned 2 of 20 open postings closed the rest; it must close nothing")
    jobs, _ = merge({"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a"), job("b")]}, [job("z")], e, "2026-10-17", full=False)
    check("backlog", not any(j.get("closed") for j in jobs), "a refresh of one batch of searches closed postings")
    # a posting is its requisition id: a new URL for the same id (Bank of America's per-session token) is the same row
    req = lambda u, i, **more: dict(job(u), external_id=i, **more)
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [req("a-t1", "1", title="old"), req("b-t1", "2")]}
    jobs, note = merge(old, [req("a-t2", "1", title="new")], e, "2026-10-17")
    check("backlog", [j["external_id"] for j in jobs] == ["1", "2"], "a requisition under a new URL was added as a second row")
    check("backlog", (jobs[0]["url"], jobs[0]["title"], jobs[0]["first_seen"], jobs[0]["last_seen"]) == ("a-t2", "new", "2026-10-10", "2026-10-17"),
          "a posting that came back did not take the board's current URL and title, or lost its first_seen")
    check("backlog", jobs[1].get("closed") == "2026-10-17" and note is None, "a requisition that did not come back under its id was not closed")
    # two rows of one requisition from before the key was the id fold into the one seen last
    old = {"scraped_at": "2026-10-13T09:00:00", "jobs": [req("a-old", "1", first_seen="2026-10-03", last_seen="2026-10-10", closed="2026-10-13"),
                                                         req("a-new", "1", first_seen="2026-10-13", last_seen="2026-10-13")]}
    jobs, _ = merge(old, [], e, "2026-10-17", full=False)
    check("backlog", len(jobs) == 1 and (jobs[0]["url"], jobs[0]["first_seen"], jobs[0].get("closed")) == ("a-new", "2026-10-03", None),
          "two rows of one requisition did not fold into the one seen last with the earliest first_seen")
    out(f"  {totals[('backlog', 'pass')]} pass, {totals[('backlog', 'fail')]} fail")


def integrity():
    out("\n== integrity: registry and processed file")
    reg = [r for r in load_registry(ROLES) if r.get("ats") not in (None, "unsupported")]
    boards = collections.defaultdict(list)
    for r in reg:
        boards[(r["ats"], json.dumps(r.get("config", {}), sort_keys=True))].append(r["company"])
    shared = {k: v for k, v in boards.items() if len(v) > 1 and k[1] != "{}"}
    check("integrity", not shared, f"registry entries share a job board: {list(shared.values())[:5]}")
    names = collections.Counter(r["company"].lower() for r in reg)
    check("integrity", max(names.values()) == 1, f"a company is in the registry twice: {[k for k, v in names.items() if v > 1][:5]}")
    jobs = processed.load(ROLES)
    urls = collections.Counter(j["url"] for j in jobs if j["url"])
    check("integrity", max(urls.values()) == 1, f"{sum(1 for v in urls.values() if v > 1)} URLs appear more than once in the processed file")
    ids = collections.Counter(j["id"] for j in jobs)
    check("integrity", max(ids.values()) == 1, f"{sum(1 for v in ids.values() if v > 1)} posting ids appear more than once")
    T = tax.for_roles(ROLES)
    known = {s["id"] for s in T["skills"]}
    stray = {k for j in jobs for k in j["skills"] if k not in known}
    check("integrity", not stray, f"skill ids in the processed file that are not in the taxonomy: {sorted(stray)[:8]}")
    check("integrity", all(s["cluster"] in T["clusters"] for s in T["skills"]), "a skill names a cluster that does not exist")
    us = collections.Counter(j["family"] for j in jobs if j["country"] == "United States")
    # A posting carries the role the rules gave it at extraction. A role added or redrawn since then shows here as
    # postings whose stored role differs from the current rules (stale), and as a role with no postings that those
    # stale postings would fill: that role waits for `pipeline.extract --roles mba`, and is reported, not failed.
    stale = collections.Counter((j["family"], roles_mba.family(j["title"], j.get("category"), j["company"])) for j in jobs
                                if roles_mba.family(j["title"], j.get("category"), j["company"]) != j["family"])
    awaiting = {to for (_, to), n in stale.items() if to and not us[to]}
    # a role that joined the rules after the last scrape has had no search of its own yet: it waits for a scrape
    last_scrape = max((j.get("last_seen") or "") for j in jobs)
    unscraped = {f for f, day in roles_mba.ADDED.items() if not us[f] and f not in awaiting and day > last_scrape}
    empty = [f for f in roles_mba.FAMILY_LABELS if not us[f] and f not in awaiting and f not in unscraped]
    check("integrity", not empty, f"roles with no US postings: {empty}")
    if unscraped:
        out(f"  roles added after the last scrape ({last_scrape}), waiting for pipeline.scrape --roles mba: {sorted(unscraped)}")
    if stale:
        out(f"  {sum(stale.values())} postings carry a role the current rules would not give (the rules changed after the last extraction): "
            + ", ".join(f"{a or 'none'} -> {b or 'none'} {n}" for (a, b), n in stale.most_common(6)) + (f"; roles waiting for re-extraction: {sorted(awaiting)}" if awaiting else ""))
    check("integrity", set(us) <= set(roles_mba.FAMILY_LABELS), f"postings carry a role that is not in the role list: {set(us) - set(roles_mba.FAMILY_LABELS)}")
    check("integrity", all(j["level"] in roles_mba.LEVEL_ORDER and j.get("ladder") in roles_mba.LADDERS for j in jobs), "a posting has a level or a ladder outside the lists")
    check("integrity", all(j.get("entry", 0) in roles_mba.ENTRY_VALUES + (None,) and isinstance(j.get("intern"), bool) for j in jobs), "a posting has no entry mark, or one outside the allowed values")
    check("integrity", all((j["entry_src"] in roles_mba.ENTRY_SOURCES) == (j["entry"] is not None) for j in jobs), "a posting has an entry mark without its source, or a source without a mark")
    check("integrity", all(isinstance(j.get("open"), bool) and j.get("first_seen") and j.get("last_seen") for j in jobs), "a posting lacks open, first_seen or last_seen")
    check("integrity", all(j["open"] or j["last_seen"] >= (__import__("datetime").date.today() - __import__("datetime").timedelta(days=extract.KEEP_CLOSED_DAYS)).isoformat() for j in jobs), "a closed posting older than the limit is still counted")
    none = sum(1 for j in jobs if j["country"] is None)
    check("integrity", none / len(jobs) < 0.01, f"{none} postings have no location at all")
    out(f"  {len(reg)} employers, {len(jobs):,} postings, {sum(us.values()):,} in the United States, {none} with no location; smallest roles: "
        + ", ".join(f"{f} {n}" for f, n in sorted(us.items(), key=lambda x: x[1])[:4]))
    out(f"  {totals[('integrity', 'pass')]} pass, {totals[('integrity', 'fail')]} fail")
    return jobs


def graph(jobs):
    out("\n== graph files")
    part = "graph"
    data = os.path.join(ROOT, "web", "data")
    read = lambda f: json.load(open(os.path.join(data, f)))
    G = read(f"graph_{ROLES}.json")
    product = read("graph.json")
    check(part, set(product) <= set(G), f"the index lacks keys of graph.json: {set(product) - set(G)}")
    check(part, G["jobs"] == [], "the index carries jobs; they belong in the role files")
    check(part, list(G["families"]) == list(roles_mba.FAMILY_LABELS) and G["levels"] == roles_mba.LEVEL_ORDER, "families or levels differ from pipeline/roles_mba.py")
    check(part, set(G["level_labels"]) == set(G["levels"]) and all(set(l["levels"]) <= set(G["levels"]) for l in G["ladders"].values()), "level labels do not cover the levels")
    # a role with no postings (added since the last extraction) is in roles with n 0 and in no group; every other role is in exactly one
    filled = sorted(f for f in G["families"] if G["roles"][f]["n"])
    check(part, sorted(f for g in G["groups"] for f in g["families"]) == filled, "the groups do not hold every role with postings exactly once, or hold an empty one")
    sk = set(G["skill_ids"])
    check(part, [s["id"] for s in G["skills"]] == G["skill_ids"] == [s["id"] for s in tax.for_roles(ROLES)["skills"]], "skills differ from the taxonomy")
    us = [j for j in jobs if j["country"] == "United States"]
    want_n = collections.Counter(j["family"] for j in us)
    seen_ids, total, worst = set(), 0, (0, None)
    ekey = lambda j: (j["entry"] + ("_intern" if j["intern"] else "")) if j["entry"] else None
    ecount = lambda js: {k: {"n": sum(1 for j in js if ekey(j) == k), "posted": sum(1 for j in js if ekey(j) == k and j["entry_src"] in ("title", "text"))} for k in ("mba", "mba_intern", "pre_mba", "pre_mba_intern")}
    by_id = {(j["company"], j["url"]): j for j in us}
    marked = collections.Counter()
    job_keys = set(product["jobs"][0])
    for f in G["families"]:
        F = read(G["meta"]["files"][f])
        rows = F["jobs"]
        total += len(rows)
        check(part, len(rows) == want_n[f] == G["roles"][f]["n"], f"{f}: {len(rows)} postings in its file, {G['roles'][f]['n']} in the index, {want_n[f]} US postings extracted")
        if not rows:
            out(f"  {f}: no postings yet (its file is empty, the index lists it with n 0 and in no group)")
            continue
        check(part, all(j["family"] == f and j["country"] == "United States" for j in rows), f"{f}: a posting of another role or another country")
        check(part, all(job_keys <= set(j) for j in rows), f"{f}: a posting lacks fields that graph.json postings have: {job_keys - set(rows[0]) if rows else ''}")
        check(part, all(j["level"] in G["levels"] and j["ladder"] in G["ladders"] for j in rows), f"{f}: a level or ladder outside the lists")
        check(part, all(j.get("entry", 0) in roles_mba.ENTRY_VALUES + (None,) and isinstance(j.get("intern"), bool) and (j.get("entry_src") in roles_mba.ENTRY_SOURCES) == (j["entry"] is not None) for j in rows), f"{f}: an entry mark is missing or outside the allowed values")
        check(part, all((j["entry"], j["intern"], j["entry_src"]) == tuple(by_id[(j["company"], j["url"])][k] for k in ("entry", "intern", "entry_src")) for j in rows), f"{f}: an entry mark differs from the processed file")
        check(part, G["roles"][f].get("entry") == {l: ecount([j for j in rows if j["ladder"] == l]) for l in G["roles"][f]["by_ladder"]}, f"{f}: the entry counts in the index do not add up to the file")
        marked.update((j["ladder"], ekey(j)) for j in rows if j["entry"])
        check(part, all(isinstance(j.get("open"), bool) for j in rows) and sum(1 for j in rows if j["open"]) == G["roles"][f].get("n_open"), f"{f}: open marks are missing or do not add up to the index")
        check(part, all(0 <= i < len(G["skill_ids"]) for j in rows for i in j["skills"]) and all(0 <= i < len(G["sub_ids"]) for j in rows for i in j["sub"]), f"{f}: a skill index out of range")
        check(part, not (seen_ids & {j["id"] for j in rows}), f"{f}: posting ids repeat across files")
        seen_ids |= {j["id"] for j in rows}
        # company balance: no employer above the cap (or three postings' worth) of the role's weight
        tot = sum(j["w"] for j in rows)
        by_c = collections.Counter()
        for j in rows:
            by_c[j["company"]] += j["w"]
        top = max(by_c.values()) / tot
        cap = max(balance.CAP, 3.0 / tot)  # three postings' worth is the least an employer is cut to
        check(part, top <= cap * 1.02, f"{f}: one employer weighs {top:.1%} of the role (cap {cap:.1%})")
        worst = max(worst, (top, f) if 3.0 / tot <= balance.CAP else (0, f))
        # the index's shares are the weighted shares of the file's postings
        R = G["roles"][f]
        for item in R["defining"][:2] + R["asks"][:3]:
            i = G["skill_ids"].index(item["id"])
            s = sum(j["w"] for j in rows if i in j["skills"]) / tot
            check(part, abs(s - item["share"]) < 0.002, f"{f}/{item['id']}: index share {item['share']}, from the file {s:.4f}")
        ids = {x["id"] for x in R["defining"]} & {x["id"] for x in R["asks"]}
        check(part, not ids, f"{f}: skills listed both as defining and as asked beyond that: {ids}")
        check(part, all(x["id"] in sk for x in R["defining"] + R["asks"] + R["credentials"]), f"{f}: an unknown skill id in the role's lists")
        check(part, all(x["share"] >= balance.DEFINING_SHARE and x["share"] >= balance.DEFINING_LIFT * x["elsewhere"] for x in R["defining"]), f"{f}: a defining skill below the thresholds")
        check(part, all(c in G["families"] for c in R["covers"] + R["covered_by"]), f"{f}: covers a role that does not exist")
        check(part, R["bytes"] == os.path.getsize(os.path.join(data, R["file"])), f"{f}: file size in the index is stale")
    check(part, total == G["meta"]["n_jobs"] == len(us) and seen_ids == set(range(total)), f"postings: {total} in files, {G['meta']['n_jobs']} in the index, {len(us)} extracted")
    check(part, all(G["ladders"][l].get("entry") == ecount([j for j in us if j["ladder"] == l]) for l in G["ladders"]), "the entry counts per ladder in the index do not add up to the postings")
    check(part, set(G["meta"].get("entry", {}).get("labels", {})) == {"mba", "mba_intern", "pre_mba", "pre_mba_intern"}, "the index lacks the labels of the entry mark")
    out("  entry marks (n, of which the posting says so): " + "; ".join(f"{l}: " + ", ".join(f"{k} {v['n']} ({v['posted']})" for k, v in G["ladders"][l]["entry"].items()) for l in G["ladders"]))
    check(part, os.path.getsize(os.path.join(data, f"graph_{ROLES}.json")) < 2.5e6, "the index is above 2.5 MB; it is loaded on every visit")
    ev = read(G["meta"]["evidence"])
    us_urls = {j["url"] for j in us}
    check(part, set(ev) <= sk and all(e["url"] in us_urls for groups in ev.values() for lst in groups.values() for e in lst), "evidence names an unknown skill or quotes a posting that is not shown")
    # roles_<set>.json
    rules = read(f"roles_{ROLES}.json")
    check(part, {f["id"] for f in rules["families"]} == set(G["families"]) and all(f["label"] == G["families"][f["id"]] for f in rules["families"]), "roles file: families differ from the graph")
    check(part, all(set(f["covers"]) | set(f["covered_by"]) <= set(G["families"]) for f in rules["families"]), "roles file: covers a role that does not exist")
    # the product files this build must leave alone
    P = tax.for_roles("product")
    check(part, read("taxonomy.json") == P, "web/data/taxonomy.json is no longer the product part of the taxonomy")
    # graph.json holds the product families of its last build: a family added to pipeline/roles.py since shows up at the next
    check(part, [s["id"] for s in product["skills"]] == [s["id"] for s in P["skills"]] and {"pm", "tpm", "pmm", "product_ops", "product_analyst", "product_owner"} <= set(product["families"]) <= set(roles.FAMILY_LABELS), "web/data/graph.json changed shape")
    sizes = sorted((G["roles"][f].get("bytes", 0), f) for f in G["families"] if G["roles"][f]["n"])   # an empty role has no size
    out(f"  {total:,} postings in {len(G['families'])} role files ({sum(b for b, _ in sizes) / 1e6:.1f} MB; largest {sizes[-1][1]} {sizes[-1][0] / 1e6:.2f} MB, smallest {sizes[0][1]} {sizes[0][0] / 1e3:.0f} KB);"
        f" index {os.path.getsize(os.path.join(data, f'graph_{ROLES}.json')) / 1e6:.2f} MB; heaviest employer in a role: {worst[0]:.1%} ({worst[1]})")
    out(f"  {totals[(part, 'pass')]} pass, {totals[(part, 'fail')]} fail")


def js(jobs):
    out("\n== JavaScript reader of roles_mba.json against pipeline/roles_mba.py")
    seen = {}
    for j in jobs:
        seen.setdefault((j["title"], j["company"], j.get("category"), j.get("industry")), None)
    for r in load("titles_mba.json")["rows"]:
        seen.setdefault((r["title"], r["company"], r["category"], r.get("industry")), None)
    rows = [{"title": t, "company": c, "category": cat, "industry": ind} for t, c, cat, ind in seen]
    # the entry mark is also compared with the posting text, on the labelled postings that carry one
    for r in load("entry_mba.json")["rows"]:
        text, yoe = entry_text(r)
        rows.append({"title": r["title"], "company": r["company"], "category": r["category"], "industry": r.get("industry"), **({"text": text, "yoe": yoe} if text else {})})
    try:
        res = subprocess.run(["node", os.path.join(HERE, "roles_mba.mjs")], input=json.dumps(rows), capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as e:
        check("js", False, f"node evals/roles_mba.mjs did not run: {getattr(e, 'stderr', e)}")
        return
    bad = 0
    for r, got in zip(rows, json.loads(res.stdout)):
        pf = roles_mba.family(r["title"], r["category"], r["company"])
        lv = roles_mba.level(r["title"], r["company"], r["category"], r["industry"], pf)
        want = (pf, lv, roles_mba.ladder(r["title"], r["company"], r["category"], r["industry"], pf), *roles_mba.entry(r["title"], r["company"], r["category"], r["industry"], pf, lv, r.get("text"), r.get("yoe")))
        f = tuple(got)
        if f != want:
            bad += 1
            if bad <= 5:
                out(f"  differs: {r['title']!r} at {r['company']}: python {want}, javascript {f}")
    check("js", bad == 0, f"{bad} of {len(rows)} titles read differently")
    out(f"  {len(rows):,} titles (role, level, ladder, entry mark): {len(rows) - bad:,} read the same, {bad} differ")


def matcher():
    out("\n== web/match.js reads the graph unchanged")
    try:
        res = subprocess.run(["node", os.path.join(HERE, "graph_mba.mjs")], capture_output=True, text=True)
    except OSError as e:
        check("matcher", False, f"node did not run: {e}")
        return
    tail = res.stdout.strip().split("\n")[-1] if res.stdout.strip() else res.stderr.strip()[:300]
    check("matcher", res.returncode == 0, tail)
    out("  " + tail)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()
    want = lambda p: not args.only or args.only == p
    per = None
    if want("titles"):
        titles()
    if want("entry"):
        entry()
    if want("backlog"):
        backlog()
    if want("countries"):
        countries()
    if want("golden"):
        per = golden()
    if want("sponsorship"):
        sponsorship_part()
    jobs = integrity() if any(want(p) for p in ("integrity", "graph", "js")) else None
    if want("graph"):
        graph(jobs)
    if want("js"):
        js(jobs)
    if want("matcher"):
        matcher()
    p = sum(v for (_, k), v in totals.items() if k == "pass")
    f = sum(v for (_, k), v in totals.items() if k == "fail")
    out(f"\nTOTAL: {p} pass, {f} fail")
    if args.baseline:
        if args.only or f:
            sys.exit("the baseline is written from a full run with no failures")
        md = ["# Pipeline eval baseline: the MBA role set", "",
              f"Generated by `.venv/bin/python evals/run_pipeline.py --baseline` on {time.strftime('%Y-%m-%d')}. Do not edit by hand.", "", "```", *[l.lstrip("\n") for l in lines], "```", "",
              "## Golden postings: what the tagger misses and wrongly tags", "",
              "A skill marked * is shared with the product map: a change to its patterns also moves the product graph.", "",
              "| posting | employer | must: missed | must not: tagged |", "|---|---|---|---|"]
        only = {s["id"] for s in tax.for_roles(ROLES)["skills"] if s.get("only")}
        mark = lambda k: k if k in only else k + "*"
        for r, m, fl in per:
            md.append(f"| {r['title'][:70]} | {r['company']} | {', '.join(map(mark, m)) or '–'} ({len(r['must']) - len(m)}/{len(r['must'])} found) | {', '.join(map(mark, fl)) or '–'} |")
        with open(os.path.join(HERE, f"pipeline_baseline_{ROLES}.md"), "w") as fh:
            fh.write("\n".join(md) + "\n")
        print("wrote evals/pipeline_baseline_mba.md")
    sys.exit(1 if f else 0)


if __name__ == "__main__":
    main()
