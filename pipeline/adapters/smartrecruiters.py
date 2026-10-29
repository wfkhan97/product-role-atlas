import time
from .common import get, strip_html, job


def fetch(company, cfg, title_ok):
    c = cfg["company"]
    seen = {}
    for q in cfg.get("queries", ["product"]):
        offset = 0
        while True:
            r = get(f"https://api.smartrecruiters.com/v1/companies/{c}/postings", listing=True, params={"q": q, "limit": 100, "offset": offset})
            if r.status_code != 200:
                break
            data = r.json()
            for p in data.get("content", []):
                if title_ok(p.get("name", "")):
                    seen[p["id"]] = p
            offset += 100
            if offset >= data.get("totalFound", 0):
                break
    out = []
    for pid, p in seen.items():
        r = get(f"https://api.smartrecruiters.com/v1/companies/{c}/postings/{pid}")
        if r.status_code != 200:
            continue
        d = r.json()
        secs = d.get("jobAd", {}).get("sections", {})
        desc = "\n".join(strip_html(secs.get(k, {}).get("text", "")) for k in ("jobDescription", "qualifications", "additionalInformation"))
        loc = d.get("location", {})
        out.append(job(company, d.get("name"), d.get("applyUrl") or d.get("postingUrl"), desc,
                       location=", ".join(x for x in [loc.get("city"), loc.get("region"), loc.get("country")] if x),
                       posted=d.get("releasedDate"), external_id=pid, extra={"department": (d.get("department") or {}).get("label")}))
        time.sleep(0.2)
    return out


def still_open(company, cfg, posting):
    """Ask the posting detail the fetch uses. False: it answers "active": false (SmartRecruiters keeps the record of a
    closed posting and marks it so) or a JSON 404 RESOURCE_NOT_FOUND. None otherwise, also for "active": true: postings
    that left the company's full listing (Sia, ServiceNow, AECOM) still answer active, public and with their text, so
    the detail cannot tell an open posting from an unlisted one, and this check never answers True."""
    pid, c = posting.get("external_id"), cfg.get("company")
    if not pid or not c:
        return None
    r = get(f"https://api.smartrecruiters.com/v1/companies/{c}/postings/{pid}")
    try:
        d = r.json()
    except ValueError:
        return None
    if not isinstance(d, dict):
        return None
    if r.status_code == 404 and d.get("code") == "RESOURCE_NOT_FOUND":
        return False
    if r.status_code == 200 and str(d.get("id")) == str(pid) and d.get("active") is False:
        return False
    return None
