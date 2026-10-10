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
cd web && python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

- `pipeline/adapters/` — one module per ATS (Greenhouse, Lever, Ashby, Workday, Eightfold, Phenom, Oracle HCM, SmartRecruiters, Amazon, Apple, Google).
- `pipeline/roles.py` — which titles count as product roles; family / level / specialisation classification.
- `pipeline/taxonomy.json` — the skill taxonomy (clusters, skills, regex patterns). Shared with the web app. Patterns are tuned for precision against model judgments on a 200-posting sample (see `evals/extraction_baseline.md`); avoid bare everyday words.
- `pipeline/depth/*.json` — editorial depth per skill: plain-English definition, sub-skills (with regex patterns and examples), a four-step level ladder, how to build it, and resume lines that show it. Sub-skills are also tagged in postings and used for partial credit in the matcher.
- `pipeline/scrape.py`, `extract.py`, `build_graph.py` — the three stages. Extract also pulls evidence sentences per skill and level group; build_graph computes the axis positions (seniority = share-weighted level centre of mass; IC vs leads-teams = director+ share vs staff/principal share; commercial vs technical = PMM/growth share vs TPM/platform share), rank-spread with shrinkage for rare skills.
- `data/raw/fortune500_2026.json` — the 2026 Fortune 500 with Fortune's industry labels; `pipeline/sectors.json` groups those 66 industries into 11 sectors for the Industry filter.
- `pipeline/discover.py` — automatic careers-site discovery for Fortune companies (domain via Clearbit/Wikipedia, careers-link crawl, ATS signature detection, Workday tenant guessing, adapter verification). Output in `data/raw/discovery/`. Companies it can't resolve are handed to research agents, whose results land in `data/raw/registry_fortune_agents_*.json`.
- `pipeline/verify_one.py` — verify a single ATS config with the real adapter.
- `data/raw/funds.json` — the 52 venture funds (institutional, corporate and YC) whose portfolios feed the startup side; `data/raw/portfolio_<fund>.json` are the scraped portfolio lists (name, website, status, stage where the fund states it).
- `pipeline/probe_startups.py` — for every active portfolio company, finds a Greenhouse / Lever / Ashby board (slug guessing plus a careers-page scan), keeps those with product postings, and writes `data/raw/registry_startups.json` with each company's list of backing funds. Stage: fund-stated Seed/Series letters are kept; otherwise it is inferred from the company's own postings ("we raised our Series B") in `pipeline/extract.py`.
- `data/raw/registry_*.json` — per-company ATS configs; `pipeline/merge_registry.py` merges them (hand-verified > agents > auto) with Fortune tier, industry and sector into `data/registry.json`.
- `data/raw/jobs/*.json` — raw scraped postings per company (cache).
- `web/` — static site; `web/data/graph.json` is the only build output it needs.
- `web/match.js` — the resume matcher (pure logic, no DOM): per-line evidence with strength, tiered requirements, persona and level read, transfer vocabulary. Used by `app.js` and by the evals.
- `evals/` — evals and baselines: sample resumes with expectations and `node evals/run.mjs` for the matcher; `extraction_baseline.md` for the taxonomy (regex vs model judgment on 200 postings); `NOTES.md` for the design history and findings.
- `pipeline/experiments/` — the model-judgment audit (`decisions_audit.py`, `decisions_report.py`, `decisions_compare.py`). Needs `OPENAI_API_KEY` in `.env` for a live run; `--reuse` recomputes the regex side against saved answers without API calls. Output lands in `data/experiments/` (gitignored).
