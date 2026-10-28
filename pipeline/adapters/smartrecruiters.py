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
