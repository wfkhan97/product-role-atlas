import html
import re
import time
from urllib.parse import quote
from .common import get, strip_html, job
from . import jsonld

CHROME_RE = re.compile(r"(?is)<(script|style|header|footer|nav|form)\b.*?</\1>")
PLACE_RE = re.compile(r"^[^\n,]{2,40}, [^\n,]{2,40}, [A-Z][A-Za-z ]{3,30}$", re.M)


def fetch(company, cfg, title_ok, max_pages=10):
    """Avature career portals (Bain, Deloitte US): server-rendered search pages, then each job page.

    config: host, search (path of the search page), detail (path segment of job links), prefix (name of the paging parameters).
    """
    host, search, detail, prefix = cfg["host"], cfg["search"], cfg["detail"], cfg["prefix"]
    link_re = re.compile(rf'href="(https://{re.escape(host)}[^"]*/{detail}/[^"?]+/(\d+))"[^>]*>\s*([^<]+?)\s*<')
    size = cfg.get("page_size", 50)
    seen = {}
    for q in cfg.get("queries", ["consultant"]):
        for page in range(cfg.get("max_pages", max_pages)):
            r = get(f"https://{host}{search}/{quote(q)}", params={f"{prefix}RecordsPerPage": size, f"{prefix}Offset": page * size})
            if r.status_code != 200:
                break
            links = {}
            for m in link_re.finditer(r.text):  # each card links twice; the first link carries the title
                links.setdefault(m.group(2), (m.group(1), html.unescape(m.group(3))))
            for jid, (url, title) in links.items():
                if title_ok(title):
                    seen[jid] = (url, title)
            if len(links) < size:
                break
            time.sleep(0.4)
    out = []
    for jid, (url, title) in seen.items():
        r = get(url)
        if r.status_code != 200:
            continue
        text = strip_html(CHROME_RE.sub("", r.text))
        p = jsonld.job_posting(r.text) or {}
        desc = strip_html(p.get("description") or "")
        if len(desc) < 300:
            desc = text.split("Description & Requirements", 1)[-1].split("\nGo back\n")[0].strip()
        m = re.search(r"Location\(s\)\s+([^\n]+)", text)
        loc = m.group(1) if m else "; ".join(dict.fromkeys(PLACE_RE.findall(text[:6000])))[:300]
        out.append(job(company, title, url, desc, location=loc, posted=p.get("datePosted"), external_id=jid))
        time.sleep(0.3)
    return out
