# Product Job Map

The job atlas is GradBuddy's grounding layer. A pipeline scrapes live job postings (the Fortune 500, venture-backed
startups, the employers MBA students target), tags them against one skill taxonomy and builds role graphs. A static
site reads those graphs: what each role asks for, how a résumé fits, which Spring 2027 classes cover the gaps, who to
meet, and a self-serve skill tree for a signed-in person.

Three documents: this one (what exists, how to run it), [docs/MODULES.md](docs/MODULES.md) (what each module does,
its inputs and outputs) and [PLAN.md](PLAN.md) (the decisions and why, dated). [docs/GRADBUDDY_CONTRACT.md](docs/GRADBUDDY_CONTRACT.md)
says what another program may read from the atlas. [CLAUDE.md](CLAUDE.md) is the working agreements.

## The site

Four verbs behind a door, on a hash router. Every route is in `web/app.js` unless named.

| Route | What it is | Code |
|---|---|---|
| `#/` | The door: an email and what you study. Everyone can skip it. A campus address opens Find classes. | `Door` in `app.js`, `web/doors.js` |
| `#/home` | The four verbs as cards, About you inline. | `app.js` |
| `#/jobs` | Find jobs: one search over every open US posting of both role sets, counted facets, the posting in a side panel. | `web/jobs.js` |
| `#/skills` | Explore careers: the launcher by field or search, the résumé's match beside it. | `web/launcher.js` |
| `#/explore`, `#/field/<id>` | The fields as cards or a skill map; one field's roles with its skills on lanes. | `web/skillmap.js` |
| `#/role/<id>` | A role: its skills by area, filters, the fit rail, the heart. | `app.js` |
| `#/role/<id>/fit` | The fit screen: what the résumé shows and what needs evidence, a pasted posting, "Get your tree". | `web/match.js`, `web/evidence_text.js` |
| `#/role/<id>/course` | Drop a syllabus: what it teaches against what postings ask. | `web/atlas.js` |
| `#/classes`, `#/professor/<slug>` | Find classes: the Spring 2027 picker on public files, matched to the roles chosen. | `web/classes.js`, `web/catalog.js` |
| `#/network` | Networking: who to meet for a role, where, what to say, a prep card per chat. | `web/network.js` |
| `#/you` | About you: three questions, the résumé, the saved roles. | `app.js` |
| `#/play/<slug>` | The games, from the role pages. | `web/games/`, `web/gameshell.js` |
| `#/signin`, `#/map` | The sign-in and the apprentice map (the skill tree, the read, the quests). | `web/auth.js`, `web/map.js`, `web/state.js` |
| `#/about` | About the data, privacy. | `app.js` |

Every string a screen owns is in `web/copy.js` and checked by `node evals/copy.mjs`.

### What leaves the browser

- **A résumé's text** goes to `/api/infer` once per upload (the model read, stored nowhere) and to `/api/tree` once per
  build (grounded and dropped). A syllabus or a pasted posting never leaves.
- **Counts**, never text: `web/capture.js` posts screens, calls to action and a heartbeat to `events` with a random
  session id and a random per-browser id; a stage, a program, a role or field id; the signed-in id when there is one.
- **What a person typed on purpose**: an email into the door or an intake box (`waitlist`); the feedback sentence
  and, if typed, an email (`feedback`). The owner reads the sentences in the catalog project's SQL editor.
- **With a sign-in** (`ACCOUNTS_ENABLED`): the About-you answers, the hearts, and each read as the band, the skill
  ids with their state and one résumé line each (`profiles`, `hearts`, `reads`); a self-serve map in `maps/<uid>/`.
  A button on About you forgets it all.

### The switches

`web/config.js` holds the flags. A merge to `main` deploys to production, so a feature ships dark behind its flag and
flips in a one-line pull request once what it needs is in place.

| Flag | State | What it gates | What it needs |
|---|---|---|---|
| `CAPTURE_ENABLED`, `JOURNEY_ENABLED` | on | Events, calls to action, the heartbeat into the `events` table. | The capture and journey migrations (applied). |
| `INFER_ENABLED` | on | The model read of a résumé (`/api/infer`). | `ANTHROPIC_API_KEY` in the Vercel project. |
| `MAPS_ENABLED` | on | `#/map`, the invited magic-link sign-in, the private `maps` bucket. | The maps migration (applied). |
| `TREE_ENABLED` | on | The self-serve tree form on `#/map` and "Get your tree" on the fit screen (`/api/tree`). | `CATALOG_SERVICE_ROLE_KEY` in the Vercel project (set); `GET /api/tree` must answer `storage: true`. |
| `FEEDBACK_ENABLED` | on | The feedback link, box and prompt. | The feedback migration (applied). |
| `ACCOUNTS_ENABLED` | off | The six-digit-code sign-in for anyone, saved state, the heart's sign-in nudge. | A sender domain and its SMTP password in the catalog project's Auth settings (Supabase's own mailer sends a few an hour); "Allow new users to sign up" back on there (off today, so only invited addresses get a session); the state migration (applied). |
| `TECH_ENABLED` | off | The engineering, design and legal role set in the interface (its data is on `main`). | Bands for its data, design and legal groups; the owner's call. |
| `IENYC_ENABLED` | off | The IE New York campus in Find classes. | Its course catalog file. |
| `AUTH_ENABLED` | off | Unused: nothing behind the picker is private. | |

## Run it

```bash
cd web && python3 -m http.server 8000        # the site at http://localhost:8000; no /api locally, so the model read reads patterns alone and the tree form says the build did not go through
node --test 'tests/web/*.test.mjs'           # the browser code (quote the glob: node reads a bare directory as a file)
.venv/bin/python -m pytest tests/python      # the pipeline (pip install -r requirements-dev.txt once)
node evals/run.mjs                           # the matcher against the sample résumés; evals/README.md lists every runner
node tests/ui/serve.mjs                      # the site and its two functions at http://localhost:8787 (reads .env; npm install once)
npm run test:ui                              # the UI harness: Playwright on a phone and a desktop (tests/README.md, "The UI harness")
```

CI (`.github/workflows/ci.yml`) runs both suites and the eval runners it lists on every pull request and on `main`.
Both suites finish in about a second and never touch the network.

A fresh machine:

```bash
git clone git@github.com:wfkhan97/product-role-atlas.git && cd product-role-atlas
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                              # fill in what you need; each comment names the command that reads it
.venv/bin/python -m pipeline.store bootstrap      # the raw postings backlog, the sample résumés, the model caches
```

Without the keys every store command says so and exits 0, so a checkout without secrets still runs the tests and
the evals.

## The pipeline

```bash
.venv/bin/python -m pipeline.backlog pull                   # the raw postings from the Supabase backlog -> data/raw/jobs*/ (always before extract or a scrape)
./run_all.sh [--refresh]                                    # product set: merge registry, scrape, extract, build graph, jobs_open, artifact; log in logs/
.venv/bin/python -m pipeline.scrape --roles mba --refresh   # the MBA backlog (hours; --ats workday or --only "Name" narrows)
.venv/bin/python -m pipeline.extract --roles mba            # tag the postings -> data/processed/jobs_mba.json.gz (about 20 minutes)
.venv/bin/python -m pipeline.build_graph --roles mba        # the graph -> web/data/graph_mba.json + graph_mba/<role>.json
.venv/bin/python -m pipeline.jobs_open                      # every open US posting -> web/data/jobs_open.json + jobs_meta.json
.venv/bin/python -m pipeline.scrape --roles tech --count-only counts.json   # the tech set: what its sampling would keep, nothing written
.venv/bin/python evals/run_pipeline.py [--roles tech]       # titles, levels, countries, golden postings, graph integrity
.venv/bin/python -m pipeline.catalog_export                 # the Spring 2027 catalog -> web/data/catalog/cornell_tech.json
node pipeline/catalog_tags.mjs                              # skill tags per class -> cornell_tech_tags.json (rerun after a taxonomy change)
.venv/bin/python -m pipeline.funnel --from 2026-11-01       # screens reached, calls to action, returns, visible time, feedback counts
.venv/bin/python -m pipeline.runs --last 20                 # the last recorded runs of every stage
```

Three stages per role set (`--roles product|mba|tech`): `scrape` (one adapter per ATS, cached per employer),
`extract` (title rules, cleaning, dedupe, skill tagging), `build_graph` (shares, levels, the role files). The raw
files are a backlog: a refresh merges and never drops a posting (`CLAUDE.md`). The apprentice map generator is
`pipeline/apprentice/` (its own README); the skill depth and taxonomy tooling are in `docs/MODULES.md`.

### Scheduled jobs

Nothing on a schedule depends on a Mac. Each refresh runs on GitHub-hosted runners, pulls the backlog, scrapes,
pushes each file back as it is written, re-extracts, rebuilds the graph, runs the checks and opens a `data/` pull
request, which it merges itself when every check passes (a failing run leaves a draft; the repository variable
`REFRESH_AUTO_MERGE=off` leaves every pull request open).

| Workflow | When | Variable |
|---|---|---|
| `refresh-mba.yml` | Sunday 03:17 New York | `REFRESH_MBA_SCHEDULE=on` |
| `refresh-product.yml` | first Sunday of the month, 05:17 | `REFRESH_PRODUCT_SCHEDULE=on` |
| `refresh-tech.yml` | second Sunday of the month | `REFRESH_TECH_SCHEDULE=on` |
| `ci.yml` | every pull request and push to `main` | |

By hand: `gh workflow run refresh-mba.yml [-f ats=workday] [-f only="Accenture"] [-f dry_run=true]`. A job board
that blocks GitHub's runners can run on a self-hosted runner (`docs/SELF_HOSTED_RUNNER.md`). Every stage run writes
one row to the `runs` table (`pipeline/log.py`, `PIPELINE_RUNS=off` turns it off).

## Hosting

The site is the `web/` folder as it is: no build step, relative paths, a hash router. The host is the Vercel project
`gradbuddy-atlas` (https://gradbuddy-atlas.vercel.app, team `wk332`), root directory `web`, framework "Other", no
build command. Production deploys from `main`; every pull request gets a preview URL behind Vercel's sign-in.
`web/data/local/` (gitignored) is never hosted.

Two serverless functions ride along under `web/api/`, bundled with the data files `web/vercel.json` names:

| Function | What it does | Needs | Health |
|---|---|---|---|
| `infer.js` (`POST /api/infer`) | Sends a résumé's text once to Claude Haiku 5.5 for the skills it shows without naming them. Stores nothing. | `ANTHROPIC_API_KEY` | `GET /api/infer` → `{ ok, key }` |
| `tree.js` (`POST /api/tree`) | Builds a signed-in person's map from their résumé and one to four roles of one field, no model, and writes `maps/<uid>/map.json`. Refuses to overwrite a map written by hand. | `CATALOG_SERVICE_ROLE_KEY` (a new-style `sb_secret_` key goes in `apikey` alone) | `GET /api/tree` → `{ ok, key, storage }` |

The local python server has no `/api`, so a local run reads the patterns alone and the tree form says the build
did not go through.

## Data and secrets

Two Supabase projects. **GradBuddy** (`joanndudsiqrfoemwogm`) holds the pipeline's state: the raw postings backlog
(`backlog_files`, `postings`), the `atlas-store` bucket (stores `evals`, `caches`, `logs`) and the `runs` table.
**gradbuddy-catalog** (`qqkzbzwmpkrmlicoxijy`) is what the site talks to: the class catalog, `events`, `waitlist`,
`feedback`, the sign-in's users, `profiles`, `hearts`, `reads`, and the private `maps` bucket. Its migrations are
`pipeline/sql/*.sql`, applied through the Supabase connector or the SQL editor, never by a browser.

| Path git ignores | Where its contents live | Fetch |
|---|---|---|
| `.env` | The owner's password manager; each repository's Actions secrets for the jobs. | `cp .env.example .env`, fill in by hand |
| `data/raw/jobs*/` | The backlog tables, plus dated snapshots in the `backlog` bucket. | `pipeline.backlog pull [--roles mba]` |
| `evals/resumes/external/`, `evals/resumes/private/` | `atlas-store`, store `evals` (published samples; real résumés). | `pipeline.store pull evals` |
| `data/experiments/` (except `scratch/`, `_trash/`) | `atlas-store`, store `caches` (model answers that cost money). | `pipeline.store pull caches` |
| `logs/` | `atlas-store`, store `logs`. | `pipeline.store pull logs` |
| `data/apprentice/students/` | Nowhere: one folder per real student, this machine only. | |
| `data/experiments/scratch/`, `_trash/` | Nowhere: interim work, swept by `./sweep_scratch.sh --go`. | |

`.env.example` names every key the code reads and the command that needs it. Values live in three places: the
owner's password manager (copied into `.env` by hand), each repository's GitHub Actions secrets (the jobs), and the
Vercel project's environment (`ANTHROPIC_API_KEY`, `CATALOG_SERVICE_ROLE_KEY`, for the two functions). Never in a
commit, a doc, a log (`pipeline/log.py` masks them) or a chat. `push` never deletes a remote file; `pull` never
overwrites a newer local one.

## Layout

| Folder | What is in it |
|---|---|
| `pipeline/` | The stages, the role sets (`roles.py`, `roles_mba.py`, `roles_tech.py`), the taxonomy (`taxonomy.json`, `evidence.json`, `fields.json`, `tax.py`), the depth (`depth/`, `depth_gen.py`, `build_steps.py`, `depth_publish.py`), the stores (`backlog.py`, `store.py`), the adapters (`adapters/`), the catalog export, the funnel, the apprentice generator (`apprentice/`), the migrations (`sql/`), taxonomy tooling (`experiments/`). |
| `web/` | The site. `index.html` is the shell; `app.js` the screens; one module per concern (table above); `data/` the published graphs, bands, catalog and jobs files; `api/` the two functions; `tokens/` the design tokens. |
| `data/` | `registry.json` (every employer's ATS config, merged from `raw/registry_*.json`), `raw/` (the Fortune list, funds, portfolios, employer lists; the postings backlog is not in git), `processed/` (the tagged postings). |
| `evals/` | Every eval runner, the expectation files and the committed baselines (`evals/README.md`). |
| `tests/` | Unit tests, web and python (`tests/README.md`). |
| `games/` | The design packages of the games (`games/README.md`). |
| `docs/` | The module reference, the GradBuddy contract, the self-hosted runner. |
| `.github/workflows/` | CI and the three refresh jobs. |

## Writing and scratch

What lasts goes in the documents named at the top. Interim work (plans under review, mockups, audits, scratch
scripts) lives in `data/experiments/scratch/<topic>/` or the session scratchpad and is swept with
`./sweep_scratch.sh --go` when the thread ends. The rule is in `CLAUDE.md`.
