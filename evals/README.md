# Evals

Every runner that checks the pipeline, the matcher, the data files or the screens against labelled baselines. The
expectation files are the spec; a baseline (`*_baseline.md`, `calibration*.md`) is committed with the change that
moves it. Scratch (a draft baseline, a one-off report) goes under `data/experiments/scratch/<topic>/`, never here.

| Runner | Checks | CI | Needs |
|---|---|---|---|
| `node evals/run.mjs` | The matcher on the sample résumés; `--external`, `--private` add the other sets | yes | |
| `node evals/run_tech.mjs` | The tech set's samples | yes | |
| `node evals/calibrate.mjs [--roles mba\|tech]` | The bands of fit from the published samples → `web/data/bands*.json`, `calibration*.md` | | `store pull evals` |
| `node evals/rough_fit.mjs` | The interface's rough read against the full matcher | | `store pull evals` |
| `python evals/run_pipeline.py [--roles tech]` | Titles, levels, entry marks, countries, golden postings, sponsorship, integrity, graph, js, matcher | yes | |
| `python evals/run_taxonomy.py` | Kinds, evidence and field entries against the postings | yes | |
| `python evals/run_depth.py` | The published MBA skill depth | | |
| `python evals/run_standards.py` | The standards index: structure, `shows`, skill ids, freshness | yes, `--skip freshness` | |
| `node evals/adaptive.mjs`, `stage.mjs`, `posting.mjs` | The sentences and carriers over every role; what each stage leads with; the pasted posting | yes | |
| `node evals/copy.mjs` | Every string the screens own against the writing rule (gated by `tests/web/copy.test.mjs`) | via the test | |
| `node evals/run_classes.mjs` | The class picker's matching on the test résumés | | |
| `node evals/infer.mjs` | The model read over the whole résumé set | | `ANTHROPIC_API_KEY` or `--url`; `store pull evals` |
| `node evals/quests.mjs` | The project writer (`/api/open`, `/api/quests`) over 51 fixed cases: validity per rule, drops, levels, shares, tokens, cost per person → `quests_baseline.md` | | `ANTHROPIC_API_KEY`, or `--url` with `QUESTS_TOKEN` |
| `node evals/lines_judged.mjs` | A model reader on 50 generated sentences | | `OPENROUTER_API_KEY` |
| The game evals (below) | Each game's pools and deals over every role | | |

## Matcher evals

Sample inputs plus human-written expectations for the résumé read, so every change to the matcher can be checked
against the same cases and compared with [baseline.md](baseline.md).

```bash
node evals/run.mjs               # score every sample, check expectations, print a report
node evals/run.mjs --baseline    # same, and rewrite baseline.md (commit it with the matcher change)
node evals/run.mjs --only grad   # one sample
node evals/copy.mjs              # the strings the screens own against the writing rule (gated; --baseline rewrites copy_baseline.md)
```

No install needed; it reads `web/data/taxonomy.json` (the product part of `pipeline/taxonomy.json`, written by `build_graph`), `web/data/subskills.json` and `web/data/graph.json`.

## File types

A sample may be `.txt`, `.pdf` or `.docx`. The runner reads PDF and DOCX with the libraries the app loads in the
browser, at the same versions, and builds the text the same way (`evals/extract.mjs` mirrors `readFile` in
`web/app.js`), so a two-column PDF or a Word table is tested as a user's file would be. Text samples need no
install. For PDF and DOCX, run `npm install` once in `evals/`.

A sample's JSON may carry `parse`: what the parser must find whatever the layout. Fields: `roles` or `min_roles`,
`min_years`, `max_years`, `degrees` (ids), `titles` (each must appear in some role's title).

## Published sample resumes

`evals/external_sources.json` lists sample resumes that universities, business schools, professional bodies and
resume sites publish, by role, with a `fetch` rule for each: `script` (a university, business school or
professional body: `node evals/fetch_external.mjs` fetches it), `manual` (a resume site whose terms allow
personal or internal use but not automated retrieval, or whose terms could not be read: download it by hand and
save it under its id), `page` (a web page: paste its text into a `.txt`), `no` (left out, with the reason; real
people's resumes are never used), `ask` (a university sample that is not confirmed as an invented person: the
owner decides before any fetch). `evals/build_external_sources.py` rebuilds the list from search results; the 64 tech
entries (2026-11-06) were added by hand from research notes, so a rebuild must keep them. `--roles a,b` fetches only the
samples filed under those roles; `MAX_MB=15` raises the 5 MB cap for a long career guide.

`evals/external_expectations.json` says what the reader must find in each file. Write an entry by reading the
file first (`node evals/extract.mjs <file>` prints its text as the app reads it), never from the reader's output.
Fields: `kind` (`single`; `template`, placeholder text or dates; `packet`, several resumes in one file), `only_years`
(a template whose only placeholders are the years, "May 20XX": calibration reads it, see below), `parse`
(as above), `seniority` (early, mid or senior, as read from the resume), `must_evidence` and `must_not_tag`
(skill ids of the MBA taxonomy; checked with a matcher built on `pipeline/taxonomy.json` as the MBA role set sees
it), `held` (role families the person held as jobs), `note` (the layout). A packet has `parts`: each is one resume,
cut by `lines` (first and last line of the file's text, counted from 1) with `starts` (the first characters of
the first line, so a cut that has moved fails loudly), its own `role`, `seniority` and `parse`.

`evals/resume_titles.json` lists job titles as resumes write them with the role family each must be read as, or
none. `node evals/run.mjs` checks it with the role families of `web/data/roles_mba.json`. A case marked `known_gap` is
reported and not counted. Its tech twin, `evals/resume_titles_tech.json`, is checked by `node evals/run_tech.mjs`.

`node evals/run.mjs --external` also scores the files in `evals/resumes/external/`.

`node evals/parse_health.mjs` reads every external file and flags the ones the parser reads badly (no jobs, a job
with no title, implausible years), with no expectations needed.

The bands files also record `scoring.behaviours` (`"show"`: a behaviour is a row with weight 0, credited through its
carriers for display; `"score"`: weighed like every ask). `BEHAVIOURS=score node evals/calibrate.mjs --roles mba` tries
the other setting and writes nothing.

`node evals/calibrate.mjs` writes [calibration.md](calibration.md): how same-role, adjacent-role and other-field
resumes score against the product roles, how well the score separates them, and the cut points for bands of fit
that those distributions give, with bootstrap intervals. `node evals/calibrate.mjs --roles mba` does the same for
the 50 roles of the MBA graph and writes [calibration_mba.md](calibration_mba.md), with a table per role group
(about five minutes). `node evals/calibrate.mjs --roles tech` does it for the seven tech roles and writes
[calibration_tech.md](calibration_tech.md) and `web/data/bands_tech.json` (about two minutes). There, three groups hold one
role each, so "adjacent" is a tech résumé against a tech role it was not written for, and another field is a résumé
written for an MBA or product role; the matcher weighs asks against the MBA and tech roles together, as the site does
(`techBaseline` in `evals/lib.mjs`, held to `web/atlas.js` by a test). Calibration reads single résumés and the
templates marked `only_years`. Each run also writes the bands as data for the interface: `web/data/bands.json` (product),
`web/data/bands_mba.json` and `web/data/bands_tech.json`, the cut points the interface uses: two upper lines shared
by every role, a bottom line per role group, and the groups that get no bands yet. `Matcher.bandOf(score, bands,
group)` in `web/match.js` reads it. The file also states the scoring the cut points were made with
(`scoring.distinct`); create the MBA matcher with that setting or the bands do not hold.
`DISTINCT='{"floor":0,"full":3}' node evals/calibrate.mjs --roles mba` tries another setting and writes nothing. Rerun both after any change to the matcher; the bands the interface shows must come from
these files, not from round numbers. The folder is gitignored:
published sample resumes belong to their publishers, so the repository keeps only the list of sources and our own
expectations for each file, not the files.

## Real resumes, kept private

Put a real resume in `evals/resumes/private/<name>.txt`, with a `<name>.json` of expectations beside it if you
have them. The folder is gitignored, so the file stays on this machine. Run `node evals/run.mjs --private` to
score it with the other samples. Private samples never go into `baseline.md`.

## Samples

`evals/resumes/<name>.txt` is the input exactly as a user would paste or drop it. `<name>.json` beside
it holds the expectations:

| field | meaning |
|---|---|
| `persona` | `experienced_in_role`, `new_to_role` or `pivoter`. The redesign should produce a different reading for each. |
| `targets` | slices to score against, as `family:level` or `family:__all`. |
| `score_band` | per target, the range a sensible score should land in. A judgment call; tune after the scoring model settles. |
| `expect_employer` | an employer the matcher must recognise on the first target, because we hold its postings. |
| `expected_level` | the level a reader would place this person at. Not checked yet; for the level-read feature. |
| `must_evidence` | skills a human reader says are clearly shown. Each one not tagged is a miss. |
| `must_not_tag` | skills that are not on the page. Each one tagged is a false positive. The hard constraint: false positives cost user trust faster than misses. |
| `real_gaps` | skills genuinely absent that the result should surface as gaps. Tagged means a false positive. |
| `must_show_through` | `{ behaviour: carrier }`: on the first target, the behaviour's row must read `through` that carrier (`"*"`: any carrier; a list: any one of them, for carriers the resume shows equally strongly, where the pick between them follows how often each comes with the behaviour in the postings, which a refresh can reorder). A behaviour is never evidenced by its own words (PLAN.md v14, decision 1). |

The runner also lists skills it tagged that no expectation covers, so each sample's expectations can be
completed over time. Expectations are the spec. When a check fails because the expectation was wrong,
fix the expectation and say why in the commit.

## Current samples

- `experienced_pm` — five-year PM, written in outcome language. Should score high at senior and mid.
- `grad_student_new` — MBA student, one PM internship, marketing background. The core user.
- `pivot_phd_hci` — HCI PhD with an engineering internship; academic vocabulary for PM skills.
- `course_list` — the paste-a-course-list path, no work history.
- `experienced_with_coursework` — twelve years of work, a course list and a skills column with no heading: only
  the work lines are evidence.
- `template_placeholder_years` — a career-office template with "20XX" for every year: jobs are read, years are not.

## Adding a sample

1. Drop the text in `evals/resumes/<name>.txt` (convert PDF/DOCX to text first; the app's own extraction
   path is not exercised here). Strip real names and contact details.
2. Run `node evals/run.mjs --only <name>` and read the tagged list.
3. Write `<name>.json` from that list and the resume: what is clearly shown, what is a false positive,
   what is genuinely missing.

## What the runner checks

For each sample and target: the three coverage numbers and the overall score against `score_band`;
`must_evidence`, `must_not_tag` and `real_gaps` against the set of skills evidenced at strength 2 or
more; `persona` and `expected_level` against the profile read; and a monotonicity property (appending a
line that evidences a gap never lowers the score). `--verbose` prints every requirement row with the
line that evidenced it, which is the fastest way to see why a check failed.

**Layouts.** Each sample is also rewritten in the layouts of `evals/layouts.mjs` (dates as `01/2020 – 03/2022`
or `Jan 2020 - Mar 2022`, employer in capitals on its own line, other bullet glyphs, wrapped bullets, spaced
hyphens, split ligatures, a year broken in two, a side column's heading inside the work history, dates in a
column apart from the job lines, only a place beside the dates, other headings, Windows line ends, and several of
these at once as a PDF text layer gives them). Every variant must read like the original: the same number of
roles, the same years in product, the same persona and level, the same skills evidenced, and a score within four
points. Add a variant when a real resume shows a layout that is not there yet.

The runner requires `web/match.js` directly, so it always runs the code the app runs.

## The tech role set's samples

`node evals/run_tech.mjs` runs `evals/resumes_tech/`, scored as the site scores the set (the setting in
`web/data/bands_tech.json` and `techBaseline`), (a `.txt` and its `.json` per sample, the fields of the table
above plus `known_miss`: `{skill id, "level" or target: reason}`, a wrong answer accepted for now that fails when it starts
to pass) through `web/match.js` with `web/data/taxonomy_tech.json`. `--baseline` writes `baseline_tech.md`. A sample's band is a judgment
call; the calibrated bands are in `bands_tech.json` (software and security; data and AI, design and legal wait for
samples). The runner also reads `evals/resume_titles_tech.json`: job titles as résumés write them (rows marked
`from_sample` come from the published tech samples, with the employer line beside them), each with the tech family
and, where the title names a grade, the level it must be read as; `known_gap` rows are reported with their reason and
not counted.

## Extraction baselines

The matcher evals above check how a resume is read. These check how postings are tagged.

- [extraction_baseline.md](extraction_baseline.md): the product taxonomy against model judgment on 200 PM postings.
  The model's answers were recorded once and live in `data/experiments/` (gitignored). After a taxonomy change,
  re-extract and rebuild the graph, then recompute the regex side against the saved answers (no API calls) and
  add a dated section for the skills that moved:

  ```bash
  .venv/bin/python -m pipeline.extract && .venv/bin/python -m pipeline.build_graph
  .venv/bin/python -m pipeline.experiments.decisions_audit --n 200 --seed 7 --skills <all product skill ids> \
      --reuse data/experiments/decisions_results.jsonl --tag after
  ```

- [extraction_baseline_mba.md](extraction_baseline_mba.md): the MBA role set. Per role, how many skills a posting
  gets and which are asked most; per skill, its share and the roles that ask for it. Regenerate after any
  taxonomy change that touches shared or MBA skills:

  ```bash
  .venv/bin/python -m pipeline.extract --roles mba
  .venv/bin/python -m pipeline.experiments.role_corpus --roles mba
  .venv/bin/python -m pipeline.experiments.role_coverage --roles mba
  ```

- `extraction_audit_mba.md`: model judgment on the MBA skills, from
  `pipeline.experiments.skill_audit --roles mba` (needs `OPENAI_API_KEY` in `.env`; `--reuse` afterwards).

A shared skill serves both role sets, so a change to one of its patterns means both sets of steps.

- [extraction_baseline_tech.md](extraction_baseline_tech.md): the tech role set, the same report (`role_coverage --roles tech`
  after `pipeline.extract --roles tech`). A skill's tech wording (`patterns_for: {"tech": ...}`) and a tech-only skill move
  this file alone; `tests/python/test_taxonomy.py` pins that the product and MBA sets never read them.

## Pipeline evals for the MBA role set

The evals above check a resume and the tags of a posting. These check the data layer under them: which role and
level a title gets, which country a location gets, which skills a known posting gets, and whether the graph files
are whole.

```bash
.venv/bin/python evals/run_pipeline.py               # all parts; exit 1 when a check fails
.venv/bin/python evals/run_pipeline.py --only titles # one part: backlog, titles, entry, countries, golden, sponsorship, integrity, graph, js, matcher
.venv/bin/python evals/run_pipeline.py --baseline    # also rewrite pipeline_baseline_mba.md (commit it with the change)
```

No API key is needed. The `js` and `matcher` parts need `node`.

| part | file | what it guards |
|---|---|---|
| backlog | – | What a refresh does to a company's postings (`pipeline.scrape.merge`): it adds new ones, closes missing ones, reopens returning ones, drops none, and closes nothing when most postings fail to come back. A posting is its requisition id (its URL on a board that gives none): a requisition under a new URL is the same row and takes the current URL and title; two rows of one requisition fold into the one seen last. |
| titles | `titles_mba.json` | 810 titles with the role each must get, or none. 470 come from the scraped postings, 159 were written to probe the edges ("Executive Assistant, Investment Banking", "Talent Sourcing Manager"), 156 cover campus titles, sector bankers and entry-level grades (set `entry-2026-10-13`), 17 the AI transformation role and its edges (set `ai-transformation-2026-10-30`: engineers, research labs, AI governance and AI strategy are not it). |
| golden, entry, integrity, graph, matcher (tech) | `golden_tech.json`, `entry_tech.json` | `run_pipeline.py --roles tech`: 14 golden postings (two per role) with must and must-not skills, floors 0.87 and 0.27; 130 postings with their entry mark, read with their text. Integrity, graph and matcher read `data/processed/jobs_tech.json` and `web/data/graph_tech*`. The js part also checks that `web/data/taxonomy_tech.json` is the set's part of the taxonomy (`python -m pipeline.roles_tech`). |
| titles (tech) | `titles_tech.json` | `run_pipeline.py --roles tech`: 748 titles with the role, level, ladder and entry mark each must get in the tech role set (PLAN.md, "A third role set"), labelled by readers who saw a written spec and never the rules: 480 drawn from a census of the Greenhouse, Lever and Ashby boards, 236 written at the borders with the product and MBA sets, hardware, banks and the ladders, 32 entry titles, and 90 bare titles at employers of every industry, with the employer's industry, which decides them. The same run checks `web/data/roles_tech.json` against `export()` and `evals/roles_tech.mjs` against `pipeline/roles_tech.py`. Baseline: `pipeline_baseline_tech.md`. The other parts come with the set's scrape and graph build. |
| titles, fresh (tech) | `titles_tech_fresh.json` | Reported by the same run, never checked: 420 titles drawn on 2026-11-06 after the rules were written (300 from the census with a new seed, 120 kept by the refresh from Workday and the other boards), labelled by two readers on every title from the same spec; 302 rows where both were sure and agreed. The rates (role right, recall, precision, level, entry mark) are the honest ones, since no rule was fixed on these titles. A miss is fixed through a new row in `titles_tech.json`, never by editing this file. |
| levels | same file | The level each title must get on its ladder: corporate, bank or consulting. A bank Vice President is `senior`. |
| entry | `entry_mba.json` | 231 postings with the entry mark each must get: `mba`, `pre_mba` or none, and internship or not. 210 are real US postings drawn by seed from 20 strata; 21 are titles written to probe the firm table. 32 are read with their posting text. The part also checks that every row of the firm table has a source. |
| countries | `countries.json` | 280 location strings with the country each must get. A wrong country hides a US posting or shows a foreign one. |
| golden | `golden_mba.json` | 99 postings, two per role, each with the skills it must get and must not get. The posting text is in the file, so the eval does not move when the scrape is refreshed. |
| sponsorship | `sponsorship.json` | Visa sponsorship as a posting fact: postings labelled by reading them (yes: the employer says it sponsors; no: it says it does not; null: it says nothing, some naming a project sponsor or a sponsored event), with the deciding sentence in `note`. `pipeline.sponsorship.read` must equal every label; the part also prints the values in the processed file. 62 rows: 22 business postings from the golden set and 40 tech postings (`set: "tech"`) drawn from the 2026-11-05 tech refresh, 18 yes, 24 no and 20 silent in all. |
| integrity | – | No two registry entries share a job board. No URL or id repeats in the processed file. Every skill id exists. Every role has US postings, except a role the current rules would fill from postings stored under another role (a role added since the last extraction: reported as waiting for `pipeline.extract --roles mba`, with the count of stale postings). Every posting has an entry mark from the allowed values, and a source exactly when it has a mark. |
| graph | – | The role files add up to the index. A role with no postings is in the index with n 0, has an empty file and is in no group; every other role is in exactly one group. Every posting is a US posting of its role. The entry marks in the files equal the processed file, and the entry counts in the index (per role and ladder, per ladder) add up to the files. Shares in the index equal the weighted shares of the files. No employer weighs more than the cap. The product files are untouched. |
| js | `roles_mba.mjs` | The JavaScript reader of `web/data/roles_mba.json` gives the same role, level, ladder and entry mark as `pipeline/roles_mba.py` on every title we hold, and the same entry mark on the labelled postings that carry a text. |
| matcher | `graph_mba.mjs` | `web/match.js` builds requirements and scores a resume against each MBA role with postings, with no change to the matcher. |

**How the labels were made.** Before the code was run on them, by reading: each title with its employer, each
location, each posting in full with the skill names and definitions (not the patterns). The labellers were model
readers that did not see the code. The instructions they followed are summarised in each file's `about`.

**The entry labels.** One model reader labelled the 231 rows from a written spec, the research note and the sample. It did not see the code, and the rule was not run on the rows before. The spec defines `mba` as "written for MBA students or new MBA graduates, or the grade at which that firm hires MBA graduates into its main line of work", and `pre_mba` likewise. 60 rows are `sure: false` (funds, asset managers, brand titles, internships with no audience in the title): the research does not settle them. After a change to `pipeline/entry_mba.json`, to `entry()` or to a level rule, run `evals/run_pipeline.py`; the chain for the MBA extract path applies (below), because the mark is written at extraction.

**Rows that do not count.** `"sure": false` marks a row a reader could label either way (about a third of the
titles). It is reported, not counted. `"known_miss"` (`known_miss_role`, `known_miss_level` for titles) marks a
wrong answer we accept for now, with the reason. It fails when it starts to pass, so the mark gets removed.

**Golden floors.** The tagger does not find every `must` skill and tags some `must_not` skills. The file holds a
floor for the first and a ceiling for the second. A change that makes either worse fails. When a taxonomy
change makes them better, move the floors in the same commit. `pipeline_baseline_mba.md` lists every miss per
posting; a skill marked * is shared with the product map.

**When a check fails.** Labels are the spec. Fix the rule. If the label is wrong, fix the label and say why in
its `note` and in the commit. Do not relabel to make a rule pass.

**What these evals do not show.** The rules were fixed on the same titles and locations that now measure them,
so "all pass" is optimistic. Draw a new sample (other seed) to get an honest rate. The golden postings were
labelled once by one reader each; two readers per posting would show how much the labels themselves vary.

## Content evals for skill depth

The published depth of the MBA skills (`pipeline/depth/mba_*.json`, written by `pipeline.depth_publish`) is checked
with no model:

```bash
.venv/bin/python evals/run_depth.py                 # all parts; exit 1 when a check fails
.venv/bin/python evals/run_depth.py --only evidence # one part: shape, style, specificity, evidence, ladder, subskills, build, roles
.venv/bin/python evals/run_depth.py --with-corpus   # also check every cited sentence against the posting's text (needs data/experiments/corpus_mba.jsonl)
.venv/bin/python evals/run_depth.py --baseline      # also rewrite depth_baseline_mba.md (commit it with the change)
```

| part | what it guards |
|---|---|
| shape | Every MBA skill has a definition. Sub-skill ids are unique, their patterns compile and carry no inline flag (the web matcher cannot read one). Ladders and rungs use the known names; a shown ladder has two rungs or more. Every statement, sub-skill and step has provenance, and a rung's text is its statements joined. |
| style | Definitions, examples, rungs and steps: at most 25 words a sentence (20 for a step), one or two sentences, active voice, no filler; a rung or an example starts with "You". |
| specificity | A rung statement names at least two content terms of its cited sentences, from two employers. A step names its target or its source. |
| evidence | Every statement cites two employers. Its postings exist in the processed file, are US postings on this ladder and at this level, and carry the skill. The quote is word for word in a cited sentence. With the corpus: each cited sentence is still in the posting. A sub-skill's patterns match its own cited sentences. |
| ladder | A higher rung does not say what the rung below says (term overlap under 0.6). |
| subskills | On the processed file, a sub-skill is tagged in 5% to 50% of the skill's US postings at three employers or more, and is not named like another skill. |
| build, roles | Every step passes the code checks of `pipeline.build_steps` against its stored provenance (demand, no credential under a skill, no step on a ladder on hold, source on the allow-list with a hash and the passage still found, grounding label, template, quote, licence, vendor, style, duty, exam access, slots only, numbers). At most three steps per ladder, one per kind. Role asks have five employers. |

**What these evals do not show.** The checks measure form and grounding, not truth: a rung says what two employers
ask at that level, which may still be an odd pair. The critic's judgment (support, swap test) ran once in the
pipeline and is not rerun here; `pipeline.depth_gen --rejudge` measures how much another critic agrees. The
sub-skill shares are measured on the same postings the patterns were drafted from.

## Game evals

The games (`games/`, built in `web/games/`; reached from the role pages at `#/play/<slug>`) draw their rounds from
the atlas data with
rules written in their design packages (`games/<slug>/README.md`). Each game keeps its data rules as pure functions
apart from its screens, so node can run them over every role with no install. Each exits 1 on a rule violation.

```bash
node evals/skill_path.mjs             # Skill path: the board, the README's example round, the random pool, no dead end
node evals/games_guess_the_role.mjs   # Guess the role: the pool, distractors and the three clues over all 48 roles
node evals/game_passages.mjs          # Spot the real ask: the passages file web/data/game_passages.json
node evals/game_spot_scoring.mjs      # Spot the real ask: the lines and the scorer, five simulated readers answering line by line
node evals/game_know_the_role.mjs     # Know the role: the pools and the deals (boards, calls, field hop) over all 63 roles, the tech set's seven included
```

| eval | what it guards |
|---|---|
| `skill_path.mjs` | Loads `web/atlas.js`, the skill map's own board (`SkillMap.board()`) and the game's `logic`. The board has 240 skills and 938 links in one piece, each skill with 2 links or more (`buildBoard` drops dead ends). Product Manager's arrival skills, Marketing's start skill, the shortest route (3 hops, 1 of them good), the budget (5), the four choices at each hop of the README's Marketing → Product Manager round with ★ on the ones that end it, its result (arrived in 4, 1 good) and Build next before and after ticks. Supply chain & procurement → Product Manager: start skill, par 4, and the biggest-blue-number route ends 3 hops short with 2 good hops. The random pool (485 pairings from a field, 2,396 from a role: a shortest route of 2 to 6 hops, no small role). All 56 pickable roles have three arrival skills. Four simulated players on every pairing: none is ever left with no choice and no step back, and the perfect player always arrives. |
| `games_guess_the_role.mjs` | Every role has a playable posting. Every distractor set is three distinct roles, none above similarity 0.90, in a 2 + 2 or 1 + 1 + 1 + 1 field pattern. Every clue set of every playable posting is three distinct eligible skills, none generic, each asked by at least a quarter of the role's postings, in rising order of lift, with no red herring and the giveaway's disc above 0; the first clue comes from the more distinctive half of the candidates and the second is the most distinctive but the giveaway (v12). It prints the counts the README states (22,367 open, 20,313 playable, 46 roles with 2 + 2, the relaxed rule for 364) and warns, without failing, when a data refresh moves them. |
| `game_passages.mjs` | Checks `web/data/game_passages.json`, written by `pipeline/game_passages.py`: valid chunk labels, every ask names a skill of its set's taxonomy, each block's chunks join back to its text, shares in [0, 1], no passage over 700 characters, at most 12 per role and one employer per role, the file under 1 MB, every role id in `graph_mba.json` or `graph.json`. |
| `game_know_the_role.mjs` | Loads `web/atlas.js` (with the tech index on) and the game's `logic`. Every role is playable, the seven tech roles included (three real asks at 40% and a decoy or more; the counts: 54 roles, real asks 10 to 27 a role, decoys 12 to 99, calls 42 to 80). For every role and stage: a board of twelve with five real asks (never a decoy that is an ask, never a tile twice, the first board's decoys from another world when the pool has them), eight calls that exclude the anchor, sit on both sides of half and outside the stage's gap when the pool allows, and a field hop over roles of other fields; a seed repeats a deal; a perfect and an all-wrong player score as they should. The three games it replaced (Higher or lower, What does it ask for, Build the hire) had no eval. |
| `game_spot_scoring.mjs` | Loads `web/data/game_passages.json` and the game's `logic` (its lines, deal and scorer). The lines of every passage are its ask and filler chunks in reading order, each inside its bullet, with an ask and a filler line in every passage (456 passages, 3,661 lines, 4 to 17 a passage). Five simulated readers play 4,000 runs each of one easy, one medium and one hard passage, dealt as the game deals (seed 7), answering every line: perfect, careful (an ask called an ask with p 0.85, a filler line with p 0.20), keyword (0.60 / 0.50), all-ask, all-filler. The perfect reader reads 1 in every run, all-ask exactly 0.5, all-filler 0; the careful reader's mean read is at least 0.75 and never below 0.3 over a run; the keyword reader's mean is at least 0.2 below the careful reader's and above 0.4, and it finds fewer asks and lets less filler pass. Prints the mean read, the asks found and the filler let pass per reader. |

The expected numbers are the data's at the last run. After a data refresh `skill_path.mjs` prints the new values and
fails, and `games_guess_the_role.mjs` warns; update the game's README and the eval together on a `data/` branch. When
a refresh of the passages moves a simulated reader off its band, `game_spot_scoring.mjs` fails: the scorer in
`web/games/spot-the-real-ask.js` and the band in the eval are then retuned together.

## The standards index

`pipeline/standards.json` (`docs/MODULES.md`, "The standards index") is hand-checked grounding for the quest
generator. The eval checks the file with no model and no network:

```bash
.venv/bin/python evals/run_standards.py                  # all parts; exit 1 when a check fails
.venv/bin/python evals/run_standards.py --skip freshness # what CI runs
.venv/bin/python evals/run_standards.py --baseline       # also rewrite standards_baseline.md (commit it with the change)
```

| part | what it guards |
|---|---|
| structure | Source ids are unique; every record has its fields and known values for `kind`, `publisher_class`, `verified`, `access` and, on a program only, `status`; every role id exists in a role set; a prep vendor or a gap is never first-party; no record keeps a quotation; no publisher or URL is on the blocked-vendor list of `data/raw/build_sources.json`; verify's fields are well formed. |
| shows | Every role in `roles` exists in the role sets it names, under the set's label; every role has a list, is served by another role's, or is in `no_list` with its reason; every source id resolves and serves that role or one in `also_serves`; an item with no fetched source other than a prep vendor carries a `weak` note (an item may carry one for another stated reason, such as a single employer's page). |
| skills | Every skill id is in `pipeline/taxonomy.json` and in the taxonomy of one of the role's sets. |
| freshness | No `shows` item rests only on sources read more than 12 months ago, programs not re-read since the last 1 August, or closed programs. The date decides it, so the monthly workflow runs it and CI does not. |

**When a check fails.** The file is the label. A person re-reads the page, edits the record and its `date_read`,
runs `pipeline.standards verify --only <id>` and rewrites the baseline. `verify` never edits a summary.

**What this eval does not show.** Whether a summary is true to its page (each was read once, by one reader, and 38
were seen in a search result only), and whether a generated quest matches what a role's loops ask for. The second is
"Evals to build", item 10.

## Taxonomy evals

The stratified taxonomy (`PLAN.md`, "A stratified taxonomy") adds a `kind` to every skill, an evidence entry per skill
(`pipeline/evidence.json`) and a field entry per skill and field for the skills most fields ask for
(`pipeline/fields.json`). The files are hand-written; the eval checks them against the postings.

```bash
.venv/bin/python evals/run_taxonomy.py              # all parts; exit 1 when a check fails
.venv/bin/python evals/run_taxonomy.py --baseline   # also rewrite taxonomy_baseline.md (commit it with the change)
```

| part | what it guards |
|---|---|
| shape | `pipeline.tax.validate`: every skill has a kind from `KINDS`; every skill has an evidence entry with a known form, list fields and carriers that are skills of a carrier kind (method, practice, technical, knowledge), not itself; a behaviour names three or more carriers; a tool or credential is `named`; every field entry names one of the 11 fields or a role (`role:<id>`, a role override: PLAN.md v16 step 6), two to six carriers, a reading under 25 words and a resume line under 30 words with a number. |
| coverage | A skill that at least four fields ask for (mean share over the field's roles at least 25%) has an entry for every field that asks for it; no entry exists for a field that asks for the skill in under 10% of its postings; tools and credentials have none. |
| grounding | Each carrier a field entry names is asked for together with the skill in at least 15% of the field's US postings that ask for the skill, company-balanced; a role override is checked the same way on the role's own postings. The baseline prints, beside each entry's carriers, the five carriers the postings rank highest (share times log-lift), so a reader can see where the hand and the data differ. |
| carriers | Each carrier a behaviour's or a practice's evidence names is asked for with it in at least 10% of some field's postings that ask for it. A carrier is field-specific (pitch books carry communication in banking), so this is the maximum over fields. |
| published | `web/data/graph.json`, `graph_mba.json` and `taxonomy*.json` carry what the source files say: every skill node has the taxonomy's kind and its evidence entry under `how_shown`, the field entries appear as `fields` with the postings' side (`n`, `with`, `subs`) beside the text, and `meta.kinds` is the current table. A build older than the files fails here. |

**The tech set.** Its five fields (`pipeline/roles_tech.py`, `GROUPS`) are read from `data/processed/jobs_tech.json` beside the MBA fields and counted apart: a skill four tech fields ask for needs an entry per asking tech field. A checkout without that file reports the tech fields as waiting and checks their entries for shape only.

**What these evals do not show.** The carriers are checked against postings, which say what employers ask for together,
not what a resume reader accepts as evidence. The readings and resume lines are editorial; no reader has judged them.
The thresholds were set once on the data of 2026-10-24.

## Adaptive evals

The taxonomy adapted to each role puts its logic in pure functions the app runs (`web/evidence_text.js`;
`carriers()`, `areas()` and `readCourse()` in `web/atlas.js`), so one runner checks them over every role of both sets
with no DOM. Exits 1 on a rule violation; in CI.

```bash
node evals/adaptive.mjs                 # every part
node evals/adaptive.mjs --only text     # one part
```

| part | what it guards |
|---|---|
| carriers | For every role of both sets and every behaviour or practice in its grid, `Atlas.carriers` picks carriers of a carrier kind, four at most; picked on the postings they all pass the 15% floor; the field fallback is the role's own field's list; a behaviour most postings ask for always has a carrier. Prints how many were picked on the postings, by the field's list, by the two most asked under the floor, and none. |
| course | The `course_list` sample read by `Atlas.readCourse`: the split by kind (`teaches`, `named`, `other`) sums to the found set; `teaches` holds only methods, technical, knowledge and tools; `named` only behaviours and practices; `other` only credentials; against every role's grid no behaviour or practice is shown as taught, every named one is listed apart, and none is both. |
| grid | Over every role of both sets: no behaviour sits in an area panel; the last panel is "How you work" exactly when a behaviour is in the grid, holds every one of them with its carriers and a summary built from the shares; the first panel holds a carrier-kind skill or a defining one (never tools or behaviours alone); the generic skills (`Atlas.genericSkills`, measured) are mostly behaviours and practices and never a tool or a credential, composition printed. |
| text | For every role of both sets and every ask of the role, `EvidenceText` returns a line, a gap sentence and a "add a number" sentence under 40 words with no empty slot; a template line (no field entry, no product `signals`) invents no number; where the role's field has an entry the line is that entry's (a product role reads the product entry); a behaviour's gap sentence names a carrier the role's postings ask for. Prints how many lines come from a field entry, from `signals` and from a template. |

## The stage eval

The stage answer (`you.stage`: looking, targeting, curious), asked in About you, step 2, decides what About you and
the role rail lead with. `node evals/stage.mjs` checks, for each stage, that the first action each screen offers is
the one the stage asks for (looking: a résumé drop or the fields; targeting: the role search or the gaps; curious:
explore or a game), reading the pure table `Stage` in `web/app.js` that the screens draw from, and that the screens do
read it; that the first call to action on the rail and the fit screen is the intake box (`Stage.cta`, the copy in
the pure table `Intake`, which names no cohort, price or date); and that the door and home never ask the stage. In
CI. What it does not show: whether a student of each kind gets what they came for; that needs sessions
(`pipeline/funnel.py`) or résumés per kind.

## The pasted posting

The fit screen reads a pasted posting in the browser: `Atlas.readPosting` runs
`Matcher.tagPosting`, the taxonomy's own patterns over the text with the boilerplate cut the way `pipeline/extract.py`
cuts it (EEO, benefits, legal, the employer describing itself; the employer's name is inferred from the line openings
it repeats, since a pasted posting carries none), none of the matcher's resume-language extras. `node evals/posting.mjs`
pastes the 99 golden MBA postings one by one and compares with the tags the pipeline gives the same text (a short
python run, no network): each posting must show at least 80% of its pipeline-tagged skills and never a skill the
pipeline does not tag. In CI. What it does not show: whether the skills a posting names are the ones it weighs; a pasted posting is read as one
document, so the band stays the role's.

## Lines judged

The sentences the screens show about a skill are built from the data by `web/evidence_text.js`; no reader had judged
them. `node evals/lines_judged.mjs` draws 50 sentences per release over both role sets, a
third each of field lines (`pipeline/fields.json`), templates (`pipeline/evidence.json`) and gap sentences, one from each
kind-by-field cell in a seeded order, and asks a model reader of a different family from the depth's drafter
(`anthropic/claude-haiku-5.5` through OpenRouter; `openai/gpt-6.1-sol` drafted the depth) three yes/no questions per
sentence: names an artefact or a counterpart; carries a number where its kind asks for one ("na" when the sentence names
the measure or points to other work); in the field's words rather than another field's. Answers are cached under
`data/experiments/lines_judged/` (a rerun sends only what is missing); `--dry-run` states the sample and the cost and
sends nothing; `--n`, `--seed` and `--model` change the sample and the reader. The report is
[lines_judged.md](lines_judged.md), failures listed by skill and field so `fields.json` or `evidence.json` can be fixed;
the runner exits 1 while a judged sentence fails. The gate: it runs before any later PR changes a sentence template
or shows a new generated line. Needs `OPENROUTER_API_KEY` in `.env`; not in CI. The report file is a placeholder until
the first live run.

**What it does not show.** One reader, once, on 50 sentences; whether a student reads a line as the reader does is not
measured, and a sentence the reader accepts can still be an odd line for a role whose field reading does not fit it
(the role overrides in `pipeline/fields.json` are the remedy the grounding check points to).

## The class picker's matching

The Spring 2027 class picker (`web/classes.js`) rates every class against the roles chosen and says which of the
person's gaps it covers. `evals/run_classes.mjs` runs that matching the way the picker runs it and checks it
against hand-written expectations.

```bash
node evals/run_classes.mjs               # every case; exit 1 when a check fails
node evals/run_classes.mjs --baseline    # also rewrite classes_baseline.md (commit it with the change)
node evals/run_classes.mjs --cut         # print the thresholds that keep the band shares
node evals/run_classes.mjs --only pivot  # the cases whose id contains the text
```

A case is one test résumé from `evals/resumes/*.txt` and one role, or a résumé and all its roles together
(`+all`, through `Catalog.combineRoles`). The roles per résumé are a fixed table at the top of the runner: Product
Manager for every résumé, then the two MBA roles the rough fit ranked highest when the cases were written. Eight résumés give 32
cases. The seven tech samples (`evals/resumes_tech/`) add 21: each against its own tech role and one neighbour (the
lawyer's is the MBA compliance role), and both together; a case with a tech role reads the MBA and tech tags joined
(`Catalog.tagsFor`), as the picker does. For each, the runner reads the fit at level "all" (`app.js gapsFor`), scores every card with the tags file
(`web/data/catalog/cornell_tech_tags.json`) through `Catalog.relevanceScore`, `relevanceBand` and `gapsCovered`,
and orders the cards with `sortCards("gaps")` and the campus field tie-break. It records the top 10 with score,
band, the gaps covered and their share sum.

The expectation files are `evals/classes/<resume>+<roleId>.json` and `<resume>+all.json`, the spec:

```json
{ "resume": "grad_student_new", "roles": ["marketing_manager"],
  "note": "why these expectations, one or two sentences",
  "must_top": { "n": 2, "codes": ["TECH 5240", "NBA 6340"] },
  "must_not_top": { "n": 5, "codes": ["ECE 5748"] },
  "must_cover": { "brand_strategy": ["TECH 5240", "NBA 6340"] },
  "no_cover": false,
  "known_failures": { "must_not_top ECE 5748": "why it still fails, and what would fix it" } }
```

A check named under `known_failures` is a failure the spec keeps on purpose: the reader's expectation stands, the
matching does not meet it yet, and the reason says why. The runner reports it as KNOWN, counts it apart from the
failures, and stays green on it; a known failure that starts to pass fails the run until its line is dropped. The
gaps sort orders by one line score per card: the shares of the gaps it covers, halved for a low-band class, plus 0.75
times its relevance. The known failures left are tag problems: a class whose tags do not name the role's asks or the
person's gaps. They are fixed in the tags file (`pipeline/catalog_tags.mjs`), not in the sort.

`must_top`: each code sits in the top n. `must_not_top`: none of the codes does. `must_cover`: each listed code
covers that gap of the case (optional). `no_cover`: whether the case must be one no class covers (optional). A
code matches any code of a cross-listed card. The `note` gives the reason, as a careful reader of the catalog would
want it; an expectation the picker fails stays when the output reads worse, and the baseline lists the failure.
A case with no file, and a file with no case, both fail.

`--cut` pools every card score over all cases and prints the two thresholds that keep the share of "high" at about
2.3% and of "medium or high" at about 54% of card reads (the tuning study's shares). The numbers go in
`web/data/sp27_campus.json`, `cornell_tech.relevance`.

Rerun after any change to the scoring in `web/catalog.js`, to the tags file, to the thresholds or to
`evals/resumes/`, and commit `classes_baseline.md`. The matcher evals above cover `evals/resumes/` too: run both.

## The copy eval

The rule for every string a screen owns ("How to write"): sentences of at most 20 words, active
voice, simple words (never utilize, leverage, facilitate, via, in order to), American spelling, no bare codes, and
never a percentage or a score in what a person reads about a fit (bands and "N of M"). `node evals/copy.mjs` reads
`web/copy.js` (every string in the table, recursively; functions skipped), `web/data/sp27_campus.json` and
`web/data/games.json` (every string value) and reports, per file, every sentence over 20 words (split on `.`, `?`,
`!`; a `{slot}` counts as one word; code spans and URLs are taken out first), every passive construction (a form of
"be": is, are, was, were, be, been, being, followed within two words by a word ending in "ed" or an irregular past
participle from the short list in `evals/copy_lib.mjs`) and every stoplist word. For those three files the count must
be zero: `tests/web/copy.test.mjs` imports the same checker and fails on the first offender, so fix the sentence or
tighten the rule in `copy_lib.mjs` with a comment, never skip a file. The editorial data files are reported, not
gated: `web/data/graph_mba.json` (role, field and cluster labels, the kinds, and per skill the name, definition,
`how_shown` words, ladder, build steps, field readings and sub-skills), `web/data/role_blurbs.json`,
`web/data/graph_mba/_evidence.json` (quoted posting sentences, a posting's own words) and the published sub-skill files
`web/data/subskills_mba.json` and `web/data/subskills.json` (the depth files `pipeline/depth/*.json` as `web/` serves
them; `pipeline.build_graph` writes the rest of the MBA depth into `graph_mba.json`). `--baseline` writes the counts
and the first 20 offenders per file and rule to [copy_baseline.md](copy_baseline.md), the list the editorial pass
works from (PLAN.md, "Later"). A false positive of the passive rule on a data-built line ("is based") is fine to list
there. Rerun after any change to `web/copy.js`, `web/data/sp27_campus.json` or `web/data/games.json`, and commit the
baseline; the product graph `web/data/graph.json` is not read. In CI through the test.

## The model read

`web/api/infer.js` asks a model (Haiku 5.5) for the skills a resume shows without naming them; the matcher credits
them as `inferred` (0.75, between a mention and a line of work; `web/match.js`, INFERRED). `node evals/infer.mjs`
runs the same prompt, request and validation over the whole resume set (`CLAUDE.md`; `--quick` is the eight samples
alone). For the eight samples it reports, per resume, each inferred skill with
the line that suggested it, the overall score per target without and with them, and on the first target which
expectations it gains (a `must_evidence` the patterns miss) or loses (a `must_not_tag` or `real_gaps` skill it tags).
Then every readable published sample of `evals/resumes/external/` the calibration reads (a single resume with a role
and 120 words or more; `pm` maps to `product_manager`): the inferred skills, the sample's own MBA role scored and
banded as the site does it (`Atlas.matcher`, `bands_mba.json`) without → with, band moves flagged; and an aggregate
(resumes read, inferred per resume, the 20 most inferred, band moves, time and cost, and four counts that must be
zero: inferred credentials, behaviours, unknown ids, quoted lines not in the text). The baseline header says how
many of the 495 files were present (`python -m pipeline.store pull evals` fetches them). `--only` filters both sets;
PDF and DOCX need `npm install` in `evals/`.
The expectation files stay the spec: a loss is fixed in the prompt or the validation, never in the file. Answers are
saved under `data/experiments/infer/` (a pipeline cache, never swept), keyed by model, prompt, skill list, text and
found ids; `--reuse` reruns from them with no network and no key, `--baseline` writes
[infer_baseline.md](infer_baseline.md), `--private` adds the private samples (never in the baseline). A live run goes
through the deployed route, where the key lives: `--url https://gradbuddy-atlas.vercel.app/api/infer` sends the body
the site sends and saves the answer with the route's host (check the deploy first: `curl <url>` answers
`{ "ok": true, "key": true }`); without `--url` it calls Anthropic with `ANTHROPIC_API_KEY` from the environment or
`.env`. The baseline says which path produced its answers. Rerun with `--baseline` after any change to the prompt, the
validation or the merge, and commit the baseline. `node evals/run.mjs --baseline` must not move when no list is
passed: the patterns' read is the floor.

`--set all` runs what the site sends with the tech set on (`CONFIG.TECH_ENABLED`): the skill list adds the 45
skills only the tech set has (names only: tech skills have no definitions yet), `found` comes from `Atlas.roughFit`
(its `shown` and the tech reader's `shownT`), and a sample filed under a tech role is scored and banded on that role
(`bands_tech.json`). It writes [infer_baseline_tech.md](infer_baseline_tech.md). The `"both"` list does not change with
the tech set, so its saved answers keep their keys. Both runs read the templates marked `only_years`, as the
calibration does. A preview deploy behind Vercel Authentication takes `INFER_COOKIE` (the `_vercel_jwt` cookie its
share link sets).

## Adding a role (the checklist)

Every role, in either role set, goes through the same steps as the first 50 MBA roles did on 2026-10-11 (NOTES.md,
"Taxonomy for the MBA role set"): its postings are scraped, the skills that set them apart are found in their own
words and written into the taxonomy, and those skills are put in context (definitions, depth, field readings,
credentials). Title rules alone give a role postings, not skills. A role counts as added when every box below is
ticked; until then PLAN.md carries it under Later with the boxes left.

**A. Rules (one pull request, before any scrape)**

1. Title rules and exclusions in `pipeline/roles_mba.py` (or `pipeline/roles.py`), its label, group and the day it
   joined (`ADDED`), and searches for the search-based job boards (`SEARCH_QUERIES_2`).
2. Labelled titles in `evals/titles_mba.json`, written from real titles before the patterns, with the edges the
   patterns must not take; older null rows the role now takes get relabelled with the reason. The resume-side twin,
   `evals/resume_titles.json` (`evals/resume_titles_tech.json` for the tech set), the same way.
3. Pin tests in `tests/python/test_roles_mba.py`; a one-sentence `web/data/role_blurbs.json` entry.
4. A new group also needs its campus subjects (`field_subjects` in `web/data/sp27_campus.json`).
5. `build_graph --roles mba`, `evals/run_pipeline.py --baseline`, `node evals/run.mjs`, both test suites.
   The role shows as waiting for a scrape (no postings yet, `ADDED` after the last scrape).

**B. Postings (the refresh)**

6. `refresh-mba` (or `refresh-product`) scrapes with the new searches and re-extracts. Afterwards the role has US
   postings in `evals/extraction_baseline_mba.md`; an empty role now fails `run_pipeline.py`.

**C. Skills (one pull request per batch of roles, after the refresh)**

7. Corpus and phrases: `pipeline.experiments.role_corpus --roles mba`, then
   `pipeline.experiments.role_terms --roles mba --role <id> --n 80`. Read the top phrases against the role's
   defining skills in `extraction_baseline_mba.md`: a phrase no skill covers is a draft skill.
8. Draft skills in a JSON file in the scratch folder; `pipeline.experiments.skill_probe --skills draft.json --roles mba`
   until the shares and matched sentences read right. A skill already in the taxonomy gets a pattern, not a twin.
9. Into `pipeline/taxonomy.json`, each with its `kind`, a `pipeline/evidence.json` entry and, when four or more fields
   ask for it, `pipeline/fields.json` entries (carriers that co-occur, CLAUDE.md); `pytest tests/python/test_taxonomy.py`,
   `evals/run_taxonomy.py --baseline`.
10. Re-extract both role sets when a shared skill changed (CLAUDE.md), `role_coverage --roles mba` for
    `extraction_baseline_mba.md`, `skill_audit --roles mba` for the new skills (`extraction_audit_mba.md`).
11. Context: a definition per new skill and the depth through `pipeline.depth_gen` and `pipeline.depth_publish`
    (`evals/run_depth.py --baseline`); the role's credentials (`pipeline.build_steps`, `pipeline/depth/mba_roles.json`).
12. A new group: its field readings in `pipeline/fields.json` once it has postings to ground them.

**D. Fit (when samples exist)**

13. Sample resumes for the role's group in `evals/external_sources.json`; `evals/calibrate.mjs --roles mba` for its band.
    A group with fewer than 10 samples shows no verdict.
14. Game passages (`pipeline/game_passages.py`) for the games that deal roles.

## Evals to build

Still to build, in this order:

1. **Matcher evals per role group.** Built for what a resume shows: skill lists for 130 published samples, two or
   three per role, and resume titles to role families (see "Published sample resumes"). Score bands for the MBA roles
   come from `calibrate.mjs --roles mba`. Still to build: hand-written samples per role group with score bands
   and a persona, as the product samples have.
2. **Scoring properties.** A person who held a role at a level scores high against that role at that level and
   below. The score against a lower level is never below the score against a higher level for the same resume.
   Adding a line of evidence never lowers a score (this one exists).
3. **A re-judged sample of depth claims.** 100 published rungs and sub-skills per release, judged again by the critic
   with a new seed, to measure how many supported claims the first pass let through wrongly (PLAN.md, "Skill depth").
4. **A fresh sample for titles, entry marks and countries**, labelled and run once without fixing rules on it. For the entry mark also: a second reader, and a sample of marked postings judged with their full text (the precision in `NOTES.md` was read by the author of the rules).
5. **A second reader for the golden postings**, to measure agreement between labellers.
6. **A recalibration gate on the full sample.** `BEHAVIOURS=score node evals/calibrate.mjs --roles mba` (and the
   product set) on the 304-resume calibration set, set beside the current report: the two rank statistics and the groups
   without bands. The behaviours enter the score only when neither falls; otherwise they stay shown with no weight. The
   bands files already record the setting under `scoring.behaviours`; the 48 files on the build machine gave no fall
   (PLAN.md v14, "Decisions settled on the way").
7. **The door funnel.** Door shown → passed → each verb on home, from the `events` rows (`door`, `door_passed`,
   `home_<verb>`, `intake_<surface>`). `pipeline.funnel` prints it. The eval checks that no step's share rises above
   the step before it. A band for the pass rate comes once a week of sessions exists.
8. **The jobs fit line against the full matcher.** For the test résumés in `evals/resumes/`, the "N of M" a posting
   card shows (`Jobs.fitOf`: the posting's tagged skills the résumé's skill set holds) against the matcher's evidenced
   skills for that posting's role (`m.match` rows at `evidenced`). A skill the card counts must be one the fit screen
   would show, and the two must never disagree on a core ask.
9. **The apprentice map's layout against a hand-placed example.** `MapModel.treeLayout` and `questLayout` are
   deterministic; the eval holds them to a hand-placed layout of the example map
   (`pipeline/apprentice/examples/pmm-nyc/map.json`): every trunk node on the trunk, every own node beside its role's
   stem, no two labels overlapping at 1280 px, every stop on its world's path in mission order.
10. **Generated quests against the standards index.** A sample of 30 generated quests for roles with a list, each
   judged by the owner: does this project show something the role's `shows` list asks for, or lay a foundation for
   one? No rule ties a quest to one item, so this is a judged sample, not a code check.
11. **A judged half for the project writer.** `evals/quests.mjs` checks the rules in code and has a baseline
    (`quests_baseline.md`). Whether a project fits the person and the role is not judged yet: a second model or the
    owner reads a sample.
12. **Map grounding for the tech set.** The open flow builds maps for tech roles (`tech.<family>`) with
    `web/apprentice.js`, and `evals/quests.mjs` has three tech cases, but nothing holds a tech map's trunk, gaps and
    nodes to what `apprentice.test.mjs` and `check.mjs` hold the tracked MBA example to: a tech example map through
    the same checks.

## The project writer (`evals/quests.mjs`)

What `/api/open` and `/api/quests` write (one generator, `web/api/quests.js` `write`), held to the rules
`web/quests.js` `validate` checks in code (`Quests.RULES`): a level of beginner or intermediate; a concrete artifact,
never a résumé, CV, cover letter or LinkedIn profile rewrite; the skills on the class tree; a kind and its tools from
`web/data/build_kit.json` that the answers allow, or tools the person typed; a place the answers allow; the word
limits (title twelve, "You ship" twenty, three to six steps of eighteen, a prompt of a hundred: each a little above what the prompt asks for); no duration word; no
"mission"; a why line that speaks to the person as "you"; no title the person asked to replace; no duplicate. Some
rules cut a part and keep the project: a résumé quote the résumé lacks (`quote_dropped`), a share whose place is not
allowed or that states a duration (`share_dropped`). `level_mix` notes an answer that is not two beginner and one
intermediate and refuses nothing. The duration rule refuses an estimate of how long the project takes, never a time
word in what the person builds ("a weekly business review").

The cases: the eight sample résumés of `evals/resumes/`, each with two or three roles (17 in all, from the MBA,
product and tech sets) × three answer profiles: `own_tools` (no code, a tapped kind and typed tools, not open to new
ones), `builder` (writes code, open to new tools, a portfolio on GitHub Pages) and `rewrite` (a "None of these"
rewrite with feedback and two avoided titles). The report gives the validity per rule, the drops and retries, the
levels and shares of the kept projects, the tokens and the cost per person at Opus 5.5's prices. A direct run builds
each case's map the way `/api/open` does (the tech set on) and sends the function's own body; `--url` goes through a
deploy signed in as a test account (`QUESTS_TOKEN`; the deploy's `QUESTS_DAILY_CAP` at 60 or more for a full run).
Saved answers sit in `data/experiments/quests/` and are validated again on every run, so `--reuse` rescores a rule
change for free.
