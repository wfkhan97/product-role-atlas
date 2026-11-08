"""Every open US posting of the three role sets in one file, for Find jobs (PLAN.md v19, step B4). Reads the graph files
the build writes and nothing else: no network, no .env. Idempotent: the same inputs give the same bytes.

  web/data/jobs_open.json   one row per open US posting of the product set (web/data/graph.json: every row is open;
                            the US slice is country == "United States"), of the MBA set (web/data/graph_mba/<role>.json:
                            open true and country equal to the index meta's) and of the tech set (graph_tech/<role>.json,
                            the same rule). Column-oriented so the screen loads it
                            fast: the companies, locations, roles and titles are lists, and a row is
                              [num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, flags, skills[], url, firstSeen, yoe, posted, start]
                            num is the posting's own number (the id is p<num>, m<num> or t<num>); levelIdx indexes
                            levels[<set>]; flags is a bit field (FLAGS: bit 1 marks the MBA set, 256 the tech set, 512
                            the tech set's new-graduate mark, 1024 a title that says the job is for new graduates, in
                            any set: GRAD_TITLE); skills index this file's own skill_ids, the union of the
                            three sets'; url is the posting's URL minus its company's url_prefix; yoe is the
                            years of experience the posting asks for, or null. firstSeen is the day our scrape first
                            saw the posting (MBA and tech sets; it clusters on scrape days); posted is the board's own
                            posting date (build_graph posted_day, YYYY-MM-DD), or null. start is the year a
                            graduate title says the job starts (the first of 2026 to 2029 in a title with bit 1024), or
                            null. A row's skills are the ones a
                            person can learn or show: no credential (years, degrees, licences, clearance: years is its
                            own column and clearance a flag) and no industry (cluster domain) unless it defines the
                            posting's MBA or tech role. No snippet, no sub-skills. web/jobs.js rowsOf(file) expands it.
  web/data/jobs_meta.json   the counts alone (home reads this, never the big file), per set and without the tech set,
                            so a site with CONFIG.TECH_ENABLED off counts what it shows.

  .venv/bin/python -m pipeline.jobs_open
"""
import glob, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "web", "data")
OUT = os.path.join(DATA, "jobs_open.json")
META = os.path.join(DATA, "jobs_meta.json")
PRODUCT_NS = "product."   # web/atlas.js productKey: the product set's family ids live under their own namespace
TECH_NS = "tech."         # web/atlas.js techKey: the tech set's the same way
US = "United States"
# the bits of a row's flags (web/jobs.js FLAGS reads the same)
FLAGS = {"mba": 1, "intern": 2, "remote": 4, "entry_mba": 8, "entry_pre_mba": 16, "sponsor_yes": 32, "sponsor_no": 64, "clearance": 128,
         "tech": 256, "entry_grad": 512, "grad_title": 1024}
CLEARANCE = "security_clearance"   # the credential the clearance flag reads
# A title that says the job is for new graduates, in any set: the product set has no entry mark of its own and the
# MBA set's marks miss titles like "Associate Product Manager, New Grad (2027 Start)". Each form names graduates, a
# campus hire or a start class; "campus" and "university" alone do not count, since a title like "Product Marketing,
# Campus and Branch" or "Product Manager - ServiceNow University" names a place or a product. A year counts only when a
# word for a start, a degree or graduates follows it within a few words, so "2026 Roadmap" is not a mark.
GRAD_TITLE = re.compile(
    r"\b(?:new[- ]?grad(?:uate)?s?|(?:university|college)\s+(?:grad(?:uate)?|hire)s?|early[- ]career"
    r"|campus\s+(?:hire|program|recruit\w*|20\d\d)|graduate\s+(?:program|programme|scheme|hire|trainee|rotation\w*)"
    r"|rotational|class\s+of\s+20\d\d"
    r"|20(?:2[6-9])\W+(?:\w+\W+){0,4}?(?:start\w*|grad(?:uate)?s?|mba|university|new\s+grad))\b", re.I)
# A title can name graduates and still not be a graduate's job: an internship whose row lacks the intern flag ("2027
# MBA Intern – Product Manager"), a co-op, or a job that runs the graduate programs ("Head of Early Career Recruiting",
# "University Recruiter (Early Career)", "Sr Director, Program Management - Early Career & Rotational Programming").
NOT_A_GRAD_JOB = re.compile(r"\b(?:intern(?:ships?|s)?|co-?op|recruiters?|head\s+of|director|onboarding|programming)\b", re.I)
# the start year a graduate title names: the first of 2026 to 2029 in it
START_YEAR = re.compile(r"\b(202[6-9])\b")

NOTE = ("Every open posting of the site's US slice, the three role sets, for Find jobs. Column-oriented: companies, "
        "locations, roles and titles are lists; a row is [num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, "
        "flags, skills, url, firstSeen, yoe, posted, start]; role_labels names each role. The id is p<num> (product, the index into graph.json jobs), m<num> (MBA, "
        "the row id in graph_mba/<role>.json) or t<num> (tech, the row id in graph_tech/<role>.json); flags: 1 MBA set, 2 internship, 4 remote, 8 MBA entry, 16 bachelor's "
        "entry, 32 says it sponsors, 64 says it does not, 128 asks for a security clearance, 256 tech set, 512 tech entry for new graduates, 1024 the title says the job is for new graduates (any set, never an internship); levelIdx indexes levels[set]; skills index skill_ids; url "
        "is the posting's URL after its company's url_prefix; yoe is the years asked, or null; firstSeen is the day our scrape first saw the posting and posted the board's own posting date (YYYY-MM-DD), each or null; start is the year 2026 to 2029 a graduate title names, or null. Skills leave out credentials and the industries that do not define the posting's role. Written by pipeline.jobs_open; rows are sorted by set (product, MBA, tech), "
        "then by number. web/jobs.js rowsOf expands it.")


def read(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class Column:
    """A list of distinct values in first-seen order, and the index of each."""

    def __init__(self):
        self.values, self.index = [], {}

    def idx(self, key, value=None):
        if key not in self.index:
            self.index[key] = len(self.values)
            self.values.append(key if value is None else value)
        return self.index[key]


def flags_of(set_, j, clearance=False):
    f = FLAGS["mba"] if set_ == "mba" else FLAGS["tech"] if set_ == "tech" else 0
    if clearance:
        f |= FLAGS["clearance"]
    if j.get("intern"):
        f |= FLAGS["intern"]
    if j.get("remote"):
        f |= FLAGS["remote"]
    entry = j.get("entry") if set_ == "mba" else None
    if entry == "mba":
        f |= FLAGS["entry_mba"]
    elif entry == "pre_mba":
        f |= FLAGS["entry_pre_mba"]
    # the tech set has one entry mark of its own (pipeline/roles_tech.py entry: "grad" or None)
    if set_ == "tech" and j.get("entry") == "grad":
        f |= FLAGS["entry_grad"]
    # the title's own mark, for every set; an internship stays an internship even when its title names graduates
    if not j.get("intern") and grad_title(j.get("title")):
        f |= FLAGS["grad_title"]
    if j.get("sponsorship") == "yes":
        f |= FLAGS["sponsor_yes"]
    elif j.get("sponsorship") == "no":
        f |= FLAGS["sponsor_no"]
    return f


def grad_title(title):
    """Whether a title says the job is for new graduates (GRAD_TITLE) and is not an internship or a recruiter's."""
    return bool(GRAD_TITLE.search(title or "")) and not NOT_A_GRAD_JOB.search(title or "")


def start_of(title, flags):
    """The year a graduate job starts, from its title: the first of 2026 to 2029 when the title carries the graduate
    mark, else None. A year on a title without the mark (a product's version, a fiscal year) says nothing of a start."""
    m = START_YEAR.search(title or "") if flags & FLAGS["grad_title"] else None
    return int(m.group(1)) if m else None


def common_prefix(urls):
    """The longest common prefix of a company's URLs, cut at its last "/"; "" with fewer than two URLs or when the
    prefix stops before the host's own path ("https://" alone saves nothing)."""
    urls = [u for u in urls if u]
    if len(urls) < 2:
        return ""
    p = urls[0]
    for u in urls[1:]:
        n = 0
        while n < len(p) and n < len(u) and p[n] == u[n]:
            n += 1
        p = p[:n]
    p = p[:p.rfind("/") + 1]
    return p if "/" in p[p.find("://") + 3:] else ""


def build():
    product = read(os.path.join(DATA, "graph.json"))
    mba = read(os.path.join(DATA, "graph_mba.json"))
    tech = read(os.path.join(DATA, "graph_tech.json"))
    graphs = {"product": product, "mba": mba, "tech": tech}
    country = mba.get("meta", {}).get("country") or US
    tech_country = tech.get("meta", {}).get("country") or US
    skill_ids = sorted(set(product["skill_ids"]) | set(mba["skill_ids"]) | set(tech["skill_ids"]))
    remap = {k: i for i, k in enumerate(skill_ids)}
    levels = {s: g["levels"] for s, g in graphs.items()}
    # which of a posting's skills it keeps: credentials never (years and clearance have their own column and flag);
    # an industry (cluster domain) only when it defines the posting's MBA or tech role (roles.<id>.defining, the
    # field doing the work: fintech for treasury). The product roles have no defining list, so none of theirs.
    cluster = {s: {k["id"]: k["cluster"] for k in g["skills"]} for s, g in graphs.items()}
    defining = {f: {a["id"] for a in r.get("defining", [])} for f, r in mba["roles"].items()}
    defining.update({TECH_NS + f: {a["id"] for a in r.get("defining", [])} for f, r in tech["roles"].items()})
    def keeps(set_, role, sid):
        c = cluster[set_].get(sid)
        return c != "credentials" and (c != "domain" or (set_ != "product" and sid in defining.get(role, ())))
    # (set, num, job, role) for every open US posting, in the file's order: product by index, then MBA by row id, then
    # tech by row id
    found = []
    for j in product["jobs"]:
        if j.get("country") == country:
            found.append(("product", int(j["id"]), j, PRODUCT_NS + j["family"]))
    n_product = len(found)
    for path in sorted(glob.glob(os.path.join(DATA, "graph_mba", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        d = read(path)
        for j in d["jobs"]:
            if j.get("open", True) and j.get("country") == country:
                found.append(("mba", int(j["id"]), j, d["family"]))
    for path in sorted(glob.glob(os.path.join(DATA, "graph_tech", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        d = read(path)
        for j in d["jobs"]:
            if j.get("open", True) and j.get("country") == tech_country:
                found.append(("tech", int(j["id"]), j, TECH_NS + d["family"]))
    ORDER = {"product": 0, "mba": 1, "tech": 2}
    found.sort(key=lambda t: (ORDER[t[0]], t[1]))
    companies, locations, roles, titles = Column(), Column(), Column(), Column()
    # the role's name, so the screen names a product role without loading graph.json
    role_labels = {PRODUCT_NS + f: label for f, label in product["families"].items()}
    role_labels.update({f: r["label"] for f, r in mba["roles"].items()})
    role_labels.update({TECH_NS + f: r["label"] for f, r in tech["roles"].items()})
    urls_by_company = {}
    for set_, num, j, role in found:
        urls_by_company.setdefault(j["company"], []).append(j.get("url") or "")
    rows = []
    for set_, num, j, role in found:
        c = companies.idx(j["company"], {"name": j["company"], "group": j["group"], "sector": j.get("sector"), "url_prefix": ""})
        prefix = companies.values[c]["url_prefix"] = common_prefix(urls_by_company[j["company"]])
        url = j.get("url") or ""
        ids = [graphs[set_]["skill_ids"][i] for i in j.get("skills", [])]
        flags = flags_of(set_, j, CLEARANCE in ids)
        rows.append([
            num, c, roles.idx(role), titles.idx(j["title"]), levels[set_].index(j["level"]),
            locations.idx(j.get("location") or ""), flags,
            sorted(remap[k] for k in ids if keeps(set_, role, k)),
            url[len(prefix):] if url.startswith(prefix) else url, j.get("first_seen"), j.get("yoe"),
            j.get("posted"), start_of(j["title"], flags),
        ])
    generated = time.strftime("%Y-%m-%d")
    out = {
        "_note": NOTE, "generated": generated, "country": country, "skill_ids": skill_ids,
        "levels": levels, "level_labels": {s: g["level_labels"] for s, g in graphs.items()},
        "flags": FLAGS, "companies": companies.values, "locations": locations.values, "roles": roles.values,
        "role_labels": {r: role_labels[r] for r in roles.values}, "titles": titles.values, "rows": rows,
    }
    set_of = lambda r: "tech" if r[6] & FLAGS["tech"] else "mba" if r[6] & FLAGS["mba"] else "product"
    by_set = {}
    for s in ("product", "mba", "tech"):
        js = [r for r in rows if set_of(r) == s]
        by_set[s] = {"n_open": len(js), "n_companies": len({r[1] for r in js})}
    # the counts a site with the tech set switched off shows (web/config.js TECH_ENABLED): the employers overlap
    # across sets, so the count without tech is its own number, not a difference
    rest = [r for r in rows if set_of(r) != "tech"]
    meta = {
        "generated": generated, "n_open": len(rows), "n_companies": len(companies.values),
        "by_set": by_set, "without_tech": {"n_open": len(rest), "n_companies": len({r[1] for r in rest})},
        "n_roles": len(roles.values),
    }
    assert meta["n_open"] == n_product + by_set["mba"]["n_open"] + by_set["tech"]["n_open"]
    return out, meta


def main():
    out, meta = build()
    os.makedirs(DATA, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    with open(META, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
        f.write("\n")
    size = os.path.getsize(OUT)
    print(f"jobs_open.json: {meta['n_open']} open US postings ({meta['by_set']['product']['n_open']} product, "
          f"{meta['by_set']['mba']['n_open']} MBA, {meta['by_set']['tech']['n_open']} tech), {meta['n_companies']} companies, {meta['n_roles']} roles, "
          f"{len(out['skill_ids'])} skill ids, {len(out['titles'])} titles, {len(out['locations'])} locations, "
          f"{size:,} bytes ({size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
