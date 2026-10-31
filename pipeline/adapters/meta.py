"""Meta careers: GraphQL search (needs the LSD token from the jobs page) + JSON-LD detail."""
import json
import re
import threading
import time
import requests
from .common import strip_html, job, listing_failed, SEARCH_QUERIES
from .jsonld import job_posting

LSD_RE = re.compile(r'"LSD",\[\],\{"token":"([^"]+)"')
DEFAULT_DOC_ID = "27506805582236862"


def _session():
    s = requests.Session()  # curl-like default UA on purpose: a browser UA gets HTTP 400
    s.headers.update({"User-Agent": "curl/8.4.0"})
    return s


def fetch(company, cfg, title_ok, max_pages=30):
    s = _session()
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
                listing_failed(f"meta: HTTP {r.status_code} for {q!r} page {page}")
                break
            try:
                data = r.json()
            except ValueError:
                listing_failed(f"meta: unreadable JSON for {q!r} page {page}")
                break
            search = (data.get("data") or {}).get("job_search_with_featured_jobs")
            if not isinstance(search, dict):  # "errors" also comes with good answers (warnings): only a missing result fails
                listing_failed(f"meta: no search result for {q!r} page {page}")
                break
            rows = search.get("all_jobs") or []
            new = 0
            for row in rows:
                if row["id"] not in seen and title_ok(row.get("title", "")):
                    seen[row["id"]] = row
                    new += 1
            if not rows or (page > 1 and new == 0):
                break
            time.sleep(0.5)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"meta: stopped at the page cap for {q!r}")
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


_check = threading.local()


def still_open(company, cfg, posting):
    """GET the job page the fetch reads (its own session, for the reason in _session). True: it answers 200 with the
    JSON-LD JobPosting. False: Meta redirects a job it no longer shows to /jobs/position-not-available/ (which answers
    404), or the job page itself answers 404 or 410. None: anything else (a block, a 5xx, a page without the job)."""
    jid = posting.get("external_id")
    if not jid or not str(jid).isdigit():
        return None
    if not hasattr(_check, "s"):
        _check.s = _session()
    try:
        r = _check.s.get(f"https://www.metacareers.com/jobs/{jid}/", timeout=30)
    except requests.RequestException:
        return None
    if "/position-not-available" in r.url:
        return False
    if r.status_code in (404, 410) and not r.history:
        return False
    if r.status_code == 200 and job_posting(r.text):
        return True
    return None
