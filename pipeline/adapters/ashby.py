from .common import get, strip_html, job


def fetch(company, cfg, title_ok):
    board = cfg["board"]
    r = get(f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true", listing=True)
    r.raise_for_status()
    out = []
    for j in r.json().get("jobs", []):
        if not title_ok(j.get("title", "")):
            continue
        desc = j.get("descriptionPlain") or strip_html(j.get("descriptionHtml", ""))
        out.append(job(company, j["title"], j.get("jobUrl"), desc, location=j.get("location", ""),
                       posted=j.get("publishedAt"), external_id=j.get("id"),
                       extra={"department": j.get("department"), "team": j.get("team"),
                              "compensation": (j.get("compensation") or {}).get("compensationTierSummary")}))
    return out
