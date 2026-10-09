"""Radancy-hosted sites (jobs.citi.com, careers.chevron.com): JSON search whose `results` is HTML + JSON-LD detail."""
import re
import time
from .common import get, strip_html, job, SEARCH_QUERIES
from .jsonld import job_posting, location

LINK_RE = re.compile(r'<a[^>]+href="((?:/[a-z]{2}(?:-[a-z]{2})?)?/job/[^"]+)"[^>]*>(.*?)</a>', re.S)


def fetch(company, cfg, title_ok, max_pages=10):
    host = cfg["host"]
    path = cfg.get("results_path", "/search-jobs/results")
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            url = (f"https://{host}{path}?ActiveFacetID=0&CurrentPage={page}&RecordsPerPage=100&Keywords={q.replace(' ', '+')}"
                   f"&SearchResultsModuleName=Search+Results&SearchFiltersModuleName=Search+Filters&ShowRadius=False&IsPagination=False"
                   f"&SearchType=5&Distance=50&RadiusUnitType=0&SortCriteria=0&SortDirection=0&ResultsType=0")
            r = get(url, headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
            if r.status_code != 200:
                break
            try:
                html = r.json().get("results", "")
            except ValueError:
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
