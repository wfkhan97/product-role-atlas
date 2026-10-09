import time
from .common import get, strip_html, job


def fetch(company, cfg, title_ok, max_offset=2000):
    seen = {}
    for q in cfg.get("queries", ["product manager", "technical program manager", "product marketing manager", "product operations"]):
        offset = 0
        while offset < max_offset:
            r = get(f"https://www.amazon.jobs/en/search.json?base_query={q.replace(' ', '+')}&result_limit=100&offset={offset}&sort=recent"
                    + ("&country=USA" if cfg.get("usa_only") else ""))
            if r.status_code != 200:
                break
            data = r.json()
            jobs = data.get("jobs", [])
            for j in jobs:
                if title_ok(j.get("title", "")):
                    seen[j.get("id_icims") or j.get("job_path")] = j
            offset += 100
            if not jobs or offset >= data.get("hits", 0):
                break
            time.sleep(0.4)
    out = []
    for key, j in seen.items():
        desc = "\n".join([strip_html(j.get("description", "")), "Basic qualifications:", strip_html(j.get("basic_qualifications", "")),
                          "Preferred qualifications:", strip_html(j.get("preferred_qualifications", ""))])
        out.append(job(company, j.get("title"), "https://www.amazon.jobs" + j.get("job_path", ""), desc,
                       location=j.get("normalized_location") or j.get("location", ""), posted=j.get("posted_date"),
                       external_id=j.get("id_icims"), extra={"business_category": j.get("business_category"), "team": j.get("team", {}).get("label") if isinstance(j.get("team"), dict) else None}))
    return out
