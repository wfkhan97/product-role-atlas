import json
import re
import time
from .common import get, post, strip_html, job, listing_failed, SEARCH_QUERIES

def _ddo(html):
    """Extract the phApp.ddo JSON object with balanced-brace scanning."""
    i = html.find("phApp.ddo")
    if i < 0:
        return None
    j = html.find("{", i)
    depth, instr, esc = 0, False, False
    for k in range(j, len(html)):
        ch = html[k]
        if instr:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                instr = False
            continue
        if ch == '"':
            instr = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[j:k + 1])
                except ValueError:
                    return None
    return None


PAGE_SIZE = 100  # Phenom widgets accept up to ~200; 100 keeps request count low and verify_one's 2-page cap meaningful


def _body(q, start, size):
    return {"lang": "en_us", "deviceType": "desktop", "country": "us", "pageName": "search-results",
            "ddoKey": "refineSearch", "sortBy": "", "subsearch": "", "from": start, "jobs": True, "counts": True,
            "all_fields": ["category", "country", "state", "city"], "size": size, "clearAll": False,
            "jdsource": "facets", "isSliderEnable": False, "pageId": "page12", "siteType": "external",
            "keywords": q, "global": True, "selected_fields": {}, "locationData": {}}


def _locale_parts(p):
    """('gb', 'en') from a record locale like en_GB; Phenom job pages live under /{country}/{lang}/job/..."""
    loc = (p.get("locale") or "en_US").replace("-", "_")
    lang, _, cc = loc.partition("_")
    return (cc or "us").lower(), (lang or "en").lower()


def _page_url(host, p):
    cc, lang = _locale_parts(p)
    return f"https://{host}/{cc}/{lang}/job/{p.get('jobId') or p.get('jobSeqNo')}"


def _job_detail(host, path, p):
    """Phenom widgets jobDetail: full record (description, applyUrl) without scraping the HTML page."""
    cc, lang = _locale_parts(p)
    body = {"lang": f"{lang}_{cc}", "deviceType": "desktop", "country": cc, "pageName": "job-details",
            "ddoKey": "jobDetail", "jobId": p.get("jobId"), "jobSeqNo": p.get("jobSeqNo"), "siteType": "external"}
    r = post(f"https://{host}{path}", json=body, headers={"Content-Type": "application/json"})
    if r.status_code != 200:
        return {}
    try:
        return ((r.json().get("jobDetail") or {}).get("data") or {}).get("job") or {}
    except ValueError:
        return {}


def fetch(company, cfg, title_ok, max_pages=25):
    host = cfg["host"]
    path = cfg.get("widgets_path", "/widgets")
    if isinstance(cfg.get("detail"), dict) and cfg["detail"].get("ats") == "workday" and not cfg.get("workday_detail"):
        cfg = dict(cfg, workday_detail=cfg["detail"])
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            r = post(f"https://{host}{path}", listing=True, json=_body(q, page * PAGE_SIZE, PAGE_SIZE),
                     headers={"Content-Type": "application/json"})
            if r.status_code != 200:
                break
            try:
                body = r.json()
            except ValueError:
                listing_failed(f"phenom: search body not JSON for {q!r} page {page}")
                break
            if not isinstance(body, dict) or not isinstance(body.get("refineSearch"), dict):
                listing_failed(f"phenom: no refineSearch in answer for {q!r} page {page}")
                break
            rs = body["refineSearch"]
            data = rs.get("data") or {}
            posts = data.get("jobs", [])
            for p in posts:
                if title_ok(p.get("title", "")):
                    seen[p.get("jobSeqNo") or p.get("jobId")] = p
            # totalHits lives at refineSearch.totalHits on real Phenom responses (PMI, TD Synnex); data.totalHits is a fallback
            total = rs.get("totalHits") or data.get("totalHits") or 0
            if not posts or (page + 1) * PAGE_SIZE >= total:
                break
            time.sleep(0.3)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"phenom: stopped at the page cap for {q!r}")
    out = []
    for key, p in seen.items():
        desc = p.get("description") or ""
        url = p.get("applyUrl") or p.get("jobUrl") or ""
        if (not desc or len(desc) < 500) and cfg.get("workday_detail") and url:
            # e.g. CVS: Phenom search, Workday job detail. applyUrl looks like https://host/site/job/.../apply
            wd = cfg["workday_detail"]
            m2 = re.search(r"myworkday(?:jobs|site)\.com/(?:recruiting/[^/]+/)?[^/]+(/job/.*?)(?:/apply)?/?$", url)
            if m2:
                r = get(f"https://{wd['host']}/wday/cxs/{wd['tenant']}/{wd['site']}{m2.group(1)}", headers={"Accept": "application/json"})
                if r.status_code == 200:
                    try:
                        info = r.json().get("jobPostingInfo", {})
                        desc = info.get("jobDescription") or desc
                        url = info.get("externalUrl") or url
                    except ValueError:
                        pass
        if not desc or len(desc) < 500:
            # cheapest path: the jobDetail widget returns the full record as JSON (PMI records carry no URL at all)
            jd = _job_detail(host, path, p)
            if jd.get("description"):
                desc = jd["description"]
            url = url or jd.get("applyUrl") or jd.get("jobUrl") or ""
        if not desc or len(desc) < 500:
            # job page embeds the full record in phApp.ddo; prefer the Phenom page over a foreign applyUrl (Taleo etc.)
            # the page path is locale-specific (/gb/en/job/... for en_GB); /us/en/... redirects to the site home elsewhere
            page_url = p.get("jobUrl") if p.get("jobUrl") and host in p.get("jobUrl") else (url if url and host in url else _page_url(host, p))
            r = get(page_url)
            ddo = _ddo(r.text) if r.status_code == 200 else None
            if ddo:
                jd = ((ddo.get("jobDetail") or {}).get("data") or {}).get("job") or {}
                desc = jd.get("description") or desc
                url = url or jd.get("applyUrl") or page_url
            if url and host not in url and "myworkday" not in url:
                url = page_url  # link people to the readable job page, not a foreign apply/login URL
            if (not desc or len(desc) < 500) and r.status_code == 200:
                from .jsonld import job_posting
                p2 = job_posting(r.text)
                if p2 and p2.get("description"):
                    desc = p2["description"]
            url = url or page_url
        if not desc:
            continue
        if not url or (host not in url and "myworkday" not in url):
            url = _page_url(host, p)  # link people to the readable job page, not a foreign apply/login URL
        loc = ", ".join(x for x in [p.get("city"), p.get("state"), p.get("country")] if x)
        out.append(job(company, p.get("title"), url, strip_html(desc), location=loc, posted=p.get("postedDate"),
                       external_id=p.get("jobId") or key, extra={"category": p.get("category")}))
        time.sleep(0.2)
    return out


def still_open(company, cfg, posting):
    """Read the posting's Phenom job page: the stored URL when it is on the Phenom host, else /us/en/job/<jobId> (CVS,
    Regions, ITW store a Workday apply link; a page in the wrong locale redirects to the right one, asked once). True: the page's
    jobDetail holds this job. False: the page answers 404 or 410, how Phenom pages answer a job that is gone (BCG,
    CVS, PMI, United, Synovus, Zimmer). None: anything else, including a record marked "Deleted" on a page that still
    answers 200 (Newmont keeps those pages; the job is out of the search, but the mark is one board's field)."""
    host, jid, url = cfg.get("host"), str(posting.get("external_id") or ""), posting.get("url") or ""
    if not host:
        return None
    if not (url.startswith(f"https://{host}/") and "/job/" in url):
        if not jid:
            return None
        url = f"https://{host}/us/en/job/{jid}"
    r = get(url, allow_redirects=False)
    if 300 <= r.status_code < 400 and jid:
        # a page asked in the wrong locale redirects to the right one: to its job page (BCG) or to its home, /global/en
        # (Labcorp); ask that locale's job page once
        m = re.match(r"(?:https://[^/]+)?/([a-z]{2,6})/([a-z]{2})(?:/job/[^/?#]+)?/?$", r.headers.get("Location") or "")
        retry = f"https://{host}/{m.group(1)}/{m.group(2)}/job/{jid}" if m else None
        if retry and retry != url:
            r = get(retry, allow_redirects=False)
    if r.status_code in (404, 410):
        return False
    if r.status_code != 200:
        return None
    jd = (((_ddo(r.text) or {}).get("jobDetail") or {}).get("data") or {}).get("job") or {}
    if not jd or (jid and str(jd.get("jobId") or "") != jid):
        return None
    if str(jd.get("jobStatusVal") or "").lower() == "deleted":
        return None
    return True
