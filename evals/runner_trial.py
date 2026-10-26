"""The runner trial's table: what each ATS family's trial employer did from the GitHub-hosted runner, from the logs.

    .venv/bin/python -m pipeline.store pull logs             # the jobs push logs/refresh-mba_<date>_<family>.log
    .venv/bin/python evals/runner_trial.py --date 2026-11-02 [--minutes 184] [--write]

Reads logs/refresh-mba_<date>_<family>.log for every family of evals/runner_trial.json and classifies the trial
employer's run: "reached, complete" (a fetched line, no partial warning), "reached, partial" (the scrape's partial
warning: fewer came back than were open, nothing closed), "blocked" (an error or warning naming a bot check, a
captcha, HTTP 403 or 429) or "failed" (any other error), with the counts of the employer line and what the file held
before (open before = open after - new + closed, from the same line). Prints the table as markdown; --write appends
it to evals/runner_trial_<date>.md under "## Results". The decision rule is in that file.
"""
import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRIAL = json.load(open(os.path.join(ROOT, "evals", "runner_trial.json")))
BLOCKED = re.compile(r"captcha|bot check|403|429|forbidden|too many requests|access denied|cloudflare", re.I)
EMPLOYER = re.compile(r"pipeline\.scrape: (.+?) \((\w+)\): fetched (\d+), kept (\d+) \((\d+) open\), new (\d+), reopened (\d+), closed (\d+)")
STAMP = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")


def read_log(path, employer):
    """(result, counts, minutes, note) for the employer in one family's log."""
    if not os.path.exists(path):
        return "no log", {}, 0, "the job wrote no log (did it run?)"
    counts, partial, errors, stamps = {}, "", [], []
    for line in open(path, encoding="utf-8", errors="replace"):
        m = STAMP.match(line)
        if m:
            stamps.append(m.group(1))
        m = EMPLOYER.search(line)
        if m and m.group(1) == employer:
            fetched, kept, open_, new, reopened, closed = (int(x) for x in m.groups()[2:])
            counts = {"fetched": fetched, "kept": kept, "open": open_, "new": new, "closed": closed, "open before": open_ - new + closed}
        if " WARNING " in line and line.split("pipeline.scrape: ", 1)[-1].startswith(employer + ": partial fetch"):
            partial = line.rstrip().split("partial fetch, ", 1)[-1]
        if " ERROR " in line and employer in line:
            errors.append(line.rstrip().split("pipeline.scrape: ", 1)[-1][:160])
    minutes = 0
    if len(stamps) >= 2:
        from datetime import datetime
        f = "%Y-%m-%d %H:%M:%S"
        minutes = (datetime.strptime(stamps[-1], f) - datetime.strptime(stamps[0], f)).total_seconds() / 60
    text = " ".join(errors) + " " + partial
    if errors and BLOCKED.search(text):
        return "blocked", counts, minutes, errors[0]
    if errors:
        return "failed", counts, minutes, errors[0]
    if partial and BLOCKED.search(partial):
        return "blocked", counts, minutes, partial
    if partial:
        return "reached, partial", counts, minutes, partial
    if counts:
        return "reached, complete", counts, minutes, ""
    return "not fetched", counts, minutes, "no line for this employer: not in the family's registry on the runner, or the job stopped before it"


def table(date):
    rows, ok_share = [], 0.0
    for family, f in TRIAL["families"].items():
        path = os.path.join(ROOT, "logs", f"refresh-mba_{date}_{family}.log")
        result, c, minutes, note = read_log(path, f["trial"])
        if result == "reached, complete":
            ok_share += f["share"]
        rows.append((family, f["trial"], f["share"], result, c.get("open before", ""), c.get("fetched", ""), c.get("open", ""), c.get("new", ""), c.get("closed", ""), f"{minutes:.0f}", note))
    lines = ["| family | trial employer | share % | result | open before | fetched | open after | new | closed | job min | note |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    lines += ["| " + " | ".join(str(x).replace("|", "/") for x in r) + " |" for r in rows]
    lines += ["", f"Families reached and complete cover {ok_share:.1f}% of the MBA postings (the rule asks for 90%)."]
    return "\n".join(lines), ok_share


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--date", required=True, help="the date in the logs' names (UTC), as the workflow wrote it")
    ap.add_argument("--minutes", type=int, help="the run's billable minutes, from the run's page on GitHub")
    ap.add_argument("--write", action="store_true", help="append the table to evals/runner_trial_<date>.md")
    a = ap.parse_args()
    if not glob.glob(os.path.join(ROOT, "logs", f"refresh-mba_{a.date}_*.log")):
        sys.exit(f"no logs/refresh-mba_{a.date}_*.log: run `python -m pipeline.store pull logs` first")
    text, share = table(a.date)
    if a.minutes:
        text += f"\n\nThe run used {a.minutes} billable minutes (the run's page), {a.minutes * 52 / 60:.0f} hours a year at one run a week."
    print(text)
    if a.write:
        path = os.path.join(ROOT, "evals", f"runner_trial_{a.date}.md")
        with open(path, "a") as f:
            f.write(f"\n## Results ({a.date})\n\n{text}\n")
        print(f"\nappended to {os.path.relpath(path, ROOT)}")


if __name__ == "__main__":
    main()
