"""iCIMS hosted career portals (HTML search in iframe mode + JSON-LD / iCIMS_JobContent detail)."""
import re
import time
from urllib.parse import quote_plus
from .common import get, strip_html, job, listing_failed, SEARCH_QUERIES
from .jsonld import job_posting, location

LINK_RE = re.compile(r'href="(https?://[^"]+/jobs/(\d+)/([^/"?]+)/job[^"]*)"')
CONTENT_RE = re.compile(r'<div[^>]+class="iCIMS_JobContent"[^>]*>(.*?)<div[^>]+class="iCIMS_(?:JobOptions|ApplyBox)', re.S)


def fetch(company, cfg, title_ok, max_pages=6):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            r = get(f"https://{host}/jobs/search?ss=1&searchKeyword={quote_plus(q)}&in_iframe=1&pr={page-1}", listing=True)
            if r.status_code != 200:
                break
            found = 0
            for m in LINK_RE.finditer(r.text):
                url, jid = m.group(1), m.group(2)
                if jid not in seen:
                    seen[jid] = url.split("?")[0] + "?in_iframe=1"
                    found += 1
            if found == 0:
                # a page past the last one is still an iCIMS page, only without job links; a page with no iCIMS
                # markup at all is a block or error page
                if "iCIMS_" not in r.text:
                    listing_failed(f"icims: search page without iCIMS markup for {q!r} page {page}")
                break
            time.sleep(0.4)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"icims: stopped at the page cap for {q!r}")
    out = []
    for jid, url in seen.items():
        r = get(url)
        if r.status_code != 200:
            continue
        p = job_posting(r.text)
        title = (p or {}).get("title") or strip_html(re.search(r"<h1[^>]*>(.*?)</h1>", r.text, re.S).group(1) if re.search(r"<h1[^>]*>(.*?)</h1>", r.text, re.S) else "")
        if not title_ok(title):
            continue
        m = CONTENT_RE.search(r.text)
        desc = strip_html(m.group(1)) if m else strip_html((p or {}).get("description", ""))
        if not desc:
            continue
        out.append(job(company, title, url.replace("?in_iframe=1", ""), desc, location=location(p) if p else "",
                       posted=(p or {}).get("datePosted"), external_id=jid))
        time.sleep(0.3)
    return out
