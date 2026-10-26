# Runner trial: can the MBA refresh run from a GitHub-hosted runner? (prepared 2026-10-26)

The first pause of the scheduled-jobs thread. The trial could not run in the thread that wrote this: the workflow
has to sit on `main` to be dispatched, the three Actions secrets were not yet added and the `atlas-store` bucket did
not exist (the owner's checklist, `docs/OWNER_CHECKLIST_2026-10.md`). This page holds everything that is known
before the run, the command that runs it, and the rule that decides what happens after. `evals/runner_trial.py`
appends the results table once the logs are back.

## The question

Do the job boards accept datacenter traffic? If families covering at least 90% of the MBA postings (by count in
`data/processed/jobs_mba.json.gz`, 56,741 postings on 2026-10-26; the graph shows the open ones) are reached and
complete from `ubuntu-latest`, the weekly schedule is enabled as the workflow stands. Any family that is blocked
(bot check, captcha, HTTP 403 or 429) gets `runner: [self-hosted, macOS]` in the matrix of
`.github/workflows/refresh-mba.yml`, that family only, and the owner installs the runner on the Mac mini from
`docs/SELF_HOSTED_RUNNER.md`.

## One employer per family

The largest employer of each family by MBA postings (`evals/runner_trial.json`; the workflow reads it when the
`trial` input is set):

| family | trial employer | its postings | family postings | share % | cumulative % |
|---|---|---|---|---|---|
| workday | Accenture | 2,067 | 20,665 | 36.4 | 36.4 |
| greenhouse | Anduril Industries | 235 | 5,602 | 9.9 | 46.3 |
| oracle_hcm | JPMorgan Chase | 1,114 | 4,794 | 8.4 | 54.7 |
| amazon | Amazon | 4,408 | 4,408 | 7.8 | 62.5 |
| ashby | Airwallex | 149 | 4,397 | 7.7 | 70.3 |
| successfactors | EY | 2,001 | 4,384 | 7.7 | 78.0 |
| eightfold | Microsoft | 608 | 2,738 | 4.8 | 82.8 |
| radancy | Citigroup | 464 | 1,548 | 2.7 | 85.5 |
| jibe | PepsiCo | 241 | 1,265 | 2.2 | 87.8 |
| phenom | CVS Health | 428 | 1,147 | 2.0 | 89.8 |
| smartrecruiters | Sia Partners | 314 | 1,126 | 2.0 | 91.8 |
| google | Alphabet | 740 | 740 | 1.3 | 93.1 |
| lever | Shield AI | 67 | 728 | 1.3 | 94.4 |
| apple | Apple | 518 | 518 | 0.9 | 95.3 |
| paradox | AbbVie | 223 | 517 | 0.9 | 96.2 |
| avature | Deloitte | 309 | 469 | 0.8 | 97.0 |
| icims | Charles Schwab | 52 | 409 | 0.7 | 97.7 |
| mcloud | Home Depot | 144 | 261 | 0.5 | 98.2 |
| meta | Meta Platforms | 247 | 247 | 0.4 | 98.6 |
| bofa_servlet | Bank of America | 227 | 227 | 0.4 | 99.0 |
| mckinsey | McKinsey & Company | 220 | 220 | 0.4 | 99.4 |
| kpmg | KPMG | 106 | 106 | 0.2 | 99.6 |
| gs_graphql | Goldman Sachs Group | 99 | 99 | 0.2 | 99.8 |
| talnet | CohnReznick | 39 | 74 | 0.1 | 99.9 |
| yello | Kearney | 52 | 52 | 0.1 | 100.0 |

What the shares say before the run: the eleven largest families reach 90% only together, so one blocked family among
them (workday alone is 36%) means a self-hosted job. The families below smartrecruiters add 8% between them; a block
there is noted, not decisive. Evercore's tal.net board is known to sit behind a captcha from any machine (README,
`pipeline/adapters/`); CohnReznick is the trial employer for that family so the result reads the board, not the
captcha.

## Running it

```bash
gh workflow run refresh-mba.yml -f trial=true          # after #101, #102 and #103 are merged and the secrets are in
gh run list --workflow refresh-mba.yml --limit 1        # the run's id and its page (billable minutes are on the page)
```

The trial pushes each trial employer's file to the backlog as it is written (a refresh, merged: nothing is deleted)
and opens a data pull request only if the rebuilt graph differs; a trial can be left unmerged. Then, on a machine
with `.env`:

```bash
.venv/bin/python -m pipeline.store pull logs
.venv/bin/python evals/runner_trial.py --date <the run's UTC date> --minutes <from the run's page> --write
```

The script reads each family's log, finds the trial employer's line (`fetched N, kept K (O open), new, reopened,
closed`) and its partial warning or error, and classifies it: reached and complete, reached but partial, blocked
(the error or warning names a bot check, a captcha, 403 or 429) or failed (any other error). "Open before" is what
the file held before the trial, read off the same line (open after, less new, plus closed): the local run's
`partial` flag is overwritten by the trial's own merge, so the comparison with the last local run uses the log,
and `pipeline.backlog status` for the counts on both sides.

## Minutes

The repository is private, so the minutes count against the account's Actions allowance (2,000 a month on the
free plan, 3,000 on Pro; a macOS self-hosted runner costs nothing). The trial measures what one family-job costs;
the weekly schedule is 25 scrape jobs (each pulls the backlog, scrapes its family, pushes its log) plus one build
job (pull, extract about 20 minutes on a Mac, build, checks). Fill in after the run: the run's billable minutes
times 4.3 runs a month, against the allowance, with the product refresh (one run a month, 20 scrape jobs) on top.

## Decision rule (the owner's, 2026-10-26)

- Reached and complete for families covering at least 90% of the postings: set the repository variable
  `REFRESH_MBA_SCHEDULE=on`; the schedule runs as it stands.
- Any family blocked: that family's matrix entry gets `runner: [self-hosted, macOS]`; the owner installs the runner
  from `docs/SELF_HOSTED_RUNNER.md`; then the variable.
- Reached but partial: not a runner problem (the board or a search returned less than was open; the scrape closed
  nothing). Note it; it does not change the runner.

## Results

Appended by `evals/runner_trial.py --write` after the run.
