# The owner's checklist, October 2026: what only the owner can do

Everything the scheduled-jobs thread (2026-10-26) could not do, in order. The pull requests it opened: atlas #101
(the store), #102 (the runs table), #103 (the refresh workflows and the trial), the docs PR with this page; research
repository #2 (the roster re-scrape), #3 (the transcripts bucket), and its docs PR. Each atlas PR is stacked on the
one before, so merge them in order.

## Before anything runs

- [ ] **One project or two.** The brief assumed both repositories use one Supabase project; they use two, in one
  organisation: GradBuddy (`joanndudsiqrfoemwogm`: the atlas's backlog, and now `atlas-store` and `runs`) and
  gradbuddy-catalog (`qqkzbzwmpkrmlicoxijy`: the catalog, `syllabi`, and now `catalog-snapshots` and
  `research-private`). Everything below is written for two projects, each repository on the one it already uses,
  with the `runs` table in the GradBuddy project for both. Consolidating is a later migration if wanted
  (`PLAN.md`, Later); nothing here depends on it.
- [ ] **Actions secrets, atlas** (`wfkhan97/product-role-atlas` > Settings > Secrets and variables > Actions):
  `SUPABASE_DB_URL` (the GradBuddy project's session-pooler string, as in `.env`), `SUPABASE_URL`
  (`https://joanndudsiqrfoemwogm.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (that project's service-role or
  `sb_secret_` key).
- [ ] **Actions secrets, research repository** (`wfkhan97/gradbuddy-research`): `SUPABASE_URL`
  (`https://qqkzbzwmpkrmlicoxijy.supabase.co`), `SUPABASE_SERVICE_ROLE_KEY` (the catalog project's key, the one
  `db/.env` holds), and `SUPABASE_DB_URL` (the GradBuddy project's pooler string again, for the `runs` table).
- [ ] Optional, both repositories: `ACTIONS_PAT`, a fine-grained personal token with contents and pull-requests
  write on the repository. With it a job's pull request is opened as you and CI runs on it; without it the job runs
  CI's commands itself and reports them in the body (GitHub gives a pull request opened by the workflow's own token
  no CI run).
- [ ] **The password manager.** The same values there, one entry per project; then delete every copy in notes,
  chats and scratch files. `.env` on each Mac is filled from it (`.env.example` in each repository names the keys).
- [ ] **Apply `pipeline/sql/002_runs.sql`** in the GradBuddy project's SQL editor (after #102 is merged, or from
  the branch). Row-level security on, no policies: service role only.
- [ ] **Create the three buckets**, private, no policies: `atlas-store` in the GradBuddy project;
  `catalog-snapshots` and `research-private` in gradbuddy-catalog. (The `backlog` and `syllabi` buckets exist.)

## First pushes (once, from the Mac that has the files)

- [ ] On the Mac mini, in the atlas checkout with `.env`: `.venv/bin/python -m pipeline.store push evals` and
  `.venv/bin/python -m pipeline.store push caches` (after #101 is merged, or on its branch). Then
  `pipeline.store status` on the other Mac shows what it lacks; `pull` fetches it.
- [ ] On the MacBook Air, in the research checkout: `python3 -I tools/private_store.py push` (after #3). The
  checklist's counts on this machine: 37, 7 and 1 files in the three stores.
- [ ] Commit the roster edits of 2026-10-25 that are still uncommitted in the research checkout (`.gitignore`, the
  catalog README, `db/README.md`, `professors.json` and the profiles) before or after merging #2 and #3; two of
  those files are touched by the branches, away from the same lines.

## The trial, then the schedules

- [ ] Merge #101, #102, #103 (in order). Dispatch the trial: `gh workflow run refresh-mba.yml -f trial=true`, and
  read `evals/runner_trial_2026-10-26.md` for how to read it. After the run, on a Mac with `.env`:
  `pipeline.store pull logs`, then `evals/runner_trial.py --date <the run's UTC date> --minutes <from the run's
  page> --write`, and commit the report. The decision rule is on that page: 90% of the postings reached and
  complete means the schedule goes on as it stands.
- [ ] If a family is blocked: `runner: [self-hosted, macOS]` on that family's line of the matrix in
  `.github/workflows/refresh-mba.yml`, and the runner on the Mac mini from `docs/SELF_HOSTED_RUNNER.md`.
- [ ] Set the repository variables (Settings > Secrets and variables > Actions > Variables):
  `REFRESH_MBA_SCHEDULE=on`, and `REFRESH_PRODUCT_SCHEDULE=on` when the product refresh should run monthly. The
  minutes: the repository is private, so the runs count against the account's Actions allowance; the trial report
  says what one run costs.
- [ ] Merge research #2 and #3. `rescrape-sp27.yml` runs the next Monday 03:23 New York; `load-catalog.yml` runs
  on the next push to `main` that touches the curated JSON (or dispatch it with `dry_run=true` first).

## After the first scheduled run of each job

- [ ] `python -m pipeline.runs` shows a row for `refresh-mba` (each stage), and one for `rescrape-sp27`. Only then:
  delete the local scheduled tasks for the MBA refresh and the roster re-scrape on both Macs, and change the Claude
  scheduled task `sp27-roster-rescrape` (and the Tuesday catch-up) so it no longer scrapes and keeps only the Claude
  work: notes for new classes, profiles for new instructors, reading the pull request the job opened. Delete nothing
  else.
- [ ] The newsletter briefs stay where they are (Claude's cloud scheduled tasks).
