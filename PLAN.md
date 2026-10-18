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

Static site, no build step, published as an artifact and runnable locally. The first interface (v1 to v4: a
force graph with rails of filters and six views, the match flow in a modal) is described in the sections below for
the record; v9 replaced it with pages around the student's journeys.

## Filters (v3)

Role family, level, company group (Fortune 1–50 / 51–100 / 101–250 / 251–500, a16z, Sequoia), industry
(Fortune sectors), company name (search + chips), location (country, remote), years of experience asked,
specialisation from the title, education asked for. Every chip count reflects the other active filters.

## Views (v3/v4)

- 3D map: y = seniority, x and z selectable (kind of role, which path, how common, skill area);
  drag rotates, scroll zooms, a cube frame with seniority lanes gives orientation. Pure SVG projection,
  no 3D library, so every 2D interaction (click, satellites, match highlighting) carries over.

- Career map (default since 2026-10-09): columns = skill area, rows = seniority lanes (quartiles of the
  share-weighted level at which the skill is asked for). It is the one view where position is something a
  student can act on, and it has no rotation state to get lost in; the 3D map is kept as a secondary view.
- Table stakes vs. rare: x = share of the current slice, y = seniority.
- Which path: x = director+ share vs staff/principal share.
- Kind of role: x = TPM/platform/AI share vs PMM/growth share.
- Free: force layout by co-occurrence.
Sub-skills can be shown as satellite dots: on click (default), for every skill, or off.

## Role sets (v5, 2026-10-11)

A role set is a list of roles with its own title rules: `product` (the six product families) and `mba` (the 50
roles of mbapreferred.com's "50 MBA Career Options", `pipeline/roles_mba.py`). Scrape, extraction and the graph
build take `--roles`; the taxonomy is one vocabulary in which a skill is either shared or belongs to one role set
(`pipeline/tax.py`). Only US postings of the MBA set are shown.

## The MBA graph (v6, 2026-10-12)

`pipeline.build_graph --roles mba` writes the data the interface and the matcher need. The interface is not
designed yet; this is the data layer only.

- **One index, one file per role.** `web/data/graph_mba.json` (about 1 MB, always loaded) has every key of
  `graph.json` with `jobs` empty. `web/data/graph_mba/<role>.json` holds one role's postings. The index plus the
  postings of the roles loaded is a graph `web/match.js` reads unchanged. Comparing roles needs the index only.
  Cost: a view across roles ("all postings at one bank") loads many files.
- **Company-balanced shares.** One employer counts for at most 5% of a role (`pipeline/balance.py`). Each posting
  carries its weight `w`. Every share in the index is weighted.
- **What defines a role, kept apart.** `roles.<role>.defining` lists the skills on at least 80% of the role's
  postings that are at least 2.5 times as common as elsewhere (the role's own field). `asks` lists what the role
  asks beyond that. `credentials` lists degrees and experience.
- **Levels: one scale, three ladders.** Every posting has a level on one scale of eight keys, so levels compare
  across roles and the matcher keeps one order. The name of a level depends on the ladder: `corporate`, `bank`
  (banks, private equity, venture capital, asset managers) or `consulting`. A bank Vice President and a consulting
  Manager both sit at `senior`. Each posting carries its `ladder`; the index has the names per ladder.
- **Groups are labels.** The 11 groups in the index name sets of roles for the interface. They do not decide files.
- **Title rules as data.** `web/data/roles_mba.json` has each role's label, group, title patterns (JavaScript
  regular expressions), the roles it covers, the employer rules and the grade patterns of each ladder.
  `evals/roles_mba.mjs` is a reference reader.
- **Evals.** `evals/run_pipeline.py`: labelled titles, levels and countries, 99 golden postings, integrity of the
  processed file and of the graph files, the JavaScript reader against the Python rules, and the matcher on every role.

## Postings backlog and more sources (v7, 2026-10-13)

- **A backlog, not a snapshot.** The raw files keep every posting ever seen, with `first_seen`, `last_seen` and
  `closed`. A closed posting is not listed as open. It counts in shares and statistics for 12 months. The MBA
  set is refreshed weekly (`pipeline.scrape --roles mba --refresh`); entry-level and MBA postings open in
  recruiting windows and close fast.
- **Entry level.** Campus and programme titles count. For 20 roles the analyst and associate grades of the
  function are the role's entry level. Sales manager, general manager and chief of staff have none: people come
  to them from another job. An MBA internship that names a function is that role at entry level.
- **Employers.** 308 listed employers for these roles (60 added for the thin consulting, bank and fund cells),
  and the Fortune banks and investors now have a category. Adapters for tal.net and Yello boards.
- **Not done.** Boards behind a captcha or bot check are left alone (Evercore, Citadel, CBRE). Twelve board
  types have no adapter. A separate student board per bank is not looked up yet. "Entry level for an MBA"
  differs by firm (Consultant at a strategy house, Senior Consultant at Deloitte, Associate at a bank): see the
  entry mark below.

## The entry mark (v8, 2026-10-13)

Which level is "entry" for an MBA graduate? Not one level per ladder. A strategy house hires an MBA as
Consultant or Associate (`mid`), Deloitte as Senior Consultant (`senior`), a bank as Associate (`mid`), and the
corporate roles spread over three levels. "Associate" is the MBA grade at McKinsey and the bachelor's grade at
BCG. So the levels stay as they are, and each posting gets a second fact.

- **Three fields on a posting.** `entry`: `"mba"`, `"pre_mba"` or `null`. `intern`: true or false. `entry_src`:
  the evidence. An MBA internship is `entry: "mba", intern: true`. Internship is a field of its own because
  bachelor's internships exist too, and the interface needs both pairs.
- **Two kinds of evidence, kept apart.** `title` and `text`: the posting says who it is for ("MBA", "Summer
  Analyst", "currently pursuing an MBA", "graduating 2027"). `firm` and `category`: the title is the grade that
  group joins at (McKinsey Associate, an investment bank's Associate). A grade mark does not say the posting is
  for new graduates; most such postings also ask for experience. The index counts both: `n` and `posted`.
- **`null` means "experienced hire or no evidence".** A plain "Financial Analyst" has no mark. A low level is
  not evidence.
- **The table is data** (`pipeline/entry_mba.json`): nine firms and two categories, each row with its source
  and `basis` (`primary`: the firm's own posting or page; `secondary`: a guide or another office). It is
  exported in `web/data/roles_mba.json` for the resume reader.
- **Order of rules.** A job about students (a campus recruiter) and a posting for PhD graduates only get no
  mark. Then: the firm's row; a title that names the audience; a line of the text that says who the posting is
  for; the category default for the grade; "Summer Associate"; a text that asks for no experience; campus
  words, an internship or a programme (read as pre-MBA).
- **Not built, on purpose.** No default for private equity, venture capital, asset management, commercial
  banking, the Big Four other than Deloitte, or brand management: the research has only secondary sources, or
  our postings contradict it (see `evals/NOTES.md`). The interface is not designed; label text is in
  `meta.entry` of the index.

## The interface around journeys (v9, 2026-10-13)

The one-screen analyst tool (rails, thirteen filter sections, six map views, eleven area colours) is replaced by
pages for the journeys a student has. Audit and pattern picks are in the session notes (`data/experiments/ui_audit.md`,
`ui_design.md`, gitignored); the decisions are the owner's (2026-10-13).

- **First visit.** A choice: "Tell us about you" (three questions, an optional resume; the answers pick the fields)
  or "Explore the roles". Desktop only; there is no phone layout.
- **Explore.** The fields as circles sized by open postings (ten MBA groups plus Product), then the roles of a
  field sorted by open postings with what defines each, then the role screen. Breadcrumbs carry the path. The MBA
  set's own product group is not shown: the Product field opens the product role set.
- **The role screen.** One layout for both role sets, no legend: rows by how many postings ask for a skill (over
  half, a quarter to a half, one in ten to one in four), two columns (asked at every level; asked at least 1.5
  times as often in leadership postings as in entry ones, measured over the whole role so a level filter re-ranks
  without moving skills), skill areas as text labels inside a cell, ◆ for the skills that define the role, a blue
  share bar on every skill. A level filter and an employer-type filter re-rank the grid. A skill opens in a side
  panel: definition, sub-skills with their shares in the view, example sentences from postings by level group, the
  level ladder, build steps, postings that ask for it, skills often asked together. A posting opens in the same
  panel. Why not a map: within a role the level profile of most skills is flat (30 to 45% of a role's skills are
  asked more at senior levels, the rest at every level), so a seniority axis spreads nothing; and three colours
  with meaning (green = you, blue = the postings' numbers, amber = gaps) replace eleven colours without.
- **Tell us about you (step 2).** Three questions (where you are, what you look for, which fields) and an optional
  resume, read in the browser. The answers and the resume stay in local storage. A rough read of the resume
  against the index alone (the share of each role's main asks it shows, and the roles it says the person held)
  picks the fields on Explore and marks roles in a field; the band of fit needs the role's postings and comes on the
  fit screen. A student sees the entry grade first.
- **Your fit (step 2).** The matcher is created the way the bands were calibrated (the MBA set with the
  distinctiveness weighting and a baseline of mean shares over the 50 roles; the product set without). The band is
  the headline on a four-step scale; no percentage anywhere. A group without bands gets a sentence that says so
  and the evidence without a verdict. Then: what to evidence next (three gaps, with the industry and AI slots in
  plain words), what the resume shows, presumed skills, gaps, named-not-shown, and disclosures for "say it in this
  field's words", credentials and industries, unread lines. The grid is painted: green shows it, amber dashed is a
  gap; presumed skills stay plain.
- **Check a course (step 3).** A syllabus or course description, read as a student's course list: a mention counts.
  The screen lists the role's skills the text names (with the share of postings that ask for each), the skills most
  postings ask for that it does not name, which of the person's gaps it covers when a fit was read, and the grid
  painted. It cannot tell a course that teaches a skill without naming it the way postings do.
- **Prepare for an event (step 3).** One screen per field with three kinds. Networking: the roles by open postings
  with the one or two skills that set each apart (the defining skills, else the most asked skills that are not
  generic to every role), the three skills the resume shows that most of these roles ask for, and the employers
  hiring now from the field's postings. Employer roundtable: role by role, the skills most postings ask for that the
  resume shows with the line that shows it, and two they may ask about. Hackathon or case: the skills most roles of
  the field ask for that the resume does not show, with the build step where one is written. No event data exists:
  "who is in the room" means the field's roles, not a guest list.
- **Step 5.** Everything the first four steps left as a note is done or measured: the rough read on Explore has the
  shape of the full score and an eval against it (`evals/rough_fit.mjs`); the product families get defining skills
  by the MBA build's own rule; "generic" skills are measured (asked by most postings of at least half the roles);
  the roundtable runs the full matcher on each role; the course reader counts sub-skill hits and keeps the last
  course; a "Graduates and interns" chip filters on the entry mark.
- **Filters (step 4).** One pattern everywhere: a chip row with counts. On the role screen: Level and Employers in the
  row; Industry, Employer (search) and Location (countries and remote for the product set; US only and remote for
  the MBA set) behind "More filters", a sheet under the row with the same chips. Filters set in the sheet show in
  the row as removable chips when it is closed. Every count reflects the other filters. The fit and course screens
  read the same view. Dropped for good, per the audit: investor, funding stage, years asked for, specialisation and
  degree filters; the five map views and the 3D controls; the sub-skills toggle; the area colour legend; the
  percentage ring and meters.

## Explore as a skill map (v10, 2026-10-18)

Owner's decisions (2026-10-18): one map for both role sets, MBA links as they are, every link drawn faint, on by
default with a switch to plain circles. A map behind the page and a map in the side panel were tried and dropped:
neither related to where the field circles were, so the map showed only around them and read as noise.

- **One picture.** The 11 fields sit on a ring, ordered so neighbours ask for similar skills (cosine over the
  mean share of each skill across a field's roles). Every skill's home is the fields' positions weighted by
  (share / mean share)^3, pulled slightly inwards: a field's own skills land beside it, the skills every field
  asks for land in the middle. Skills repel each other and are pushed out from under the circles.
- **One vocabulary.** All 98 product skills are in the MBA index under the same ids (96 with the same patterns), so
  the map uses `graph_mba.json` (278 skills, 1,272 links) and the product field's shares come from the product set.
- **Hover a field:** its 25 most distinctive skills (share × share over the mean field's, capped at 4) turn blue
  with spokes from the circle, and the five most distinctive are named. **Click a skill:** it and its six closest
  links are named; the side panel shows where postings ask for it most, as links to roles and fields.
- A field's page links to its place on the map (`#/explore?field=<group>`). The role screen keeps its grid.

## Skill depth for the MBA skills (built 2026-10-14; the plan below is what was built, with the changes noted)

The 180 MBA skills had a one-line definition. Sub-skills and level ladders are now drafted from postings by
`pipeline/depth_gen.py` and published by `pipeline/depth_publish.py`; build steps come from `pipeline/build_steps.py`
on two keys (postings name the target, an allow-listed source says what it contains), not from posting sentences
(step 2 below drafted duties, not ways to learn: `evals/NOTES.md`, "Skill depth pilot"). The content evals of step 8
are `evals/run_depth.py`. No subject experts are available to review the content, so every statement comes from
postings and passes automated checks. Ladders are specific to an industry. Nothing generic is kept.

The unit of content is a **claim**: one sentence with the postings that support it. A claim with no support is
not published.

1. **Evidence packs** (code, no model). For each skill, ladder and level: the sentences of US postings that
   matched the skill, with company, title, level and URL. At most two sentences per employer. A cell with fewer
   than 8 postings from 4 employers gets no rung; the interface says "not enough postings at this level".
   Cost: about 40% of cells will be empty, mostly senior grades of small roles.
2. **Draft** (model 1). Input: one skill's evidence packs and its definition. Output per ladder: 3 to 6
   sub-skills (name, patterns, example), one rung per level with evidence, 3 build steps. Every sentence carries
   the ids of the evidence sentences it rests on and one quoted phrase of at most 12 words.
3. **Evidence check** (code). Each quoted phrase must appear word for word in the cited posting. Each sub-skill
   pattern must match at least 5% of the skill's postings and at least 3 employers. Each rung must cite postings
   of its own ladder and level. A claim that fails is dropped, not repaired by hand.
4. **Specificity check** (code, then model 2). A rung must name a tool, an artefact, a counterparty or a number
   that occurs in its evidence. The code check is a list of terms taken from the evidence. Then a swap test: the
   critic sees the rung without the skill name and the level, and must pick both from four options. A rung that
   fits two levels or two skills equally is generic and is dropped.
5. **Style check** (code). ASD-STE100 about 80% of the way: at most 20 words for an instruction and 25 for a
   description, one idea per sentence, active voice, simple present, no idioms. Domain terms stay (DCF, S&OP).
6. **Critic** (model 2, a different model family from model 1). For each claim: "Do the cited sentences support
   this? Answer from the sentences only." Unsupported claims are dropped. The critic also lists what the evidence
   says that the draft left out; that list feeds one redraft.
7. **Ladder check** (code). Within a ladder, a higher rung must not repeat a lower one, and the evidence of a
   higher rung must come from higher-level postings. Rungs out of order are dropped.
8. **Release report** per skill: claims drafted, dropped at each check, cells with no rung. A skill with fewer
   than two rungs on a ladder shows the definition only on that ladder.

Evals that stay in the repository: the evidence, specificity, style and ladder checks run on the published
files with no model (`evals/README.md`, "Content evals for skill depth"). A sample of 100 claims per release is
re-judged by the critic with a new seed, to measure how many supported claims the first pass let through wrongly.

Cost: about 180 skills, up to 3 ladders. About 400 drafting requests, 400 redrafts, and 6,000 to 9,000 critic
and swap-test requests (one per claim). That is above 5,000 requests, so it needs a go-ahead. A pilot on 12
skills (4 per ladder) costs about 600 requests and shows the drop rates before the full run.

What this does not give: a judgment that a rung is true of the job where postings are silent. Postings say what
employers ask for, not how the work is done. The content will say "postings at this level ask for", not "at
this level you do".

## Later

- LLM-based extraction (Claude) for higher-recall skill tagging and requirement vs nice-to-have split.
- Nightly refresh via a scheduled job; history of postings over time.
- More families (design, engineering) and more companies (full Fortune 500).
