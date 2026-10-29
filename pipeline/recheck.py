"""Ask the boards about postings the backlog holds as closed, and reopen the ones still shown.

usage: python -m pipeline.recheck [--roles mba|product] [--only COMPANY ...] [--since DATE] [--workers N] [--no-db]

Until 2026-10-29 a fetch cut by a page cap or a failed listing page closed every posting it did not return, so the
backlog holds postings as closed that are still on their boards (pipeline/scrape.py now asks about those one by
one). This asks the adapter's still_open about each closed posting closed on or after --since: True reopens it
(the closed date goes, last_seen is today), False and None leave it as it was. Nothing is deleted. Each employer's
check is first asked about up to three postings seen open on the latest refresh; one called gone means the check
is not trusted for that employer and nothing there is changed. Run pipeline.backlog pull first; each changed file
is pushed as it is written unless --no-db.
"""
import argparse
import collections
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import backlog, log, scrape
from pipeline.adapters import CHECKS

logger = log.get(__name__)


def recheck(still_open, company, cfg, blob, today, since):
    """Reopen the closed postings of `blob` (closed on or after `since`) that still_open says are on the board.
    Changes blob in place. Returns a Counter of reopened / gone / unknown, or None when the controls fail."""
    def ask(j):
        try:
            return still_open(company, cfg, j)
        except Exception:
            return None

    jobs = blob.get("jobs", [])
    latest = max((j.get("last_seen") or "" for j in jobs), default="")
    controls = [j for j in jobs if not j.get("closed") and j.get("last_seen") == latest][:scrape.CONTROLS]
    if not controls or any(ask(j) is False for j in controls):
        return None
    said = collections.Counter()
    for j in jobs:
        if not j.get("closed") or j["closed"] < since:
            continue
        a = ask(j)
        time.sleep(0.3)
        if a:
            j.pop("closed", None)
            j["last_seen"] = today
            said["reopened"] += 1
        else:
            said["gone" if a is False else "unknown"] += 1
    return said


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--roles", choices=sorted(scrape.ROLE_SETS), default="mba")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--since", default="2026-10-01", help="recheck postings closed on or after this date")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--no-db", action="store_true", help="write the files only")
    a = ap.parse_args()
    db = not a.no_db and backlog.configured()
    raw = os.path.join(scrape.ROOT, "data", "raw", scrape.ROLE_SETS[a.roles][1])
    today = time.strftime("%Y-%m-%d")
    todo = []
    for entry in scrape.load_registry(a.roles):
        if (a.only and entry["company"] not in a.only) or entry.get("ats") not in CHECKS:
            continue
        path = os.path.join(raw, scrape.slug(entry["company"]) + ".json")
        if os.path.exists(path):
            todo.append((entry, path))
    timer, totals, lock = log.Timer(), collections.Counter(), threading.Lock()

    def one(item):
        try:
            _one(item)
        except Exception as e:  # one employer's failure leaves its file as it was and the others run
            logger.error("%s: recheck failed: %s: %s", item[0]["company"], type(e).__name__, e, exc_info=True)

    def _one(item):
        entry, path = item
        with open(path) as f:
            blob = json.load(f)
        if not any(j.get("closed", "") >= a.since for j in blob.get("jobs", [])):
            return
        said = recheck(CHECKS[entry["ats"]], entry["company"], entry.get("config", {}), blob, today, a.since)
        if said is None:
            logger.warning("%s (%s): the check called a posting seen open gone, or none was seen open; nothing changed",
                           entry["company"], entry["ats"])
            with lock:
                totals["untrusted"] += 1
            return
        logger.info("%s (%s): reopened %d, gone %d, unknown %d", entry["company"], entry["ats"], said["reopened"],
                    said["gone"], said["unknown"])
        with lock:
            totals.update(said)
        if said["reopened"]:
            with open(path + ".tmp", "w") as f:
                json.dump(blob, f)
            os.replace(path + ".tmp", path)
            if db:
                saved, note = backlog.push_file_safely(path, a.roles)
                (logger.info if saved else logger.error)("%s", note)

    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        list(ex.map(one, todo))
    logger.info("recheck done in %s: %d employers with a check, reopened %d, gone %d, unknown %d, untrusted %d", timer,
                len(todo), totals["reopened"], totals["gone"], totals["unknown"], totals["untrusted"])


if __name__ == "__main__":
    main()
