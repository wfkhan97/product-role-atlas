# Product Job Map

An interactive map of what product roles actually ask for, built from live job postings at the
Fortune 50 and at a16z- and Sequoia-backed startups. Pick a role family and level, click around the
skill graph, or drop in a resume / course list to see how well you match a specific posting.

See [PLAN.md](PLAN.md) for the design.

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install requests beautifulsoup4
./run_all.sh            # merge registry, scrape (cached per company), extract, build graph
./run_all.sh --force    # re-scrape everything
.venv/bin/python -m pipeline.discover --from 101 --to 250   # (re)discover careers sites for a rank range
.venv/bin/python -m pipeline.scrape --rank-from 101 --rank-to 250   # scrape one Fortune tier
.venv/bin/python -m pipeline.scrape --roles mba   # same companies plus role-specific employers, the 50 MBA roles -> data/raw/jobs_mba/
.venv/bin/python -m pipeline.extract --roles mba  # tag the MBA postings -> data/processed/jobs_mba.json (about 20 minutes)
cd web && python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

- `pipeline/adapters/` — one module per ATS (Greenhouse, Lever, Ashby, Workday, Eightfold, Phenom, Oracle HCM, SmartRecruiters, Amazon, Apple, Google).
- `pipeline/roles.py` — which titles count as product roles; family / level / specialisation classification.
- `pipeline/taxonomy.json` — the skill taxonomy (clusters, skills, regex patterns): one vocabulary for every role set. A skill marked `"only": ["mba"]` belongs to that role set alone; unmarked skills are shared. `pipeline/tax.py` hands each role set its part, and `build_graph` writes the product part to `web/data/taxonomy.json` for the web app and the evals. Patterns are tuned for precision against model judgments on a 200-posting sample (see `evals/extraction_baseline.md`); avoid bare everyday words.
- `pipeline/depth/*.json` — editorial depth per skill: plain-English definition, sub-skills (with regex patterns and examples), a four-step level ladder, how to build it, and resume lines that show it. Sub-skills are also tagged in postings and used for partial credit in the matcher.
- `pipeline/scrape.py`, `extract.py`, `build_graph.py` — the three stages. `scrape` and `extract` take `--roles product|mba` and share one code path (title filter, cleaning, repost and repeated-URL dedupe, tagging in worker processes); `build_graph` and the web app are product-only for now. Extract also pulls evidence sentences per skill and level group; build_graph computes the axis positions (seniority = share-weighted level centre of mass; IC vs leads-teams = director+ share vs staff/principal share; commercial vs technical = PMM/growth share vs TPM/platform share), rank-spread with shrinkage for rare skills.
- `data/raw/fortune500_2026.json` — the 2026 Fortune 500 with Fortune's industry labels; `pipeline/sectors.json` groups those 66 industries into 11 sectors for the Industry filter.
- `pipeline/discover.py` — automatic careers-site discovery for Fortune companies (domain via Clearbit/Wikipedia, careers-link crawl, ATS signature detection, Workday tenant guessing, adapter verification). Output in `data/raw/discovery/`. Companies it can't resolve are handed to research agents, whose results land in `data/raw/registry_fortune_agents_*.json`.
- `pipeline/verify_one.py` — verify a single ATS config with the real adapter.
- `data/raw/funds.json` — the 52 venture funds (institutional, corporate and YC) whose portfolios feed the startup side; `data/raw/portfolio_<fund>.json` are the scraped portfolio lists (name, website, status, stage where the fund states it).
- `pipeline/probe_startups.py` — for every active portfolio company, finds a Greenhouse / Lever / Ashby board (slug guessing plus a careers-page scan), keeps those with product postings, and writes `data/raw/registry_startups.json` with each company's list of backing funds. Stage: fund-stated Seed/Series letters are kept; otherwise it is inferred from the company's own postings ("we raised our Series B") in `pipeline/extract.py`.
- `data/raw/registry_*.json` — per-company ATS configs; `pipeline/merge_registry.py` merges them (hand-verified > agents > auto) with Fortune tier, industry and sector into `data/registry.json`. One job board is one employer: startups that fund portfolios list under two names are merged (other names kept in `also_listed_as`).
- `data/raw/jobs/*.json` — raw scraped postings per company (cache).
- `pipeline/roles_mba.py` — a second role set: the 50 roles of mbapreferred.com's "50 MBA Career Options" (consulting, strategy, finance, banking, investing, operations, marketing, sales, supply chain, HR, risk, real estate, leadership programs), scraped in two batches (`--batch N` adds one batch to files that lack it). `pipeline.scrape --roles mba` runs the same adapters over the same registry with these title patterns and search queries and caches to `data/raw/jobs_mba/*.json`. Product Manager and Product Strategy Manager are the `pm` family already in `data/raw/jobs/`, Product Marketing Manager the `pmm` family and technical program managers the `tpm` family, so they are not fetched twice. The MBA set also covers employers that fit these roles but are outside the Fortune 500 and the fund portfolios (consulting firms, the Big Four, investment banks, private equity and venture firms, asset managers, regional banks, real-estate firms, consumer-goods companies): the list is `data/raw/mba_employers.json`, `pipeline.discover --list data/raw/mba_employers.json --roles mba` writes `data/raw/discovery_mba/`, and looked-up configs live in `data/raw/registry_mba_employers_*.json`. The scraper adds the verified ones for `--roles mba` only (group `mba_employer`); they are not in `data/registry.json`, so the product map does not change. `pipeline.extract --roles mba` tags them against the whole taxonomy (the shared skills plus those written for these roles, with a one-line definition each in `pipeline/depth/mba_*.json`) into `data/processed/jobs_mba.json`, reading levels with bank and consulting grades. The graph build and the web app are still product-only. Only US postings are meant to be shown; the scrape and the processed file keep every country.
- `web/` — static site; `web/data/graph.json` is the only build output it needs.
- `web/tokens/` — the GradBuddy design tokens (CSS custom properties, oklch, dark and light), copied verbatim from the design-system snapshot of 2026-10-09; `web/style.css` is written on them and look changes go through tokens only. The theme follows the device unless overridden from the top bar.
- `web/match.js` — the resume matcher (pure logic, no DOM): per-line evidence with strength, tiered requirements, persona and level read, transfer vocabulary. Used by `app.js` and by the evals.
- `evals/` — evals and baselines: sample resumes with expectations and `node evals/run.mjs` for the matcher; `extraction_baseline.md` for the product taxonomy (regex vs model judgment on 200 postings); `extraction_baseline_mba.md` for the MBA role set (what each role's postings ask for, per skill and per role); `NOTES.md` for the design history and findings.
- `pipeline/experiments/` — taxonomy tooling. For drafting skills from postings: `role_corpus.py` (cleaned postings of a role set), `role_terms.py` (phrases that set a role apart), `skill_probe.py` (try draft skills on postings and read what matched). For checking them: `role_coverage.py` (writes `evals/extraction_baseline_<roles>.md`) and `skill_audit.py` (model judgment on sampled tagged and untagged postings per skill). The product model-judgment audit is `decisions_audit.py`, `decisions_report.py`, `decisions_compare.py`. Needs `OPENAI_API_KEY` in `.env` for a live run; `--reuse` recomputes the regex side against saved answers without API calls. Output lands in `data/experiments/` (gitignored).
