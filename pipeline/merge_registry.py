"""Merge the per-source registry files into data/registry.json.

Fortune entries come from the hand-verified registry_fortune_{a,b,c}.json (ranks 1-50), the automatic
discovery pass (data/raw/discovery/*.json) and agent-verified registry_fortune_agents_*.json files;
later sources override earlier ones only when they are verified. Every Fortune entry gets its tier,
industry and sector from fortune500_2026.json. Startups: every verified a16z / Sequoia board.
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import log

logger = log.get(__name__)
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
        except Exception as e:  # a file that does not parse is left out; the merge goes on with the others
            logger.warning("skipped %s: %s: %s", os.path.relpath(p, ROOT), type(e).__name__, e)
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
    funds = {f["id"]: f for f in json.load(open(os.path.join(RAW, "funds.json")))}
    startups = {}
    # legacy single-investor registries (a16z / Sequoia) + the multi-fund probe output
    for inv, pattern in (("a16z", "registry_a16z.json"), ("sequoia", "registry_sequoia.json"), (None, "registry_startups.json")):
        for r in load(pattern):
            if not (r.get("verified") and r.get("ats") in ("greenhouse", "lever", "ashby", "workday")):
                continue
            key = r["company"].lower()
            if key in seen:
                continue
            e = startups.get(key)
            fund_ids = r.get("funds") or ([inv] if inv else [])
            if e is None:
                e = dict(r); e["funds"] = []; e["group"] = "startup"
                vert = (r.get("verticals") or "").split(";")[0].strip().lower()
                e["sector"] = STARTUP_SECTOR.get(vert, "Startup (unclassified)")
                e["industry"] = r.get("verticals") or None
                e["stage_from_fund"] = r.get("stage_from_fund")
                startups[key] = e
            for fid in fund_ids:
                if fid in funds and fid not in e["funds"]:
                    e["funds"].append(fid)
            if r.get("stage_from_fund") and not e.get("stage_from_fund"):
                e["stage_from_fund"] = r["stage_from_fund"]
    sector_text = json.load(open(os.path.join(RAW, "startup_sector_text.json"))) if os.path.exists(os.path.join(RAW, "startup_sector_text.json")) else {}
    import re as _re
    KW = [('Health Care', 'health|bio|pharma|medic|clinic|therap|life science|care\\b|patient|genomic'), ('Financials', 'fintech|financ|payment|bank|insur|lending|credit|crypto|blockchain|web3|wealth|trading|defi'), ('Energy & Utilities', 'energy|climate|solar|battery|grid|carbon|nuclear|fusion|utilit'), ('Industrials & Manufacturing', 'robot|hardware|defense|aerospace|space\\b|industrial|manufactur|american dynamism|physical ai|semiconductor|chip|construction|materials'), ('Automotive & Transportation', 'mobility|autonom|vehicle|logistic|transport|fleet|supply chain|drone|aviation'), ('Retail', 'commerce|marketplace|retail|shopping|consumer goods|dtc|food|grocery|restaurant'), ('Media, Telecom & Hospitality', 'consumer|media|gaming|game|social|creator|entertain|travel|hospitality|sports|music|video'), ('Technology', 'enterprise|saas|software|infra|developer|devtool|ai\\b|machine learning|data|security|cloud|platform|b2b|productivity|analytics|api|open source|crypto infra|llm|agent')]
    def map_sector(text):
        t = (text or "").lower()
        for sec, rx in KW:
            if _re.search(rx, t):
                return sec
        return None
    for key, e in startups.items():
        if e.get("sector") in (None, "Startup (unclassified)"):
            k = _re.sub(r"[^a-z0-9]+", "", key.replace("&", "and"))
            e["sector"] = map_sector(sector_text.get(k, "") + " " + (e.get("description") or "")) or "Startup (unclassified)"
    # One job board is one employer. Fund portfolios name the same company differently ("Anduril" and
    # "Anduril Industries"), and each name would otherwise count the same postings again.
    def board(e):
        return (e["ats"], json.dumps(e.get("config", {}), sort_keys=True))
    def slug(name):
        return _re.sub(r"[^a-z0-9]+", "", name.lower())
    fortune_boards = {board(r) for r in reg if r["ats"] != "unsupported"}
    by_board = {}
    for key, e in startups.items():
        by_board.setdefault(board(e), []).append(key)
    merged = 0
    for b, keys in by_board.items():
        if b in fortune_boards:  # already listed as a Fortune company
            for k in keys:
                del startups[k]; merged += 1
            continue
        if len(keys) == 1:
            continue
        target = slug(str(startups[keys[0]].get("config", {}).get("board", "")))
        # keep the name the board itself uses, else the one most funds use, else the longer one
        keep = max(keys, key=lambda k: (slug(startups[k]["company"]) == target, len(startups[k]["funds"]), len(k)))
        for k in keys:
            if k != keep:
                startups[keep]["funds"] += [f for f in startups[k]["funds"] if f not in startups[keep]["funds"]]
                startups[keep].setdefault("also_listed_as", []).append(startups[k]["company"])
                del startups[k]; merged += 1
    logger.info("startup entries merged into another entry with the same job board: %d", merged)
    for e in startups.values():
        e["investor"] = ", ".join(funds[f]["name"] for f in e["funds"]) if e["funds"] else None
        e["investors"] = [funds[f]["name"] for f in e["funds"]]
        reg.append(e)
    json.dump(reg, open(os.path.join(ROOT, "data", "registry.json"), "w"), indent=1)
    import collections
    f = [r for r in reg if r["group"].startswith("fortune")]
    logger.info("registry.json: %d entries; fortune (tier, has adapter): %s", len(reg), collections.Counter((r["group"], r["ats"] != "unsupported") for r in f))
    st = [r for r in reg if r["group"] == "startup"]
    logger.info("startups: %d; by fund: %s", len(st), collections.Counter(f for r in st for f in r["funds"]).most_common(12))
    logger.info("ats mix: %s", collections.Counter(r["ats"] for r in reg).most_common())


if __name__ == "__main__":
    log.setup()
    main()
