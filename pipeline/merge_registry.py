"""Merge the per-source registry files into data/registry.json.

Fortune entries come from the hand-verified registry_fortune_{a,b,c}.json (ranks 1-50), the automatic
discovery pass (data/raw/discovery/*.json) and agent-verified registry_fortune_agents_*.json files;
later sources override earlier ones only when they are verified. Every Fortune entry gets its tier,
industry and sector from fortune500_2026.json. Startups: every verified a16z / Sequoia board.
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
SECTORS = json.load(open(os.path.join(ROOT, "pipeline", "sectors.json")))
IND2SEC = {i: s for s, l in SECTORS.items() for i in l}
STARTUP_SECTOR = {  # a16z verticals -> sector (approximate)
    "enterprise": "Technology", "infra": "Technology", "consumer": "Media, Telecom & Hospitality", "fintech": "Financials",
    "bio + health": "Health Care", "american dynamism": "Industrials & Manufacturing", "crypto": "Financials", "games": "Media, Telecom & Hospitality",
}


def load(pattern):
    out = []
    for p in sorted(glob.glob(os.path.join(RAW, pattern))):
        try:
            d = json.load(open(p))
            out.extend(d if isinstance(d, list) else [d])
        except Exception as e:
            print("skip", p, e)
    return out


def tier(rank):
    return "fortune50" if rank <= 50 else "fortune100" if rank <= 100 else "fortune250" if rank <= 250 else "fortune500"


def main():
    f500 = {r["company"]: r for r in json.load(open(os.path.join(RAW, "fortune500_2026.json")))}
    by_rank = {r["rank"]: r for r in f500.values()}
    fortune = {}
    # precedence: hand-verified (a/b/c) > agents > auto discovery; a verified entry beats an unverified one
    for src, rows in (("auto", load("discovery/*.json")), ("agents", load("registry_fortune_agents_*.json")), ("hand", load("registry_fortune_[abc].json"))):
        for r in rows:
            rank = r.get("rank")
            if rank is None:
                continue
            cur = fortune.get(rank)
            if cur is None or (r.get("verified") and (not cur.get("verified") or src == "hand")):
                r = {k: v for k, v in r.items() if k not in ("candidates", "seconds")}
                r["source"] = src
                fortune[rank] = r
    reg = []
    for rank in sorted(by_rank):
        base = by_rank[rank]
        r = fortune.get(rank) or {"company": base["company"], "rank": rank, "ats": "unsupported", "config": {}, "verified": False, "notes": "not yet discovered"}
        r["company"] = base["company"]
        r["group"] = tier(rank)
        r["industry"] = base["industry"]
        r["sector"] = IND2SEC.get(base["industry"], "Other")
        r["state"] = base.get("state")
        if not r.get("verified"):
            r["ats"] = "unsupported"
        reg.append(r)
    seen = {r["company"].lower() for r in reg}
    for inv, pattern in (("a16z", "registry_a16z.json"), ("Sequoia", "registry_sequoia.json")):
        rows = [r for r in load(pattern) if r.get("verified") and r.get("ats") in ("greenhouse", "lever", "ashby", "workday")]
        rows.sort(key=lambda r: -(r.get("pm_postings") or 0))
        for r in rows:
            if r["company"].lower() in seen:
                continue
            seen.add(r["company"].lower())
            r["group"] = inv.lower(); r["investor"] = inv
            vert = (r.get("verticals") or "").split(";")[0].strip().lower()
            r["sector"] = STARTUP_SECTOR.get(vert, "Startup (unclassified)")
            r["industry"] = r.get("verticals") or None
            reg.append(r)
    json.dump(reg, open(os.path.join(ROOT, "data", "registry.json"), "w"), indent=1)
    import collections
    f = [r for r in reg if r["group"].startswith("fortune")]
    print("fortune:", collections.Counter((r["group"], r["ats"] != "unsupported") for r in f))
    print("startups:", collections.Counter(r["group"] for r in reg if not r["group"].startswith("fortune")))
    print("ats mix:", collections.Counter(r["ats"] for r in reg).most_common())


if __name__ == "__main__":
    main()
