"""Aggregate tagged postings into the graph the web app renders.

usage: python -m pipeline.build_graph              ->  web/data/graph.json (+ taxonomy.json, subskills.json)
       python -m pipeline.build_graph --roles mba  ->  web/data/graph_mba.json (index), web/data/graph_mba/<role>.json,
                                                       taxonomy_mba.json, subskills_mba.json, roles_mba.json
"""
import collections
import glob
import itertools
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.roles import FAMILY_LABELS, LEVEL_LABELS, LEVEL_ORDER

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from pipeline import processed, tax
TAX = tax.for_roles("product")  # the product map shows the product role set's part of the taxonomy
DEPTH = {}
for _p in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
    if not _p.endswith("_roles.json"):   # per-role credential steps, not a skill
        DEPTH.update(json.load(open(_p)))
DEPTH = {sid: d for sid, d in DEPTH.items() if sid in {s["id"] for s in TAX["skills"]}}

IC_LEVELS = ("senior", "staff")
MGMT_LEVELS = ("group", "director", "vp", "cpo")
TECH_SPECS = {"platform", "ai_ml", "data", "hardware_devices", "security_identity"}
COMM_SPECS = {"growth", "ads_marketing", "commerce", "enterprise_b2b", "payments_fintech"}


def share(jobs, key, sid):
    return sum(1 for j in jobs if sid in j[key]) / len(jobs) if jobs else 0.0


def log_ratio(a, b, floor=0.02):
    return math.log((a + floor) / (b + floor))


def normalise(vals):
    """Map a list of floats to [-1, 1] by rank-preserving min/max around the median."""
    xs = sorted(vals)
    lo, hi, med = xs[0], xs[-1], xs[len(xs) // 2]
    out = []
    for v in vals:
        if v >= med:
            out.append((v - med) / (hi - med) if hi > med else 0.0)
        else:
            out.append(-(med - v) / (med - lo) if med > lo else 0.0)
    return out


def main():
    jobs = json.load(open(os.path.join(ROOT, "data", "processed", "jobs.json")))
    evidence = json.load(open(os.path.join(ROOT, "data", "processed", "evidence.json")))
    reg = {r["company"]: r for r in json.load(open(os.path.join(ROOT, "data", "registry.json")))}
    inferred = json.load(open(os.path.join(ROOT, "data", "processed", "company_stage.json"))) if os.path.exists(os.path.join(ROOT, "data", "processed", "company_stage.json")) else {}
    funds = {f["id"]: f for f in json.load(open(os.path.join(ROOT, "data", "raw", "funds.json")))}
    def stage_of(company):
        r = reg.get(company, {})
        if not r.get("group", "").startswith("startup"):
            return None
        return inferred.get(company) or r.get("stage_from_fund") or "Unknown"
    for j in jobs:
        j["stage"] = stage_of(j["company"]); j["investors"] = reg.get(j["company"], {}).get("investors") or []
        if reg.get(j["company"], {}).get("sector"):
            j["sector"] = reg[j["company"]]["sector"]
    skills = TAX["skills"]
    n = len(jobs)
    by_level = {l: [j for j in jobs if j["level"] == l] for l in LEVEL_ORDER}
    ic_jobs = [j for j in jobs if j["level"] in IC_LEVELS]
    mgmt_jobs = [j for j in jobs if j["level"] in MGMT_LEVELS]
    tech_jobs = [j for j in jobs if j["family"] == "tpm" or (j["family"] == "pm" and TECH_SPECS & set(j["specs"]))]
    comm_jobs = [j for j in jobs if j["family"] == "pmm" or (j["family"] == "pm" and COMM_SPECS & set(j["specs"]))]
    level_weights = {l: i for i, l in enumerate(LEVEL_ORDER)}

    nodes, seniority_raw, ic_raw, tech_raw = [], [], [], []
    for s in skills:
        sid = s["id"]
        lv_share = {l: share(by_level[l], "skills", sid) for l in LEVEL_ORDER if len(by_level[l]) >= 20}
        # seniority: share-weighted centre of mass across levels (independent of how many postings each level has)
        tot = sum(lv_share.values()) or 1.0
        seniority = sum(level_weights[l] * v for l, v in lv_share.items()) / tot
        ic = log_ratio(share(mgmt_jobs, "skills", sid), share(ic_jobs, "skills", sid))
        tech = log_ratio(share(tech_jobs, "skills", sid), share(comm_jobs, "skills", sid))
        seniority_raw.append(seniority); ic_raw.append(ic); tech_raw.append(tech)
        d = DEPTH.get(sid, {})
        subs = []
        for sub in d.get("subskills", []):
            with_skill = [j for j in jobs if sid in j["skills"]]
            subs.append({"id": sub["id"], "name": sub["name"], "example": sub["example"],
                         "share": share(with_skill, "sub", sub["id"]),
                         "by_level": {l: share([j for j in by_level[l] if sid in j["skills"]], "sub", sub["id"]) for l in LEVEL_ORDER if len(by_level[l]) >= 20}})
        nodes.append({"id": sid, "name": s["name"], "cluster": s["cluster"], "share": share(jobs, "skills", sid),
                      "n": sum(1 for j in jobs if sid in j["skills"]),
                      "by_family": {f: share([j for j in jobs if j["family"] == f], "skills", sid) for f in FAMILY_LABELS},
                      "by_level": {l: share(by_level[l], "skills", sid) for l in LEVEL_ORDER},
                      "by_group": {g: share([j for j in jobs if j["group"] == g], "skills", sid) for g in ("fortune50", "fortune100", "fortune250", "fortune500", "startup")},
                      "by_sector": {g: share([j for j in jobs if j.get("sector") == g], "skills", sid) for g in sorted({j.get("sector") for j in jobs if j.get("sector")})},
                      "what": d.get("what", ""), "subskills": subs, "ladder": d.get("ladder"), "build": d.get("build", []),
                      "signals": d.get("signals", []), "evidence": evidence.get(sid, {})})
    # shrink rare skills toward the centre so a handful of postings can't fling them to an extreme
    K = 40
    mean_sen = sum(seniority_raw) / len(seniority_raw)
    seniority_raw = [(nd["n"] * v + K * mean_sen) / (nd["n"] + K) for nd, v in zip(nodes, seniority_raw)]
    ic_raw = [(nd["n"] * v) / (nd["n"] + K) for nd, v in zip(nodes, ic_raw)]
    tech_raw = [(nd["n"] * v) / (nd["n"] + K) for nd, v in zip(nodes, tech_raw)]
    # rank-based spread so the map uses the whole canvas; ticks are placed on the empirical distribution
    def ranks(vals):
        order = sorted(range(len(vals)), key=lambda i: vals[i])
        r = [0.0] * len(vals)
        for pos_, i in enumerate(order):
            r[i] = pos_ / max(1, len(vals) - 1)
        return r
    sen_sorted = sorted(seniority_raw)
    def cdf(v):
        return sum(1 for x in sen_sorted if x < v) / len(sen_sorted)
    lo, hi = min(seniority_raw), max(seniority_raw)
    for node, sen, ic, tech, sr in zip(nodes, seniority_raw, ranks(ic_raw), ranks(tech_raw), ranks(seniority_raw)):
        node["axes"] = {"seniority": sr, "ic_mgmt": ic * 2 - 1, "tech_comm": tech * 2 - 1, "seniority_raw": sen,
                        "ic_mgmt_raw": None, "tech_comm_raw": None}

    # co-occurrence edges (jaccard), keep top-6 per node
    cnt, single = collections.Counter(), collections.Counter()
    for j in jobs:
        ks = sorted(k for k in j["skills"] if not k.startswith("yoe_"))
        single.update(ks)
        cnt.update(itertools.combinations(ks, 2))
    edges = {}
    for (a, b), c in cnt.items():
        if c >= 5:
            edges[(a, b)] = {"n": c, "lift": (c * n) / (single[a] * single[b]), "jaccard": c / (single[a] + single[b] - c)}
    per_node = collections.defaultdict(list)
    for (a, b), e in edges.items():
        per_node[a].append((b, e)); per_node[b].append((a, e))
    keep = set()
    for a, lst in per_node.items():
        lst.sort(key=lambda x: -x[1]["jaccard"])
        for b, e in lst[:6]:
            keep.add(tuple(sorted((a, b))))
    edge_list = [{"source": a, "target": b, **edges[(a, b)]} for (a, b) in keep]

    companies = collections.OrderedDict()
    for j in jobs:
        c = companies.setdefault(j["company"], {"name": j["company"], "group": j["group"], "investor": j.get("investor"), "rank": j.get("rank"), "sector": j.get("sector"), "industry": j.get("industry"), "country": j.get("country"), "remote": j.get("remote"), "rank": j.get("rank"), "stage": j.get("stage"), "investors": j.get("investors"), "n": 0})
        c["n"] += 1

    skill_index = {s["id"]: i for i, s in enumerate(skills)}
    sub_ids = sorted({k for j in jobs for k in j.get("sub", [])})
    sub_index = {k: i for i, k in enumerate(sub_ids)}
    fund_by_name = {f["name"]: f["id"] for f in funds.values()}
    out = {
        "skill_ids": [s["id"] for s in skills], "sub_ids": sub_ids,
        "meta": {"generated": time.strftime("%Y-%m-%d"), "n_jobs": n, "n_companies": len(companies), "companies": list(companies.values()),
                 "seniority_ticks": {l: cdf(level_weights[l]) for l in LEVEL_ORDER},
                 "seniority_range": [lo, hi]},
        "sectors": sorted({j.get("sector") for j in jobs if j.get("sector")}),
        "funds": [{"id": f["id"], "name": f["name"], "type": f["type"], "parent": f.get("parent")} for f in funds.values()],
        "clusters": TAX["clusters"], "families": FAMILY_LABELS, "levels": LEVEL_ORDER, "level_labels": LEVEL_LABELS,
        "skills": nodes, "edges": edge_list,
        "jobs": [{"id": i, "company": j["company"], "group": j["group"], "title": j["title"],
                  "family": j["family"], "level": j["level"], "specs": j["specs"], "location": j["location"], "url": j["url"], "sector": j.get("sector"), "industry": j.get("industry"), "country": j.get("country"), "remote": j.get("remote"), "rank": j.get("rank"), "stage": j.get("stage"),
                  "investors": [fund_by_name.get(n, n) for n in (j.get("investors") or [])],
                  "yoe": j["yoe"], "skills": sorted(skill_index[k] for k in j["skills"]), "sub": sorted(sub_index[k] for k in j.get("sub", [])), "snippet": j["snippet"][:180]} for i, j in enumerate(jobs)],
    }
    os.makedirs(os.path.join(ROOT, "web", "data"), exist_ok=True)
    with open(os.path.join(ROOT, "web", "data", "graph.json"), "w") as f:
        json.dump(out, f)
    tax.dump(TAX, os.path.join(ROOT, "web", "data", "taxonomy.json"))
    depth_subs = {sid: [{"id": s["id"], "name": s["name"], "patterns": s["patterns"]} for s in d.get("subskills", [])] for sid, d in DEPTH.items()}
    with open(os.path.join(ROOT, "web", "data", "subskills.json"), "w") as f:
        json.dump(depth_subs, f)
    print(f"graph: {n} jobs, {len(companies)} companies, {len(nodes)} skills, {len(edge_list)} edges")
    top = sorted(nodes, key=lambda x: -x["axes"]["seniority"])[:6]; bot = sorted(nodes, key=lambda x: x["axes"]["seniority"])[:6]
    print("most senior:", [(x["id"], round(x["axes"]["seniority"], 2)) for x in top]); print("most junior:", [(x["id"], round(x["axes"]["seniority"], 2)) for x in bot])
    print("mgmt side:", [x["id"] for x in sorted(nodes, key=lambda x: -x["axes"]["ic_mgmt"])[:6]], "IC side:", [x["id"] for x in sorted(nodes, key=lambda x: x["axes"]["ic_mgmt"])[:6]])
    print("tech side:", [x["id"] for x in sorted(nodes, key=lambda x: -x["axes"]["tech_comm"])[:6]], "commercial side:", [x["id"] for x in sorted(nodes, key=lambda x: x["axes"]["tech_comm"])[:6]])
    print("seniority ticks:", {k: round(v, 2) for k, v in out["meta"]["seniority_ticks"].items()})


# ---- A role set other than product -------------------------------------------------------------------------------
# One index and one file per role. {**index, "jobs": the jobs of the role files you loaded} has the shape of
# graph.json, so web/match.js reads it as it is. The index holds what a comparison of roles needs (shares per
# role, what defines each role, levels); a role file holds that role's postings.
ROLE_MODULES = {"mba": "pipeline.roles_mba"}
COUNTRY = {"mba": "United States"}  # the one country a role set shows
R4 = lambda x: round(x, 4)


def wshare(pairs, sid):
    """Weighted share of (job, weight) pairs that carry a skill."""
    tot = sum(w for _, w in pairs)
    return sum(w for j, w in pairs if sid in j["skills"]) / tot if tot else 0.0


# The entry mark in plain words, for the interface (pipeline/roles_mba.py, entry()).
ENTRY_KEYS = ("mba", "mba_intern", "pre_mba", "pre_mba_intern")
ENTRY_META = {
    "fields": "On each posting: entry is \"mba\", \"pre_mba\" or null; intern is true for an internship, a co-op or a summer programme; "
              "entry_src is the evidence: \"title\" or \"text\" (the posting says who it is for), \"firm\" or \"category\" (the title is the grade that group joins at; "
              "the posting may also be open to experienced hires). null means an experienced-hire job or no evidence. The level of a posting is not changed by the mark.",
    "counts": "roles.<role>.entry.<ladder>.<key> = {n, posted}: n postings carry the mark, posted of them because the posting says so (entry_src title or text). "
              "n minus posted are marked by grade only. Closed postings count, as in every statistic.",
    "labels": {"mba": "A job for new MBA graduates", "mba_intern": "An MBA summer internship", "pre_mba": "A job for new bachelor's or master's graduates",
               "pre_mba_intern": "An internship for bachelor's or master's students"},
    "source_labels": {"posted": "The posting says so", "grade": "The title is the grade this group usually joins at"},
}


def entry_key(j):
    return (j["entry"] + ("_intern" if j.get("intern") else "")) if j.get("entry") else None


def entry_counts(js):
    out = {k: {"n": 0, "posted": 0} for k in ENTRY_KEYS}
    for j in js:
        k = entry_key(j)
        if k:
            out[k]["n"] += 1
            out[k]["posted"] += j.get("entry_src") in ("title", "text")
    return out


def build_roleset(roleset):
    import importlib
    import statistics
    from pipeline import balance
    R = importlib.import_module(ROLE_MODULES[roleset])
    T = tax.for_roles(roleset)
    depth = {}
    for p in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
        if not p.endswith("_roles.json"):
            depth.update(json.load(open(p)))
    known = {s["id"] for s in T["skills"]}
    depth = {sid: d for sid, d in depth.items() if sid in known}
    # per role and ladder: the licences, exams and degrees employers ask for, with their build steps (pipeline.depth_publish)
    rp = os.path.join(ROOT, "pipeline", "depth", f"{roleset}_roles.json")
    role_depth = json.load(open(rp)) if os.path.exists(rp) else {}
    proc = os.path.join(ROOT, "data", "processed")
    country = COUNTRY[roleset]
    jobs = [j for j in processed.load(roleset) if j["country"] == country]
    evidence = json.load(open(os.path.join(proc, f"evidence_{roleset}.json")))
    reg = {}
    from pipeline.scrape import load_registry
    for r in load_registry(roleset):
        reg[r["company"]] = r
    inferred = json.load(open(os.path.join(proc, f"company_stage_{roleset}.json")))
    funds = {f["id"]: f for f in json.load(open(os.path.join(ROOT, "data", "raw", "funds.json")))}
    fund_by_name = {f["name"]: f["id"] for f in funds.values()}
    for j in jobs:
        r = reg.get(j["company"], {})
        j["stage"] = (inferred.get(j["company"]) or r.get("stage_from_fund") or "Unknown") if r.get("group", "").startswith("startup") else None
        j["investors"] = r.get("investors") or []
        j["category"] = j.get("category") or r.get("category")
    # order: roles as the source list has them, postings in extraction order; ids run across the role files
    order = {f: i for i, f in enumerate(R.FAMILY_LABELS)}
    jobs.sort(key=lambda j: order[j["family"]])
    by_role = collections.defaultdict(list)
    for j in jobs:
        by_role[j["family"]].append(j)
    for f, js in by_role.items():
        # web/match.js looks at the first posting of a graph to see how skills are stored, so it must have some
        js.sort(key=lambda j: not j["skills"])
        for j, w in zip(js, balance.weights(js)):
            j["w"] = w
    sh, elsewhere, wcount, total_w = balance.role_shares(by_role)
    pairs = [(j, j["w"]) for j in jobs]
    n = len(jobs)
    levels = R.LEVEL_ORDER
    by_level = {l: [(j, j["w"]) for j in jobs if j["level"] == l] for l in levels}
    ladders = sorted({j["ladder"] for j in jobs})
    groups = sorted({j["group"] for j in jobs})
    sectors = sorted({j.get("sector") for j in jobs if j.get("sector")})
    ic = [p for p in pairs if p[0]["level"] in IC_LEVELS]
    mgmt = [p for p in pairs if p[0]["level"] in MGMT_LEVELS]
    level_weights = {l: i for i, l in enumerate(levels)}

    nodes, sen_raw, ic_raw = [], [], []
    for s in T["skills"]:
        sid = s["id"]
        lv = {l: wshare(by_level[l], sid) for l in levels if len(by_level[l]) >= 20}
        tot = sum(lv.values()) or 1.0
        sen_raw.append(sum(level_weights[l] * v for l, v in lv.items()) / tot)
        ic_raw.append(log_ratio(wshare(mgmt, sid), wshare(ic, sid)))
        d = depth.get(sid, {})
        with_skill = [p for p in pairs if sid in p[0]["skills"]]
        subs = [{"id": sub["id"], "name": sub["name"], "example": sub["example"],
                 "share": R4(sum(w for j, w in with_skill if sub["id"] in j["sub"]) / (sum(w for _, w in with_skill) or 1))} for sub in d.get("subskills", [])]
        nodes.append({"id": sid, "name": s["name"], "cluster": s["cluster"], "role_set_only": bool(s.get("only")),
                      "share": R4(wshare(pairs, sid)), "n": len(with_skill),
                      "by_family": {f: R4(sh(f, sid)) for f in R.FAMILY_LABELS if f in by_role and sh(f, sid) > 0},
                      "by_level": {l: R4(wshare(by_level[l], sid)) for l in levels},
                      "by_ladder": {l: R4(wshare([p for p in pairs if p[0]["ladder"] == l], sid)) for l in ladders},
                      "by_group": {g: R4(wshare([p for p in pairs if p[0]["group"] == g], sid)) for g in groups},
                      "by_sector": {g: R4(wshare([p for p in pairs if p[0].get("sector") == g], sid)) for g in sectors},
                      "what": d.get("what", ""), "subskills": subs, "ladder": d.get("ladder"), "build": d.get("build", []),
                      "signals": d.get("signals", [])})
    K = 40
    mean_sen = sum(sen_raw) / len(sen_raw)
    sen_raw = [(nd["n"] * v + K * mean_sen) / (nd["n"] + K) for nd, v in zip(nodes, sen_raw)]
    ic_raw = [(nd["n"] * v) / (nd["n"] + K) for nd, v in zip(nodes, ic_raw)]

    def ranks(vals):
        o = sorted(range(len(vals)), key=lambda i: vals[i])
        r = [0.0] * len(vals)
        for pos_, i in enumerate(o):
            r[i] = pos_ / max(1, len(vals) - 1)
        return r
    sen_sorted = sorted(sen_raw)
    for node, sen, icr, sr in zip(nodes, sen_raw, ranks(ic_raw), ranks(sen_raw)):
        # tech_comm is the product map's technical-vs-commercial axis; it has no meaning across these roles
        node["axes"] = {"seniority": R4(sr), "ic_mgmt": R4(icr * 2 - 1), "tech_comm": None, "seniority_raw": R4(sen), "ic_mgmt_raw": None, "tech_comm_raw": None}

    cnt, single = collections.Counter(), collections.Counter()
    for j in jobs:
        ks = sorted(k for k in j["skills"] if not k.startswith("yoe_") and k in known)
        single.update(ks)
        cnt.update(itertools.combinations(ks, 2))
    edges, per_node = {}, collections.defaultdict(list)
    for (a, b), c in cnt.items():
        if c >= 5:
            edges[(a, b)] = {"n": c, "lift": R4((c * n) / (single[a] * single[b])), "jaccard": R4(c / (single[a] + single[b] - c))}
            per_node[a].append((b, edges[(a, b)])); per_node[b].append((a, edges[(a, b)]))
    keep = set()
    for a, lst in per_node.items():
        lst.sort(key=lambda x: (-x[1]["jaccard"], x[0]))
        keep.update(tuple(sorted((a, b))) for b, _ in lst[:6])
    edge_list = [{"source": a, "target": b, **edges[(a, b)]} for (a, b) in sorted(keep)]

    companies = collections.OrderedDict()
    for j in jobs:
        c = companies.setdefault(j["company"], {"name": j["company"], "group": j["group"], "category": j.get("category"), "investor": j.get("investor"), "rank": j.get("rank"),
                                                "sector": j.get("sector"), "industry": j.get("industry"), "stage": j.get("stage"), "investors": j.get("investors"), "n": 0})
        c["n"] += 1

    skill_ids = [s["id"] for s in T["skills"]]
    skill_index = {k: i for i, k in enumerate(skill_ids)}
    sub_ids = sorted({k for j in jobs for k in j.get("sub", [])})
    sub_index = {k: i for i, k in enumerate(sub_ids)}
    out_dir = os.path.join(ROOT, "web", "data")
    role_dir = os.path.join(out_dir, f"graph_{roleset}")
    os.makedirs(role_dir, exist_ok=True)
    for old in glob.glob(os.path.join(role_dir, "*.json")):
        os.remove(old)
    generated = time.strftime("%Y-%m-%d")
    covered_by = collections.defaultdict(list)
    for a, bs in R.COVERS.items():
        for b in bs:
            covered_by[b].append(a)
    name = {s["id"]: s["name"] for s in T["skills"]}
    soft_or_cred = {s["id"] for s in T["skills"] if s["cluster"] == "credentials"}
    roles_out, files, jid = {}, {}, 0
    for f, label in R.FAMILY_LABELS.items():
        js = by_role.get(f, [])
        rows = []
        for j in js:
            rows.append({"id": jid, "company": j["company"], "group": j["group"], "title": j["title"], "family": f, "level": j["level"], "ladder": j["ladder"],
                         "entry": j.get("entry"), "intern": bool(j.get("intern")), "entry_src": j.get("entry_src"),
                         "w": R4(j["w"]), "open": j.get("open", True), "specs": j["specs"], "location": j["location"], "url": j["url"], "sector": j.get("sector"), "industry": j.get("industry"),
                         "category": j.get("category"), "country": j.get("country"), "remote": j.get("remote"), "rank": j.get("rank"), "stage": j.get("stage"),
                         "investors": [fund_by_name.get(x, x) for x in (j.get("investors") or [])], "yoe": j["yoe"],
                         "skills": sorted(skill_index[k] for k in j["skills"] if k in skill_index), "sub": sorted(sub_index[k] for k in j.get("sub", [])),
                         "snippet": j["snippet"][:180]})
            jid += 1
        rel = f"graph_{roleset}/{f}.json"
        with open(os.path.join(out_dir, rel), "w") as fh:
            json.dump({"family": f, "label": label, "generated": generated, "n_jobs": len(rows), "jobs": rows}, fh, ensure_ascii=False)
        files[f] = rel
        if not js:
            roles_out[f] = {"label": label, "group": R.GROUP_OF[f], "n": 0, "file": rel}
            continue
        defining = balance.defining(f, sh, elsewhere, wcount, known)
        asks = [k for k, _ in wcount[f].most_common() if k in known and k not in defining and sh(f, k) >= 0.1]
        lad = collections.Counter(j["ladder"] for j in js)
        roles_out[f] = {
            "label": label, "group": R.GROUP_OF[f], "n": len(js), "n_open": sum(1 for j in js if j.get("open", True)), "n_companies": len({j["company"] for j in js}), "small": len(js) < balance.SMALL,
            "file": rel, "bytes": os.path.getsize(os.path.join(out_dir, rel)),
            "skills_per_posting": statistics.median(len([k for k in j["skills"] if not k.startswith("yoe_")]) for j in js),
            # the role's own field: on nearly every posting and uncommon elsewhere. A reader takes it as given.
            "defining": [{"id": k, "share": R4(sh(f, k)), "elsewhere": R4(elsewhere(f, k))} for k in defining],
            # what the role asks for beyond that, most common first (credentials are listed apart)
            "asks": [{"id": k, "share": R4(sh(f, k))} for k in asks if k not in soft_or_cred],
            "credentials": [{"id": k, "share": R4(sh(f, k))} for k in asks if k in soft_or_cred],
            "by_level": {l: c for l in levels if (c := sum(1 for j in js if j["level"] == l))},
            "by_ladder": {l: {"n": c, "by_level": {x: y for x in levels if (y := sum(1 for j in js if j["ladder"] == l and j["level"] == x))}} for l, c in lad.most_common()},
            "ladder": lad.most_common(1)[0][0],
            # where a new graduate enters this role: postings marked for MBA and for pre-MBA graduates, per ladder
            "entry": {l: entry_counts([j for j in js if j["ladder"] == l]) for l, _ in lad.most_common()},
            "covers": R.COVERS.get(f, []), "covered_by": covered_by.get(f, []),
            # licences, exams and degrees that five employers name at entry level, per ladder, and the steps a source grounds
            "depth": {l: {"asks": x["asks"], "build": x["build"]} for l, x in role_depth.get(f, {}).items()},
        }
    index = {
        "skill_ids": skill_ids, "sub_ids": sub_ids,
        "meta": {"generated": generated, "role_set": roleset, "country": country, "n_jobs": n, "n_open": sum(1 for j in jobs if j.get("open", True)),
                 "n_companies": len(companies), "companies": list(companies.values()),
                 "backlog": "A posting with open false has closed. Do not list it or offer it as a target. It counts in every share and statistic.",
                 "seniority_ticks": {l: R4(sum(1 for x in sen_sorted if x < level_weights[l]) / len(sen_sorted)) for l in levels},
                 "seniority_range": [R4(min(sen_raw)), R4(max(sen_raw))],
                 "shares": {"balanced": True, "cap": balance.CAP, "small": balance.SMALL, "defining_share": balance.DEFINING_SHARE, "defining_lift": balance.DEFINING_LIFT,
                            "note": "Every share is company-balanced: a posting carries weight w, so that one employer counts for at most cap of a role."},
                 "entry": ENTRY_META,
                 "files": files, "evidence": f"graph_{roleset}/_evidence.json"},
        "sectors": sectors,
        "funds": [{"id": f["id"], "name": f["name"], "type": f["type"], "parent": f.get("parent")} for f in funds.values()],
        "clusters": T["clusters"], "families": dict(R.FAMILY_LABELS), "levels": levels, "level_labels": R.LEVEL_LABELS,
        "ladders": {k: {**v, "n": sum(1 for j in jobs if j["ladder"] == k), "entry": entry_counts([j for j in jobs if j["ladder"] == k])} for k, v in R.LADDERS.items()},
        "groups": [{"id": g, "label": label, "families": fs} for g, (label, fs) in R.GROUPS.items()],
        "roles": roles_out, "skills": nodes, "edges": edge_list, "jobs": [],
    }
    with open(os.path.join(out_dir, f"graph_{roleset}.json"), "w") as fh:
        json.dump(index, fh, ensure_ascii=False)
    # example sentences per skill and level group, from postings of the shown country; loaded when a skill is opened
    with open(os.path.join(role_dir, "_evidence.json"), "w") as fh:
        json.dump({sid: evidence.get(sid, {}) for sid in skill_ids if evidence.get(sid)}, fh, ensure_ascii=False)
    tax.dump(T, os.path.join(out_dir, f"taxonomy_{roleset}.json"))
    with open(os.path.join(out_dir, f"subskills_{roleset}.json"), "w") as fh:
        json.dump({sid: [{"id": x["id"], "name": x["name"], "patterns": x["patterns"]} for x in d.get("subskills", [])] for sid, d in depth.items()}, fh)
    rules = R.export()
    rules["generated"] = generated
    for fam in rules["families"]:
        fam["n"] = len(by_role.get(fam["id"], []))
    # employers we hold postings for, with what decides their rules and their ladder
    rules["employers"] = {c["name"]: {k: c[k] for k in ("category", "industry") if c.get(k)} for c in companies.values() if c.get("category") or c.get("industry") in R.BANK_INDUSTRIES}
    with open(os.path.join(out_dir, f"roles_{roleset}.json"), "w") as fh:
        fh.write(json.dumps(rules, indent=1, ensure_ascii=False) + "\n")
    sizes = sorted(((r.get("bytes", 0), f) for f, r in roles_out.items()), reverse=True)
    print(f"graph_{roleset}: {n} postings ({country}), {len(companies)} companies, {len(nodes)} skills, {len(edge_list)} edges")
    print(f"index {os.path.getsize(os.path.join(out_dir, f'graph_{roleset}.json')) / 1e6:.2f} MB; role files {sum(b for b, _ in sizes) / 1e6:.1f} MB in {len(files)} files; largest:",
          [(f, f"{b / 1e6:.2f} MB") for b, f in sizes[:4]])
    print("ladders:", {k: v["n"] for k, v in index["ladders"].items()}, "| roles with no postings:", [f for f, r in roles_out.items() if not r["n"]])


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", choices=["product"] + sorted(ROLE_MODULES), default="product")
    args = ap.parse_args()
    main() if args.roles == "product" else build_roleset(args.roles)
