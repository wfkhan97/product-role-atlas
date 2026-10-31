import time
from urllib.parse import quote_plus
from .common import get, strip_html, job, listing_failed


def fetch(company, cfg, title_ok, max_offset=2000):
    seen = {}
    for q in cfg.get("queries", ["product manager", "technical program manager", "product marketing manager", "product operations"]):
        offset = 0
        while offset < max_offset:
            r = get(f"https://www.amazon.jobs/en/search.json?base_query={quote_plus(q)}&result_limit=100&offset={offset}&sort=recent"
                    + ("&country=USA" if cfg.get("usa_only") else ""), listing=True)
            if r.status_code != 200:
                break
            try:
                data = r.json()
            except ValueError:
                listing_failed(f"amazon: unreadable JSON for {q!r} offset {offset}")
                break
            jobs = data.get("jobs", [])
            for j in jobs:
                if title_ok(j.get("title", "")):
                    seen[j.get("id_icims") or j.get("job_path")] = j
            offset += 100
            if not jobs or offset >= data.get("hits", 0):
                break
            time.sleep(0.4)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"amazon: stopped at the page cap for {q!r}")
    out = []
    for key, j in seen.items():
        desc = "\n".join([strip_html(j.get("description", "")), "Basic qualifications:", strip_html(j.get("basic_qualifications", "")),
                          "Preferred qualifications:", strip_html(j.get("preferred_qualifications", ""))])
        out.append(job(company, j.get("title"), "https://www.amazon.jobs" + j.get("job_path", ""), desc,
                       location=j.get("normalized_location") or j.get("location", ""), posted=j.get("posted_date"),
                       external_id=j.get("id_icims"), extra={"business_category": j.get("business_category"), "team": j.get("team", {}).get("label") if isinstance(j.get("team"), dict) else None}))
    return out


def still_open(company, cfg, posting):
    """True: the job page answers 200 and names the posting's Job ID. False: the job page answers 404 or 410
    (amazon.jobs serves its 404 page for a job it no longer shows). None: anything else."""
    jid = posting.get("external_id")
    if not jid:
        return None
    url = posting.get("url") or ""
    if not url.startswith("https://www.amazon.jobs/"):
        url = f"https://www.amazon.jobs/en/jobs/{jid}"  # answers with a redirect to the page with its slug
    r = get(url)
    if r.status_code in (404, 410):
        return False
    if r.status_code == 200 and f"Job ID: {jid}" in r.text:
        return True
    return None
