"""Bank of America careers: custom search servlet + JSON-LD job pages."""
import time
from urllib.parse import quote_plus
from .common import get, listing_failed, strip_html, job, SEARCH_QUERIES
from .jsonld import job_posting, location


def fetch(company, cfg, title_ok, max_pages=10):
    host = cfg["host"]
    path = cfg.get("search_path", "/services/jobssearchservlet")
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            r = get(f"https://{host}{path}?term={quote_plus(q)}&start={page*20}&rows=20&search=jobsByKeyword", headers={"Accept": "application/json"}, listing=True)
            if r.status_code != 200:
                break
            try:
                rows = r.json().get("jobsList") or []
            except ValueError:
                listing_failed(f"bofa_servlet: unreadable search page for {q!r} start {page*20}")
                break
            for row in rows:
                if title_ok(row.get("postingTitle", "")):
                    seen[row.get("jobRequisitionId") or row.get("jcrURL")] = row
            if len(rows) < 20:
                break
            time.sleep(0.4)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"bofa_servlet: stopped at the page cap for {q!r}")
    out = []
    for key, row in seen.items():
        url = f"https://{host}{row.get('jcrURL')}"
        r = get(url)
        if r.status_code != 200:
            continue
        p = job_posting(r.text)
        if not p:
            continue
        out.append(job(company, p.get("title") or row.get("postingTitle"), url, strip_html(p.get("description", "")),
                       location=location(p) or row.get("city", ""), posted=p.get("datePosted"), external_id=key))
        time.sleep(0.3)
    return out
