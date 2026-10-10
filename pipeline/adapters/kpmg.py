import re
import time
from .common import get, strip_html, job
from . import jsonld

BASE = "https://www.kpmguscareers.com"
CARD_RE = re.compile(r'href="/jobdetail/\?jobId=(\d+)"')


def fetch(company, cfg, title_ok, max_pages=25):
    """KPMG US runs its own careers site: a JSON search that returns HTML cards, and JSON-LD on each job page."""
    ids = set()
    for q in cfg.get("queries", ["strategy"]):
        for page in range(1, max_pages + 1):
            r = get(f"{BASE}/wp-content/themes/understrap-child-main/page-templates/google/get-jobs.php",
                    params={"ajax": 1, "page_type": "", "keyword": q, "spage": page})
            if r.status_code != 200:
                break
            found = set(CARD_RE.findall((r.json().get("postings") or {}).get("jobs") or ""))
            if not found - ids:
                break
            ids |= found
            time.sleep(0.3)
    out = []
    for jid in sorted(ids):
        url = f"{BASE}/jobdetail/?jobId={jid}"
        r = get(url)
        p = jsonld.job_posting(r.text) if r.status_code == 200 else None
        if not p or not title_ok(p.get("title", "")):
            continue
        out.append(job(company, p.get("title"), url, strip_html(p.get("description", "")), location=jsonld.location(p),
                       posted=p.get("datePosted"), external_id=jid))
        time.sleep(0.2)
    return out
