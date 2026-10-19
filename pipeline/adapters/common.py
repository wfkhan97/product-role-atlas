import collections
import html
import re
import time
import requests

from pipeline import log

logger = log.get(__name__)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "application/json, text/html;q=0.9, */*;q=0.8"})
# what the retry loops below met: "429" answers waited on, "retries" after a network error, "requests" made
STATS = collections.Counter()

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
]


def _request(method, url, kw):
    """Up to three tries: a 429 answer waits 5, 10 seconds; a network error waits 2 and is raised on the third.
    Only the method and the URL are logged, never the headers or the body."""
    kw.setdefault("timeout", 30)
    for attempt in range(3):
        STATS["requests"] += 1
        try:
            r = SESSION.request(method, url, **kw)
            if r.status_code == 429 and attempt < 2:
                STATS["429"] += 1
                logger.warning("429 from %s %s; waiting %ds", method, url, 5 * (attempt + 1))
                time.sleep(5 * (attempt + 1))
                continue
            return r
        except requests.RequestException as e:
            if attempt == 2:
                raise
            STATS["retries"] += 1
            logger.warning("%s %s failed (%s: %s); retrying", method, url, type(e).__name__, str(e)[:120])
            time.sleep(2)
    return r


def get(url, **kw):
    return _request("GET", url, kw)


def post(url, **kw):
    return _request("POST", url, kw)


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
