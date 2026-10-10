"""iCIMS Jibe/Attract sites (e.g. pepsicojobs.com): /api/jobs returns full descriptions."""
import time
from urllib.parse import quote
from .common import get, strip_html, job, SEARCH_QUERIES


def fetch(company, cfg, title_ok, max_pages=15):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            r = get(f"https://{host}/api/jobs?keywords={quote(q)}&page={page}&limit=50", headers={"Accept": "application/json"})
            if r.status_code != 200:
                break
            try:
                rows = r.json().get("jobs", [])
            except ValueError:
                break
            for row in rows:
                d = row.get("data", row)
                if title_ok(d.get("title", "")):
                    seen[d.get("req_id") or d.get("slug")] = d
            if len(rows) < 50:
                break
            time.sleep(0.3)
    out = []
    for key, d in seen.items():
        desc = strip_html(d.get("description", ""))
        if not desc:
            continue
        url = d.get("apply_url") or f"https://{host}/main/jobs/{d.get('slug') or key}"
        loc = d.get("location_name") or ", ".join(x for x in [d.get("city"), d.get("state"), d.get("country")] if x)
        out.append(job(company, d.get("title"), url, desc, location=loc, posted=d.get("posted_date") or d.get("create_date"),
                       external_id=key, extra={"category": d.get("category")}))
    return out
