# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-10-13 from 274 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 50 role families of the MBA graph (US postings, all levels). 251 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (11 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 251 | 14% | 36% | 60% | 73% | 84% |
| Adjacent role (against the other roles of its group) | 1112 | 6% | 19% | 30% | 46% | 68% |
| Other field (against the roles of other groups) | 12337 | 2% | 9% | 17% | 28% | 46% |

The score ranks a same-role score above an other-field score 89% of the time, and above an adjacent-role score 77% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 50 in 120 of 251; its highest-scoring role is in its own group in 180 of 251. The level read agrees with the seniority read from the resume in 169 of 251.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 251 same-role resumes, the matcher read the role as held in 147. Their median score against their own role is 71%; the median of the 104 where the role was not read as held is 32%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 138 of 147.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 45 | 55% (29%–65%) | 26% (14%–43%) | 21% (12%–33%) | 73% | 81% |
| Finance | 21 | 70% (59%–78%) | 36% (24%–50%) | 19% (11%–29%) | 86% | 96% |
| Banking & investing | 27 | 69% (44%–81%) | 27% (17%–38%) | 11% (4%–21%) | 84% | 94% |
| Operations & general management | 35 | 46% (25%–68%) | 30% (20%–42%) | 27% (16%–40%) | 66% | 70% |
| Product | 21 | 57% (49%–65%) | 53% (40%–59%) | 17% (9%–27%) | 62% | 94% |
| Marketing | 26 | 64% (57%–69%) | 39% (29%–52%) | 15% (9%–24%) | 87% | 99% |
| Sales & partnerships | 13 | 70% (50%–72%) | 24% (16%–37%) | 15% (9%–22%) | 84% | 93% |
| Supply chain & procurement | 19 | 70% (42%–81%) | 44% (31%–59%) | 20% (12%–29%) | 68% | 91% |
| People | 17 | 66% (33%–74%) | 23% (20%–27%) | 14% (7%–24%) | 80% | 89% |
| Risk & compliance | 13 | 35% (21%–58%) | 18% (13%–29%) | 13% (5%–23%) | 74% | 81% |
| Analytics | 14 | 69% (42%–72%) | 57% (44%–72%) | 22% (10%–32%) | 55% | 90% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 73% and above | the top quarter of same-role resumes | 71% to 75% | 25% | 3% | 0% |
| In range for the role | 48% to 73% | from the score that best splits same-role from adjacent-role resumes | 45% to 55% | 43% | 20% | 4% |
| Related background | 28% to 48% | above three in four other-field resumes | 27% to 29% | 16% | 31% | 21% |
| A different field so far | below 28% | | | 16% | 46% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `bands_mba.json`. The two upper lines are the same for every role: in range from 48%, reads like people in the role from 73%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when its own cut points come out of order, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 33% | 31% to 34% | 29% / 11% / 47% / 13% | 75% / 18% / 7% / 1% |
| Finance | 29% | 27% to 30% | 5% / 0% / 52% / 43% | 75% / 22% / 3% / 0% |
| Banking & investing | 21% | 20% to 22% | 7% / 22% / 30% / 41% | 75% / 24% / 1% / 0% |
| Operations & general management | 40% | 38% to 42% | 46% / 9% / 26% / 20% | 75% / 10% / 14% / 1% |
| Product | 27% | 24% to 29% | 5% / 19% / 62% / 14% | 75% / 20% / 5% / 0% |
| Marketing | 24% | 22% to 26% | 0% / 4% / 77% / 19% | 75% / 23% / 2% / 0% |
| Sales & partnerships | 22% | 21% to 23% | 8% / 15% / 62% / 15% | 75% / 23% / 2% / 0% |
| Supply chain & procurement | 29% | 27% to 30% | 11% / 26% / 16% / 47% | 75% / 22% / 3% / 0% |
| People | 24% | 23% to 26% | 12% / 24% / 35% / 29% | 75% / 24% / 1% / 0% |
| Risk & compliance | no bands | held back by the owner: 8 of its 13 same-role samples are law-school resumes of students and career changers | | |
| Analytics | 32% | 30% to 34% | 21% / 7% / 50% / 21% | 75% / 19% / 6% / 0% |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 45 | 33% (31% to 34%) | 43% (43% to 54%) | 65% (61% to 71%) |
| Finance | 21 | 29% (27% to 30%) | 52% (48% to 57%) | 78% (72% to 82%) |
| Banking & investing | 27 | 21% (20% to 22%) | 64% (31% to 64%) | 81% (72% to 86%) |
| Operations & general management | 35 | 40% (38% to 42%) | 46% (34% to 67%) | 68% (54% to 77%) |
| Product | 21 | 27% (24% to 29%) | 57% (25% to 70%) | 65% (59% to 75%) |
| Marketing | 26 | 24% (22% to 26%) | 53% (47% to 56%) | 69% (65% to 75%) |
| Sales & partnerships | 13 | 22% (21% to 23%) | 45% (24% to 66%) | 72% (70% to 73%) |
| Supply chain & procurement | 19 | 29% (27% to 30%) | 69% (37% to 75%) | 81% (71% to 83%) |
| People | 17 | 24% (23% to 26%) | 45% (25% to 45%) | 74% (66% to 81%) |
| Risk & compliance | 13 | 23% (22% to 24%) | 31% (20% to 58%) | 58% (35% to 79%) |
| Analytics | 14 | 32% (30% to 34%) | 67% (21% to 77%) | 72% (69% to 83%) |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
