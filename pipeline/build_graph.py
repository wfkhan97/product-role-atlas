"""Aggregate tagged postings into the graph the web app renders.

usage: python -m pipeline.build_graph  ->  web/data/graph.json (+ web/data/taxonomy.json)
"""
import collections
import glob
import itertools
import json
import math
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.roles import FAMILY_LABELS, LEVEL_LABELS, LEVEL_ORDER

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAX = json.load(open(os.path.join(ROOT, "pipeline", "taxonomy.json")))
DEPTH = {}
for _p in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
    DEPTH.update(json.load(open(_p)))

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
    shutil.copy(os.path.join(ROOT, "pipeline", "taxonomy.json"), os.path.join(ROOT, "web", "data", "taxonomy.json"))
    depth_subs = {sid: [{"id": s["id"], "name": s["name"], "patterns": s["patterns"]} for s in d.get("subskills", [])] for sid, d in DEPTH.items()}
    with open(os.path.join(ROOT, "web", "data", "subskills.json"), "w") as f:
        json.dump(depth_subs, f)
    print(f"graph: {n} jobs, {len(companies)} companies, {len(nodes)} skills, {len(edge_list)} edges")
    top = sorted(nodes, key=lambda x: -x["axes"]["seniority"])[:6]; bot = sorted(nodes, key=lambda x: x["axes"]["seniority"])[:6]
    print("most senior:", [(x["id"], round(x["axes"]["seniority"], 2)) for x in top]); print("most junior:", [(x["id"], round(x["axes"]["seniority"], 2)) for x in bot])
    print("mgmt side:", [x["id"] for x in sorted(nodes, key=lambda x: -x["axes"]["ic_mgmt"])[:6]], "IC side:", [x["id"] for x in sorted(nodes, key=lambda x: x["axes"]["ic_mgmt"])[:6]])
    print("tech side:", [x["id"] for x in sorted(nodes, key=lambda x: -x["axes"]["tech_comm"])[:6]], "commercial side:", [x["id"] for x in sorted(nodes, key=lambda x: x["axes"]["tech_comm"])[:6]])
    print("seniority ticks:", {k: round(v, 2) for k, v in out["meta"]["seniority_ticks"].items()})


if __name__ == "__main__":
    main()
