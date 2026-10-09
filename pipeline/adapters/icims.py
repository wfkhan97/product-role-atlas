"""iCIMS hosted career portals (HTML search in iframe mode + JSON-LD / iCIMS_JobContent detail)."""
import re
import time
from .common import get, strip_html, job, SEARCH_QUERIES
from .jsonld import job_posting, location

LINK_RE = re.compile(r'href="(https?://[^"]+/jobs/(\d+)/([^/"?]+)/job[^"]*)"')
CONTENT_RE = re.compile(r'<div[^>]+class="iCIMS_JobContent"[^>]*>(.*?)<div[^>]+class="iCIMS_(?:JobOptions|ApplyBox)', re.S)


def fetch(company, cfg, title_ok, max_pages=6):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            r = get(f"https://{host}/jobs/search?ss=1&searchKeyword={q.replace(' ', '+')}&in_iframe=1&pr={page-1}")
            if r.status_code != 200:
                break
            found = 0
            for m in LINK_RE.finditer(r.text):
                url, jid = m.group(1), m.group(2)
                if jid not in seen:
                    seen[jid] = url.split("?")[0] + "?in_iframe=1"
                    found += 1
            if found == 0:
                break
            time.sleep(0.4)
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
