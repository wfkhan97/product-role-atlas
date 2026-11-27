import re
import time
from .common import get, post, strip_html, job, SEARCH_QUERIES, listing_failed, held

HDR = {"Accept": "application/json", "Content-Type": "application/json"}


# A board that lists fewer postings than this in all is walked once, page by page, with no search text, instead of
# searched once per query. Measured 2026-11-27 from a home address: Travelers (388 listed) 20 requests against 519 for
# the 117 MBA searches, the same 60 postings kept; Palo Alto Networks (1,334) 67 against 612, every posting the
# searches kept and 21 they missed, and no search cut at the page cap. Of the registry's 218 boards 195 list under
# 2,000 (median 405). 2,000 is also where the API stops counting: eleven boards answer exactly that.
WALK_UNDER = 2000


def _pages(base, cfg, q, max_pages, take, start=0):
    """Read the listing for search text q from page `start`, 20 a page, calling take(posting) for each. Returns
    (how, total): how is "done" (every result read), "capped" (max_pages reached and more remain) or "failed" (a page
    was not answered, which post() has recorded as a failed listing page; or a walk, q == "", ran dry before the
    board's total, recorded here). Past the first page the API gives no total: a caller that starts at a later page
    (start > 0) took the total from page 0 and sets max_pages to the board's last page."""
    total = 0
    for page in range(start, max_pages):
        body = {"appliedFacets": cfg.get("facets", {}), "limit": 20, "offset": page * 20, "searchText": q}
        r = post(f"{base}/jobs", listing=True, json=body, headers=HDR)
        if r.status_code != 200:
            return "failed", total
        data = r.json()
        posts = data.get("jobPostings", [])
        for p in posts:
            take(p)
        # the API gives the total on the first page only (0 on later pages); reading it per page stopped every
        # search after 40 postings
        total = data.get("total") or total
        if start == 0 and (page + 1) * 20 >= total:
            return "done", total
        if not posts:
            if q == "" and page + 1 < max_pages:   # a walk that runs dry before its last page is not the whole board
                listing_failed(f"workday: the walk of the board ran dry at page {page + 1} of {max_pages}")
                return "failed", total
            return "done", total
        time.sleep(0.3)
    return ("done" if start else "capped"), total


def fetch(company, cfg, title_ok, max_pages=15):
    """A sampling role set (pipeline.scrape, the tech set) passes in cfg: max_pages (pages read per query),
    per_role (at most that many listing hits kept per value of title_ok, which then returns the role), keep_location
    (a test on the listing's location: a posting outside the set's country is never fetched) and count_only (return
    the listing hits without fetching a detail page). A listed posting the backlog holds under the same job path and
    title, with a text read recently (cfg["held"], common.Held), is returned as stored: no detail request.
    A board under WALK_UNDER postings is walked whole instead of searched (above), unless the set samples (max_pages,
    per_role: which postings a budget takes depends on the searches' order) or the board is narrowed by its own
    search text (keep_queries: a board shared with a parent company)."""
    host, tenant, site = cfg["host"], cfg["tenant"], cfg["site"]
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    walk = "max_pages" not in cfg and not cfg.get("per_role") and not cfg.get("keep_queries")
    max_pages = cfg.get("max_pages", max_pages)
    per_role, keep_location = cfg.get("per_role"), cfg.get("keep_location")
    taken = {}
    seen = {}

    def take(p):
        path = p.get("externalPath")
        role = title_ok(p.get("title", "")) if path and path not in seen else None
        if not role or (keep_location and not keep_location(p.get("locationsText", ""))):
            return
        if per_role:
            if taken.get(role, 0) >= per_role:
                return
            taken[role] = taken.get(role, 0) + 1
        seen[path] = p

    queries = cfg.get("queries", SEARCH_QUERIES)
    if walk:
        # the first page says how many the board lists: a board under WALK_UNDER whose pages are no more than twice
        # the searches (the searches cost about five requests each) is walked from there, the others are searched
        first = []
        how, total = _pages(base, cfg, "", 1, first.append)
        pages = -(-total // 20)
        if how == "failed":
            queries = []   # the board did not answer: recorded by post(), the fetch is incomplete
        elif total < WALK_UNDER and pages <= max(2 * len(queries), 25):
            for p in first:
                take(p)
            if pages > 1:
                _pages(base, cfg, "", pages, take, start=1)
            queries = []
    for q in queries:
        how, _ = _pages(base, cfg, q, max_pages, take)
        if how == "capped":  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"workday: stopped at the page cap for {q!r}", sampled="max_pages" in cfg)
    if cfg.get("count_only"):
        return [job(company, p.get("title", ""), f"https://{host}/{site}{path}", "", location=p.get("locationsText", ""),
                    external_id=(p.get("bulletFields") or [None])[0]) for path, p in seen.items()]
    out, known = [], held(cfg)
    for path, p in seen.items():
        o = known.take(p.get("title"), path=path)
        if o:
            out.append(o)
            continue
        r = get(f"{base}{path}", headers=HDR)
        if r.status_code != 200:
            continue
        info = r.json().get("jobPostingInfo", {})
        out.append(job(company, info.get("title") or p.get("title"), info.get("externalUrl") or f"https://{host}/{site}{path}",
                       strip_html(info.get("jobDescription", "")), location=info.get("location") or p.get("locationsText", ""),
                       posted=info.get("startDate"), external_id=info.get("jobReqId") or (p.get("bulletFields") or [None])[0],
                       extra={"timeType": info.get("timeType"), "remoteType": info.get("remoteType")}))
        time.sleep(0.2)
    return out


def detail_open(host, tenant, site, path):
    """Ask a Workday board's detail API about one job path (/job/...). True: it answers with the posting. False: it
    answers in its own JSON error shape that the posting is gone: 404 "S21" (not found) or 403 "S22" (the posting
    exists but is no longer posted; every unposted job checked answers this way). None: anything else: a wrong tenant
    gives 422; a bare 404 "HTTP_404" also met a job that was still listed, so it is not trusted; a block or a server
    error gives no Workday error body."""
    path = re.sub(r"/apply(?:/[^/]*)?/?$|/$", "", path)  # Phenom stores the apply link: .../job/<loc>/<id>/apply
    r = get(f"https://{host}/wday/cxs/{tenant}/{site}{path}", headers=HDR)
    try:
        body = r.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    if r.status_code == 200:
        info = body.get("jobPostingInfo")
        return True if isinstance(info, dict) and info.get("title") and info.get("posted") is not False else None
    if (r.status_code, body.get("errorCode")) in ((404, "S21"), (403, "S22")):
        return False
    return None


def still_open(company, cfg, posting):
    """True: the posting's detail answers with the job. False: Workday says the posting is not found or no longer
    posted. None: cannot tell (see detail_open), or the URL is not a Workday job URL."""
    url = posting.get("url") or ""
    # https://wd1.myworkdaysite.com/recruiting/{tenant}/{site}/job/... names the tenant in the path
    m = re.match(r"https://([^/]+\.myworkdaysite\.com)/(?:[a-z]{2}-[A-Z]{2}/)?recruiting/([^/]+)/([^/]+)(/job/[^?#]+)", url)
    if m:
        return detail_open(m.group(1), m.group(2), m.group(3), m.group(4))
    # https://{tenant}.wdN.myworkdayjobs.com/{site}/job/...: the tenant is the registry's for its host, else the
    # first label (a wrong guess gets a 422, which is None)
    m = re.match(r"https://([^/]+\.myworkdayjobs\.com)/(?:[a-z]{2}-[A-Z]{2}/)?([^/]+)(/job/[^?#]+)", url)
    if not m:
        return None
    host = m.group(1)
    tenant = cfg.get("tenant") if cfg.get("host") == host and cfg.get("tenant") else host.split(".")[0]
    return detail_open(host, tenant, m.group(2), m.group(3))
