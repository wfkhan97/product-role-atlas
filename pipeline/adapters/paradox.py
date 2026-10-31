"""Paradox-hosted careers sites (e.g. careers.fedex.com): HTML search pages + JSON-LD JobPosting on job pages."""
import json
import re
import time
from urllib.parse import quote
from .common import get, strip_html, job, SEARCH_QUERIES, listing_failed

LINK_RE = re.compile(r'href="((?:/[^"]*?)?/job/([^"?]+?))/?"')
LD_RE = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.S)
TITLE_RE = re.compile(r'href="(?:/[^"]*?)?/job/[^"?]+"[^>]*>(.*?)</a>', re.S)


def _job_posting(page):
    """The last JSON-LD JobPosting on a job page, or None."""
    posting = None
    for m in LD_RE.finditer(page):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        cands = d if isinstance(d, list) else [d]
        for c in cands:
            if isinstance(c, dict) and c.get("@type") == "JobPosting":
                posting = c
    return posting


def fetch(company, cfg, title_ok, max_pages=10):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            qp, pp, base = cfg.get("query_param", "keyword"), cfg.get("page_param"), cfg.get("search_path", "/jobs")
            if pp:
                url = f"https://{host}{base}?{qp}={quote(q)}&{pp}={page}"
            else:
                url = f"https://{host}{base}?{qp}={quote(q)}" if page == 1 else f"https://{host}{base}/page/{page}?{qp}={quote(q)}"
            r = get(url, listing=True)
            if r.status_code != 200:
                break
            links = list(dict.fromkeys(m.group(1) for m in LINK_RE.finditer(r.text)))
            if not links:
                break
            for path in links:
                seen.setdefault(path, None)
            time.sleep(0.4)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"paradox: stopped at the page cap for {q!r}")
    out = []
    for path in seen:
        r = get(f"https://{host}{path}")
        if r.status_code != 200:
            continue
        posting = _job_posting(r.text)
        if not posting:
            continue
        title = posting.get("title", "")
        if not title_ok(title):
            continue
        loc = posting.get("jobLocation") or {}
        if isinstance(loc, list):
            loc = loc[0] if loc else {}
        addr = loc.get("address", {}) if isinstance(loc, dict) else {}
        out.append(job(company, title, f"https://{host}{path}", strip_html(posting.get("description", "")),
                       location=", ".join(x for x in [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")] if isinstance(x, str) and x),
                       posted=posting.get("datePosted"), external_id=posting.get("identifier", {}).get("value") if isinstance(posting.get("identifier"), dict) else path.rsplit("/", 1)[-1]))
        time.sleep(0.3)
    return out


def still_open(company, cfg, posting):
    """True: the job page answers 200 with its JSON-LD JobPosting. False: the job page answers 404 or 410 (Paradox
    sites serve their "Page Not Found" or "this job has expired" page with a 404 for a job they no longer show).
    None: anything else."""
    url = posting.get("url") or ""
    if not url.startswith(f"https://{cfg['host']}/"):
        return None
    r = get(url)
    if r.status_code in (404, 410):
        return False
    if r.status_code == 200 and _job_posting(r.text):
        return True
    return None
