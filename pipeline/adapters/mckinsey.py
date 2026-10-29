import time
from .common import get, strip_html, job, listing_failed


def fetch(company, cfg, title_ok, max_pages=30):
    """McKinsey's own careers API. The gateway id in the URL comes from the careers page's runtime config."""
    base = cfg.get("api", "https://gateway.mckinsey.com/apigw-x0cceuow60/v1/api/jobs")
    seen = {}
    for q in cfg.get("queries", ["associate"]):
        for page in range(1, max_pages + 1):
            r = get(f"{base}/search", params={"pageSize": 20, "start": page, "lang": "en", "q": q}, listing=True)
            if r.status_code != 200:
                break
            data = r.json()
            docs = data.get("docs") or []
            for d in docs:
                if title_ok(d.get("title", "")):
                    seen[d["jobID"]] = d
            if not docs or page * 20 >= (data.get("numFound") or 0):
                break
            time.sleep(0.3)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"mckinsey: stopped at the page cap for {q!r}")
    out = []
    for jid, d in seen.items():
        desc = "\n".join(strip_html(d.get(k) or "") for k in ("whoYouWillWorkWith", "whatYouWillDo", "yourBackground"))
        places = list(dict.fromkeys(f"{c}, {n}" for c, n in zip(d.get("cities") or [], d.get("countries") or [])))
        out.append(job(company, d.get("title"), f"https://www.mckinsey.com/careers/search-jobs/jobs/{d.get('friendlyURL')}", desc,
                       location="; ".join(places[:6]), external_id=jid, extra={"interest": d.get("interest")}))
    return out


def still_open(company, cfg, posting, max_pages=5):
    """The job pages on www.mckinsey.com sit behind a bot wall and the API has no detail request, so this board gives
    no gone signal: a search that does not list a job may only rank it elsewhere.

    True: the API's search for the posting's title lists its jobID. None: anything else. Never False.
    """
    base = cfg.get("api", "https://gateway.mckinsey.com/apigw-x0cceuow60/v1/api/jobs")
    jid, title = str(posting.get("external_id") or ""), (posting.get("title") or "").strip()
    if not jid or not title:
        return None
    for page in range(1, max_pages + 1):
        r = get(f"{base}/search", params={"pageSize": 20, "start": page, "lang": "en", "q": title})
        if r.status_code != 200:
            return None
        try:
            data = r.json()
        except ValueError:
            return None
        docs = data.get("docs") or []
        if any(str(d.get("jobID")) == jid for d in docs if isinstance(d, dict)):
            return True
        if not docs or page * 20 >= (data.get("numFound") or 0):
            return None
        time.sleep(0.3)
    return None
