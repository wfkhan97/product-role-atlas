import time
from datetime import datetime, timezone
from urllib.parse import quote
from .common import get, strip_html, job, listing_failed, held, SEARCH_QUERIES

HDR = {"Accept": "application/json"}


def detail_url(host, site, rid):
    return (f"https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true"
            f"&finder=ById;Id=%22{rid}%22,siteNumber={site}")


def fetch(company, cfg, title_ok, max_pages=8):
    host, site = cfg["host"], cfg.get("siteNumber", "CX_1")
    base = f"https://{host}/hcmRestApi/resources/latest"
    seen = {}
    for q in cfg.get("queries", [x.title() for x in SEARCH_QUERIES]):
        for page in range(max_pages):
            url = (f"{base}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations"
                   f"&finder=findReqs;siteNumber={site},keyword=%22{quote(q)}%22,limit=25,offset={page*25}")
            r = get(url, headers=HDR, listing=True)
            if r.status_code != 200:
                break
            try:
                items = r.json().get("items", [])
            except ValueError:
                listing_failed(f"oracle_hcm: unreadable JSON for {q!r} offset {page*25}")
                break
            reqs = items[0].get("requisitionList", []) if items else []
            for p in reqs:
                if title_ok(p.get("Title", "")):
                    seen[p["Id"]] = p
            if len(reqs) < 25:
                break
            time.sleep(0.3)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"oracle_hcm: stopped at the page cap for {q!r}")
    out, known = [], held(cfg)
    for rid, p in seen.items():
        o = known.take(p.get("Title"), external_id=rid)  # held with a text read recently: no detail request
        if o:
            out.append(o)
            continue
        r = get(detail_url(host, site, rid), headers=HDR)
        if r.status_code != 200:
            continue
        items = r.json().get("items", [])
        if not items:
            continue
        d = items[0]
        desc = "\n".join(strip_html(d.get(k) or "") for k in ("ExternalDescriptionStr", "ExternalQualificationsStr", "ExternalResponsibilitiesStr", "ShortDescriptionStr"))
        url = f"https://{host}/hcmUI/CandidateExperience/en/sites/{site}/job/{rid}"
        out.append(job(company, d.get("Title") or p.get("Title"), url, desc, location=p.get("PrimaryLocation", ""),
                       posted=p.get("PostedDate"), external_id=rid, extra={"category": d.get("JobFamily")}))
        time.sleep(0.2)
    return out


def _date(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def still_open(company, cfg, posting):
    """Ask the detail API the fetch uses. True: it answers with the requisition, posted (ExternalPostedStartDate set)
    and not past its ExternalPostedEndDate. False: it answers 200 with no item (count 0: the site does not show this
    requisition), or with the requisition but unposted (no ExternalPostedStartDate; every unposted one checked was
    closed) or past its end date. None: anything else, a requisition with another Id among them."""
    rid = posting.get("external_id")
    if not rid:
        return None
    r = get(detail_url(cfg["host"], cfg.get("siteNumber", "CX_1"), rid), headers=HDR)
    if r.status_code != 200:
        return None
    try:
        body = r.json()
    except ValueError:
        return None
    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list):
        return None
    if not items:
        return False if body.get("count") == 0 else None
    d = items[0]
    if not isinstance(d, dict) or str(d.get("Id")) != str(rid):
        return None
    start, end = d.get("ExternalPostedStartDate"), _date(d.get("ExternalPostedEndDate") or "")
    if not start:
        return False
    if end and end.tzinfo and end < datetime.now(timezone.utc):
        return False
    return True
