import time
from urllib.parse import quote
from .common import get, strip_html, job, SEARCH_QUERIES

HDR = {"Accept": "application/json"}


def fetch(company, cfg, title_ok, max_pages=8):
    host, site = cfg["host"], cfg.get("siteNumber", "CX_1")
    base = f"https://{host}/hcmRestApi/resources/latest"
    seen = {}
    for q in cfg.get("queries", [x.title() for x in SEARCH_QUERIES]):
        for page in range(max_pages):
            url = (f"{base}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations"
                   f"&finder=findReqs;siteNumber={site},keyword=%22{quote(q)}%22,limit=25,offset={page*25}")
            r = get(url, headers=HDR)
            if r.status_code != 200:
                break
            items = r.json().get("items", [])
            reqs = items[0].get("requisitionList", []) if items else []
            for p in reqs:
                if title_ok(p.get("Title", "")):
                    seen[p["Id"]] = p
            if len(reqs) < 25:
                break
            time.sleep(0.3)
    out = []
    for rid, p in seen.items():
        r = get(f"{base}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22{rid}%22,siteNumber={site}", headers=HDR)
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
