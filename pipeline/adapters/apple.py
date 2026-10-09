import time
from .common import get, post, strip_html, job

HDR = {"Content-Type": "application/json", "Accept": "application/json"}


def fetch(company, cfg, title_ok, max_pages=30):
    seen = {}
    for q in cfg.get("queries", ["product manager", "technical program manager", "product marketing", "product operations"]):
        for page in range(1, max_pages + 1):
            body = {"query": q, "filters": cfg.get("filters", {}), "page": page, "locale": "en-us", "sort": "relevance",
                    "format": {"longDate": "MMMM D, YYYY", "mediumDate": "MMM D, YYYY"}}
            r = post("https://jobs.apple.com/api/v1/search", json=body, headers=HDR)
            if r.status_code != 200:
                break
            res = r.json().get("res", {})
            results = res.get("searchResults", [])
            for j in results:
                if title_ok(j.get("postingTitle", "")):
                    seen[j.get("positionId") or j.get("id")] = j
            if not results or page * 20 >= res.get("totalRecords", 0):
                break
            time.sleep(0.3)
    out = []
    for pid, j in seen.items():
        desc = None
        for url in (f"https://jobs.apple.com/api/v1/jobDetails/{pid}?locale=en-us",):
            r = get(url, headers=HDR)
            if r.status_code == 200:
                try:
                    d = r.json()
                except ValueError:
                    continue
                d = d.get("res", d)
                parts = [d.get("jobSummary"), d.get("description"), "Key qualifications:", d.get("keyQualifications"),
                         "Minimum qualifications:", d.get("minimumQualifications"), "Preferred qualifications:", d.get("preferredQualifications"),
                         d.get("educationAndExperience"), d.get("additionalRequirements")]
                parts = [strip_html(p if isinstance(p, str) else "\n".join(p)) for p in parts if p]
                desc = "\n".join(parts)
                break
        if not desc:
            desc = strip_html(j.get("jobSummary", ""))
        loc = (j.get("locations") or [{}])[0].get("name", "") if isinstance(j.get("locations"), list) else ""
        out.append(job(company, j.get("postingTitle"), f"https://jobs.apple.com/en-us/details/{pid}", desc,
                       location=loc, posted=j.get("postingDate"), external_id=pid, extra={"team": (j.get("team") or {}).get("teamName") if isinstance(j.get("team"), dict) else None}))
        time.sleep(0.2)
    return out
