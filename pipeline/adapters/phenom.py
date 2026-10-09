import json
import re
import time
from .common import get, post, strip_html, job, SEARCH_QUERIES

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
            r = post(f"https://{host}{path}", json=_body(q, page * PAGE_SIZE, PAGE_SIZE), headers={"Content-Type": "application/json"})
            if r.status_code != 200:
                break
            try:
                rs = r.json().get("refineSearch", {})
                data = rs.get("data", {})
            except ValueError:
                break
            posts = data.get("jobs", [])
            for p in posts:
                if title_ok(p.get("title", "")):
                    seen[p.get("jobSeqNo") or p.get("jobId")] = p
            # totalHits lives at refineSearch.totalHits on real Phenom responses (PMI, TD Synnex); data.totalHits is a fallback
            total = rs.get("totalHits") or data.get("totalHits") or 0
            if not posts or (page + 1) * PAGE_SIZE >= total:
                break
            time.sleep(0.3)
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
