"""The standards index (pipeline/standards.json): what the industry treats as the standard path into each role.

    .venv/bin/python -m pipeline.standards verify                  # fetch every source, record status and hash, print what needs a re-read
    .venv/bin/python -m pipeline.standards verify --no-fetch       # the date rules only (stale, programs due), nothing fetched
    .venv/bin/python -m pipeline.standards verify --only uber_apm  # one source
    .venv/bin/python -m pipeline.standards verify --report out.md  # also write the report as Markdown (the monthly workflow posts it)

`sources` holds one record per page a person read on `date_read`; `roles` holds what a candidate must show per
first-cut role, the layer the quest generator reads as grounding. verify writes three things on a source and nothing
else: `check` (date, outcome, HTTP status, the hash of the page's text, a note), and `read_sha256` with
`read_sha256_date`, the hash that stands for the page as it was read. The first check after a read takes it; a later
check that hashes differently is `changed`. A person re-reads a changed or stale source, edits the record and its
`date_read`, and the next verify takes a new hash (date_read is later than read_sha256_date). verify never edits a
summary.

Outcomes: ok, changed, unreachable (404, 410, a server error, no answer), needs_signed_in_read (the source is
paywalled or a book, the site refuses a script with 401, 403 or 429, or the page is an empty shell that needs a
browser). The last is not a failure: the record stands until a person opens the page signed in.

What the report flags, for a person: unreachable, changed, stale (date_read more than 12 months ago), and programs
not re-read since the last 1 August (recruiting pages turn over each summer). `citable` is the rule the eval shares:
a source that is stale, a program that is due, or a program that is closed cannot back a `shows` item alone.

Requests go one at a time, two seconds apart, with a generic user agent. No page text is stored, only its hash.
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time

from pipeline import build_sources

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STANDARDS = os.path.join(ROOT, "pipeline", "standards.json")
UA = "Mozilla/5.0 (compatible; standards-index verifier; one request per source, two seconds apart)"
PAUSE = 2
STALE_DAYS = 365
KINDS = ("program", "loop", "guide", "credential", "gap")
PUBLISHER_CLASSES = ("employer", "practitioner", "book", "certification_body", "prep_vendor")
VERIFIED = ("fetched", "search_snippet", "unverified")
ACCESS = ("free", "paywalled", "book")
STATUS = ("open", "paused", "closed", "unknown")
OUTCOMES = ("ok", "changed", "unreachable", "needs_signed_in_read")
WRITTEN = ("check", "read_sha256", "read_sha256_date")   # the only fields verify writes
REFUSED = (401, 403, 405, 406, 429, 451, 999)            # the site answers, but not to a script
SHELL_CHARS = 400                                        # less text than this is a page that needs a browser
CHALLENGE = ("just a moment", "enable javascript", "verify you are human", "captcha", "access denied", "are you a robot")


def load(path=STANDARDS):
    return json.load(open(path))


def save(d, path=STANDARDS):
    with open(path, "w") as f:
        f.write(json.dumps(d, indent=1, ensure_ascii=False) + "\n")


def day(s):
    return datetime.date.fromisoformat(s)


def last_august_first(today):
    """The most recent 1 August on or before `today`."""
    aug = datetime.date(today.year, 8, 1)
    return aug if today >= aug else datetime.date(today.year - 1, 8, 1)


def stale(src, today):
    return (today - day(src["date_read"])).days > STALE_DAYS


def program_due(src, today):
    return src["kind"] == "program" and day(src["date_read"]) < last_august_first(today)


def citable(src, today):
    """A source that can back a `shows` item on its own: read within 12 months, a program read since the last
    1 August, and not a closed program."""
    return not stale(src, today) and not program_due(src, today) and src.get("status") != "closed"


def content_hash(text):
    """The hash of a page's words: lower case, letters and digits only, so markup, spacing and scripts do not count."""
    return hashlib.sha256(build_sources.norm(text).encode()).hexdigest()


def classify(src, status, text, error=None):
    """(outcome, note) for one fetch. `status` is the HTTP status or None when there was no answer; `text` the page's
    visible text."""
    gated = src["access"] in ("paywalled", "book")
    if status is None:
        return "unreachable", f"no answer ({error})"
    if status in (404, 410):
        return "unreachable", f"HTTP {status}: the page is gone"
    if status in REFUSED:
        return "needs_signed_in_read", f"HTTP {status}: the site refuses a script"
    if status != 200:
        return "unreachable", f"HTTP {status}"
    low = text.lower()
    if len(text.strip()) < SHELL_CHARS or (len(text) < 4000 and any(c in low for c in CHALLENGE)):
        return "needs_signed_in_read", "HTTP 200 but no readable text: the page needs a browser"
    if gated:
        return "needs_signed_in_read", f"HTTP 200; {src['access']}: only what is public was hashed"
    return "ok", "HTTP 200"


def apply_check(src, status, text, today, error=None):
    """Write `check` (and the read hash, when this is the first check after a read) on a source. Returns the outcome."""
    outcome, note = classify(src, status, text, error)
    check = {"date": today.isoformat(), "outcome": outcome, "http_status": status, "content_sha256": None, "note": note}
    readable = status == 200 and "no readable text" not in note
    if readable:
        h = check["content_sha256"] = content_hash(text)
        reread = src.get("read_sha256_date") and day(src["date_read"]) > day(src["read_sha256_date"])
        if not src.get("read_sha256") or reread:
            src["read_sha256"], src["read_sha256_date"] = h, today.isoformat()
        elif h != src["read_sha256"]:
            check["note"] = note + f"; the text differs from the read of {src['read_sha256_date']}"
            if outcome == "ok":
                check["outcome"] = outcome = "changed"
            else:
                check["note"] += " (public part)"
    src["check"] = check
    return outcome


def fetch(url):
    """(status, text, error): one GET. A status of None means no answer."""
    import requests
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.8"}, timeout=45, allow_redirects=True)
    except Exception as e:
        return None, "", type(e).__name__
    if r.status_code != 200:
        return r.status_code, "", None
    try:
        text, _ = build_sources.text_of(r.content, r.headers.get("Content-Type", ""), r.url)
    except Exception as e:
        return 200, "", f"unreadable ({type(e).__name__})"
    return 200, text, None


def flags(src, today):
    """What a person should look at on this source: a list of (flag, reason)."""
    out = []
    c = src.get("check") or {}
    if c.get("outcome") == "unreachable":
        out.append(("unreachable", c["note"]))
    if c.get("outcome") == "changed" or "the text differs" in (c.get("note") or ""):
        out.append(("changed", c["note"]))
    if stale(src, today):
        out.append(("stale", f"read on {src['date_read']}, more than 12 months ago"))
    if program_due(src, today):
        out.append(("program_due", f"a program read on {src['date_read']}, before {last_august_first(today).isoformat()}"))
    return out


def backing(d, today):
    """`shows` items whose every source is flagged or not citable: [(role, item id, [source ids])]."""
    by = {s["id"]: s for s in d["sources"]}
    out = []
    for rid, r in d["roles"].items():
        for it in r["shows"]:
            srcs = [by[x] for x in it["sources"] if x in by]
            if not any(citable(s, today) and (s.get("check") or {}).get("outcome") != "unreachable" for s in srcs):
                out.append((rid, it["id"], it["sources"]))
    return out


def report(d, today):
    """The Markdown report: what needs a person, then what could not be read by a script."""
    rows = {k: [] for k in ("unreachable", "changed", "stale", "program_due")}
    signed_in, counts = [], {o: 0 for o in OUTCOMES}
    for s in d["sources"]:
        c = s.get("check") or {}
        if c.get("outcome"):
            counts[c["outcome"]] += 1
        if c.get("outcome") == "needs_signed_in_read":
            signed_in.append(s)
        for flag, why in flags(s, today):
            rows[flag].append((s, why))
    n = sum(len(v) for v in rows.values())
    lines = [f"# Standards index: verify of {today.isoformat()}", "",
             f"{len(d['sources'])} sources. Checked: " + ", ".join(f"{k} {v}" for k, v in counts.items()) + ".",
             f"{n} flag(s) for a person to re-read. verify changes no summary: re-read the page, edit the record and its `date_read` in `pipeline/standards.json`, run `pipeline.standards verify --only <id>` and `evals/run_standards.py --baseline`, and open a pull request.", ""]
    titles = {"unreachable": "Unreachable", "changed": "Changed since it was read", "stale": "Read more than 12 months ago",
              "program_due": "Programs not re-read since the last 1 August"}
    for k, title in titles.items():
        lines += [f"## {title} ({len(rows[k])})", ""]
        lines += [f"- `{s['id']}` ({s['kind']}, {', '.join(s['role_ids'])}): {why}. {s['url']}" for s, why in rows[k]] or ["None."]
        lines.append("")
    weak = backing(d, today)
    lines += [f"## `shows` items with no source left that is fresh, open and reachable ({len(weak)})", ""]
    lines += [f"- `{rid}` / `{iid}`: {', '.join(srcs)}" for rid, iid, srcs in weak] or ["None."]
    lines += ["", f"## Needs a signed-in read ({len(signed_in)}; not failures)", "",
              "Paywalled sources, books, sites that refuse a script and pages that need a browser. The record stands until a person opens the page.", ""]
    lines += [f"- `{s['id']}`: {s['check']['note']}. {s['url']}" for s in signed_in] or ["None."]
    return "\n".join(lines) + "\n", n


def verify(args):
    d = load()
    today = datetime.date.today()
    todo = [s for s in d["sources"] if not args.only or s["id"] == args.only]
    if args.only and not todo:
        sys.exit(f"no source {args.only!r}")
    if not args.no_fetch:
        for i, s in enumerate(todo):
            if i:
                time.sleep(PAUSE)
            status, text, error = fetch(s["url"])
            outcome = apply_check(s, status, text, today, error)
            print(f"{s['id']:44} {outcome:22} {s['check']['note']}", flush=True)
        save(d)
        print("wrote", STANDARDS)
    text, n = report(d, today)
    if args.report:
        with open(args.report, "w") as f:
            f.write(text)
    print()
    print(text)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"flags={n}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["verify"])
    ap.add_argument("--no-fetch", action="store_true", help="the date rules only")
    ap.add_argument("--only", help="one source id")
    ap.add_argument("--report", help="write the report to this Markdown file")
    args = ap.parse_args()
    verify(args)


if __name__ == "__main__":
    main()
