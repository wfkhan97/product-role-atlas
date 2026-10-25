# Matcher evals

Sample inputs plus human-written expectations for the "Match my resume" feature, so every change to
the matcher can be checked against the same cases and compared with [baseline.md](baseline.md).

Scratch from a thread (a draft baseline, a one-off report) goes under `data/experiments/scratch/<topic>/`, never here; `./sweep_scratch.sh` clears it at the end of the thread. Only baselines, expectation files and these notes stay.

```bash
node evals/run.mjs               # score every sample, check expectations, print a report
node evals/run.mjs --baseline    # same, and rewrite baseline.md (commit it with the matcher change)
node evals/run.mjs --only grad   # one sample
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
owner decides before any fetch). `evals/build_external_sources.py` rebuilds the list from search results.

`evals/external_expectations.json` says what the reader must find in each file. Write an entry by reading the
file first (`node evals/extract.mjs <file>` prints its text as the app reads it), never from the reader's output.
Fields: `kind` (`single`; `template`, placeholder text or dates; `packet`, several resumes in one file), `parse`
(as above), `seniority` (early, mid or senior, as read from the resume), `must_evidence` and `must_not_tag`
(skill ids of the MBA taxonomy; checked with a matcher built on `pipeline/taxonomy.json` as the MBA role set sees
it), `held` (role families the person held as jobs), `note` (the layout). A packet has `parts`: each is one resume,
cut by `lines` (first and last line of the file's text, counted from 1) with `starts` (the first characters of
the first line, so a cut that has moved fails loudly), its own `role`, `seniority` and `parse`.

`evals/resume_titles.json` lists job titles as resumes write them with the role family each must be read as, or
none. `node evals/run.mjs` checks it with the role families of `web/data/roles_mba.json`. A case marked `known_gap` is
reported and not counted.

`node evals/run.mjs --external` also scores the files in `evals/resumes/external/`.

`node evals/parse_health.mjs` reads every external file and flags the ones the parser reads badly (no jobs, a job
with no title, implausible years), with no expectations needed.

`node evals/calibrate.mjs` writes [calibration.md](calibration.md): how same-role, adjacent-role and other-field
resumes score against the product roles, how well the score separates them, and the cut points for bands of fit
that those distributions give, with bootstrap intervals. `node evals/calibrate.mjs --roles mba` does the same for
the 50 roles of the MBA graph and writes [calibration_mba.md](calibration_mba.md), with a table per role group
(about five minutes). Each run also writes the bands as data for the interface: `web/data/bands.json` (product) and
`web/data/bands_mba.json`, the cut points the interface uses: two upper lines shared
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
4. The random internet PM resume that scored 36% belongs here as the first real-world sample.

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

## Pipeline evals for the MBA role set

The evals above check a resume and the tags of a posting. These check the data layer under them: which role and
level a title gets, which country a location gets, which skills a known posting gets, and whether the graph files
are whole.

```bash
.venv/bin/python evals/run_pipeline.py               # all parts; exit 1 when a check fails
.venv/bin/python evals/run_pipeline.py --only titles # one part: backlog, titles, entry, countries, golden, integrity, graph, js, matcher
.venv/bin/python evals/run_pipeline.py --baseline    # also rewrite pipeline_baseline_mba.md (commit it with the change)
```

No API key is needed. The `js` and `matcher` parts need `node`.

| part | file | what it guards |
|---|---|---|
| backlog | – | What a refresh does to a company's postings (`pipeline.scrape.merge`): it adds new ones, closes missing ones, reopens returning ones, drops none, and closes nothing when most postings fail to come back. A posting is its requisition id (its URL on a board that gives none): a requisition under a new URL is the same row and takes the current URL and title; two rows of one requisition fold into the one seen last. |
| titles | `titles_mba.json` | 785 titles with the role each must get, or none. 470 come from the scraped postings, 159 were written to probe the edges ("Executive Assistant, Investment Banking", "Talent Sourcing Manager"), 156 cover campus titles, sector bankers and entry-level grades (set `entry-2026-10-13`). |
| levels | same file | The level each title must get on its ladder: corporate, bank or consulting. A bank Vice President is `senior`. |
| entry | `entry_mba.json` | 231 postings with the entry mark each must get: `mba`, `pre_mba` or none, and internship or not. 210 are real US postings drawn by seed from 20 strata; 21 are titles written to probe the firm table. 32 are read with their posting text. The part also checks that every row of the firm table has a source. |
| countries | `countries.json` | 280 location strings with the country each must get. A wrong country hides a US posting or shows a foreign one. |
| golden | `golden_mba.json` | 99 postings, two per role, each with the skills it must get and must not get. The posting text is in the file, so the eval does not move when the scrape is refreshed. |
| integrity | – | No two registry entries share a job board. No URL or id repeats in the processed file. Every skill id exists. Every role has US postings. Every posting has an entry mark from the allowed values, and a source exactly when it has a mark. |
| graph | – | The role files add up to the index. Every posting is a US posting of its role. The entry marks in the files equal the processed file, and the entry counts in the index (per role and ladder, per ladder) add up to the files. Shares in the index equal the weighted shares of the files. No employer weighs more than the cap. The product files are untouched. |
| js | `roles_mba.mjs` | The JavaScript reader of `web/data/roles_mba.json` gives the same role, level, ladder and entry mark as `pipeline/roles_mba.py` on every title we hold, and the same entry mark on the labelled postings that carry a text. |
| matcher | `graph_mba.mjs` | `web/match.js` builds requirements and scores a resume against each of the 50 roles, with no change to the matcher. |

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

The games on the first-visit screen (`games/`, built in `web/games/`) draw their rounds from the atlas data with
rules written in their design packages (`games/<slug>/README.md`). Each game keeps its data rules as pure functions
apart from its screens, so node can run them over every role with no install. Each exits 1 on a rule violation.

```bash
node evals/skill_path.mjs             # Skill path: the board, the README's example rounds, the random pools, no dead end
node evals/games_guess_the_role.mjs   # Guess the role: the pool, distractors and clues over all 48 roles
node evals/game_passages.mjs          # Spot the real ask: the passages file web/data/game_passages.json
node evals/game_spot_scoring.mjs      # Spot the real ask: the scoring rule and rank thresholds, five simulated readers
```

| eval | what it guards |
|---|---|
| `skill_path.mjs` | Loads `web/atlas.js`, the skill map's own board (`SkillMap.board()`) and the game's `logic`. The board has 240 skills and 936 links in one piece, each skill with 2 links or more. Product Manager's arrival skills, Marketing's start skill, par and shortest route, and the four choices at each hop of the README's Marketing → Product Manager round. Supply chain & procurement → Product Manager: start skill, par 4, and the biggest-blue-number route ends 3 hops short. The random pools (86 / 313 / 51 from a field, 447 / 1,373 / 222 from a role). All 53 pickable roles have three arrival skills. Four simulated players on every pairing at every difficulty: none is ever left with no choice and no step back, and the perfect player always arrives. |
| `games_guess_the_role.mjs` | Every role has a playable posting. Every distractor set is three distinct roles, none above similarity 0.90, in a 2 + 2 or 1 + 1 + 1 + 1 field pattern. Every clue set of every playable posting is five distinct eligible skills, none generic, each asked by at least a quarter of the role's postings, in rising order of lift, with no red herring and the giveaway's disc above 0. It prints the counts the README states (22,483 open, 19,004 playable, 46 roles with 2 + 2) and warns, without failing, when a data refresh moves them. |
| `game_passages.mjs` | Checks `web/data/game_passages.json`, written by `pipeline/game_passages.py`: valid chunk labels, every ask names a skill of its set's taxonomy, each block's chunks join back to its text, shares in [0, 1], no passage over 700 characters, at most 12 per role and one employer per role, the file under 1 MB, every role id in `graph_mba.json` or `graph.json`. |
| `game_spot_scoring.mjs` | Loads `web/data/game_passages.json` and the game's `logic` (its deal, scoring and `RANKS`, so the thresholds stay in the game). Five simulated readers play 4,000 runs each of one easy, one medium and one hard passage, dealt as the game deals (seed 7): perfect, careful (each ask marked with p 0.85, each filler chunk with p 0.20), keyword (0.60 / 0.50), mark everything, mark nothing. Mark everything and mark nothing land on Skimmer in every run, the perfect reader on Reads like the atlas. The careful reader lands on Careful reader or Recruiter's eye in at least 85% of runs and on Skimmer in at most 2%. The keyword reader lands on Keyword spotter or Careful reader in at least half of runs and on Recruiter's eye or above in at most 5%, with a mean read at least 0.2 below the careful reader's. Every passage has an ask and a filler chunk, since the read divides by both. Prints the mean read and the rank distribution per reader. |

The expected numbers are today's data. After a data refresh `skill_path.mjs` prints the new values and fails, and
`games_guess_the_role.mjs` warns; update the game's README and the eval together on a `data/` branch. When a refresh of
the passages moves a simulated reader off its band, `game_spot_scoring.mjs` fails: retune `RANKS` in
`web/games/spot-the-real-ask.js` and the rank tables in `games/spot-the-real-ask/README.md` together.

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
| shape | `pipeline.tax.validate`: every skill has a kind from `KINDS`; every skill has an evidence entry with a known form, list fields and carriers that are skills of a carrier kind (method, practice, technical, knowledge), not itself; a behaviour names three or more carriers; a tool or credential is `named`; every field entry names one of the 11 fields, two to six carriers, a reading under 25 words and a resume line under 30 words with a number. |
| coverage | A skill that at least four fields ask for (mean share over the field's roles at least 25%) has an entry for every field that asks for it; no entry exists for a field that asks for the skill in under 10% of its postings; tools and credentials have none. |
| grounding | Each carrier a field entry names is asked for together with the skill in at least 15% of the field's US postings that ask for the skill, company-balanced. The baseline prints, beside each entry's carriers, the five carriers the postings rank highest (share times log-lift), so a reader can see where the hand and the data differ. |
| carriers | Each carrier a behaviour's evidence names is asked for with the behaviour in at least 10% of some field's postings that ask for it. A carrier is field-specific (pitch books carry communication in banking), so this is the maximum over fields. |
| published | `web/data/graph.json`, `graph_mba.json` and `taxonomy*.json` carry what the source files say: every skill node has the taxonomy's kind and its evidence entry under `how_shown`, the field entries appear as `fields` with the postings' side (`n`, `with`, `subs`) beside the text, and `meta.kinds` is the current table. A build older than the files fails here. |

**What these evals do not show.** The carriers are checked against postings, which say what employers ask for together,
not what a resume reader accepts as evidence. The readings and resume lines are editorial; no reader has judged them.
The thresholds were set once on the data of 2026-10-24.

## Evals to build

- The stage answer of About you (`you.stage`: looking, targeting, curious) decides what the role page's rail leads with; nothing checks that the three readings get what they came for. A sample of resumes per kind with the expected first action would.

The product roles have matcher evals and an extraction baseline. The MBA role set has an extraction baseline, a
model audit, the pipeline evals and the content evals above (items 1 to 6 of the first list). Still to build, in
this order:

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
6. **Adaptive taxonomy evals**, one part per step of `PLAN.md`, "The taxonomy adapted to each role":
   `node evals/adaptive.mjs` with `--only text` (every fit-page sentence for every role and row kind is built from the
   data, under 40 words, with no empty slot, and a behaviour's gap sentence names a carrier the role asks for),
   `--only carriers` (the carriers a role shows or credits for a behaviour or practice pass the 15% co-occurrence rule on
   the role's own postings or fall back to the field entry, with the fallback count printed), `--only grid` (no
   behaviour in an area panel; the first panel holds a method or a defining skill) and `--only course` (the course
   reader never shows a behaviour or a practice as taught). Beside it: `must_show_through` (behaviour: carrier) in the
   sample expectations of `evals/resumes/`, and the matcher tests that a behaviour row earns its best carrier's credit, a
   named-only behaviour earns none, and the score still never falls when evidence is added. Each step's PR adds its
   part; the runner joins CI from step 2.
7. **A recalibration gate.** `calibrate.mjs` run with the behaviours in the score, set beside the current report: the two
   rank statistics (a same-role score above an other-field score, above an adjacent-role score) and the groups without
   bands. The behaviours enter the score only when neither falls; otherwise they are shown with no weight. The bands
   files record the setting under `scoring`, as they record `distinct`.
8. **A reader's judgment of the generated lines.** 50 fit-page sentences per release (field lines, templates from the
   evidence entries, gap sentences), judged by a model reader that did not write them: names an artefact or a
   counterpart, carries a number where the kind asks for one, in the field's words. The field lines of
   `pipeline/fields.json` have never been judged; this is the first eval that reads them as a student would.
