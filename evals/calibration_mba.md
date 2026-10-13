# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-10-13 from 274 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 50 role families of the MBA graph (US postings, all levels). 251 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (11 groups, from `web/data/roles_mba.json`); roles of other groups are another field.

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 251 | 15% | 42% | 61% | 72% | 82% |
| Adjacent role (against the other roles of its group) | 1112 | 10% | 23% | 35% | 48% | 68% |
| Other field (against the roles of other groups) | 12337 | 4% | 14% | 23% | 33% | 50% |

The score ranks a same-role score above an other-field score 86% of the time, and above an adjacent-role score 76% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 50 in 123 of 251; its highest-scoring role is in its own group in 176 of 251. The level read agrees with the seniority read from the resume in 169 of 251.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 251 same-role resumes, the matcher read the role as held in 147. Their median score against their own role is 70%; the median of the 104 where the role was not read as held is 36%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 142 of 147.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 45 | 59% (35%–68%) | 34% (21%–49%) | 26% (16%–37%) | 71% | 80% |
| Finance | 21 | 67% (56%–75%) | 38% (26%–49%) | 25% (16%–34%) | 86% | 95% |
| Banking & investing | 27 | 69% (46%–80%) | 31% (23%–42%) | 17% (10%–26%) | 84% | 93% |
| Operations & general management | 35 | 56% (35%–71%) | 37% (26%–47%) | 33% (20%–47%) | 69% | 72% |
| Product | 21 | 60% (52%–65%) | 54% (43%–62%) | 22% (13%–33%) | 62% | 92% |
| Marketing | 26 | 63% (57%–67%) | 37% (26%–51%) | 22% (14%–31%) | 90% | 99% |
| Sales & partnerships | 13 | 70% (49%–72%) | 26% (19%–38%) | 21% (14%–30%) | 80% | 85% |
| Supply chain & procurement | 19 | 64% (40%–76%) | 41% (28%–57%) | 25% (17%–34%) | 67% | 85% |
| People | 17 | 65% (28%–73%) | 28% (21%–35%) | 22% (13%–34%) | 75% | 82% |
| Risk & compliance | 13 | 30% (20%–57%) | 17% (13%–26%) | 22% (13%–31%) | 71% | 68% |
| Analytics | 14 | 60% (38%–71%) | 47% (42%–65%) | 25% (14%–36%) | 58% | 86% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 72% and above | the top quarter of same-role resumes | 70% to 73% | 25% | 3% | 0% |
| In range for the role | 55% to 72% | from the score that best splits same-role from adjacent-role resumes | 48% to 57% | 35% | 13% | 3% |
| Related background | 33% to 55% | above three in four other-field resumes | 32% to 35% | 21% | 37% | 22% |
| A different field so far | below 33% | | | 19% | 47% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `bands_mba.json`. The two upper lines are the same for every role: in range from 55%, reads like people in the role from 72%. The bottom line (related background) is each group's own. A group with too few same-role resumes, or whose own cut points come out of order, gets no bands: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 37% | 35% to 39% | 27% / 20% / 36% / 18% | 75% / 21% / 4% / 0% |
| Finance | 34% | 32% to 36% | 5% / 14% / 38% / 43% | 75% / 24% / 1% / 0% |
| Banking & investing | 26% | 25% to 28% | 7% / 26% / 30% / 37% | 75% / 25% / 0% / 0% |
| Operations & general management | 47% | 45% to 49% | 43% / 6% / 29% / 23% | 75% / 11% / 13% / 1% |
| Product | 33% | 32% to 34% | 10% / 24% / 52% / 14% | 75% / 21% / 4% / 0% |
| Marketing | 31% | 30% to 33% | 0% / 23% / 62% / 15% | 75% / 23% / 2% / 0% |
| Sales & partnerships | 30% | 29% to 32% | 23% / 15% / 38% / 23% | 75% / 24% / 1% / 0% |
| Supply chain & procurement | 34% | 33% to 36% | 21% / 26% / 16% / 37% | 75% / 23% / 2% / 0% |
| People | 34% | 32% to 35% | 29% / 12% / 29% / 29% | 75% / 23% / 2% / 0% |
| Risk & compliance | no bands | its own cut points are out of order | | |
| Analytics | 36% | 34% to 38% | 21% / 21% / 29% / 29% | 75% / 22% / 3% / 0% |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 45 | 37% (35% to 39%) | 50% (40% to 58%) | 68% (64% to 73%) |
| Finance | 21 | 34% (32% to 36%) | 51% (46% to 55%) | 75% (69% to 79%) |
| Banking & investing | 27 | 26% (25% to 28%) | 59% (38% to 62%) | 80% (71% to 84%) |
| Operations & general management | 35 | 47% (45% to 49%) | 55% (45% to 66%) | 71% (61% to 74%) |
| Product | 21 | 33% (32% to 34%) | 55% (20% to 63%) | 65% (60% to 73%) |
| Marketing | 26 | 31% (30% to 33%) | 47% (42% to 56%) | 67% (64% to 73%) |
| Sales & partnerships | 13 | 30% (29% to 32%) | 48% (45% to 68%) | 72% (70% to 74%) |
| Supply chain & procurement | 19 | 34% (33% to 36%) | 62% (38% to 66%) | 76% (66% to 78%) |
| People | 17 | 34% (32% to 35%) | 48% (38% to 48%) | 73% (65% to 76%) |
| Risk & compliance | 13 | 31% (29% to 32%) | 23% (21% to 59%) | 57% (30% to 74%) |
| Analytics | 14 | 36% (34% to 38%) | 67% (48% to 70%) | 71% (61% to 81%) |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
