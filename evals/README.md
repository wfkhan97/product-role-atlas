# Matcher evals

Sample inputs plus human-written expectations for the "Match my resume" feature, so every change to
the matcher can be checked against the same cases and compared with [baseline.md](baseline.md).

```bash
node evals/run.mjs               # score every sample, check expectations, print a report
node evals/run.mjs --baseline    # same, and rewrite baseline.md (commit it with the matcher change)
node evals/run.mjs --only grad   # one sample
```

No install needed; it reads `pipeline/taxonomy.json`, `web/data/subskills.json` and `web/data/graph.json`.

## Samples

`evals/resumes/<name>.txt` is the input exactly as a user would paste or drop it. `<name>.json` beside
it holds the expectations:

| field | meaning |
|---|---|
| `persona` | `experienced_in_role`, `new_to_role` or `pivoter`. The redesign should produce a different reading for each. |
| `targets` | slices to score against, as `family:level` or `family:__all`. |
| `score_band` | per target, the range a sensible score should land in. A judgment call; tune after the scoring model settles. |
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

The runner requires `web/match.js` directly, so it always runs the code the app runs.
