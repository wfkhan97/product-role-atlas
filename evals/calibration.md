# Calibration: what a match score means

Produced by `node evals/calibrate.mjs` on 2026-11-02 from 304 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the six product role families (all levels). 51 were written for a product role and 253 for another field. The role a sample was written for is the answer key.

## Score by group

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a product resume against its own role) | 51 | 26% | 53% | 63% | 69% | 77% |
| Adjacent role (against the other product roles) | 255 | 10% | 19% | 30% | 43% | 63% |
| Other field (a non-product resume against product roles) | 1518 | 3% | 11% | 21% | 32% | 49% |

The score ranks a same-role resume above an other-field resume 95% of the time, and above an adjacent-role one 89% of the time (0.5 would be chance). A resume's own role is its highest-scoring product role in 33 of 51. The level read agrees with the sample's stated seniority in 40 of 50.

## Bands of fit

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 69% and above | the top quarter of same-role resumes | 67% to 72% | 25% | 1% | 0% |
| In range for the role | 49% to 69% | from the score that best splits same-role from adjacent-role resumes | 45% to 56% | 59% | 16% | 5% |
| Related background | 32% to 49% | above three in four other-field resumes | 30% to 34% | 8% | 31% | 20% |
| A different field so far | below 32% | | | 8% | 53% | 75% |

Read each row across: of the resumes in a group, the share that lands in the band.

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- 51 same-role resumes is a small sample; the intervals show how far the cut points move.
- These bands are for the product roles. The MBA role set has its own file, `calibration_mba.md`.
- A sample's seniority is the publisher's label or the one read from the resume, and the scores here are against all levels of a role.
