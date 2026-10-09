"""Bank of America careers: custom search servlet + JSON-LD job pages."""
import time
from .common import get, strip_html, job, SEARCH_QUERIES
from .jsonld import job_posting, location


def fetch(company, cfg, title_ok, max_pages=10):
    host = cfg["host"]
    path = cfg.get("search_path", "/services/jobssearchservlet")
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            r = get(f"https://{host}{path}?term={q.replace(' ', '+')}&start={page*20}&rows=20&search=jobsByKeyword", headers={"Accept": "application/json"})
            if r.status_code != 200:
                break
            try:
                rows = r.json().get("jobsList") or []
            except ValueError:
                break
            for row in rows:
                if title_ok(row.get("postingTitle", "")):
                    seen[row.get("jobRequisitionId") or row.get("jcrURL")] = row
            if len(rows) < 20:
                break
            time.sleep(0.4)
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
