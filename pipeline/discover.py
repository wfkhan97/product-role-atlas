"""Automatic careers-site discovery for the Fortune 500.

For each company: find its website (Wikipedia infobox), probe likely careers URLs, look for ATS
signatures in the HTML/redirects, derive an adapter config, and verify it by running the adapter
with a single query. Writes data/raw/discovery/<rank>.json and a merged registry_fortune_auto.json.

usage: python -m pipeline.discover --from 51 --to 100 [--workers 6] [--force]
"""
import argparse
import json
import os
import re
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.adapters import ADAPTERS
from pipeline.roles import title_ok

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "raw", "discovery")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})

OVERRIDE_DOMAINS = {}  # company -> domain, filled from data/raw/domain_overrides.json if present

SIG = [
    ("workday", re.compile(r"https?://([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_\-]+)")),
    ("greenhouse", re.compile(r"(?:boards|job-boards)\.greenhouse\.io/([a-z0-9_-]+)")),
    ("greenhouse", re.compile(r"boards-api\.greenhouse\.io/v1/boards/([a-z0-9_-]+)")),
    ("lever", re.compile(r"jobs\.lever\.co/([a-z0-9_-]+)")),
    ("ashby", re.compile(r"jobs\.ashbyhq\.com/([a-z0-9_-]+)")),
    ("eightfold", re.compile(r"https?://([a-z0-9.-]+\.eightfold\.ai)")),
    ("smartrecruiters", re.compile(r"(?:jobs|careers)\.smartrecruiters\.com/([A-Za-z0-9_-]+)")),
    ("icims", re.compile(r"https?://([a-z0-9-]+\.icims\.com)")),
    ("oracle_hcm", re.compile(r"https?://([a-z0-9.-]+\.oraclecloud\.com)/hcmUI/CandidateExperience/[a-z-]+/sites/([A-Za-z0-9_]+)")),
    ("successfactors", re.compile(r"https?://([a-z0-9.-]+)/(?:search/|job/|go/)[^\"']*", re.I)),  # only used with the SF marker below
    ("taleo", re.compile(r"https?://([a-z0-9-]+\.taleo\.net)/careersection/([^/\"']+)")),
    ("phenom", re.compile(r"phApp\.|phenompeople|/widgets", re.I)),
    ("radancy", re.compile(r"/search-jobs/results|radancy|tmpwidget", re.I)),
    ("jibe", re.compile(r"/api/jobs\?|jibeapply|\"jibe\"", re.I)),
    ("paradox", re.compile(r"paradox\.ai|olivia", re.I)),
]
SF_MARK = re.compile(r"successfactors|jobTitle-link|rf\.jobsearch|sap\.com", re.I)


import threading
WIKI_LOCK = threading.Lock()


def clearbit_domain(name):
    try:
        r = S.get("https://autocomplete.clearbit.com/v1/companies/suggest", params={"query": name}, timeout=15)
        hits = r.json()
        if not hits:
            return None
        # prefer an exact (case-insensitive) name match, else the first suggestion
        for h in hits:
            if h.get("name", "").lower() == name.lower():
                return h["domain"].lower()
        return hits[0]["domain"].lower()
    except Exception:
        return None


def find_domain(name):
    return clearbit_domain(name) or wiki_domain(name)


WIKI = requests.Session()
WIKI.headers.update({"User-Agent": "product-role-atlas/1.0 (careers-site discovery script)"})


def wiki_domain(name):
    """Website from the English Wikipedia infobox (rate-limited: one request per second)."""
    try:
      with WIKI_LOCK:
        time.sleep(1.2)
        r = WIKI.get("https://en.wikipedia.org/w/api.php", params={"action": "query", "list": "search", "srsearch": name + " company", "format": "json", "srlimit": 1}, timeout=20)
        hits = r.json().get("query", {}).get("search", [])
        if not hits:
            return None
        title = hits[0]["title"]
        time.sleep(1.2)
        r = WIKI.get("https://en.wikipedia.org/w/api.php", params={"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "titles": title, "format": "json", "formatversion": 2}, timeout=20)
        wikitext = r.json()["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
        wikitext = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", wikitext, flags=re.S)
        m = re.search(r"\|\s*website\s*=\s*(?:\{\{URL\|)?\s*(?:https?://)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})", wikitext, re.I)
        return m.group(1).lower() if m else None
    except Exception:
        return None


def fetch(url, timeout=20):
    try:
        r = S.get(url, timeout=timeout, allow_redirects=True)
        return r
    except requests.RequestException:
        return None


CAREER_LINK = re.compile(r'href=["\']([^"\']*(?:career|jobs|join-us|joinus|work-with-us|employment|opportunit)[^"\']*)["\']', re.I)
SEARCH_LINK = re.compile(r'href=["\']([^"\']*(?:search|jobs|openings|positions|find-a-job|job-search|all-jobs|explore)[^"\']*)["\']', re.I)


def absolutize(base, href):
    if href.startswith("//"):
        return "https:" + href
    if href.startswith("http"):
        return href
    p = urlparse(base)
    if href.startswith("/"):
        return f"{p.scheme}://{p.netloc}{href}"
    return f"{p.scheme}://{p.netloc}/{href}"


def follow_links(html, base, rx, limit=6):
    out = []
    for m in rx.finditer(html):
        u = absolutize(base, m.group(1).split("#")[0])
        if u.startswith("http") and not re.search(r"\.(pdf|png|jpg|svg|css|js)(\?|$)", u, re.I) and u not in out:
            out.append(u)
        if len(out) >= limit:
            break
    return out


def workday_guess(domain):
    """Try the obvious Workday tenants for this domain; the landing redirect reveals the site name."""
    root = domain.split(".")[0].replace("-", "")
    found = []
    for n in (1, 3, 5, 12, 103, 10):
        host = f"{root}.wd{n}.myworkdayjobs.com"
        try:
            r = S.get(f"https://{host}/", timeout=12, allow_redirects=True)
        except requests.RequestException:
            continue
        m = re.search(r"https?://[^/]+/(?:[a-z]{2}-[A-Z]{2}/)?([A-Za-z0-9_\-]+)", r.url)
        if r.status_code == 200 and m and m.group(1).lower() not in ("wday", "login") and "myworkdayjobs" in r.url:
            found.append({"host": host, "tenant": root, "site": m.group(1)})
            break
    return found


def candidates(domain):
    base = domain
    return [f"https://careers.{base}", f"https://jobs.{base}", f"https://www.{base}/careers", f"https://www.{base}/careers/", f"https://{base}/careers",
            f"https://www.{base}/jobs", f"https://www.{base}/about/careers", f"https://www.{base}/en/careers", f"https://www.{base}/company/careers",
            f"https://www.{base}/en-us/careers", f"https://www.{base}/careers/jobs", f"https://www.{base}/about-us/careers", f"https://www.{base}/en/careers.html",
            f"https://www.{base.split('.')[0]}careers.com", f"https://{base.split('.')[0]}careers.com", f"https://careers.{base.split('.')[0]}.com",
            f"https://{base}", f"https://www.{base}"]


def detect(html, final_url):
    found = []
    text = html + "\n" + final_url
    for ats, rx in SIG:
        if ats == "successfactors":
            if SF_MARK.search(text) and re.search(r'class="jobTitle-link"|/search/\?q=|rf\.jobsearch', text):
                h = urlparse(final_url).netloc
                found.append(("successfactors", {"host": h}))
            continue
        for m in rx.finditer(text):
            if ats == "workday":
                host, site = m.group(1), m.group(2)
                if site.lower() in ("wday", "login", "job", "jobs"):
                    continue
                found.append(("workday", {"host": host, "tenant": host.split(".")[0], "site": site}))
            elif ats in ("greenhouse", "lever", "ashby", "smartrecruiters"):
                found.append((ats, {"board": m.group(1)} if ats != "smartrecruiters" else {"company": m.group(1)}))
            elif ats == "eightfold":
                h = m.group(1)
                found.append(("eightfold", {"host": h, "domain": h.replace(".eightfold.ai", "") + ".com", "api": "pcsx"}))
            elif ats == "icims":
                found.append(("icims", {"host": m.group(1)}))
            elif ats == "oracle_hcm":
                found.append(("oracle_hcm", {"host": m.group(1), "siteNumber": m.group(2)}))
            elif ats == "taleo":
                found.append(("taleo", {"host": m.group(1), "careersection": m.group(2)}))
            elif ats in ("phenom", "radancy", "jibe", "paradox"):
                found.append((ats, {"host": urlparse(final_url).netloc}))
            if len(found) > 12:
                break
    # de-dup preserving order
    seen, uniq = set(), []
    for f in found:
        k = json.dumps(f, sort_keys=True)
        if k not in seen:
            seen.add(k); uniq.append(f)
    return uniq


def reachable(ats, cfg):
    """Does the board answer at all? (The scraper paginates further than this check.)"""
    try:
        if ats == "workday":
            r = S.post(f"https://{cfg['host']}/wday/cxs/{cfg['tenant']}/{cfg['site']}/jobs", json={"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "product"},
                       headers={"Accept": "application/json", "Content-Type": "application/json"}, timeout=20)
            return r.status_code == 200 and r.json().get("total", 0) > 0
        if ats == "eightfold":
            r = S.get(f"https://{cfg['host']}/api/pcsx/search?domain={cfg['domain']}&query=product&location=&start=0&sort_by=relevance", timeout=20)
            return r.status_code == 200 and bool(r.json().get("data", {}).get("positions"))
        if ats == "oracle_hcm":
            r = S.get(f"https://{cfg['host']}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&finder=findReqs;siteNumber={cfg['siteNumber']},keyword=%22product%22,limit=5,offset=0", headers={"Accept": "application/json"}, timeout=20)
            return r.status_code == 200 and bool(r.json().get("items", [{}])[0].get("requisitionList"))
        if ats == "greenhouse":
            r = S.get(f"https://boards-api.greenhouse.io/v1/boards/{cfg['board']}/jobs", timeout=20); return r.status_code == 200 and bool(r.json().get("jobs"))
        if ats == "ashby":
            r = S.get(f"https://api.ashbyhq.com/posting-api/job-board/{cfg['board']}", timeout=20); return r.status_code == 200 and bool(r.json().get("jobs"))
        if ats == "lever":
            r = S.get(f"https://api.lever.co/v0/postings/{cfg['board']}?mode=json", timeout=20); return r.status_code == 200 and bool(r.json())
        if ats == "smartrecruiters":
            r = S.get(f"https://api.smartrecruiters.com/v1/companies/{cfg['company']}/postings?limit=5", timeout=20); return r.status_code == 200 and bool(r.json().get("content"))
    except Exception:
        return False
    return False


def verify(company, ats, cfg):
    if ats not in ADAPTERS:
        return False, "no adapter", 0
    try:
        c = dict(cfg); c["queries"] = ["product manager", "product management"]
        kw = {"max_pages": 2} if ats not in ("greenhouse", "lever", "ashby", "smartrecruiters") else {}
        jobs = ADAPTERS[ats](company, c, title_ok, **kw)
        if jobs:
            return True, jobs[0]["title"], len(jobs[0]["description"])
        if reachable(ats, cfg):
            return True, "(board reachable; no product title on first pages)", 0
        return False, "0 product postings", 0
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e)[:80]}", 0


def eightfold_probe(domain):
    """Many Fortune 500 sites run Eightfold under careers.<domain>; test directly."""
    for host in (f"careers.{domain}", f"jobs.{domain}", f"apply.careers.{domain}"):
        r = fetch(f"https://{host}/api/pcsx/search?domain={domain}&query=product%20manager&location=&start=0&sort_by=relevance", 15)
        if r is not None and r.status_code == 200 and "positions" in r.text[:2000]:
            return {"host": host, "domain": domain, "api": "pcsx"}
    return None


def discover(row, force=False):
    rank, name = row["rank"], row["company"]
    path = os.path.join(OUT, f"{rank:03d}.json")
    if os.path.exists(path) and not force:
        return json.load(open(path))
    rec = {"company": name, "rank": rank, "group": "fortune500", "industry": row.get("industry"), "ats": "unsupported", "config": {}, "verified": False, "notes": "", "candidates": []}
    t0 = time.time()
    domain = OVERRIDE_DOMAINS.get(name) or find_domain(name)
    rec["domain"] = domain
    if not domain:
        rec["notes"] = "no website found"
        json.dump(rec, open(path, "w"), indent=1); return rec
    rec["config"] = {"careers_url": f"https://www.{domain}/careers"}
    tried = set()
    STRONG = ("workday", "greenhouse", "lever", "ashby", "eightfold", "oracle_hcm", "smartrecruiters", "icims", "successfactors", "taleo")

    def consider(url, depth):
        if url in tried or len(tried) > 40:
            return False
        tried.add(url)
        r = fetch(url)
        if r is None or r.status_code >= 400 or not r.text:
            return False
        final = r.url
        for ats, cfg in detect(r.text, final):
            k = (ats, json.dumps(cfg, sort_keys=True))
            if k in {(c["ats"], json.dumps(c["config"], sort_keys=True)) for c in rec["candidates"]}:
                continue
            rec["candidates"].append({"ats": ats, "config": cfg, "from": final})
        if any(c["ats"] in STRONG for c in rec["candidates"]):
            return True
        if depth < 2:
            for nxt in follow_links(r.text, final, CAREER_LINK if depth == 0 else SEARCH_LINK):
                if consider(nxt, depth + 1):
                    return True
        return False

    for url in candidates(domain):
        if consider(url, 0):
            break
    for cfg in workday_guess(domain):
        rec["candidates"].insert(0, {"ats": "workday", "config": cfg, "from": "tenant guess"})
    ef = eightfold_probe(domain)
    if ef:
        rec["candidates"].insert(0, {"ats": "eightfold", "config": ef, "from": "probe"})
    # try candidates in priority order
    prio = {"workday": 0, "eightfold": 1, "greenhouse": 2, "ashby": 2, "lever": 2, "oracle_hcm": 3, "smartrecruiters": 3, "icims": 4, "successfactors": 5, "jibe": 5, "phenom": 6, "radancy": 6, "paradox": 7, "taleo": 8}
    for cand in sorted(rec["candidates"], key=lambda c: prio.get(c["ats"], 9)):
        ok, info, chars = verify(name, cand["ats"], cand["config"])
        cand["verify"] = info
        if ok:
            rec.update(ats=cand["ats"], config=cand["config"], verified=True, sample_title=info, description_chars=chars)
            break
    if not rec["verified"]:
        rec["notes"] = "candidates: " + "; ".join(f"{c['ats']} {c.get('verify', '')}" for c in rec["candidates"]) if rec["candidates"] else "no ATS signature found on careers pages"
        if rec["candidates"]:
            rec["ats"] = rec["candidates"][0]["ats"]; rec["config"] = rec["candidates"][0]["config"]
    rec["seconds"] = round(time.time() - t0)
    json.dump(rec, open(path, "w"), indent=1)
    print(f"[{'ok' if rec['verified'] else '--'}] {rank:3d} {name:32s} {rec['ats']:14s} {domain or '-':28s} {rec.get('sample_title') or rec['notes'][:70]}", flush=True)
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="lo", type=int, default=51)
    ap.add_argument("--to", dest="hi", type=int, default=100)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    ov = os.path.join(ROOT, "data", "raw", "domain_overrides.json")
    if os.path.exists(ov):
        OVERRIDE_DOMAINS.update(json.load(open(ov)))
    rows = [r for r in json.load(open(os.path.join(ROOT, "data", "raw", "fortune500_2026.json"))) if args.lo <= r["rank"] <= args.hi and (not args.only or r["company"] in args.only)]
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(lambda r: discover(r, args.force), rows))
    ok = [r for r in results if r["verified"]]
    print(f"\n{len(ok)}/{len(results)} verified")
    import collections
    print(collections.Counter(r["ats"] for r in ok))


if __name__ == "__main__":
    main()
