# Modules

What each part of the repository does: inputs, outputs, the rules it holds. The entry point is `README.md`; the
decisions behind each module and their dates are in `PLAN.md`.

## Pipeline

### Role sets

Three sets share one pipeline (`--roles product|mba|tech`) and one taxonomy.

- `pipeline/roles.py` — the product set: which titles are product roles, seven families (`pm`, `pmm`, `tpm`, … and
  `product_engineer`: Product Engineer, Forward Deployed Engineer), level and specialisation. A product engineer title
  that names a hardware discipline is dropped (`HARDWARE_RE`); a bare one is settled by its posting text at
  extraction (`software_build`). The scrape's searches are `SEARCH_QUERIES` in `pipeline/adapters/common.py`.
- `pipeline/roles_mba.py` — the MBA set: the 50 roles of mbapreferred.com's "50 MBA Career Options", `ai_transformation`,
  and 13 business roles Cornell Tech and IE graduates take (`ADDED` records the day each joined). An employer's category
  selects its title rules, searches and ladder (corporate, bank or consulting grades; `FORTUNE_CATEGORIES` for banks
  and investors of the Fortune list). Campus and programme titles and the analyst and associate grades count; three
  roles have no entry level (`NO_ENTRY_LEVEL`). Extra employers outside the Fortune list and the fund portfolios come
  from `data/raw/mba_employers.json` (`pipeline.discover --list … --roles mba` → `data/raw/discovery_mba/`; verified
  configs in `data/raw/registry_mba_employers_*.json`, group `mba_employer`, not in `data/registry.json`).
- `pipeline/entry_mba.json`, `roles_mba.entry()` — the entry mark as data: which title each firm gives MBA hires and
  bachelor's hires (nine firms with sources), two category defaults, the words read in titles and texts. Every MBA
  posting gets `entry` (`mba`, `pre_mba`, null), `intern` and `entry_src` (`title`, `text`, `firm`, `category`). Levels
  are not changed by the mark. Copied into `web/data/roles_mba.json` under `entry`.
- `pipeline/roles_tech.py`, `pipeline/entry_tech.json` — the tech set: seven roles in five fields (`software_engineer`;
  `ml_engineer`, `data_engineer`; `security_engineer`; `product_designer`, `ux_researcher`; `counsel`), US only. Each
  set reads every title on its own (`product_gate` keeps product titles in the product set). A bare title ("Senior
  Engineer", "Designer") is the role only at a software employer, unless the rest of the title names software work
  (`BARE`, `software_employer(industry)`; an unknown employer, as on a résumé, counts as software). Three ladders on one
  level scale (`engineering`, `legal`, `bank` when a bank grade is in the title); entry mark `grad` or none, plus
  `intern`. `python -m pipeline.roles_tech` writes `web/data/roles_tech.json`. The scrape samples 30 open postings per
  employer and role (`--count-only` measures first). Shown only with `CONFIG.TECH_ENABLED`.
- `web/data/roles_mba.json`, `roles_tech.json` — the title rules as data for the browser (labels, groups, patterns,
  employer rules, ladders), written by the graph build; `evals/roles_mba.mjs` and `roles_tech.mjs` are reference readers.

### Taxonomy

- `pipeline/taxonomy.json` — the skills: clusters, regex patterns, one vocabulary for every set. `"only": ["mba"]`
  or `["tech"]` restricts a skill to a set; `"patterns_for": {"mba": [...]}` gives a shared skill stricter wording
  for one set. Every skill has a `kind` (`pipeline/tax.py`, `KINDS`): `method`, `practice`, `behaviour`, `technical`,
  `knowledge`, `tool`, `credential`. The kind decides how a résumé shows the skill and how the interface treats it,
  never how a posting is tagged. `tax.py` hands each set its part; `build_graph` writes `web/data/taxonomy*.json`.
  Patterns are tuned for precision against model judgment (`evals/extraction_baseline*.md`); avoid bare everyday words.
- `pipeline/evidence.json` — how a résumé shows each skill: `form` (`through`, `scope`, `artefact`, `outcome`, `built`,
  `context`, `named`), the `artefacts`, `counterparts`, `measures` and `verbs` a line carries, and `shown_by`, the
  concrete skills whose evidence counts for a behaviour or a practice.
- `pipeline/fields.json` — what the skills four or more fields ask for mean in each field: `reads_as`, `shown_by`
  (carriers that co-occur with the skill in at least 15% of the field's postings that ask for it) and `line` (one
  résumé line in the field's words, with a number). `role:<id>` keys are role overrides of the same shape.
  `tax.validate` checks both files; `evals/run_taxonomy.py` checks them against the postings. The graph publishes
  `kind`, `how_shown` and `fields` on every skill node.
- `pipeline/depth/*.json` — editorial depth per skill: definition, sub-skills (patterns, examples), a level ladder,
  how to build it, résumé lines that show it. Product files are hand-written. MBA files (`mba_*.json`) are written by
  `pipeline.depth_publish` from posting evidence: `ladder` keyed by industry ladder, `build` by ladder, `provenance`
  (posting ids, employers, quoted phrases) under every statement; a rung the postings do not support is absent.
  `mba_roles.json` holds per role and ladder the licences, exams and degrees five employers name at entry level.
- `pipeline/depth_gen.py`, `build_steps.py`, `build_sources.py`, `depth_publish.py` — the depth from postings.
  `depth_gen` drafts sub-skills and rungs with one model and keeps what code checks and a second model support
  (every statement asked by two employers, quoting its evidence). `build_steps` writes "how to build it" steps on a
  target postings name and a source on the allow-list (`data/raw/build_sources.json`: government, regulators,
  certification bodies; course vendors never). `build_sources verify` hashes every source and marks each passage
  found or not. Needs `OPENROUTER_API_KEY`; answers cache in `data/experiments/depth/`; `--dry-run` states the cost.
- `pipeline/sponsorship.py`, `sponsorship.json` — visa sponsorship as a posting fact: `yes`, `no` or null per posting,
  patterns anchored on visa and work-authorization words; a no wins over a yes. Counted per role in the MBA index.
- `pipeline/experiments/` — taxonomy tooling. Drafting: `role_corpus.py` (cleaned postings of a set), `role_terms.py`
  (phrases that set a role apart), `skill_probe.py` (try draft skills on postings). Checking: `role_coverage.py`
  (writes `evals/extraction_baseline_<roles>.md`), `skill_audit.py` (model judgment per skill), `decisions_audit.py`,
  `decisions_report.py`, `decisions_compare.py` (the product audit). `OPENAI_API_KEY` for a live run; `--reuse`
  recomputes against saved answers. Output in `data/experiments/`.
- `pipeline/experiments/postings_read.py` — a model read of every posting in the backlog, kept as a cache the
  pipeline does not read yet. One request per posting through the Message Batches API: the taxonomy skill ids asked
  (required or nice-to-have, each with a quoted phrase), years, degree, audience (intern, new graduate, early career),
  sponsorship, start date, remote, level. `submit` sends what the cache lacks, `collect` folds ended batches in,
  `sample` and `judge` run a second model on a stratified subset and a third on their disagreements, `compare --pilot`
  scores model and regex on the labelled postings, `report` writes the per-field tables. Cache:
  `data/experiments/postings_read/<set>/<employer>.json` plus `manifest.json` (model, prompt hash, batch ids, spend).
  Needs `ANTHROPIC_API_KEY` to send; refuses to submit past `CAP_USD`.
- `pipeline/experiments/postings_ladders.py` — definition, sub-skill and ladder drafts for skills without a depth
  file, from the sentences the model read quoted (`packs`, `draft`, `check`, `finish`). Runs `depth_gen`'s code checks
  and its support question; writes run files in `depth_gen`'s shape under `data/experiments/postings_read/ladders/`.
  Drafts only: nothing reaches `pipeline/depth/` except through `depth_publish`.

### Stages and stores

- `pipeline/scrape.py`, `extract.py`, `build_graph.py` — the three stages. Scrape and extract share one path: title
  filter, cleaning, repost and repeated-URL dedupe, tagging in worker processes, evidence sentences per skill and
  level. Build_graph carries each posting's board date as `posted` (`posted_day`: YYYY-MM-DD from each board's
  shape, null when unreadable or not between 2000 and today), computes shares (company-balanced for the MBA set: `pipeline/balance.py`, one employer at most
  5% of a role), levels per ladder, the axis positions, and writes the index plus one file per role.
- `data/raw/jobs*/` — the backlog, one file per employer, not in git. A refresh never drops a posting: one still shown
  gets `last_seen`, a new one `first_seen`, one no longer shown `closed`. A posting is its requisition id (its URL on a
  board that gives none). An incomplete fetch (a listing page unread, a search at its page cap, under 30% returned)
  closes nothing by absence: each missing open posting is asked about one by one (`still_open`); the file says
  `partial`. `--recheck-closed DATE` reopens postings closed since DATE that the board still shows. MBA closed postings
  stay in the statistics for 12 months (`KEEP_CLOSED_DAYS`) with `open: false`; the product set drops them.
- `pipeline/backlog.py` — the backlog's store: the `backlog_files` and `postings` tables (GradBuddy project).
  `push` (the scrape pushes each file as it writes it), `pull`, `verify`, `status`; a full scrape keeps the newest four
  dated snapshots in the `backlog` bucket. Push never deletes; pull never overwrites a local posting the database lacks.
- `pipeline/store.py` — the `atlas-store` bucket, one manifest per store (`evals`, `caches`, `logs`). `push` uploads
  changed files and never deletes; `pull` writes differing files and keeps a newer local one; `status`; `bootstrap`.
  `pipeline/env.py` is the one reader of `.env`.
- `pipeline/processed.py` — reads and writes `data/processed/`; a file over 50 MB of JSON is kept gzipped.
- `pipeline/geo.py` — the country reader for the MBA and tech sets ("US - Remote", country codes, SuccessFactors URLs).
- `pipeline/log.py`, `pipeline/runs.py` — every stage logs INFO per stage with counts and seconds, WARNING for a
  skipped record, ERROR with the traceback; `.env` values are masked. With `SUPABASE_DB_URL` set each run inserts one
  row into `runs` (`pipeline/sql/002_runs.sql`); `pipeline.runs` prints them. `PIPELINE_LOG` names a log file,
  `PIPELINE_LOG_LEVEL=DEBUG` shows more, `PIPELINE_RUNS=off` skips the row.
- `pipeline/jobs_open.py` — every open US posting of the three sets (product, MBA, tech) → `web/data/jobs_open.json`
  (column-oriented: companies, locations, roles, titles, skill ids as lists; each row `[num, companyIdx, roleIdx,
  titleIdx, levelIdx, locationIdx, flags, skills, url, firstSeen, yoe, posted, start]`; `flags` is a bit field the file
  names, with one bit for the MBA set, one for the tech set, one for the tech set's new-graduate mark and one for a
  title that says the job is for new graduates (`GRAD_TITLE`, any set, never an internship), `yoe` the years asked,
  `firstSeen` the day our scrape first saw the posting (MBA and tech sets), `posted` the board's own posting date,
  `start` the year 2026 to 2029 a graduate title names) and `jobs_meta.json` (the counts, per set and without the tech set). A row's skills leave out credentials and
  the industries that do not define its MBA or tech role. No snippet, no sub-skills. Runs after `build_graph` of any
  set, no network; refresh-product, refresh-mba and refresh-tech all run it.
- `pipeline/catalog_export.py`, `catalog_tags.mjs` — the Spring 2027 catalog as public files. `catalog_export` runs
  the course catalog's loader dry and writes `web/data/catalog/cornell_tech.json` (committed) and
  `web/data/local/catalog_full.json` (this machine; the only copy with the syllabus digest). `catalog_tags` reads the
  local file, runs `Atlas.readCourse` per class twice (the MBA taxonomy into `tags`, the tech set's into `tags_tech`) and
  writes `cornell_tech_tags.json` with the three taxonomy files' hashes; the picker joins the two readings when a tech
  role is chosen (`Catalog.tagsFor`);
  `tests/web/catalog_files.test.mjs` fails when a hash is stale.
- `pipeline/funnel.py` — the funnel from the catalog project's tables for a date range: sessions and the share
  reaching each event, applications by source, the door funnel, drop-off by day and screen, calls to action
  (shown, clicked, done), the guide's tips by screen (`guide(rows)`: sessions shown, completed, skipped), returns,
  visible time by screen, feedback counts (never the sentences; `--notes` prints an applicant's note). Reads `CAPTURE_DB_URL`, else `SUPABASE_DB_URL`. Pure parts in `tests/python/test_funnel.py`.
- `pipeline/map_publish.py`, `map_feedback.py` — upload a student's checked map to `maps/<uid>/map.json`; list the
  feedback files. Read `CATALOG_URL` and `CATALOG_SERVICE_ROLE_KEY` from `.env`; exit 0 without the key.
- `pipeline/build_artifact.py` — the single-file build of the site (`web/artifact.html`, gitignored).
- `pipeline/game_passages.py` — `web/data/game_passages.json` for Spot the real ask.

### Employers and discovery

- `data/raw/fortune500_2026.json` — the 2026 Fortune 500 with industry labels; `pipeline/sectors.json` groups the 66
  industries into 11 sectors.
- `pipeline/discover.py` — careers-site discovery for Fortune companies (domain, careers-link crawl, ATS signature,
  Workday tenant guessing, adapter verification) → `data/raw/discovery/`; unresolved companies go to research agents
  (`data/raw/registry_fortune_agents_*.json`). `pipeline/verify_one.py` verifies one ATS config.
- `data/raw/funds.json`, `portfolio_<fund>.json`, `pipeline/probe_startups.py` — 52 venture funds and their portfolios;
  the probe finds each active company's Greenhouse, Lever or Ashby board and writes `data/raw/registry_startups.json`.
- `data/raw/registry_*.json`, `pipeline/merge_registry.py` → `data/registry.json` — per-company ATS configs merged
  (hand-verified over agents over auto) with tier, industry and sector. One job board is one employer.
- `pipeline/adapters/` — one module per ATS (27: Greenhouse, Lever, Ashby, Workday, Eightfold, Phenom, Oracle HCM,
  SmartRecruiters, SuccessFactors, iCIMS, Avature, Jibe, Radancy, Paradox, Amazon, Apple, Google, Meta, McKinsey,
  KPMG, Goldman Sachs, Bank of America, a JSON-LD reader, and others); `common.py` holds the session, the retry loop
  and `strip_html`. `talnet.py` reads tal.net (Oleeo) boards from
  the public Atom feed (`…/candidate/jobboard/vacancy/<n>/feed/structured`); a firm names its boards in the config
  (`{"host": "lek.tal.net", "boards": [{"name", "path", "vacancy"}]}`); a board behind a captcha returns nothing and
  says so. `yello.py` reads Yello (recsolu.com) boards: the search URL from the board page, 25 cards a page, then each
  job page; `posted` is approximate. Configs in `data/raw/registry_mba_employers_talnet_yello.json`.

### The standards index

- `pipeline/standards.json` — what the industry treats as the standard path into each role, as grounding for the
  quest generator's prompt; nothing in it is shown or linked on a quest card. `sources`: one record per page a
  person read (`kind`: program, loop, guide, credential, gap; `publisher_class`: employer, practitioner, book,
  certification_body, prep_vendor; `verified`, `access`, `first_party`, `status` on programs; `why_standard`,
  `what_they_test`, `artifacts` and `notes` in our own words, no quotations). Publishers on the blocked-vendor list of
  `data/raw/build_sources.json` are left out. `roles`: per role with a list (`also_serves` names the roles that read the
  same list) a `shows` list: `stage` (foundation or build), `means`, `artifacts`, `sources`
  (ids), `skills` (taxonomy ids), `weak`, a note, when no fetched source other than a prep vendor backs the item or the backing is thin for a stated reason. `no_list`: the roles whose
  sources do not say what a candidate must show, each with the reason; a reader gives those roles no grounding from
  this file. A reader takes `roles`; `sources` is there to weigh an item (first-party, fetched, fresh).
- `pipeline/standards_publish.mjs` — writes `web/data/standards.json` (the roles and their `shows`, no sources) for
  `/api/quests`; `--check` exits 1 when it is behind. `Quests.standardsFor` (`web/quests.js`) renders the lists of a
  person's roles into the prompt.
- `pipeline/standards.py` — `verify`: one GET per source, two seconds apart, a generic user agent. Writes only
  `check` (date, outcome, HTTP status, hash of the page's words, note), `read_sha256`, `read_sha256_date` and
  `read_sketch` (64 short hashes of the text's five-word runs) on a source; never a summary. Outcomes: `ok`,
  `changed` (the hash differs from the read's and a second fetch agrees with the first; a page whose two fetches
  differ is compared by sketch and is changed only under 0.8 alike), `unreachable`,
  `needs_signed_in_read` (paywalled, a book, a site that refuses scripts, a page that needs a browser; not a
  failure). The report also flags sources read more than 12 months ago and programs not re-read since the last
  1 August. After a re-read a person edits the record and `date_read`; the next verify takes the new hash.
  `citable` is the freshness rule the eval shares. `evals/run_standards.py` checks the file;
  `.github/workflows/verify-standards.yml` runs both monthly and opens an issue.

### The apprentice map

`pipeline/apprentice/` (its own README), `.claude/skills/apprentice-map/SKILL.md`, `data/apprentice/` (gitignored).
Node scripts run from the root: `new.mjs <slug> [--import]`, `ground.mjs`, `assemble.mjs`, `check.mjs`, `render.mjs`.
The pure part is `web/apprentice.js` (`Apprentice.ground`, `storyCards`, `assembleMap`, `selfServeMap`, `byHand`),
which the site's `/api/tree` runs for a signed-in person. The tracked example is `pipeline/apprentice/examples/pmm-nyc`,
a fictional person against a real posting.

## Site

All of `web/` is static. Classic scripts load in the browser and in node (`require("web/<file>.js")`), so the tests
and evals run the code the site runs.

- `index.html` — the shell: the brand, breadcrumbs, the verbs, the theme switch, the Feedback link; the footer's
  About GradBuddy, Feedback and Show me around; the scripts in load order (`config.js`, `copy.js`, … `feedback.js`,
  `guide.js`, … `app.js`, `gameshell.js`, the games). `tests/web/assets.test.mjs` checks every
  named script exists and the remote ones pin a version.
- `config.js` — the flags (README, "The switches"), the catalog project's URL and publishable key, `CAMPUS_DOMAINS`
  (flag → email domains), `CATALOG_TERM`, the Tally form ids.
- `copy.js` — every string a screen owns, one table grouped by screen (`Copy.door`, `.home`, `.intake`, `.you`,
  `.explore`, `.role`, `.fit`, `.jobs`, `.skills`, `.network`, `.classes`, `.signin`, `.heart`, `.feedback`, `.map`,
  `.about`, `.games`, `.guide`, `.common`). `Copy.fill(template, vars)` fills `{slots}`. Checked by `evals/copy.mjs` and
  `tests/web/copy.test.mjs`: sentences of at most 20 words, active voice, no utilize, leverage, facilitate, via,
  in order to; never a percentage about a fit.
- `atlas.js` — the data layer over both role sets: `Atlas.index()` (fields, roles), `Atlas.product()`, `Atlas.role(id)`
  (one role's postings, skills, sub-skills, evidence), `Atlas.grid()`, `Atlas.matcher(R)` (the matcher with the bands
  it was calibrated with), `Atlas.roughFit`, `Atlas.readPosting`, `Atlas.readCourse`, `Atlas.fieldChart`,
  `Atlas.carriers`, `Atlas.genericSkills`, `Atlas.us(text)` (American spelling at load, `web/data/spelling_us.json`,
  never on a quoted sentence or a pattern), `Atlas.useInferred` (binds the model read to one résumé text).
- `match.js` — the résumé matcher, pure: per-line evidence with strength, tiered requirements, persona and level,
  transfer vocabulary, skills presumed from a role held. A behaviour is credited through its carriers (`pickCarriers`),
  status `through`. `createMatcher({ behaviours })` is `"show"` or `"score"` as the bands files record. The model
  read's skills merge as status `inferred`, credit 0.75. `Matcher.bandOf(score, bands, group)` reads
  `web/data/bands*.json` (written by `evals/calibrate.mjs`; cut points, never round numbers). A résumé's job titles
  are read with the role set's rules, plus a few only résumés need: a law-firm "Associate", a judicial internship, an
  internship named by its field ("Embedded Software Intern"), and `RESUME_TITLE` for families the set holds.
- `evidence_text.js` — every sentence a screen shows about a skill, built from the data: the example line, what the
  skill means in the field, the gap sentence by kind, the measures to add. Checked by `evals/adaptive.mjs`.
- `app.js` — the screens (README table), the pure tables `Routes.parseRoute`, `Stage` (what each stage leads with),
  `Intake` (the one call to action), `Door` (the door's copy and rules: `campus`, `opens`, `reach`, `bounce`; `pass`,
  so a click on the door's own chrome counts as Skip), `You` (`You.back`: a `next` is a hash of this site, never the
  sign-in; the résumé step returns to it), `FitCounts` (the rail's "N of M" and the fit screen's lists from one fit),
  `CourseCore`, `Crumbs` (one breadcrumb rule: the section as the top bar names it, then the screen; Build skills is
  the section `build` at `#/map`), `Theme`,
  `RoleFilters`; the role screen's rail, the fit screen, the course screen, the event screen, the apprentice map's
  screens, the hearts (`heartHtml`, `toggleHeart`), the feedback box (`openFeedback`, `maybePrompt`), the tree form,
  one drop zone with a real "choose a file" button. `route()` calls `Guide.after` once a screen draws (the feedback
  prompt waits while a tip is due or open); `topBar` draws "Show me around" beside Feedback.
- `launcher.js`, `network.js`, `jobs.js`, `pick.js`, `skillmap.js` — the pure parts of Explore careers, Networking
  (`Network.sentenceCase`: skill names in lower case mid-sentence, acronyms and proper nouns kept), Find jobs
  (`searchJobs`, `filterJobs`, `facetCounts`; the search reads the short forms in `ALIASES` ("mle", "pm", "swe") by
  their own word or the words they stand for, `searchJobsRelaxed` gives the rows that match all but one word when none
  match every word, and `queryHints` names the filters a query's words ask for ("new grad", "remote", "visa"); `fitOf`,
  `fitLine`, `sortJobs`, `dedupe`, `pageOf`, `parseState`,
  `cardFacts`, `dateOf`, `dateLine`; the Fit sort ranks by `fitShare`, N / max(M, 15), so a long posting does not win
  on its count alone; Newest orders by `posted`, else `first_seen`, shown as "Posted 3 Nov" or "Listed here 5 Nov";
  the list opens on Fit with a résumé on file and on Newest without one (`defaultSort`; the menu's order is
  `sortChoices`), and that default stays out of the link;
  `sponsor` is `yes` or `open` (every posting that does not say it will not sponsor), and `ENTRIES(year)` gives New
  graduates, MBA entry, Internship and "Starts {year+1} or later" from the file's year; old links' `sponsor=1` and
  `entry=bachelor` read as `yes` and `grads`),
  the role picker (`Pick.distinct` names two roles with one title apart by field; `Pick.closest` offers the nearest
  roles when nothing matches), and the skill map (the fields on a ring, skills near the fields that ask for them,
  `SkillMap.chart` for one field, `thinNames` drops a label that would overlap, the route planner).
- `catalog.js`, `classes.js`, `data/sp27_campus.json` — the class picker. `catalog.js` is the reads and the pure
  functions (cross-list collapsing, eligibility, the relevance score and band, the gaps a class covers,
  `combineRoles`, the sorts, `datesLine`: the pre-enrollment dates from the campus entry); `classes.js` draws the
  screens. Every campus-specific string is data in
  `sp27_campus.json`, one entry per campus: a new campus is a new entry, never a code change. `enabled_by` names the
  flag that lists a campus; `catalog_file` and `tags_file` the two public files. No sign-in; the picker reads the
  person's gaps for the chosen roles and says which each class covers. `evals/run_classes.mjs` checks the matching.
- `doors.js` — the door and the intake boxes as Tally forms with the native form as the fallback: `Doors.mount(el,
  kind, opts)` (a light and a dark form per kind in `CONFIG.TALLY`, swapped on a theme change), `returnQuery`,
  `nativeSubmit` (through `Capture.waitlist`).
- `capture.js` — `Capture.event(name, ctx)` posts one event (name from the closed list `EVENTS`; the session and
  visitor ids; stage, program, role or field id, screen, cta, ms; the signed-in id when there is one) to `events` with
  the publishable key; `Capture.waitlist(email, source, ctx)` one application row; `screen(name)`, `cta(id, step)`
  (`cta_shown`, `cta_click`, `cta_done`), `action()` (a count in localStorage), `visible()` (visible milliseconds,
  summed from the heartbeats), `watch()` (the heartbeat every thirty seconds of visible, active time). Never a
  résumé, a posting, a skill id or a file name. `CONFIG.CAPTURE_ENABLED` off makes every call a no-op.
- `feedback.js` — `Feedback.due(input)`, the prompt's rule (twelve actions or six minutes of visible time; never on
  the door or the sign-in, nor within a minute of signing in; again after thirty days with new actions; once at the
  first self-serve tree); `emailOk` (empty, or one well-formed address); `offer` (the address on file, offered as one
  press: the box opens empty); `Feedback.send(row)` into the insert-only `feedback` table; the marks in localStorage.
- `guide.js` — the tips per screen: on a visitor's first visit to a screen, two to four spotlight steps on its
  controls; the door has none. `Guide.STEPS` is the step table (screen, step id, the selectors tried in order, the state
  a step needs); a step whose target is not in the page is skipped. The seen-state is `localStorage["guide.seen"]`
  (screen → version). A run is due when the flag is on, nothing else is open and the screen is unseen or its version
  is higher. Calls to action: `guide_<screen>` shown, click, done; `guide_skip` done; `guide_relaunch` click. On a
  phone (640 px and under) the card is a bottom sheet and the target gets a ring. The card is a non-modal dialog:
  focus moves in, Tab stays among its buttons, Esc skips. Off with `CONFIG.GUIDE_ENABLED`: nothing draws.
- `auth.js` — the sign-in with no library: `Auth.sendLink(email)` (an invited address only, `create_user: false`; the email carries a code and a link, and the invited page takes the code with `verifyCode`),
  `Auth.sendCode` and `verifyCode` (the six-digit code for anyone; `create_user: true`, so the catalog project's
  "Allow new users to sign up" must be on), `takeHash` (a magic link's landing), `stored`, `session` (refreshes),
  `readMap`, `readFeedback`, `writeFeedback` (the person's own mark on a quest: `feedbackObject`, `cleanLink`), `signOut`. The session lives in `localStorage` under `maps.session`. `MapGate.next` is
  the route table for `#/map` (Build skills); `MapGate.signinHash` and `landing` carry the map's own address through
  the sign-in and back. `app.js` `buildBar` shows the top bar's Build skills to every visitor while the tree is on; `buildOn` decides who sees the other door into the map (the fit
  screen's "Get your tree"): `TREE_ENABLED`, and accounts on or a session on this browser.
- `state.js` — a signed-in person's saved state in `profiles`, `hearts` and `reads` (own rows under row-level
  security): `State.hash(text)` (a SHA-256 of the normalized résumé, never the text), `readRows(fit)`, `saveProfile`,
  `saveRead`, `heart`, `load`, `forget`, `merge` (the browser's answers win; hearts are a union). Runs only with
  `CONFIG.ACCOUNTS_ENABLED` and a session.
- `map.js` — `MapModel`, the pure part of `#/map/quests` and `#/map/tree`: the class tree's places and layout, the
  levels and each quest's state from the file and the person's own marks (`worlds`, `ownChoice`, `questState`), the now
  quest and up next, the one-line "You ship" (`shipLine`), the read's lines, the co-asked skills; the level `side`
  (the side projects picked) has a head and no number. `apprentice.js` — the generator's pure part (above).
- `quests.js` — `Quests`, the pure part of "Start a side project" (`#/map/start`, `app.js` `startScreen`) and of
  `/api/quests`: the answers' lists and what they allow (`allowedKinds`, `allowedHosts`, `dbAllowed`), the class tree
  the projects aim at (`treeOf`), the request (`PROMPT` and `kitBlock` the stable prefix with the cache breakpoint
  after the kit, `personBlock` the person's material, `request`, `SCHEMA`), `validate` (every rule by id in `RULES`;
  a failing project is dropped, a quote the résumé lacks is cut), `cardOf` and `addSide` (the card, kind
  `side_project`, in the world `side` first on the path), `keepSide` (a rebuild keeps them), the daily cap. The kit
  is `data/build_kit.json`, the one file that names products, each with `checked` and `url`.
- `infer.js` — the browser side of the model read: `Infer.read(text, found, set)` calls `/api/infer`, keeps the answer per
  résumé text and set, `Infer.forget()`. The set is `"both"`, or `"all"` with `TECH_ENABLED` on: the route's list then
  adds the tech set's own skills, and `found` adds what the tech patterns found (`Atlas.roughFit`'s `shownT`).
- `api/infer.js`, `api/tree.js`, `api/quests.js` — the three functions (README, "Hosting"). `quests.js` authenticates
  as `tree.js` does and reuses its Storage calls; raw `fetch` to the Messages API, as `infer.js`. `tree.js` identifies the caller through
  GoTrue (`/auth/v1/user` with the session's token), reads the existing map with the service key, refuses to
  overwrite one with a build card (409), writes with `x-upsert`. `serviceHeaders(key)` puts an `sb_` key in `apikey`
  alone. Limits: 40,000 characters of text, four roles, 8 s upstream.
- `gameshell.js`, `games/` — the shell every game draws inside (`frame`, `foot`, `results`, `keys`, `start`,
  `picker`, the one `localStorage` record under `games`) and the built games. `games/README.md` is the design index.
- `tokens/`, `style.css` — the GradBuddy design tokens (oklch, dark and light) and the one stylesheet written on
  them; look changes go through tokens only.
- `data/` — the published files: `graph.json` (product), `graph_mba.json` + `graph_mba/<role>.json` (the MBA index and
  one file per role, loaded on demand; `_evidence.json` the example sentences), `graph_tech*` (the tech set),
  `taxonomy*.json`, `subskills*.json`, `bands*.json`, `roles_mba.json`, `roles_tech.json`, `role_blurbs.json` (one
  sentence per role), `jobs_open.json`, `jobs_meta.json`, `catalog/`, `games.json`, `game_passages.json`,
  `sp27_campus.json`, `spelling_us.json`. `local/` is this machine only.

## Database

`pipeline/sql/` holds every migration of the catalog project, dated, each safe to run twice:

| File | Creates |
|---|---|
| `002_runs.sql` | `runs` (GradBuddy project): one row per stage run, service role only. |
| `2026-10-25_capture.sql`, `2026-10-26_cohort.sql`, `2026-10-31_doors.sql`, `2026-11-01_positioning.sql` | `events` and `waitlist`: anonymous insert only, a unique index on email and source, the `note` and `surface` columns, the door and intake sources. |
| `2026-11-03_maps.sql` | The private `maps` bucket and the policies on a person's own folder. |
| `2026-11-05_journey.sql` | `visitor`, `user_id`, `screen`, `cta`, `ms` on `events`; the event name's shape only. |
| `2026-11-05_state.sql` | `profiles`, `hearts`, `reads`: own rows for every verb, nothing for anon. |
| `2026-11-05_feedback.sql` | `feedback`: anon and authenticated insert, never select. |

All are applied. The Vercel project's environment holds `ANTHROPIC_API_KEY` and `CATALOG_SERVICE_ROLE_KEY`
(Production).
