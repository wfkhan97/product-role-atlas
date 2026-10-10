# Product Job Graph — Plan

Goal: a Marble-style interactive map (withmarble.com/curriculum) of what product jobs actually
require, built from live postings, where a person can pick a job (or a job family + level), upload a
resume or a list of courses, and see how well they match and what the gaps are.

## Scope (v1)

Role families (product-related):
- Product Manager (APM, PM, Senior PM, Staff/Principal PM, Group PM, Director, VP/Head of Product, CPO)
- Technical Program Manager (TPM)
- Product Marketing Manager (PMM)
- Product Operations
- Product Analyst / Product Data
- Product Owner
- Suggested additions beyond the ask: Growth PM, Platform PM, AI/ML PM (tracked as specialisations,
  not separate families), and Product Designer as a future adjacent family.

Companies:
- Fortune 50 (2026 Fortune 500 ranks 1-50).
- An equal number of startups backed by a16z and Sequoia (portfolio lists scraped from a16z.com and
  sequoiacap.com; only companies with a public Greenhouse / Lever / Ashby / Workday board and >= 1 open
  product posting).

## Pipeline (`pipeline/`)

1. `registry` — one JSON row per company: ATS type + config (Workday tenant, Greenhouse board, ...).
   Built by probing each careers site (`data/raw/registry_*.json`, merged into `data/registry.json`).
2. `scrape.py` — adapters per ATS (greenhouse, lever, ashby, workday, eightfold, phenom, oracle_hcm,
   smartrecruiters, amazon, apple, google). Pulls every posting whose title matches the product-role
   regex, with the full description. Raw cache in `data/raw/jobs/<company>.json`.
3. `extract.py` — rule-based extraction (no LLM key available in this environment) against a curated
   taxonomy of ~170 PM skills/concepts (`pipeline/taxonomy.json`): craft, analytics, technical,
   domain, tools, leadership, credentials. Also pulls years-of-experience and degree requirements and
   classifies family / level / specialisation from the title. Output: `data/processed/jobs.json`.
4. `build_graph.py` — aggregates into `web/data/graph.json`: skill nodes (prevalence per family,
   level, company group), co-occurrence edges, level-progression deltas, and per-posting skill sets.

## Web app (`web/`)

Static site (D3 force graph, no build step), published as an artifact and runnable locally:
- Left rail: role family, level, company group (Fortune 50 / a16z / Sequoia), skill-cluster toggles.
- Centre: force-directed skill map; node size = share of postings that require it; edges =
  co-occurrence; colour = cluster.
- Right panel: skill detail (which companies/levels ask for it, what it co-occurs with) or job detail.
- "Match me": drop a resume (PDF / DOCX / TXT) or paste courses. Parsed in the browser (pdf.js,
  mammoth); nothing leaves the browser. `web/match.js` reads it line by line with section detection and
  an evidence strength per hit (named / done / done with an outcome), then scores it against the
  selected posting or family+level with requirements tiered into must-haves (asked in over half of the
  slice), common asks and differentiators; one industry slot and one AI-literacy slot instead of every
  domain as a separate requirement. The panel reads back a persona (experienced in role, pivoter, new to
  role) and level, three meters (must-haves, common asks, depth), credentials from titles and degrees,
  evidenced / transferable / named-not-shown / gaps with the line that earned each, rewrites for skills
  shown in another field's vocabulary, build-next steps, ladder notes, unmapped lines and a what-if.
  Evals in `evals/` guard it; design history in `evals/NOTES.md`.

## Filters (v3)

Role family, level, company group (Fortune 1–50 / 51–100 / 101–250 / 251–500, a16z, Sequoia), industry
(Fortune sectors), company name (search + chips), location (country, remote), years of experience asked,
specialisation from the title, education asked for. Every chip count reflects the other active filters.

## Views (v3/v4)

- 3D map (default): y = seniority, x and z selectable (kind of role, which path, how common, skill area);
  drag rotates, scroll zooms, a cube frame with seniority lanes gives orientation. Pure SVG projection,
  no 3D library, so every 2D interaction (click, satellites, match highlighting) carries over.

- Career map (default): columns = skill area, rows = seniority lanes (quartiles of the share-weighted
  level at which the skill is asked for).
- Table stakes vs. rare: x = share of the current slice, y = seniority.
- Which path: x = director+ share vs staff/principal share.
- Kind of role: x = TPM/platform/AI share vs PMM/growth share.
- Free: force layout by co-occurrence.
Sub-skills can be shown as satellite dots: on click (default), for every skill, or off.

## Later

- LLM-based extraction (Claude) for higher-recall skill tagging and requirement vs nice-to-have split.
- Nightly refresh via a scheduled job; history of postings over time.
- More families (design, engineering) and more companies (full Fortune 500).
