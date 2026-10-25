# Calibration: what a match score means

Produced by `node evals/calibrate.mjs` on 2026-10-25 from 48 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the six product role families (all levels). 1 were written for a product role and 47 for another field. The role a sample was written for is the answer key.

## Score by group

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a product resume against its own role) | 1 | 33% | 33% | 33% | 33% | 33% |
| Adjacent role (against the other product roles) | 5 | 28% | 30% | 31% | 31% | 38% |
| Other field (a non-product resume against product roles) | 282 | 3% | 13% | 27% | 38% | 62% |

The score ranks a same-role resume above an other-field resume 67% of the time, and above an adjacent-role one 80% of the time (0.5 would be chance). A resume's own role is its highest-scoring product role in 0 of 1. The level read agrees with the sample's stated seniority in 0 of 1.

## Bands of fit

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 33% and above | the top quarter of same-role resumes | 33% to 33% | 100% | 20% | 33% |
| In range for the role | 31% to 33% | from the score that best splits same-role from adjacent-role resumes | 31% to 31% | 0% | 0% | 7% |
| Related background | 38% to 31% | above three in four other-field resumes | 32% to 44% | 0% | 0% | 0% |
| A different field so far | below 38% | | | 0% | 80% | 61% |

Read each row across: of the resumes in a group, the share that lands in the band.

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- 1 same-role resumes is a small sample; the intervals show how far the cut points move.
- These bands are for the product roles. The MBA role set has its own file, `calibration_mba.md`.
- A sample's seniority is the publisher's label or the one read from the resume, and the scores here are against all levels of a role.
