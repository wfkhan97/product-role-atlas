"""Symphony Talent m-cloud API (Home Depot): descriptions inline."""
import time
from urllib.parse import quote
from .common import get, strip_html, job, listing_failed, SEARCH_QUERIES


def fetch(company, cfg, title_ok, max_pages=10):
    host, path, org = cfg["host"], cfg.get("path", "/api/job"), cfg["organization"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            r = get(f"https://{host}{path}?Organization={org}&SearchText={quote(q)}&Limit=50&offset={page*50+1}&fuzzy=false", listing=True)
            if r.status_code != 200:
                break
            try:
                rows = r.json().get("queryResult", [])
            except ValueError:
                listing_failed(f"mcloud: unreadable JSON for {q!r} offset {page*50+1}")
                break
            for row in rows:
                if title_ok(row.get("title", "")):
                    seen[row.get("id") or row.get("url")] = row
            if len(rows) < 50:
                break
            time.sleep(0.4)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"mcloud: stopped at the page cap for {q!r}")
    out = []
    for key, row in seen.items():
        desc = strip_html(row.get("description", ""))
        if not desc:
            continue
        loc = ", ".join(x for x in [row.get("primary_city"), row.get("primary_state"), row.get("primary_country")] if x)
        out.append(job(company, row.get("title"), row.get("url"), desc, location=loc, posted=row.get("open_date"), external_id=key,
                       extra={"category": row.get("primary_category")}))
    return out


GONE_STATUS = {"closed", "filled", "expired", "inactive", "cancelled"}


def still_open(company, cfg, posting):
    """True: the API's job record ({path}/{id}) answers with the job, entity_status "Open" and is_posted "true".
    False: it answers 404 with its "JobNotFoundException" body, or the record says the job is closed or filled, or
    unposted (is_posted "false": such a job keeps entity_status "Open" but is gone from the search). None: anything
    else."""
    jid = posting.get("external_id")
    if not jid:
        return None
    host, path, org = cfg["host"], cfg.get("path", "/api/job"), cfg["organization"]
    r = get(f"https://{host}{path}/{jid}?Organization={org}")
    try:
        body = r.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    if r.status_code == 404 and body.get("Source") == "JobNotFoundException":
        return False
    if r.status_code == 200 and str(body.get("id")) == str(jid):
        status, posted = str(body.get("entity_status") or "").lower(), str(body.get("is_posted")).lower()
        if status in GONE_STATUS or posted == "false":
            return False
        if status == "open" and posted == "true":
            return True
    return None
