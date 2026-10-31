"""The funnel from the capture tables (pipeline/sql/2026-10-25_capture.sql): sessions, the share of them that reached
each event, by stage and by program group, and the cohort applications (the waitlist rows) by source. Plain text on
stdout; nothing is written to the tree. The applications' sentences ("the role you want, in your words", the one
piece of content the capture holds; pipeline/sql/2026-10-26_cohort.sql) are printed only under --notes, with the
email to reply to, never in the default output. Under those, the door funnel (v19 B7, pipeline/sql/2026-10-31_doors.sql:
the sessions that saw the door, passed it, clicked each verb on home, took an intake) and the intakes by surface (the
waitlist rows whose source is `door` or `intake_<surface>`). The `surface` column is read only when it exists
(information_schema), so the script runs before the owner applies that migration.

usage: python -m pipeline.funnel [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--by stage|program|both|none] [--notes]
       (default: the last 30 days, by both)

.env: CAPTURE_DB_URL, the session-pooler connection string of the gradbuddy-catalog project (the project web/config.js
points at, where the tables live). When it is not set, SUPABASE_DB_URL is used, the backlog project's string that
pipeline/backlog.py reads; the two are different projects, so set CAPTURE_DB_URL unless they have been merged.
A session's stage and program are the last ones its events carried (a person who answers the questions mid-visit
counts under the answer). The event names are the closed list in web/capture.js; the order below is the funnel's.
"""
import argparse
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.env import load_env

FUNNEL = ["start", "start_stage", "you_done", "resume_read", "explore", "field", "role", "fit", "course_read", "event_prep",
          "classes", "posting_link", "play", "waitlist_start", "waitlist_show", "waitlist_build", "waitlist_ways", "waitlist_fit",
          "waitlist_classes"]
STAGES = ["looking", "targeting", "curious", "(none)"]
# the door funnel (web/doors.js NAMES.events), in its order: the door drawn, passed, each verb clicked on home, each intake
DOOR = ["door", "door_passed", "home_jobs", "home_skills", "home_classes", "home_network", "intake_skills", "intake_classes",
        "intake_network"]


def connect():
    load_env()
    url = os.environ.get("CAPTURE_DB_URL") or os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("CAPTURE_DB_URL (or SUPABASE_DB_URL) is not set: put the catalog project's session-pooler string in .env")
    import psycopg
    return psycopg.connect(url, connect_timeout=30)


def sessions(cur, start, end):
    """{session: {"stage": ..., "program": ..., "events": set(names)}} for the sessions with an event in the range."""
    cur.execute("""select session, name, stage, program from public.events
                   where created_at >= %s and created_at < %s order by created_at""", (start, end))
    out = {}
    for session, name, stage, program in cur.fetchall():
        s = out.setdefault(session, {"stage": None, "program": None, "events": set()})
        s["events"].add(name)
        if stage:
            s["stage"] = stage
        if program:
            s["program"] = program
    return out


def waitlist(cur, start, end):
    cur.execute("""select source, count(*), count(distinct email_key) from public.waitlist
                   where created_at >= %s and created_at < %s group by source order by source""", (start, end))
    return cur.fetchall()


def column_exists(cur, table, column):
    """True when public.<table> has the column: the `surface` column lands with 2026-10-31_doors.sql, applied by hand."""
    cur.execute("""select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = %s and column_name = %s""", (table, column))
    return cur.fetchone() is not None


def intakes(cur, start, end):
    """(source, surface, rows, distinct emails) for the native fallback's rows: source `door` or `intake_<surface>`.
    The surface column is read when it exists; before the migration every surface prints as '-'."""
    col = "coalesce(surface, '-')" if column_exists(cur, "waitlist", "surface") else "'-'"
    cur.execute(f"""select source, {col}, count(*), count(distinct email_key) from public.waitlist
                    where (source = 'door' or starts_with(source, 'intake_')) and created_at >= %s and created_at < %s
                    group by 1, 2 order by 1, 2""", (start, end))
    return cur.fetchall()


def door_funnel(all_sessions):
    """[(event, sessions, share of the sessions that saw the door)] in the funnel's order, from the session dicts."""
    saw = [s for s in all_sessions if "door" in s["events"]]
    return [(name, sum(1 for s in all_sessions if name in s["events"]), saw) for name in DOOR]


def notes(cur, start, end):
    """The applications that carry a sentence: (created_at, source, role_id, email, note). Only under --notes."""
    cur.execute("""select created_at, source, role_id, email, note from public.waitlist
                   where note is not null and created_at >= %s and created_at < %s order by created_at""", (start, end))
    return cur.fetchall()


def table(title, groups, by):
    """groups: [(label, [session dicts])]. One column per group: sessions, then the share that reached each event."""
    print(f"\n== {title}")
    head = f"{'event':<16}" + "".join(f"{g[:14]:>16}" for g, _ in groups)
    print(head)
    print(f"{'sessions':<16}" + "".join(f"{len(ss):>16}" for _, ss in groups))
    for name in FUNNEL:
        cells = []
        for _, ss in groups:
            n = sum(1 for s in ss if name in s["events"])
            cells.append(f"{n:>6} ({100 * n / len(ss):3.0f}%)" if ss else f"{'-':>12}")
        print(f"{name:<16}" + "".join(f"{c:>16}" for c in cells))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--from", dest="start", help="first day, YYYY-MM-DD (default: 30 days ago)")
    ap.add_argument("--to", dest="end", help="last day, inclusive, YYYY-MM-DD (default: today)")
    ap.add_argument("--by", choices=["stage", "program", "both", "none"], default="both")
    ap.add_argument("--notes", action="store_true", help="also print each application's sentence, with the email to reply to (the one piece of content)")
    a = ap.parse_args()
    today = datetime.date.today()
    start = datetime.date.fromisoformat(a.start) if a.start else today - datetime.timedelta(days=30)
    end = (datetime.date.fromisoformat(a.end) if a.end else today) + datetime.timedelta(days=1)
    with connect() as conn, conn.cursor() as cur:
        ss = sessions(cur, start, end)
        wl = waitlist(cur, start, end)
        nt = notes(cur, start, end) if a.notes else []
        it = intakes(cur, start, end)
    allS = list(ss.values())
    print(f"capture funnel · {start} to {end - datetime.timedelta(days=1)} · {len(allS)} sessions with an event")
    table("all sessions", [("all", allS)], None)
    if a.by in ("stage", "both"):
        table("by stage", [(st, [s for s in allS if (s["stage"] or "(none)") == st]) for st in STAGES], "stage")
    if a.by in ("program", "both"):
        programs = sorted({s["program"] or "(none)" for s in allS}, key=lambda p: (p == "(none)", p))
        table("by program group", [(p, [s for s in allS if (s["program"] or "(none)") == p]) for p in programs], "program")
    print("\n== applications by source (rows, distinct emails)")
    if not wl:
        print("  none in the range")
    for source, n, emails in wl:
        print(f"  {source:<16}{n:>6}{emails:>8}")
    print("\n== door funnel (sessions; the share is of the sessions that saw the door)")
    for name, n, saw in door_funnel(allS):
        print(f"  {name:<16}{n:>6}" + (f" ({100 * n / len(saw):3.0f}%)" if saw else f"{'-':>7}"))
    print("\n== intakes by surface (the native fallback's rows: source, surface, rows, distinct emails)")
    if not it:
        print("  none in the range")
    for source, surface, n, emails in it:
        print(f"  {source:<16}{surface:<10}{n:>6}{emails:>8}")
    if a.notes:
        print("\n== applications with a sentence (--notes: the one piece of content; for the owner's reply only)")
        if not nt:
            print("  none in the range")
        for created, source, role_id, email, note in nt:
            print(f"  {created:%Y-%m-%d}  {source:<8}{(role_id or '-'):<24}{email}\n      {note}")


if __name__ == "__main__":
    main()
