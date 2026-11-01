# Where things live (2026-10-26)

The rule: a fresh machine, or a fresh cloud session, gets everything it needs with one command, and nothing that
runs on a schedule depends on a laptop being awake. Three kinds of work, three homes. Claude work (reading,
judging, drafting, sending) stays in Claude's cloud scheduled tasks. Deterministic compute (scrape, extract, build,
calibrate) runs on GitHub Actions on a cron, with Supabase as the only state. Work that truly needs a Mac stays
local, and after this thread nothing in the two repositories does. The counterpart page for the research repository
is `discovery&research/WHERE_THINGS_LIVE.md` in `gradbuddy-research`.

Two Supabase projects, one organisation (so the Pro plan covers both): **GradBuddy** (`joanndudsiqrfoemwogm`), the
atlas's, with the raw postings backlog, the `atlas-store` bucket and the `runs` table; **gradbuddy-catalog**
(`qqkzbzwmpkrmlicoxijy`), the research repository's, with the catalog tables, the `syllabi`, `catalog-snapshots` and
`research-private` buckets. The brief of 2026-10-26 assumed one project; the owner's checklist names the choice to
consolidate or not.

## Every path git ignores

| path | what | where its contents live | fetch | written by |
|---|---|---|---|---|
| `.env` | the keys | the owner's password manager (the Macs); each repository's Actions secrets (the jobs) | `cp .env.example .env` and fill in by hand | the owner |
| `data/raw/jobs/`, `data/raw/jobs_mba/` | the raw postings backlog, one file per employer | the `backlog_files` and `postings` tables (GradBuddy project), plus the newest four dated gzipped copies in the `backlog` bucket under `<role set>/<date>/` | `python -m pipeline.backlog pull [--roles mba]` | `pipeline.scrape` (each file as it is written: `refresh-mba`, `refresh-product`, a hand run with `.env`) |
| `evals/resumes/external/` | the published sample resumes the calibration reads (their index is `evals/external_sources.json`; several carry terms, so never served) | the `atlas-store` bucket, store `evals`, prefix `external/` | `python -m pipeline.store pull evals` | `node evals/fetch_external.mjs` and hand fetches on a Mac, then `pipeline.store push evals` |
| `evals/resumes/private/` | real resumes kept private | `atlas-store`, store `evals`, prefix `private/` | the same | the owner, then `push evals` |
| `data/experiments/` (except `scratch/`, `_trash/`) | model answers that cost money to regenerate: `depth/` (`depth_gen`, `build_steps`), `corpus_<roles>.jsonl` (`role_corpus`), `skill_audit_<roles>.jsonl`, `decisions_*.jsonl`, `decisions_report*.md`, `game_passages_review.md` | `atlas-store`, store `caches` | `python -m pipeline.store pull caches` | the model steps on a Mac with `.env`, then `push caches` |
| `data/experiments/scratch/`, `data/experiments/_trash/` | interim artifacts of one thread | nowhere: swept by `./sweep_scratch.sh` at the end of the thread | not fetched | threads |
| `logs/` | one log per stage run | `atlas-store`, store `logs`, named `refresh-mba_<date>_<family>.log`, `refresh-product_<date>_<family>.log`, `run_<date>.log` | `python -m pipeline.store pull logs` | every job (`pipeline.store push logs`); `run_all.sh` on a Mac |
| the `runs` table (no path) | one row per stage run: repo, job, stage, host, times, ok, counts, tallies, log path | `public.runs` (GradBuddy project; `pipeline/sql/002_runs.sql`) | `python -m pipeline.runs [--last 20] [--job NAME]` | `pipeline/log.py` when a stage ends with `SUPABASE_DB_URL` set; the research repository's `runlog.py` |
| `.venv/`, `evals/node_modules/`, `__pycache__/` | installed packages | `requirements*.txt`, `evals/package.json` | `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt`; `npm install` in `evals/` for PDF and DOCX samples | pip, npm |
| `web/artifact.html` | the single-file build of the web app | built from `web/` | `python -m pipeline.build_artifact` | `run_all.sh` on a Mac |
| `tools/` | the owner's tools folder (the GitHub CLI, when it is kept there) | this machine only; Homebrew's `gh` serves the same | `brew install gh` | the owner |
| `.DS_Store` | Finder noise | nowhere | nothing | macOS |

One command for a fresh clone, after `.env`: `python -m pipeline.store bootstrap` (the backlog for both role sets,
then `evals`, then `caches`). `python -m pipeline.store status` shows what differs between this machine and the
store; `pipeline.backlog status` the same for the backlog.

## The jobs

| job | repository | schedule | runner | writes | by hand |
|---|---|---|---|---|---|
| `refresh-mba` (`.github/workflows/refresh-mba.yml`) | product-role-atlas | Sunday 03:17 New York (`17 7 * * 0` UTC), when the repository variable `REFRESH_MBA_SCHEDULE` is `on` | `ubuntu-latest`, one job per ATS family; a blocked family on `[self-hosted, macOS]` (the Mac mini, `docs/SELF_HOSTED_RUNNER.md`) | the backlog (each file as it is written), the dated snapshot, the `logs` store, a `runs` row per stage, a pull request from `data/mba-<date>` | `gh workflow run refresh-mba.yml [-f ats=workday] [-f only="Accenture"] [-f trial=true] [-f dry_run=true]` |
| `refresh-product` (`refresh-product.yml`) | product-role-atlas | first Sunday of the month, 05:17 New York, when `REFRESH_PRODUCT_SCHEDULE` is `on` | the same | the same for the product set, a pull request from `data/product-<date>` | `gh workflow run refresh-product.yml` |
| `ci` (`ci.yml`) | product-role-atlas | every pull request and push to `main` | `ubuntu-latest` | nothing | a push |
| `rescrape-sp27` | gradbuddy-research | Monday 03:23 New York (`23 7 * * 1` UTC) | `ubuntu-latest` | the `catalog-snapshots` bucket under `<date>/` (newest four), a `runs` row, a pull request from `data/roster-<date>` when the roster changed | `gh workflow run rescrape-sp27.yml --repo wfkhan97/gradbuddy-research` |
| `load-catalog` | gradbuddy-research | every push to `main` that touches the curated catalog JSON | `ubuntu-latest` | the catalog tables of gradbuddy-catalog, a `runs` row | `gh workflow run load-catalog.yml --repo wfkhan97/gradbuddy-research [-f dry_run=true]` |
| the newsletter briefs | Claude scheduled tasks | as set in the Claude app | Claude's cloud | drafts | the Claude app |
| `sp27-roster-rescrape` (Claude scheduled task) | the Claude app on a Mac | Sundays 09:00, until the first `rescrape-sp27` run has written its `runs` row; after that it keeps only the Claude work (notes for new classes, profiles for new instructors) | a Mac that is awake | the research notes and profiles | the Claude app |

A job never pushes to `main` directly: every change to tracked files is a pull request. The refresh jobs merge their
own `data/` pull request when every check passes (`REFRESH_AUTO_MERGE` = `off` stops that); any other the owner merges. A job's secrets are
the repository's Actions secrets; a job fails at its first step with one clear line when one is missing.

## Where secrets live

`SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CAPTURE_DB_URL` (the catalog project's pooler
string, for `pipeline.funnel`), `OPENROUTER_API_KEY`, `OPENAI_API_KEY` (`.env.example` says which command needs each): in the owner's password manager, copied by hand into `.env` on a
Mac; in each repository's GitHub Actions secrets for the jobs; nowhere else. Never in Supabase, a repository, a
log (`pipeline/log.py` masks the `.env` values), a job summary or a chat.
