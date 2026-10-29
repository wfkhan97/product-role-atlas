import html
import re
import sys
import time
import xml.etree.ElementTree as ET
from .common import get, strip_html, job, listing_failed

ATOM = "{http://www.w3.org/2005/Atom}"
XHTML = "{http://www.w3.org/1999/xhtml}"
OPP_ID_RE = re.compile(r"/opp/(\d+)")
CHROME_RE = re.compile(r"(?is)<(script|style)\b.*?</\1>")
FIELD_SPLIT = "<!-- template=eform2/field.tt -->"
LABEL_RE = re.compile(r'(?s)class="hform_lbl_text"[^>]*>(.*?)</span>')
VALUE_RE = re.compile(r'(?s)class="form-control-static"[^>]*>(.*)')
PLACE_LABEL_RE = re.compile(r"(?i)^(location|office|city|state|country|region)s?\b")


def _boards(cfg):
    boards = cfg.get("boards") or [cfg["board"]]
    return [b if isinstance(b, dict) else {"path": b} for b in boards]


def feed_url(host, board):
    """A board is a path ("appcentre-2/brand-2") and the number of its job list ("vacancy": 3)."""
    return f"https://{host}/vx/mobile-0/{board['path'].strip('/')}/candidate/jobboard/vacancy/{board.get('vacancy', 1)}/feed/structured"


def _props(entry):
    """itemprop name -> inner HTML of the structured feed's <span itemprop=...> fields."""
    out = {}
    for span in entry.iter(f"{XHTML}span"):
        name = span.get("itemprop")
        if name and name not in out:
            inner = (span.text or "") + "".join(ET.tostring(c, encoding="unicode", method="html") for c in span)
            out[name] = re.sub(r"</?(?:html|ns\d+):", lambda m: m.group(0)[0] + ("/" if "/" in m.group(0) else ""), inner)
    return out


def _text(s):
    # feed values are escaped twice ("&amp;#x27;")
    return html.unescape(strip_html(s or ""))


def challenged(page):
    return "oleeoProtect" in page[:3000] or "<altcha-widget" in page


def read_page(page):
    """(description, location) from a server-rendered vacancy page: its fields are label/value pairs."""
    body = CHROME_RE.sub("", page.split('id="vac_desc"', 1)[-1]).split("</form>")[0]
    long, places = [], []
    for chunk in body.split(FIELD_SPLIT)[1:]:
        label, value = LABEL_RE.search(chunk), VALUE_RE.search(chunk)
        if not (label and value):
            continue
        label = strip_html(label.group(1))
        value = strip_html(value.group(1))
        if not value:
            continue
        if "type_richtext" in chunk[:400] or 'data-type="LARGETEXT"' in chunk[:400]:
            long.append(value if re.match(r"(?i)^(job )?description$", label) else f"{label}\n{value}")
        elif PLACE_LABEL_RE.match(label):
            places.append(value)
    return "\n\n".join(long), ", ".join(dict.fromkeys(places))


def fetch(company, cfg, title_ok, max_pages=None):
    """tal.net (Oleeo) job boards: one Atom feed per board, complete in one answer.

    config: host ("lek.tal.net") and boards, a list of {"path": "appcentre-2/brand-2", "vacancy": 3, "name": "Americas"}
    (a firm has several: experienced hires, students, regions). Where the firm put the description in the feed
    (itemprop="Description") it is taken from there; otherwise each vacancy page is read. Pages behind the site's
    "Quick Check" (a captcha) are left alone: those postings are not returned.
    """
    host = cfg["host"]
    found = {}
    for board in _boards(cfg):
        r = get(feed_url(host, board), headers={"Accept": "application/atom+xml, application/xml;q=0.9, */*;q=0.8"}, listing=True)
        r.raise_for_status()
        if challenged(r.text):
            listing_failed(f"talnet: {host} board {board['path']} feed is behind the site's check")
            continue
        try:
            root = ET.fromstring(r.content)
        except ET.ParseError:
            listing_failed(f"talnet: {host} board {board['path']} feed is not XML")
            continue
        if root.tag != f"{ATOM}feed":
            listing_failed(f"talnet: {host} board {board['path']} answer is not an Atom feed")
            continue
        for e in root.iter(f"{ATOM}entry"):
            p = _props(e)
            title = html.unescape((e.findtext(f"{ATOM}title") or "").strip()) or _text(p.get("Title") or p.get("name"))
            link = next((l.get("href") for l in e.iter(f"{ATOM}link") if l.get("rel") == "alternate"), None) or e.findtext(f"{ATOM}id")
            if not link or not title_ok(title):
                continue
            url = link.split("?")[0]
            m = OPP_ID_RE.search(url)
            key = m.group(1) if m else url
            if key in found:  # one vacancy can be on two boards
                continue
            loc = ", ".join(dict.fromkeys(x for x in (_text(p.get(k)) for k in ("Location", "City", "State", "Country")) if x))
            found[key] = job(company, title, url, strip_html(html.unescape(p.get("Description") or "")), location=loc,
                             posted=e.findtext(f"{ATOM}published") or e.findtext(f"{ATOM}updated"), external_id=key,
                             extra={"board": board.get("name") or board["path"],
                                    **{k: _text(p[k]) for k in ("Department", "Function", "Position type", "Work option", "Deadline") if p.get(k)}})
        time.sleep(0.5)
    out, blocked = [], 0
    for j in found.values():
        if len(j["description"]) < 300:
            if blocked >= 2:  # the whole site asks for the check: do not keep knocking
                blocked += 1
                continue
            r = get(j["url"], headers={"Accept": "text/html"})
            time.sleep(0.5)
            if r.status_code != 200 or challenged(r.text):
                blocked += 1
                continue
            desc, loc = read_page(r.text)
            j["description"], j["location"] = desc or j["description"], j["location"] or loc
        out.append(j)
    if blocked:
        print(f"[talnet] {company}: {blocked} of {len(found)} vacancy pages are behind the site's check; not read", file=sys.stderr, flush=True)
    return out


def still_open(company, cfg, posting):
    """True: the vacancy page answers 200 with its vacancy fields (id="vac_desc"). False: the vacancy page answers 404
    or 410 (tal.net serves its "Page Not Found (404)" page for a vacancy it no longer shows). None: anything else,
    and every page behind the site's "Quick Check" (a captcha) whatever its status."""
    url = posting.get("url") or ""
    if not url.startswith("https://"):
        return None
    r = get(url, headers={"Accept": "text/html"})
    if challenged(r.text):
        return None
    if r.status_code in (404, 410):
        return False
    if r.status_code == 200 and 'id="vac_desc"' in r.text:
        return True
    return None
