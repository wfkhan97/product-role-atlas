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

# A site that refuses this machine's address. Workday answers 429 to GitHub's hosted runners from the first request
# (2026-11-22 on: about 19,000 of them in a 340-minute job, and 30 of 30 answers of 200 from a home address the same
# day), so waiting helps nothing and every employer of the family takes half an hour to fail. Each answer is counted
# per site (the last two labels of the host: every Workday tenant is on myworkdayjobs.com); once REFUSE_MIN answers
# are in and REFUSE_SHARE of them were 429, the site is refused for the rest of the process: a request to it raises
# Refused without being sent, and pipeline.scrape skips the employers it has not started. Nothing is written for an
# employer that was not read, so nothing is closed.
REFUSE_MIN, REFUSE_SHARE = 50, 0.4
_answers = {}   # site -> [answers, of them 429]
_answers_lock = threading.Lock()


class Refused(RuntimeError):
    """The site answers 429 to this address too often to go on (see REFUSE_MIN)."""


def site_of(url):
    host = re.sub(r"^[a-z]+://", "", url or "").split("/")[0].split(":")[0].lower()
    return ".".join(host.split(".")[-2:])


def refused(url):
    """True once the site of this URL (or host) has refused this address; (answers, 429s) are in refusals()."""
    a = _answers.get(site_of(url))
    return bool(a and a[0] >= REFUSE_MIN and a[1] >= REFUSE_SHARE * a[0])


def refusals():
    """site -> (answers, of them 429) for every refused site."""
    return {s: tuple(a) for s, a in _answers.items() if refused(s)}


def _count_answer(url, status):
    site = site_of(url)
    with _answers_lock:
        a = _answers.setdefault(site, [0, 0])
        was = refused(site)
        a[0] += 1
        a[1] += status == 429
        if not was and refused(site):
            logger.error("%s answered 429 to %d of %d requests: it refuses this address; its employers are not fetched "
                         "from here (nothing of theirs is written or closed)", site, a[1], a[0])

# The listing pages of the employer this thread is fetching that could not be read. pipeline.scrape fetches employers
# in parallel threads (an adapter never starts its own), calls start_fetch() before each and reads listing_failures()
# after: a fetch with a failed listing page is incomplete, so the merge closes nothing. Without this an adapter that
# stops paging on a bad answer looked like a board whose other jobs had all closed.
_fetch = threading.local()


def start_fetch():
    _fetch.failed = []
    _fetch.reused = 0


def texts_reused():
    """How many postings this thread's fetch took from the backlog without reading their text again (Held.take)."""
    return getattr(_fetch, "reused", 0)


class Held:
    """The postings of an employer's backlog whose text need not be read again today: pipeline.scrape passes it in
    cfg["held"] (open postings with a text read recently; scrape.fresh_texts) and an adapter that makes one request a
    posting for the text asks take() for each listed posting before that request. A posting is found by its
    requisition id, its URL, or the part of its URL from "/job/" (a Workday listing gives that path, not the URL)."""

    def __init__(self, postings=()):
        self.by_id, self.by_url, self.by_path = {}, {}, {}
        for j in postings:
            url = j.get("url") or ""
            if j.get("external_id"):
                self.by_id[str(j["external_id"])] = j
            if url:
                self.by_url[url] = j
                if "/job/" in url:
                    self.by_path[url[url.index("/job/"):]] = j

    def take(self, title, external_id=None, url=None, path=None):
        """A copy of the stored posting the listing row names, or None (read the text). Give the one identifier the
        listing has. The listing's title must be the stored one: a retitled posting is read again."""
        if external_id is not None:
            o = self.by_id.get(str(external_id))
        elif url:
            o = self.by_url.get(url)
        else:
            o = self.by_path.get(path) if path else None
        if o is None or (o.get("title") or "") != (title or "").strip():
            return None
        _fetch.reused = getattr(_fetch, "reused", 0) + 1
        return dict(o)


def held(cfg):
    return cfg.get("held") or Held()


def listing_failures():
    return list(getattr(_fetch, "failed", []))


def listing_failed(what, sampled=False):
    """Record a listing page that could not be read: an adapter calls this where a page that should list jobs gives a
    body it cannot parse; a non-2xx answer to a request made with listing=True is recorded by the request itself.
    sampled=True: the page was left unread on purpose (a sampling role set's page limit). The fetch is incomplete all
    the same, so nothing is closed by absence, but it is logged at INFO: it is the plan, not a failure."""
    if not hasattr(_fetch, "failed"):
        _fetch.failed = []
    _fetch.failed.append(str(what)[:200])
    (logger.info if sampled else logger.warning)("listing page not read: %s", str(what)[:200])

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
    third. A site that has refused this address (refused(), above) is not asked: Refused is raised. With listing=True (a page that lists jobs, not one job's detail) a final answer that is not 2xx is recorded
    with listing_failed. Only the method and the URL are logged, never the headers or the body."""
    kw.setdefault("timeout", 30)
    for attempt in range(3):
        if refused(url):
            raise Refused(f"{site_of(url)} refuses this address")
        STATS["requests"] += 1
        try:
            r = SESSION.request(method, url, **kw)
            _count_answer(url, r.status_code)
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
