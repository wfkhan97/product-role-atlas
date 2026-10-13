# Matcher evals

Sample inputs plus human-written expectations for the "Match my resume" feature, so every change to
the matcher can be checked against the same cases and compared with [baseline.md](baseline.md).

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
(about five minutes). It also writes `bands_mba.json`, the cut points the interface uses: two upper lines shared
by every role, a bottom line per role group, and the groups that get no bands yet. `Matcher.bandOf(score, bands,
group)` in `web/match.js` reads it. Rerun both after any change to the matcher; the bands the interface shows must come from
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
.venv/bin/python evals/run_pipeline.py --only titles # one part: titles, countries, golden, integrity, graph, js, matcher
.venv/bin/python evals/run_pipeline.py --baseline    # also rewrite pipeline_baseline_mba.md (commit it with the change)
```

No API key is needed. The `js` and `matcher` parts need `node`.

| part | file | what it guards |
|---|---|---|
| titles | `titles_mba.json` | 629 titles with the role each must get, or none. 470 come from the scraped postings, 159 were written to probe the edges ("Executive Assistant, Investment Banking", "Talent Sourcing Manager"). |
| levels | same file | The level each title must get on its ladder: corporate, bank or consulting. A bank Vice President is `senior`. |
| countries | `countries.json` | 280 location strings with the country each must get. A wrong country hides a US posting or shows a foreign one. |
| golden | `golden_mba.json` | 99 postings, two per role, each with the skills it must get and must not get. The posting text is in the file, so the eval does not move when the scrape is refreshed. |
| integrity | – | No two registry entries share a job board. No URL or id repeats in the processed file. Every skill id exists. Every role has US postings. |
| graph | – | The role files add up to the index. Every posting is a US posting of its role. Shares in the index equal the weighted shares of the files. No employer weighs more than the cap. The product files are untouched. |
| js | `roles_mba.mjs` | The JavaScript reader of `web/data/roles_mba.json` gives the same role, level and ladder as `pipeline/roles_mba.py` on every title we hold. |
| matcher | `graph_mba.mjs` | `web/match.js` builds requirements and scores a resume against each of the 50 roles, with no change to the matcher. |

**How the labels were made.** Before the code was run on them, by reading: each title with its employer, each
location, each posting in full with the skill names and definitions (not the patterns). The labellers were model
readers that did not see the code. The instructions they followed are summarised in each file's `about`.

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

## Evals to build

The product roles have matcher evals and an extraction baseline. The MBA role set has an extraction baseline, a
model audit and the pipeline evals above (items 1 to 6 of the first list). Still to build, in this order:

1. **Matcher evals per role group.** Built for what a resume shows: skill lists for 130 published samples, two or
   three per role, and resume titles to role families (see "Published sample resumes"). Score bands for the MBA roles
   come from `calibrate.mjs --roles mba`. Still to build: hand-written samples per role group with score bands
   and a persona, as the product samples have.
2. **Scoring properties.** A person who held a role at a level scores high against that role at that level and
   below. The score against a lower level is never below the score against a higher level for the same resume.
   Adding a line of evidence never lowers a score (this one exists).
3. **Content evals for skill depth.** Every definition, ladder rung and build step passes a style check (sentence
   length, active voice), a specificity check (it names a tool, an artefact or a number from the postings) and an
   evidence check (its sub-skill patterns match postings; each rung is backed by postings at that level and on
   that ladder). The pipeline that produces the content is proposed in `PLAN.md`.
4. **A fresh sample for titles and countries**, labelled and run once without fixing rules on it.
5. **A second reader for the golden postings**, to measure agreement between labellers.
