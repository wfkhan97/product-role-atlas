import collections
import html
import re
import threading
import time
import requests

from pipeline import log

logger = log.get(__name__)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "application/json, text/html;q=0.9, */*;q=0.8"})
# what the retry loops below met: "429" answers waited on, "5xx" server errors waited on, "retries" after a network
# error, "requests" made
STATS = collections.Counter()
RETRY_STATUS = (429, 500, 502, 503, 504)  # answers worth waiting on: rate limits and a board that is briefly down

# The listing pages of the employer this thread is fetching that could not be read. pipeline.scrape fetches employers
# in parallel threads (an adapter never starts its own), calls start_fetch() before each and reads listing_failures()
# after: a fetch with a failed listing page is incomplete, so the merge closes nothing. Without this an adapter that
# stops paging on a bad answer looked like a board whose other jobs had all closed.
_fetch = threading.local()


def start_fetch():
    _fetch.failed = []


def listing_failures():
    return list(getattr(_fetch, "failed", []))


def listing_failed(what):
    """Record a listing page that could not be read: an adapter calls this where a page that should list jobs gives a
    body it cannot parse; a non-2xx answer to a request made with listing=True is recorded by the request itself."""
    if not hasattr(_fetch, "failed"):
        _fetch.failed = []
    _fetch.failed.append(str(what)[:200])
    logger.warning("listing page not read: %s", str(what)[:200])

# Queries used by search-based ATSes (Workday, Eightfold, ...). Title filtering happens later.
SEARCH_QUERIES = [
    "product manager",
    "product management",
    "technical program manager",
    "product marketing manager",
    "product operations",
    "product owner",
    "product analyst",
    "head of product",
    "director product",
    "product engineer",          # the product_engineer family (2026-10-30)
    "forward deployed engineer",
]


def _request(method, url, kw, listing=False):
    """Up to three tries: a 429 or a 5xx answer waits 5, 10 seconds; a network error waits 2 and is raised on the
    third. With listing=True (a page that lists jobs, not one job's detail) a final answer that is not 2xx is recorded
    with listing_failed. Only the method and the URL are logged, never the headers or the body."""
    kw.setdefault("timeout", 30)
    for attempt in range(3):
        STATS["requests"] += 1
        try:
            r = SESSION.request(method, url, **kw)
            if r.status_code in RETRY_STATUS and attempt < 2:
                STATS["429" if r.status_code == 429 else "5xx"] += 1
                logger.warning("%d from %s %s; waiting %ds", r.status_code, method, url, 5 * (attempt + 1))
                time.sleep(5 * (attempt + 1))
                continue
            break
        except requests.RequestException as e:
            if attempt == 2:
                raise
            STATS["retries"] += 1
            logger.warning("%s %s failed (%s: %s); retrying", method, url, type(e).__name__, str(e)[:120])
            time.sleep(2)
    if listing and not 200 <= r.status_code < 300:
        listing_failed(f"{method} {url}: HTTP {r.status_code}")
    return r


def get(url, listing=False, **kw):
    return _request("GET", url, kw, listing)


def post(url, listing=False, **kw):
    return _request("POST", url, kw, listing)


TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_RE = re.compile(r"(?is)<\s*(script|style)\b[^>]*>.*?<\s*/\s*\1\s*>")
WS_RE = re.compile(r"[ \t\r\f\v]+")
NL_RE = re.compile(r"\n{3,}")


def strip_html(s):
    """HTML -> plain text, keeping line breaks for block elements and list items; script and style blocks are dropped
    with their content."""
    if not s:
        return ""
    s = html.unescape(s)
    if "<" in s and "&lt;" in s and s.count("&lt;") > s.count("<"):
        s = html.unescape(s)
    s = SCRIPT_RE.sub(" ", s)
    s = re.sub(r"(?i)<\s*br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</\s*(p|div|li|h[1-6]|tr|ul|ol|section)\s*>", "\n", s)
    s = re.sub(r"(?i)<\s*li[^>]*>", "- ", s)
    s = TAG_RE.sub(" ", s)
    s = html.unescape(s)
    s = WS_RE.sub(" ", s)
    s = "\n".join(line.strip() for line in s.split("\n"))
    s = NL_RE.sub("\n\n", s)
    return s.strip()


def job(company, title, url, description, location="", posted=None, external_id=None, extra=None):
    return {
        "company": company,
        "title": (title or "").strip(),
        "url": url,
        "location": location or "",
        "posted": posted,
        "external_id": str(external_id) if external_id is not None else None,
        "description": description or "",
        "extra": extra or {},
    }
