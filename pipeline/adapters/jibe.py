"""iCIMS Jibe/Attract sites (e.g. pepsicojobs.com): /api/jobs returns full descriptions."""
import time
from urllib.parse import quote
from .common import get, strip_html, job, listing_failed, SEARCH_QUERIES


def fetch(company, cfg, title_ok, max_pages=15):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            r = get(f"https://{host}/api/jobs?keywords={quote(q)}&page={page}&limit=50", headers={"Accept": "application/json"}, listing=True)
            if r.status_code != 200:
                break
            try:
                rows = r.json().get("jobs", [])
            except ValueError:
                listing_failed(f"jibe: unreadable JSON for {q!r} page {page}")
                break
            for row in rows:
                d = row.get("data", row)
                if title_ok(d.get("title", "")):
                    seen[d.get("req_id") or d.get("slug")] = d
            if len(rows) < 50:
                break
            time.sleep(0.3)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"jibe: stopped at the page cap for {q!r}")
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


def still_open(company, cfg, posting):
    """Two answers, as neither is enough alone. The search API asked for the req_id finds a job in any language;
    the job page (/main/jobs/{slug}, the slug is the req_id on every Jibe site in the registry) answers 404 for a job
    whose language is not the default one (es-mx, ro-ro, ... need ?lang=), so its 404 alone is no evidence.
    True: the search returns the req_id, or the job page answers 200 and names it. False: the search for the req_id
    returns no such job and the job page answers 404 or 410. None: anything else (a search that fails or is not
    JSON, a block, a server error)."""
    key = posting.get("external_id")
    if not key:
        return None
    host = cfg["host"]
    r = get(f"https://{host}/api/jobs?keywords={quote(str(key))}&limit=10", headers={"Accept": "application/json"})
    try:
        rows = r.json().get("jobs") if r.status_code == 200 else None
    except (ValueError, AttributeError):
        rows = None
    if not isinstance(rows, list):
        return None
    if any(str((row.get("data", row) if isinstance(row, dict) else {}).get("req_id")) == str(key) for row in rows):
        return True
    r = get(f"https://{host}/main/jobs/{key}", headers={"Accept": "text/html"})
    if r.status_code in (404, 410):
        return False
    if r.status_code == 200 and str(key) in r.text:
        return True
    return None
