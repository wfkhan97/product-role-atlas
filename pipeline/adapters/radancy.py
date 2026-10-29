"""Radancy-hosted sites (jobs.citi.com, careers.chevron.com): JSON search whose `results` is HTML + JSON-LD detail."""
import re
import time
from urllib.parse import quote_plus
from .common import get, listing_failed, strip_html, job, SEARCH_QUERIES
from .jsonld import job_posting, location

LINK_RE = re.compile(r'<a[^>]+href="((?:/[a-z]{2}(?:-[a-z]{2})?)?/job/[^"]+)"[^>]*>(.*?)</a>', re.S)


def fetch(company, cfg, title_ok, max_pages=10):
    host = cfg["host"]
    path = cfg.get("results_path", "/search-jobs/results")
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            url = (f"https://{host}{path}?ActiveFacetID=0&CurrentPage={page}&RecordsPerPage=100&Keywords={quote_plus(q)}"
                   f"&SearchResultsModuleName=Search+Results&SearchFiltersModuleName=Search+Filters&ShowRadius=False&IsPagination=False"
                   f"&SearchType=5&Distance=50&RadiusUnitType=0&SortCriteria=0&SortDirection=0&ResultsType=0")
            r = get(url, headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"}, listing=True)
            if r.status_code != 200:
                break
            try:
                html = r.json().get("results", "")
            except ValueError:
                listing_failed(f"radancy: unreadable results page for {q!r} page {page}")
                break
            found = 0
            for m in LINK_RE.finditer(html):
                href, inner = m.group(1), m.group(2)
                title = strip_html(inner).split("\n")[0].strip()
                if href not in seen:
                    seen[href] = title
                    found += 1
            if found == 0:
                break
            time.sleep(0.4)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"radancy: stopped at the page cap for {q!r}")
    out = []
    for href, title in seen.items():
        if title and not title_ok(title):
            continue
        r = get(f"https://{host}{href}")
        if r.status_code != 200:
            continue
        p = job_posting(r.text)
        if not p:
            continue
        t = p.get("title") or title
        if not title_ok(t):
            continue
        out.append(job(company, t, f"https://{host}{href}", strip_html(p.get("description", "")), location=location(p),
                       posted=p.get("datePosted"), external_id=href.rstrip("/").rsplit("/", 1)[-1]))
        time.sleep(0.3)
    return out


def still_open(company, cfg, posting):
    """True: the job page answers 200 with its JSON-LD JobPosting. False: the job page answers 404 or 410 (Radancy
    serves its "Job Not Found" page with a 404 for a job it no longer shows). None: anything else."""
    url = posting.get("url") or ""
    if not url.startswith("https://"):
        return None
    r = get(url)
    if r.status_code in (404, 410):
        return False
    if r.status_code == 200 and job_posting(r.text):
        return True
    return None
