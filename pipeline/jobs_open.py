"""Every open US posting of both role sets in one file, for Find jobs (PLAN.md v19, step B4). Reads the graph files
the build writes and nothing else: no network, no .env. Idempotent: the same inputs give the same bytes.

  web/data/jobs_open.json   one row per open US posting of the product set (web/data/graph.json: every row is open;
                            the US slice is country == "United States") and of the MBA set (web/data/graph_mba/<role>.json:
                            open true and country equal to the index meta's). Column-oriented so the screen loads it
                            fast: the companies, locations, roles and titles are lists, and a row is
                              [num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, flags, skills[], url, firstSeen]
                            num is the posting's own number (the id is p<num> or m<num>); levelIdx indexes
                            levels[<set>]; flags is a bit field (FLAGS); skills index this file's own skill_ids, the
                            union of both sets'; url is the posting's URL minus its company's url_prefix. No snippet,
                            no sub-skills, no yoe. web/jobs.js rowsOf(file) expands it to row objects.
  web/data/jobs_meta.json   the counts alone (home reads this, never the big file).

  .venv/bin/python -m pipeline.jobs_open
"""
import glob, json, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "web", "data")
OUT = os.path.join(DATA, "jobs_open.json")
META = os.path.join(DATA, "jobs_meta.json")
PRODUCT_NS = "product."   # web/atlas.js productKey: the product set's family ids live under their own namespace
US = "United States"
# the bits of a row's flags (web/jobs.js FLAGS reads the same)
FLAGS = {"mba": 1, "intern": 2, "remote": 4, "entry_mba": 8, "entry_pre_mba": 16, "sponsor_yes": 32, "sponsor_no": 64}

NOTE = ("Every open posting of the site's US slice, both role sets, for Find jobs. Column-oriented: companies, "
        "locations, roles and titles are lists; a row is [num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, "
        "flags, skills, url, firstSeen]; role_labels names each role. The id is p<num> (product, the index into graph.json jobs) or m<num> (MBA, "
        "the row id in graph_mba/<role>.json); flags: 1 MBA set, 2 internship, 4 remote, 8 MBA entry, 16 bachelor's "
        "entry, 32 says it sponsors, 64 says it does not; levelIdx indexes levels[set]; skills index skill_ids; url "
        "is the posting's URL after its company's url_prefix. Written by pipeline.jobs_open; rows are sorted by set, "
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


def flags_of(set_, j):
    f = FLAGS["mba"] if set_ == "mba" else 0
    if j.get("intern"):
        f |= FLAGS["intern"]
    if j.get("remote"):
        f |= FLAGS["remote"]
    entry = j.get("entry") if set_ == "mba" else None
    if entry == "mba":
        f |= FLAGS["entry_mba"]
    elif entry == "pre_mba":
        f |= FLAGS["entry_pre_mba"]
    if j.get("sponsorship") == "yes":
        f |= FLAGS["sponsor_yes"]
    elif j.get("sponsorship") == "no":
        f |= FLAGS["sponsor_no"]
    return f


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
    country = mba.get("meta", {}).get("country") or US
    skill_ids = sorted(set(product["skill_ids"]) | set(mba["skill_ids"]))
    remap = {k: i for i, k in enumerate(skill_ids)}
    levels = {"product": product["levels"], "mba": mba["levels"]}
    # (set, num, job, role) for every open US posting, in the file's order: product by index, then MBA by row id
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
    found.sort(key=lambda t: (t[0] != "product", t[1]))
    companies, locations, roles, titles = Column(), Column(), Column(), Column()
    # the role's name, so the screen names a product role without loading graph.json
    role_labels = {PRODUCT_NS + f: label for f, label in product["families"].items()}
    role_labels.update({f: r["label"] for f, r in mba["roles"].items()})
    urls_by_company = {}
    for set_, num, j, role in found:
        urls_by_company.setdefault(j["company"], []).append(j.get("url") or "")
    rows = []
    for set_, num, j, role in found:
        c = companies.idx(j["company"], {"name": j["company"], "group": j["group"], "sector": j.get("sector"), "url_prefix": ""})
        prefix = companies.values[c]["url_prefix"] = common_prefix(urls_by_company[j["company"]])
        url = j.get("url") or ""
        rows.append([
            num, c, roles.idx(role), titles.idx(j["title"]), levels[set_].index(j["level"]),
            locations.idx(j.get("location") or ""), flags_of(set_, j),
            sorted(remap[(product if set_ == "product" else mba)["skill_ids"][i]] for i in j.get("skills", [])),
            url[len(prefix):] if url.startswith(prefix) else url, j.get("first_seen"),
        ])
    generated = time.strftime("%Y-%m-%d")
    out = {
        "_note": NOTE, "generated": generated, "country": country, "skill_ids": skill_ids,
        "levels": levels, "level_labels": {"product": product["level_labels"], "mba": mba["level_labels"]},
        "flags": FLAGS, "companies": companies.values, "locations": locations.values, "roles": roles.values,
        "role_labels": {r: role_labels[r] for r in roles.values}, "titles": titles.values, "rows": rows,
    }
    by_set = {}
    for s, bit in (("product", 0), ("mba", FLAGS["mba"])):
        js = [r for r in rows if (r[6] & FLAGS["mba"]) == bit]
        by_set[s] = {"n_open": len(js), "n_companies": len({r[1] for r in js})}
    meta = {
        "generated": generated, "n_open": len(rows), "n_companies": len(companies.values),
        "by_set": by_set, "n_roles": len(roles.values),
    }
    assert meta["n_open"] == n_product + by_set["mba"]["n_open"]
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
          f"{meta['by_set']['mba']['n_open']} MBA), {meta['n_companies']} companies, {meta['n_roles']} roles, "
          f"{len(out['skill_ids'])} skill ids, {len(out['titles'])} titles, {len(out['locations'])} locations, "
          f"{size:,} bytes ({size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
