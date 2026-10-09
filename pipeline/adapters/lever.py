from .common import get, strip_html, job


def fetch(company, cfg, title_ok):
    board = cfg["board"]
    r = get(f"https://api.lever.co/v0/postings/{board}?mode=json")
    r.raise_for_status()
    out = []
    for j in r.json():
        if not title_ok(j.get("text", "")):
            continue
        parts = [j.get("descriptionPlain") or strip_html(j.get("description", ""))]
        for lst in j.get("lists", []):
            parts.append(lst.get("text", ""))
            parts.append(strip_html(lst.get("content", "")))
        parts.append(j.get("additionalPlain") or "")
        cats = j.get("categories") or {}
        out.append(job(company, j["text"], j.get("hostedUrl"), "\n".join(p for p in parts if p),
                       location=cats.get("location", ""), posted=j.get("createdAt"), external_id=j.get("id"),
                       extra={"team": cats.get("team"), "commitment": cats.get("commitment")}))
    return out
