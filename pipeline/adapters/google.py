import json
import re
import time
from urllib.parse import quote
from .common import get, strip_html, job

DS_RE = re.compile(r"AF_initDataCallback\(\{key: 'ds:1'.*?data:(.*?), sideChannel", re.S)


def fetch(company, cfg, title_ok, max_pages=40):
    seen = {}
    for q in cfg.get("queries", ['"product manager"', '"technical program manager"', '"product marketing"', '"product operations"', '"product lead"']):
        for page in range(1, max_pages + 1):
            r = get(f"https://www.google.com/about/careers/applications/jobs/results?q={quote(q)}&page={page}")
            if r.status_code != 200:
                break
            m = DS_RE.search(r.text)
            if not m:
                break
            try:
                rows = json.loads(m.group(1))[0]
            except (ValueError, IndexError, TypeError):
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
