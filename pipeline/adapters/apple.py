import re
import time
from .common import get, post, strip_html, job, listing_failed, held

HDR = {"Content-Type": "application/json", "Accept": "application/json"}


def fetch(company, cfg, title_ok, max_pages=30):
    seen = {}
    for q in cfg.get("queries", ["product manager", "technical program manager", "product marketing", "product operations"]):
        for page in range(1, max_pages + 1):
            body = {"query": q, "filters": cfg.get("filters", {}), "page": page, "locale": "en-us", "sort": "relevance",
                    "format": {"longDate": "MMMM D, YYYY", "mediumDate": "MMM D, YYYY"}}
            r = post("https://jobs.apple.com/api/v1/search", listing=True, json=body, headers=HDR)
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
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"apple: stopped at the page cap for {q!r}")
    out, known = [], held(cfg)
    for pid, j in seen.items():
        o = known.take(j.get("postingTitle"), external_id=pid)  # held with a text read recently: no detail request
        if o:
            out.append(o)
            continue
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


def still_open(company, cfg, posting):
    """Ask the job's page without following redirects (one request). True: it redirects to the job's own page
    (/en-us/details/<id>[-<team>]/<slug>), which Apple does only for a role it has. False: it answers 404, or 200 with
    "this role does not exist or is no longer available" (the page Apple serves for a removed role; the jobDetails API
    gives only a generic 404 "serviceError" there). None: anything else."""
    pid = str(posting.get("external_id") or "")
    if not pid.isdigit():
        return None
    r = get(f"https://jobs.apple.com/en-us/details/{pid}", allow_redirects=False)
    if r.status_code in (301, 302, 303, 307, 308):
        return True if re.search(rf"/details/{pid}[-/]", r.headers.get("Location") or "") else None
    if r.status_code == 404:
        return False
    if r.status_code == 200 and "role does not exist or is no longer available" in r.text:
        return False
    return None
