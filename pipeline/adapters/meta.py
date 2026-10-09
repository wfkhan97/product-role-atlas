"""Meta careers: GraphQL search (needs the LSD token from the jobs page) + JSON-LD detail."""
import json
import re
import time
import requests
from .common import strip_html, job, SEARCH_QUERIES
from .jsonld import job_posting

LSD_RE = re.compile(r'"LSD",\[\],\{"token":"([^"]+)"')
DEFAULT_DOC_ID = "27506805582236862"


def fetch(company, cfg, title_ok, max_pages=30):
    s = requests.Session()  # curl-like default UA on purpose: a browser UA gets HTTP 400
    s.headers.update({"User-Agent": "curl/8.4.0"})
    r = s.get("https://www.metacareers.com/jobs/", timeout=30)
    m = LSD_RE.search(r.text)
    if not m:
        raise RuntimeError("could not find LSD token on metacareers.com")
    lsd = m.group(1)
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            variables = {"search_input": {"q": q, "divisions": [], "offices": [], "roles": [], "leadership_levels": [], "saved_jobs": [],
                                          "saved_searches": [], "sub_teams": [], "teams": [], "is_leadership": False, "is_remote_only": False,
                                          "sort_by_new": False, "page": page, "results_per_page": None}}
            r = s.post("https://www.metacareers.com/graphql", headers={"X-FB-LSD": lsd},
                       data={"lsd": lsd, "fb_api_req_friendly_name": "CareersJobSearchResultsDataQuery",
                             "doc_id": cfg.get("doc_id", DEFAULT_DOC_ID), "variables": json.dumps(variables)}, timeout=30)
            if r.status_code != 200:
                break
            try:
                data = r.json()
            except ValueError:
                break
            rows = ((data.get("data") or {}).get("job_search_with_featured_jobs") or {}).get("all_jobs") or []
            new = 0
            for row in rows:
                if row["id"] not in seen and title_ok(row.get("title", "")):
                    seen[row["id"]] = row
                    new += 1
            if not rows or (page > 1 and new == 0):
                break
            time.sleep(0.5)
    out = []
    for jid, row in seen.items():
        url = f"https://www.metacareers.com/jobs/{jid}/"
        r = s.get(url, timeout=30)
        p = job_posting(r.text) if r.status_code == 200 else None
        if not p:
            continue
        parts = [strip_html(p.get("description", "")), "Responsibilities:", strip_html(p.get("responsibilities", "")),
                 "Qualifications:", strip_html(p.get("qualifications", "")), strip_html(p.get("experienceRequirements", "")) if isinstance(p.get("experienceRequirements"), str) else ""]
        locs = row.get("locations") or []
        out.append(job(company, p.get("title") or row.get("title"), url, "\n".join(x for x in parts if x),
                       location="; ".join(locs[:3]) if isinstance(locs, list) else "", posted=p.get("datePosted"), external_id=jid))
        time.sleep(0.3)
    return out
