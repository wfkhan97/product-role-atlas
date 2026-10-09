from .common import get, strip_html, job


def fetch(company, cfg, title_ok):
    board = cfg["board"]
    r = get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true")
    r.raise_for_status()
    out = []
    for j in r.json().get("jobs", []):
        if not title_ok(j.get("title", "")):
            continue
        out.append(job(company, j["title"], j.get("absolute_url"), strip_html(j.get("content", "")),
                       location=(j.get("location") or {}).get("name", ""), posted=j.get("updated_at"),
                       external_id=j.get("id"),
                       extra={"departments": [d.get("name") for d in j.get("departments", [])]}))
    return out
