# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-10-25 from 48 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 50 role families of the MBA graph (US postings, all levels). 48 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (11 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 48 | 16% | 27% | 42% | 59% | 83% |
| Adjacent role (against the other roles of its group) | 155 | 8% | 16% | 29% | 46% | 70% |
| Other field (against the roles of other groups) | 2197 | 2% | 10% | 19% | 30% | 52% |

The score ranks a same-role score above an other-field score 80% of the time, and above an adjacent-role score 65% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 50 in 11 of 48; its highest-scoring role is in its own group in 25 of 48. The level read agrees with the seniority read from the resume in 26 of 48.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 48 same-role resumes, the matcher read the role as held in 8. Their median score against their own role is 74%; the median of the 40 where the role was not read as held is 35%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 7 of 8.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 2 | 22% (19%–25%) | 18% (12%–27%) | 23% (12%–35%) | 54% | 47% |
| Finance | 3 | 68% (43%–76%) | 34% (14%–51%) | 21% (13%–31%) | 73% | 81% |
| Banking & investing | 2 | 25% (23%–27%) | 22% (15%–26%) | 17% (10%–28%) | 63% | 69% |
| Operations & general management | 10 | 42% (30%–53%) | 39% (20%–52%) | 31% (13%–49%) | 52% | 61% |
| Product | 1 | 27% (27%–27%) | 26% (26%–26%) | 20% (12%–30%) | 100% | 70% |
| Marketing | 7 | 58% (53%–65%) | 51% (36%–55%) | 15% (8%–25%) | 71% | 98% |
| Sales & partnerships | 0 | – | – | 15% (9%–26%) | – | – |
| Supply chain & procurement | 5 | 43% (33%–46%) | 27% (17%–33%) | 18% (11%–26%) | 81% | 85% |
| People | 6 | 49% (29%–76%) | 32% (21%–41%) | 14% (5%–26%) | 65% | 86% |
| Risk & compliance | 9 | 29% (22%–42%) | 17% (13%–24%) | 16% (8%–25%) | 72% | 77% |
| Analytics | 3 | 64% (51%–70%) | 62% (50%–70%) | 13% (5%–33%) | 56% | 93% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 59% and above | the top quarter of same-role resumes | 52% to 68% | 25% | 11% | 2% |
| In range for the role | 20% to 59% | from the score that best splits same-role from adjacent-role resumes | 20% to 52% | 65% | 55% | 44% |
| Related background | 30% to 20% | above three in four other-field resumes | 27% to 34% | 0% | 0% | 0% |
| A different field so far | below 30% | | | 10% | 34% | 53% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_mba.json`. The two upper lines are the same for every role: in range from 20%, reads like people in the role from 59%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | no bands | fewer than 10 same-role resumes | | |
| Finance | no bands | fewer than 10 same-role resumes | | |
| Banking & investing | no bands | fewer than 10 same-role resumes | | |
| Operations & general management | no bands | half of its same-role resumes score below its own bottom line | | |
| Product | no bands | fewer than 10 same-role resumes | | |
| Marketing | no bands | fewer than 10 same-role resumes | | |
| Sales & partnerships | no bands | fewer than 10 same-role resumes | | |
| Supply chain & procurement | no bands | fewer than 10 same-role resumes | | |
| People | no bands | fewer than 10 same-role resumes | | |
| Risk & compliance | no bands | held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers) | | |
| Analytics | no bands | fewer than 10 same-role resumes | | |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 2 | too few | too few | too few |
| Finance | 3 | too few | too few | too few |
| Banking & investing | 2 | too few | too few | too few |
| Operations & general management | 10 | 49% (43% to 56%) | 21% (20% to 52%) | 53% (42% to 59%) |
| Product | 1 | too few | too few | too few |
| Marketing | 7 | too few | too few | too few |
| Sales & partnerships | 0 | too few | too few | too few |
| Supply chain & procurement | 5 | too few | too few | too few |
| People | 6 | too few | too few | too few |
| Risk & compliance | 9 | too few | too few | too few |
| Analytics | 3 | too few | too few | too few |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
