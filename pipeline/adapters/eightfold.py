import time
from urllib.parse import quote
from .common import get, strip_html, job, SEARCH_QUERIES, listing_failed


def fetch(company, cfg, title_ok, max_pages=10):
    host, domain = cfg["host"], cfg["domain"]
    api = cfg.get("api", "pcsx")
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            start = page * 10 if api == "pcsx" else page * 20
            if api == "pcsx":
                url = f"https://{host}/api/pcsx/search?domain={domain}&query={quote(q)}&location=&start={start}&sort_by=relevance"
            else:
                url = f"https://{host}/api/apply/v2/jobs?domain={domain}&query={quote(q)}&start={start}&num=20"
            r = get(url, listing=True)
            if r.status_code != 200:
                break
            data = r.json()
            posts = data.get("data", {}).get("positions", []) if api == "pcsx" else data.get("positions", [])
            for p in posts:
                if title_ok(p.get("name", "")):
                    seen[p["id"]] = p
            if not posts or len(posts) < (10 if api == "pcsx" else 20):
                break
            time.sleep(0.3)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"eightfold: stopped at the page cap for {q!r}")
    out = []
    for pid, p in seen.items():
        if api == "pcsx":
            r = get(f"https://{host}/api/pcsx/position_details?position_id={pid}&domain={domain}&hl=en")
            d = r.json().get("data", {}) if r.status_code == 200 else {}
        else:
            r = get(f"https://{host}/api/apply/v2/jobs/{pid}?domain={domain}")
            d = r.json() if r.status_code == 200 else {}
        desc = d.get("jobDescription") or d.get("job_description") or ""
        if not desc:
            continue
        locs = d.get("locations") or p.get("locations") or []
        url = f"https://{host}{p.get('positionUrl')}" if p.get("positionUrl") else f"https://{host}/careers/job/{pid}"
        out.append(job(company, d.get("name") or p.get("name"), url, strip_html(desc), location="; ".join(locs[:3]),
                       posted=d.get("postedTs") or p.get("postedTs"), external_id=d.get("displayJobId") or pid,
                       extra={"department": d.get("department") or p.get("department")}))
        time.sleep(0.2)
    return out
