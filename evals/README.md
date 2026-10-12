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
none. `node evals/run.mjs` checks it with the role families of `web/data/roles_mba.json`; until the graph build
writes that file it uses the stand-in `evals/fixtures/roles_mba.json`. A case marked `known_gap` is reported and
not counted.

`node evals/run.mjs --external` also scores the files in `evals/resumes/external/`.

`node evals/parse_health.mjs` reads every external file and flags the ones the parser reads badly (no jobs, a job
with no title, implausible years), with no expectations needed.

`node evals/calibrate.mjs` writes [calibration.md](calibration.md): how same-role, adjacent-role and other-field
resumes score, how well the score separates them, and the cut points for bands of fit that those distributions
give, with bootstrap intervals. Rerun it after any change to the matcher; the bands the interface shows must come
from this file, not from round numbers. The folder is gitignored:
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

- `extraction_audit_mba.md` (once run): model judgment on the MBA skills, from
  `pipeline.experiments.skill_audit --roles mba` (needs `OPENAI_API_KEY` in `.env`; `--reuse` afterwards).

A shared skill serves both role sets, so a change to one of its patterns means both sets of steps.

## Evals to build

The product roles have matcher evals and an extraction baseline. The MBA role set has an extraction baseline
only. Each eval below guards one thing that can go wrong without anyone seeing it. Build them in this order.

1. **Title classification** (`evals/titles_mba.json`). A labelled list of job titles with the role each must get,
   or none. Include titles that must be rejected ("Executive Assistant, Investment Banking", "Talent Sourcing
   Manager"). Every title rule in `pipeline/roles_mba.py` is a regex; today nothing fails when one breaks.
2. **Level reading.** The same list with the level each title must get, including bank grades (a bank "Vice
   President" is mid-career) and consulting grades.
3. **Country reading.** Locations with the country each must get. Only US postings are shown, so a wrong country
   hides a posting or shows a foreign one.
4. **Golden postings.** About 100 postings, two per role, each with the skills it must get and the skills it
   must not get. This is the posting-side twin of the resume expectations. It runs without an API key.
5. **Model audit** (`skill_audit.py`). Sampled tagged and untagged postings per skill, judged by a model. It needs
   an API key once; after that `--reuse` checks every taxonomy change for free.
6. **Data integrity.** No two registry entries share a job board. No URL appears twice in a processed file. Every
   skill id in a processed file exists in the taxonomy. Every role has postings.
7. **Matcher evals per role group.** Built for what a resume shows: skill lists for 130 published samples, two or
   three per role, and resume titles to role families (see "Published sample resumes"). Still to build once the
   MBA graph exists: score bands per role group, from `calibrate.mjs` run on the MBA roles.
8. **Scoring properties.** A person who held a role at a level scores high against that role at that level and
   below. The score against a lower level is never below the score against a higher level for the same resume.
   Adding a line of evidence never lowers a score (this one exists).
9. **Content evals for skill depth.** Every definition, ladder rung and build step passes a style check (sentence
   length, active voice), a specificity check (it names a tool, an artefact or a number from the postings) and an
   evidence check (its sub-skill patterns match postings; each rung is backed by postings at that level).
