"""Symphony Talent m-cloud API (Home Depot): descriptions inline."""
import time
from urllib.parse import quote
from .common import get, strip_html, job, SEARCH_QUERIES


def fetch(company, cfg, title_ok, max_pages=10):
    host, path, org = cfg["host"], cfg.get("path", "/api/job"), cfg["organization"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            r = get(f"https://{host}{path}?Organization={org}&SearchText={quote(q)}&Limit=50&offset={page*50+1}&fuzzy=false")
            if r.status_code != 200:
                break
            try:
                rows = r.json().get("queryResult", [])
            except ValueError:
                break
            for row in rows:
                if title_ok(row.get("title", "")):
                    seen[row.get("id") or row.get("url")] = row
            if len(rows) < 50:
                break
            time.sleep(0.4)
    out = []
    for key, row in seen.items():
        desc = strip_html(row.get("description", ""))
        if not desc:
            continue
        loc = ", ".join(x for x in [row.get("primary_city"), row.get("primary_state"), row.get("primary_country")] if x)
        out.append(job(company, row.get("title"), row.get("url"), desc, location=loc, posted=row.get("open_date"), external_id=key,
                       extra={"category": row.get("primary_category")}))
    return out
