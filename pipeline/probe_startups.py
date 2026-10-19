"""Find job boards for startup lists: python -m pipeline.probe_startups data/raw/portfolio_*.json

Input files: JSON arrays of {name, website?, stage?, status?, fund (id)} (one file per fund). Output:
data/raw/startup_boards.json (cache keyed by normalised company name) and data/raw/registry_startups.json
with one entry per company that has a Greenhouse / Lever / Ashby board and >= 1 product posting, with
the list of funds that back it.
"""
import glob
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests
import threading
LOCK = threading.Lock()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import log
from pipeline.roles import title_ok

logger = log.get(__name__)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
CACHE = os.path.join(RAW, "startup_boards.json")
S = requests.Session()
S.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"})
EXIT_WORDS = re.compile(r"acquired|ipo|public|exit|merged|shut ?down|closed", re.I)
SKIP = {"google", "apple", "amazon", "microsoft", "meta", "facebook", "nvidia", "uber", "airbnb", "stripe", "databricks", "openai", "anthropic"}
BOARD_RE = {
    "greenhouse": re.compile(r"(?:boards|job-boards)\.greenhouse\.io/([a-z0-9_-]+)|boards-api\.greenhouse\.io/v1/boards/([a-z0-9_-]+)"),
    "lever": re.compile(r"jobs\.lever\.co/([a-z0-9_-]+)"),
    "ashby": re.compile(r"jobs\.ashbyhq\.com/([a-z0-9_-]+)"),
}
PRODUCT_RE = re.compile(r"product (manager|management|lead|owner|operations|marketing|analyst)|head of product|director,? product|vp,? product|chief product|technical program manager", re.I)


STAGE_OK = re.compile(r"^(pre-?seed|seed|series [a-g])", re.I)
UNRELIABLE_STAGE_FUNDS = {"bessemer"}   # CMS default "seed" on nearly every company


def norm_stage(stage, fund):
    if not stage or fund in UNRELIABLE_STAGE_FUNDS:
        return None
    m = STAGE_OK.match(str(stage).strip())
    if not m:
        return None
    v = m.group(1).lower()
    return "Seed" if "seed" in v else "Series " + v[-1].upper()


def norm(name):
    return re.sub(r"[^a-z0-9]+", "", name.lower().replace("&", "and"))


def slugs(name, website):
    base = re.sub(r"\b(inc|llc|ltd|corp|co|labs?|technologies|technology|ai|io|hq|the)\b", "", name.lower())
    compact = re.sub(r"[^a-z0-9]", "", base)
    hyph = re.sub(r"[^a-z0-9]+", "-", base.strip()).strip("-")
    out = [compact, hyph, re.sub(r"[^a-z0-9]", "", name.lower())]
    if website:
        host = urlparse(website if website.startswith("http") else "https://" + website).netloc.replace("www.", "")
        root = host.split(".")[0]
        out += [root, root.replace("-", ""), host.replace(".", "")]
    out += [compact + "hq", compact + "ai", compact + "labs"]
    seen, uniq = set(), []
    for s in out:
        if s and len(s) > 1 and s not in seen:
            seen.add(s); uniq.append(s)
    return uniq[:9]


def fetch_board(ats, board):
    try:
        if ats == "greenhouse":
            r = S.get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs", timeout=15)
            if r.status_code != 200: return None
            jobs = r.json().get("jobs", []); return [(j.get("title", ""), j.get("absolute_url", "")) for j in jobs]
        if ats == "lever":
            r = S.get(f"https://api.lever.co/v0/postings/{board}?mode=json", timeout=15)
            if r.status_code != 200: return None
            d = r.json(); return [(j.get("text", ""), j.get("hostedUrl", "")) for j in d] if isinstance(d, list) else None
        if ats == "ashby":
            r = S.get(f"https://api.ashbyhq.com/posting-api/job-board/{board}", timeout=15)
            if r.status_code != 200: return None
            return [(j.get("title", ""), j.get("jobUrl", "")) for j in r.json().get("jobs", [])]
    except Exception as e:  # no board under this slug (or a bad answer): the next slug is tried
        logger.warning("%s board %r: %s: %s", ats, board, type(e).__name__, str(e)[:120])
        return None
    return None


def careers_scan(website):
    if not website:
        return []
    host = urlparse(website if website.startswith("http") else "https://" + website).netloc
    found = []
    for url in (f"https://{host}/careers", f"https://{host}/jobs", f"https://{host}/careers/", f"https://{host}/join", f"https://{host}/company/careers", f"https://{host}"):
        try:
            r = S.get(url, timeout=15, allow_redirects=True)
        except Exception as e:  # an unreachable careers URL is skipped
            logger.warning("GET %s failed: %s: %s", url, type(e).__name__, str(e)[:120])
            continue
        if r.status_code >= 400:
            continue
        for ats, rx in BOARD_RE.items():
            for m in rx.finditer(r.text + " " + r.url):
                b = m.group(1) or (m.group(2) if m.lastindex and m.lastindex >= 2 else None)
                if b and (ats, b) not in found:
                    found.append((ats, b))
        if found:
            break
    return found


def name_matches(company, titles_urls):
    """Guard against slug collisions: the company name (or its first word) should appear in the board URL or titles."""
    key = norm(company)[:6]
    blob = " ".join(u for _, u in titles_urls[:5]).lower() + " " + " ".join(t for t, _ in titles_urls[:30]).lower()
    return key in norm(blob) if key else True


def probe(company):
    name, website = company["name"], company.get("website")
    tried = [(ats, s) for s in slugs(name, website) for ats in ("ashby", "greenhouse", "lever")]
    for ats, b in tried:
        jobs = fetch_board(ats, b)
        if jobs is not None and len(jobs) > 0:
            if not name_matches(name, jobs) and not any(norm(name) == norm(b) for _ in [0]):
                continue
            return {"ats": ats, "board": b, "n_jobs": len(jobs), "pm": [t for t, _ in jobs if PRODUCT_RE.search(t) and title_ok(t)]}
    for ats, b in careers_scan(website):
        jobs = fetch_board(ats, b)
        if jobs:
            return {"ats": ats, "board": b, "n_jobs": len(jobs), "pm": [t for t, _ in jobs if PRODUCT_RE.search(t) and title_ok(t)], "via": "careers"}
    return {"ats": None}


def main():
    files = sys.argv[1:] or glob.glob(os.path.join(RAW, "portfolio_*.json"))
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    companies = {}
    for f in files:
        fund = os.path.basename(f)[len("portfolio_"):-5]
        for c in json.load(open(f)):
            if not c.get("name"):
                continue
            if EXIT_WORDS.search(str(c.get("status", ""))) or norm(c["name"]) in SKIP:
                continue
            if fund == "yc" and (c.get("team_size") or 0) < 15:
                continue  # seed-stage YC teams almost never have product postings; keep the probe tractable
            k = norm(c["name"])
            e = companies.setdefault(k, {"name": c["name"].strip(), "website": c.get("website"), "funds": [], "stages": [], "descriptions": []})
            if fund not in e["funds"]:
                e["funds"].append(fund)
            st = norm_stage(c.get("stage"), fund)
            if st:
                e["stages"].append(st)
            if c.get("description"):
                e["descriptions"].append(c["description"])
            if not e["website"] and c.get("website"):
                e["website"] = c["website"]
    todo = [k for k in companies if k not in cache]
    t = log.Timer()
    logger.info("probe_startups: %d companies from %d funds; %d to probe", len(companies), len(files), len(todo))

    def run(k):
        res = probe(companies[k]); res["checked"] = time.strftime("%Y-%m-%d")
        with LOCK:
            cache[k] = res
        if res.get("ats"):
            logger.info("[%s] %s %s %s jobs=%d pm=%d", "PM" if res["pm"] else "--", companies[k]["name"], res["ats"], res["board"], res["n_jobs"], len(res["pm"]))
        return k
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, _ in enumerate(ex.map(run, todo)):
            if i % 50 == 49:
                with LOCK:
                    snap = dict(cache)
                json.dump(snap, open(CACHE + ".tmp", "w")); os.replace(CACHE + ".tmp", CACHE)
                logger.info("%d/%d probed, %s", i + 1, len(todo), t)
    json.dump(cache, open(CACHE + ".tmp", "w")); os.replace(CACHE + ".tmp", CACHE)
    reg = []
    for k, c in companies.items():
        r = cache.get(k, {})
        if r.get("ats") and r.get("pm"):
            reg.append({"company": c["name"], "group": "startup", "ats": r["ats"], "config": {"board": r["board"]}, "verified": True,
                        "pm_postings": len(r["pm"]), "sample_title": r["pm"][0], "website": c["website"], "funds": c["funds"],
                        "stage_from_fund": max(c["stages"], key=lambda s: s or "") if c["stages"] else None, "description": (c["descriptions"] or [None])[0]})
    json.dump(reg, open(os.path.join(RAW, "registry_startups.json"), "w"), indent=1)
    import collections
    logger.info("probe_startups done in %s: %d companies with product postings; by ATS %s; by fund %s", t, len(reg),
                collections.Counter(r["ats"] for r in reg), collections.Counter(f for r in reg for f in r["funds"]).most_common(60))


if __name__ == "__main__":
    log.setup()
    main()
