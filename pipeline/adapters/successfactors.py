"""SAP SuccessFactors career sites (HTML only)."""
import re
import time
from urllib.parse import quote, quote_plus
from .common import get, strip_html, job, SEARCH_QUERIES

LINK_RE = re.compile(r'<a[^>]+class="jobTitle-link[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S)
DESC_RE = re.compile(r'<span[^>]+class="jobdescription"[^>]*>(.*?)</span>\s*<(?:/div|div|p|section|/section)', re.S)
RSS_ITEM_RE = re.compile(r"<item>.*?<title>(.*?)</title>.*?<link>(.*?)</link>.*?</item>", re.S)


def fetch(company, cfg, title_ok, max_pages=8):
    host = cfg["host"]
    seen = {}
    for q in cfg.get("queries", SEARCH_QUERIES):
        for page in range(max_pages):
            r = get(f"https://{host}/search/?q={quote_plus(q)}&locale=en_US&startrow={page*15}")
            if r.status_code != 200:
                break
            found = 0
            for m in LINK_RE.finditer(r.text):
                href, title = m.group(1), strip_html(m.group(2)).strip()
                if href not in seen and title_ok(title):
                    seen[href] = title
                    found += 1
            if "jobTitle-link" not in r.text or found == 0 and page > 0:
                break
            time.sleep(0.4)
        if not seen:
            # some SuccessFactors layouts render results client-side; the RSS feed still works
            r = get(f"https://{host}/services/rss/job/?locale=en_US&keywords=({quote(q)})")
            if r.status_code == 200:
                for m in RSS_ITEM_RE.finditer(r.text):
                    title = strip_html(m.group(1)).strip(); href = m.group(2).strip()
                    if href not in seen and title_ok(title):
                        seen[href] = title
    out = []
    for href, title in seen.items():
        url = href if href.startswith("http") else f"https://{host}{href}"
        r = get(url)
        if r.status_code != 200:
            continue
        m = DESC_RE.search(r.text)
        desc = strip_html(m.group(1)) if m else ""
        if len(desc) < 300:
            from .jsonld import job_posting
            p = job_posting(r.text)
            if p and p.get("description"):
                desc = strip_html(p["description"])
        if not desc:
            continue
        out.append(job(company, title, url, desc, external_id=href.rstrip("/").rsplit("/", 1)[-1]))
        time.sleep(0.3)
    return out
