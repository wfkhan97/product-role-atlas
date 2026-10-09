import html
import re
import time
import requests

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "application/json, text/html;q=0.9, */*;q=0.8"})

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


def get(url, **kw):
    kw.setdefault("timeout", 30)
    for attempt in range(3):
        try:
            r = SESSION.get(url, **kw)
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return r
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2)
    return r


def post(url, **kw):
    kw.setdefault("timeout", 30)
    for attempt in range(3):
        try:
            r = SESSION.post(url, **kw)
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return r
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2)
    return r


TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t\r\f\v]+")
NL_RE = re.compile(r"\n{3,}")


def strip_html(s):
    """HTML -> plain text, keeping line breaks for block elements and list items."""
    if not s:
        return ""
    s = html.unescape(s)
    if "<" in s and "&lt;" in s and s.count("&lt;") > s.count("<"):
        s = html.unescape(s)
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
