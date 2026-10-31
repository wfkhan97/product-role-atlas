import json
import re
import time
from urllib.parse import quote
from .common import get, strip_html, job, listing_failed

DS_RE = re.compile(r"AF_initDataCallback\(\{key: 'ds:1'.*?data:(.*?), sideChannel", re.S)


def fetch(company, cfg, title_ok, max_pages=40):
    seen = {}
    for q in cfg.get("queries", ['"product manager"', '"technical program manager"', '"product marketing"', '"product operations"', '"product lead"']):
        for page in range(1, max_pages + 1):
            r = get(f"https://www.google.com/about/careers/applications/jobs/results?q={quote(q)}&page={page}", listing=True)
            if r.status_code != 200:
                break
            m = DS_RE.search(r.text)
            if not m:
                listing_failed(f"google: no ds:1 data in results page for {q!r} page {page}")
                break
            try:
                data = json.loads(m.group(1))
            except ValueError:
                listing_failed(f"google: ds:1 data not JSON for {q!r} page {page}")
                break
            # a page past the last one carries null or an empty list where the rows go
            rows = data[0] if isinstance(data, list) and data else None
            if data is not None and not isinstance(data, list):
                listing_failed(f"google: ds:1 data not a list for {q!r} page {page}")
                break
            if not rows:
                break
            new = 0
            for row in rows:
                jid, title = row[0], row[1]
                if jid not in seen and title_ok(title):
                    seen[jid] = row
                    new += 1
            if len(rows) < 20:
                break
            time.sleep(0.5)
        else:  # the page cap ended the search, not the results: what lies past it may be open
            listing_failed(f"google: stopped at the page cap for {q!r}")
    out = []
    for jid, row in seen.items():
        def part(i):
            v = row[i] if len(row) > i else None
            if isinstance(v, list):
                v = v[1] if len(v) > 1 else ""
            return strip_html(v or "")
        desc = "\n".join(p for p in [part(10), "Responsibilities:", part(3), "Qualifications:", part(4)] if p)
        locs = row[9] if len(row) > 9 and isinstance(row[9], list) else []
        loc = "; ".join(l[0] for l in locs[:3] if isinstance(l, list) and l)
        out.append(job(company, row[1], f"https://www.google.com/about/careers/applications/jobs/results/{jid}", desc,
                       location=loc, posted=None, external_id=jid, extra={"org": row[7] if len(row) > 7 else None}))
    return out


DS0_RE = re.compile(r"AF_initDataCallback\(\{key: 'ds:0'.*?data:(.*?), sideChannel", re.S)
DS0_ERR_RE = re.compile(r"AF_initDataCallback\(\{key: 'ds:0'[^{]*?data:\[(\d+),null,.*?\]\]\],errorHasStatus: true", re.S)


def still_open(company, cfg, posting):
    """Read the job's own results page. True: its ds:0 data is this job. False: ds:0 is the error with status 5
    (NOT_FOUND) and the page says "Job not found. This job may have been taken down." None: anything else."""
    jid = str(posting.get("external_id") or "")
    if not jid.isdigit():
        return None
    r = get(f"https://www.google.com/about/careers/applications/jobs/results/{jid}")
    if r.status_code != 200:
        return None
    err = DS0_ERR_RE.search(r.text)
    if err:
        return False if err.group(1) == "5" and "Job not found" in r.text else None
    m = DS0_RE.search(r.text)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return None
    row = data[0] if isinstance(data, list) and data and isinstance(data[0], list) else None
    return True if row and str(row[0]) == jid else None
