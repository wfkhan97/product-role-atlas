import datetime
import html
import re
import time
from .common import get, strip_html, job, listing_failed

XHR = {"X-Requested-With": "XMLHttpRequest", "Accept": "application/json"}
SEARCH_URL_RE = re.compile(r'data-search-url="([^"]+)"')
ITEM_RE = re.compile(r'(?s)<li class="search-results__item">(.*?)</li>')
LINK_RE = re.compile(r'(?s)class="search-results__req_title"[^>]*href="(/jobs/([^"?/]+)[^"]*)"[^>]*>(.*?)</a>\s*(?:<div>(.*?)</div>)?')
AGE_RE = re.compile(r'(?s)search-results__post-time[^>]*>\s*([^<]*?)\s*<')
DESC_RE = re.compile(r'(?s)<section class="job-details__description[^>]*>(.*?)(?:<aside\b|</section>\s*<section\b|</main>)')
DAYS = {"h": 0, "d": 1, "w": 7, "mo": 30, "y": 365}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _posted(card, today=None):
    """The list shows an age ("5d", "3w") for new postings and a day ("Sep 15") for older ones, never a year."""
    m = AGE_RE.search(card)
    text = m.group(1) if m else ""
    today = today or datetime.date.today()
    m = re.match(r"(\d+)\s*(h|d|w|mo|y)", text)
    if m:
        return (today - datetime.timedelta(days=int(m.group(1)) * DAYS[m.group(2)])).isoformat()
    m = re.match(r"([A-Z][a-z]{2})[a-z]* (\d{1,2})(?:,? (\d{4}))?$", text)
    if m and m.group(1) in MONTHS:
        month, day = MONTHS.index(m.group(1)) + 1, int(m.group(2))
        try:
            d = datetime.date(int(m.group(3) or today.year), month, day)
            if d > today and not m.group(3):  # no year given: the latest such day that has passed
                d = d.replace(year=d.year - 1)
        except ValueError:
            return None
        return d.isoformat()
    return None


def fetch(company, cfg, title_ok, max_pages=40):
    """Yello (recsolu.com) job boards: the board page names its search URL; that answers with 25 cards a page.

    config: host ("kearney.recsolu.com") and board (the number or key in /job_boards/<board>). The whole board is
    listed (empty search) and filtered by title, so config["queries"] is not used. Then each job page is read.
    """
    host, board = cfg["host"], cfg.get("board", 1)
    r = get(f"https://{host}/job_boards/{board}", headers={"Accept": "text/html"})
    r.raise_for_status()
    m = SEARCH_URL_RE.search(r.text)
    if not m:
        raise RuntimeError(f"no search URL on https://{host}/job_boards/{board}")
    search = html.unescape(m.group(1))
    seen, listed = {}, set()
    for page in range(1, cfg.get("max_pages", max_pages) + 1):
        r = get(search, params={"query": "", "page_number": page}, headers=XHR, listing=True)
        if r.status_code != 200:
            break
        data = r.json()
        new = 0
        for card in ITEM_RE.findall(data.get("html") or ""):
            m = LINK_RE.search(card)
            if not m:
                continue
            path, jid, title = html.unescape(m.group(1)), m.group(2), strip_html(m.group(3))
            new += jid not in listed
            listed.add(jid)
            if jid in seen or not title_ok(title):
                continue
            # the spans under the title: employment type, region, cities
            spans = [strip_html(s) for s in re.findall(r"(?s)<span[^>]*>(.*?)</span>", m.group(4) or "")]
            seen[jid] = (f"https://{host}{path}", title, spans, _posted(card))
        if not data.get("more_requisitions") or not new:
            break
        time.sleep(0.4)
    else:  # the page cap ended the search, not the results: what lies past it may be open
        listing_failed("yello: stopped at the page cap")
    out = []
    for jid, (url, title, spans, posted) in seen.items():
        r = get(url, headers={"Accept": "text/html"})
        time.sleep(0.4)
        if r.status_code != 200:
            continue
        m = DESC_RE.search(r.text)
        desc = strip_html(m.group(1)) if m else ""
        desc = re.sub(r"^Job Description\s*", "", desc)
        kind, region, cities = (spans + ["", "", ""])[:3]
        out.append(job(company, title, url, desc, location=cities or region, posted=posted, external_id=jid,
                       extra={"type": kind, "region": region}))
    return out


def still_open(company, cfg, posting, max_pages=4):
    """A Yello job page keeps showing a job after it has left the board, so the page alone never says True.

    True: the board's own search for the posting's title lists its id. False: the job page redirects to the job board,
    which is how Yello answers for a job it no longer has. None: anything else (the job page still renders but the
    search does not list it, a block, a server error).
    """
    host, board, jid = cfg.get("host"), cfg.get("board", 1), posting.get("external_id")
    url, title = posting.get("url") or "", (posting.get("title") or "").strip()
    if not host or not jid or not url.startswith("https://"):
        return None
    r = get(url, headers={"Accept": "text/html"}, allow_redirects=False)
    if r.status_code in (404, 410) or (r.status_code in (301, 302, 303)
                                       and "/job_boards/" in (r.headers.get("Location") or "")):
        return False
    if r.status_code != 200 or not title:
        return None
    r = get(f"https://{host}/job_boards/{board}", headers={"Accept": "text/html"})
    m = SEARCH_URL_RE.search(r.text) if r.status_code == 200 else None
    if not m:
        return None
    search = html.unescape(m.group(1))
    for page in range(1, max_pages + 1):
        time.sleep(0.4)
        r = get(search, params={"query": title, "page_number": page}, headers=XHR)
        if r.status_code != 200:
            return None
        try:
            data = r.json()
        except ValueError:
            return None
        for card in ITEM_RE.findall(data.get("html") or ""):
            m = LINK_RE.search(card)
            if m and m.group(2) == jid:
                return True
        if not data.get("more_requisitions"):
            return None
    return None
