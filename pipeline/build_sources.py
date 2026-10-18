"""The source registry for build steps (data/raw/build_sources.json): hashes, fetching and passage checks.

    .venv/bin/python -m pipeline.build_sources verify            # hash every record; fetch the sources a script may read and check their passages
    .venv/bin/python -m pipeline.build_sources verify --no-fetch # hashes only, nothing fetched
    .venv/bin/python -m pipeline.build_sources show sec_10k      # a source's record and what the fetched text looks like

Every record gets `record_sha256`: the hash of the record itself (publisher, URL, passages, facts), so an edit to a
stored passage shows as a changed hash. A source with `fetch: "script"` is read by this module (a PDF with pypdf,
a page with BeautifulSoup) and gets `document_sha256`, `document_bytes`, `date_verified` and `passages_found`: how
many of its stored passages are word for word in the fetched text. A source with `fetch: "hand"` (a site whose
terms or robots rules refuse scripts) keeps `document_sha256: null` and the reason; its passages were read once by
a person on `date_read`.

No source text is written anywhere but the registry. Requests go one at a time, two seconds apart.
"""
import argparse
import datetime
import hashlib
import io
import json
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = os.path.join(ROOT, "data", "raw", "build_sources.json")
UA = "job-graph build-sources verifier (one request per source; contact via the repository)"
HASH_FIELDS = ("record_sha256", "document_sha256", "document_bytes", "date_verified", "passages_found", "fetch_note")


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def record_hash(src):
    rec = {k: v for k, v in src.items() if k not in HASH_FIELDS}
    return hashlib.sha256(json.dumps(rec, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def fetch_kind(src):
    """script when the record says the source was read by a script or is a PDF of a US government site; hand otherwise."""
    if src.get("fetch") in ("script", "hand"):
        return src["fetch"]
    if src["read_with"].startswith("script"):
        return "script"
    if src["url"].lower().endswith(".pdf") and src["publisher_class"] == "us_government":
        return "script"
    return "hand"


def strip_running_lines(pages):
    """Drop the header and footer lines a PDF repeats on most pages (a handbook's title, 'As of ... this guidance applies',
    page numbers), which otherwise cut a passage in two where a page ends."""
    import collections
    count = collections.Counter()
    for p in pages:
        for line in {re.sub(r"\d+", "#", ln.strip()) for ln in p.split("\n") if ln.strip()}:
            count[line] += 1
    running = {ln for ln, n in count.items() if n >= max(3, 0.3 * len(pages))}
    out = []
    for p in pages:
        out.append("\n".join(ln for ln in p.split("\n") if re.sub(r"\d+", "#", ln.strip()) not in running and not re.fullmatch(r"\s*\d+\s*", ln)))
    return out


def text_of(content, content_type, url):
    if content_type.startswith("application/pdf") or url.lower().endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages = strip_running_lines([page.extract_text() or "" for page in reader.pages])
        text = "\n".join(pages)
        # PDF text keeps ligatures and soft hyphens; fold them so a stored passage matches
        for a, b in (("ﬁ", "fi"), ("ﬂ", "fl"), ("ﬀ", "ff"), ("ﬃ", "ffi"), ("ﬄ", "ffl"), ("­", ""), ("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"')):
            text = text.replace(a, b)
        return text, len(pages)
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, "html.parser")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    return soup.get_text(" "), None


def fetch(src, ua=None):
    """(status, content type, content, final url). A record with `urls` (a source read in several pages) is fetched page by
    page and the contents joined; the status is the first that is not 200."""
    import requests
    status, ctype, parts, final = 200, "", [], src["url"]
    for i, url in enumerate(src.get("urls") or [src["url"]]):
        if i:
            time.sleep(2)
        r = requests.get(url, headers={"User-Agent": ua or UA, "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.8"}, timeout=60, allow_redirects=True)
        if r.status_code != 200:
            return r.status_code, r.headers.get("Content-Type", ""), b"", r.url
        ctype, final = r.headers.get("Content-Type", ""), r.url
        parts.append(r.content)
    return status, ctype, b"\n".join(parts), final


def passages_found(src, text):
    """Marks each passage `found` (word for word in the fetched text) and returns (found, total, [title found])."""
    body = norm(text)
    found = []
    for p in src.get("passages", []):
        p["found"] = norm(p["text"]) in body
        found.append(p["found"])
    titles = [norm(src["title"]) in body] if src["licence_class"] == "title_only" else []
    return sum(found), len(found), titles


def verify(args):
    d = json.load(open(SOURCES))
    today = datetime.date.today().isoformat()
    for s in d["sources"]:
        s["fetch"] = fetch_kind(s)
        s["record_sha256"] = record_hash(s)
        if args.only and s["id"] == args.only and args.ua:
            s["fetch"] = "script"   # a contact address was given for a site that asks for one
        if args.no_fetch or s["fetch"] != "script" or (args.only and s["id"] != args.only):
            if s["fetch"] == "hand" and not s.get("fetch_note"):
                s["document_sha256"] = None
                s["fetch_note"] = "read by hand on date_read: the site refuses scripts or its terms forbid them; no document hash"
            continue
        try:
            status, ctype, content, final_url = fetch(s, args.ua)
        except Exception as e:
            s["fetch_note"] = f"{today}: fetch failed ({type(e).__name__})"
            print(f"{s['id']:24} fetch failed: {e}")
            time.sleep(2)
            continue
        if status != 200:
            s["fetch_note"] = f"{today}: HTTP {status}; the stored passages were not re-checked"
            print(f"{s['id']:24} HTTP {status}")
            time.sleep(2)
            continue
        text, pages = text_of(content, ctype, final_url)
        n, m, titles = passages_found(s, text)
        s["document_sha256"] = hashlib.sha256(content).hexdigest()
        s["document_bytes"] = len(content)
        s["date_verified"] = today
        s["passages_found"] = f"{n} of {m}"
        s["fetch_note"] = f"{today}: HTTP 200, {len(content):,} bytes" + (f", {pages} pages (pypdf {__import__('pypdf').__version__})" if pages else "") + (f"; title on page: {'yes' if titles[0] else 'no'}" if titles else "")
        print(f"{s['id']:24} 200  {len(content):>9,} bytes  passages found {n}/{m}" + (f"  pages {pages}" if pages else ""))
        if n < m and args.show_missing:
            body = norm(text)
            for p in s["passages"]:
                if norm(p["text"]) not in body:
                    print(f"    missing [{p['id']}]: {p['text'][:100]}")
        time.sleep(2)
    with open(SOURCES, "w") as f:
        f.write(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
    print("wrote", SOURCES)


def show(args):
    d = json.load(open(SOURCES))
    s = next(x for x in d["sources"] if x["id"] == args.only)
    print(json.dumps({k: v for k, v in s.items() if k != "passages"}, indent=1, ensure_ascii=False))
    status, ctype, content, final_url = fetch(s)
    text, pages = text_of(content, ctype, final_url)
    print(f"HTTP {status} {ctype} {len(content):,} bytes; text {len(text):,} characters")
    print(text[:3000])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["verify", "show"])
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--only", help="one source id")
    ap.add_argument("--show-missing", action="store_true")
    ap.add_argument("--ua", help="a user agent with a contact address, for a site that asks for one (sec.gov); used with --only")
    args = ap.parse_args()
    {"verify": verify, "show": show}[args.cmd](args)


if __name__ == "__main__":
    main()
