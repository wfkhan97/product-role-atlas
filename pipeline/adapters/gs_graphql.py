"""Goldman Sachs 'Higher' careers site: custom GraphQL gateway."""
import copy
import time
import uuid
from .common import post, strip_html, job, SEARCH_QUERIES, listing_failed


def fetch(company, cfg, title_ok, max_pages=10):
    url = f"https://{cfg['host']}{cfg.get('graphql_path', '/gateway/api/v1/graphql')}"
    hdr = {"Content-Type": "application/json", "Origin": "https://higher.gs.com", "x-higher-request-id": str(uuid.uuid4())}
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(1, max_pages + 1):
            v = copy.deepcopy(cfg["search_variables"])
            v["searchQueryInput"]["searchTerm"] = q
            v["searchQueryInput"]["page"] = {"pageNumber": page, "pageSize": 20}
            r = post(url, listing=True, json={"query": cfg["search_query"], "variables": v}, headers=hdr)
            if r.status_code != 200:
                break
            rs = r.json().get("data", {}).get("roleSearch", {})
            items = rs.get("items", [])
            for it in items:
                if title_ok(it.get("jobTitle", "")):
                    seen[it["externalSource"]["sourceId"]] = it
            if not items or page * 20 >= rs.get("totalCount", 0):
                break
            time.sleep(0.3)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"gs_graphql: stopped at the page cap for {q!r}")
    out = []
    for sid, it in seen.items():
        r = post(url, json={"query": cfg["detail_query"], "variables": {"id": sid}}, headers=hdr)
        if r.status_code != 200:
            continue
        d = (r.json().get("data") or {}).get("role") or {}
        desc = strip_html(d.get("descriptionHtml") or d.get("shortDescription") or "")
        if not desc:
            continue
        locs = it.get("locations") or []
        loc = ", ".join(x for x in [locs[0].get("city"), locs[0].get("state"), locs[0].get("country")] if x) if locs else ""
        out.append(job(company, d.get("jobTitle") or it.get("jobTitle"), f"https://higher.gs.com/roles/{sid}", desc, location=loc,
                       external_id=sid, extra={"division": it.get("division"), "corporateTitle": it.get("corporateTitle")}))
        time.sleep(0.2)
    return out
