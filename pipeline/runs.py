"""The runs table as a table: one line per recorded run of a pipeline stage, newest first.

usage: python -m pipeline.runs [--last 20] [--job NAME] [--repo NAME]

Rows are written by pipeline/log.py (RunRecorder) when a stage's process ends and SUPABASE_DB_URL is set, and by
the research repo's runlog.py the same way (pipeline/sql/002_runs.sql). Needs SUPABASE_DB_URL in .env.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import backlog

COLUMNS = ["id", "started", "min", "repo", "job", "stage", "host", "ok", "warn", "err", "counts", "log"]


def fetch(conn, last=20, job=None, repo=None):
    where, args = [], []
    if job:
        where.append("job = %s")
        args.append(job)
    if repo:
        where.append("repo = %s")
        args.append(repo)
    sql = ("select id, repo, job, stage, host, started_at, finished_at, ok, counts, warnings, errors, log_path from public.runs"
           + (" where " + " and ".join(where) if where else "") + " order by started_at desc limit %s")
    cur = conn.cursor()
    cur.execute(sql, args + [last])
    return cur.fetchall()


def lines(rows):
    """The rows as aligned text lines, with a header."""
    out = []
    for id_, repo, job, stage, host, started, finished, ok, counts, warnings, errors, log_path in rows:
        minutes = (finished - started).total_seconds() / 60 if finished and started else 0
        compact = " ".join(f"{k}={v}" for k, v in (counts or {}).items())
        out.append([str(id_), started.strftime("%Y-%m-%d %H:%M"), f"{minutes:.0f}", repo, job, stage, host or "", "ok" if ok else "FAIL",
                    str(warnings), str(errors), compact[:70], log_path or ""])
    widths = [max(len(COLUMNS[i]), *(len(r[i]) for r in out)) if out else len(COLUMNS[i]) for i in range(len(COLUMNS))]
    fmt = "  ".join("{:<%d}" % w for w in widths)
    return [fmt.format(*COLUMNS).rstrip()] + [fmt.format(*r).rstrip() for r in out]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--last", type=int, default=20)
    ap.add_argument("--job")
    ap.add_argument("--repo")
    a = ap.parse_args()
    with backlog.connect() as conn:
        rows = fetch(conn, a.last, a.job, a.repo)
    print("\n".join(lines(rows)))
    if not rows:
        print("(no runs recorded)")


if __name__ == "__main__":
    main()
