"""Paradox-hosted careers sites (e.g. careers.fedex.com): HTML search pages + JSON-LD JobPosting on job pages."""
import json
import re
import time
from .common import get, strip_html, job, SEARCH_QUERIES

LINK_RE = re.compile(r'href="((?:/[^"]*?)?/job/([^"?]+?))/?"')
LD_RE = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.S)
TITLE_RE = re.compile(r'href="(?:/[^"]*?)?/job/[^"?]+"[^>]*>(.*?)</a>', re.S)


def fetch(company, cfg, title_ok, max_pages=10):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            qp, pp, base = cfg.get("query_param", "keyword"), cfg.get("page_param"), cfg.get("search_path", "/jobs")
            if pp:
                url = f"https://{host}{base}?{qp}={q.replace(' ', '%20')}&{pp}={page}"
            else:
                url = f"https://{host}{base}?{qp}={q.replace(' ', '%20')}" if page == 1 else f"https://{host}{base}/page/{page}?{qp}={q.replace(' ', '%20')}"
            r = get(url)
            if r.status_code != 200:
                break
            links = list(dict.fromkeys(m.group(1) for m in LINK_RE.finditer(r.text)))
            if not links:
                break
            for path in links:
                seen.setdefault(path, None)
            time.sleep(0.4)
    out = []
    for path in seen:
        r = get(f"https://{host}{path}")
        if r.status_code != 200:
            continue
        posting = None
        for m in LD_RE.finditer(r.text):
            try:
                d = json.loads(m.group(1))
            except ValueError:
                continue
            cands = d if isinstance(d, list) else [d]
            for c in cands:
                if isinstance(c, dict) and c.get("@type") == "JobPosting":
                    posting = c
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
