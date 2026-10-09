import time
from .common import get, post, strip_html, job, SEARCH_QUERIES

HDR = {"Accept": "application/json", "Content-Type": "application/json"}


def fetch(company, cfg, title_ok, max_pages=15):
    host, tenant, site = cfg["host"], cfg["tenant"], cfg["site"]
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            body = {"appliedFacets": cfg.get("facets", {}), "limit": 20, "offset": page * 20, "searchText": q}
            r = post(f"{base}/jobs", json=body, headers=HDR)
            if r.status_code != 200:
                break
            data = r.json()
            posts = data.get("jobPostings", [])
            for p in posts:
                path = p.get("externalPath")
                if path and title_ok(p.get("title", "")):
                    seen[path] = p
            if (page + 1) * 20 >= data.get("total", 0) or not posts:
                break
            time.sleep(0.3)
    out = []
    for path, p in seen.items():
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
