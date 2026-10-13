# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-10-13 from 304 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 50 role families of the MBA graph (US postings, all levels). 281 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (11 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 281 | 15% | 37% | 59% | 73% | 84% |
| Adjacent role (against the other roles of its group) | 1273 | 6% | 18% | 30% | 45% | 69% |
| Other field (against the roles of other groups) | 13646 | 2% | 9% | 17% | 27% | 46% |

The score ranks a same-role score above an other-field score 89% of the time, and above an adjacent-role score 76% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 50 in 138 of 281; its highest-scoring role is in its own group in 198 of 281. The level read agrees with the seniority read from the resume in 180 of 281.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 281 same-role resumes, the matcher read the role as held in 154. Their median score against their own role is 71%; the median of the 127 where the role was not read as held is 35%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 145 of 154.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 52 | 50% (25%–65%) | 26% (15%–40%) | 21% (12%–31%) | 72% | 79% |
| Finance | 25 | 69% (59%–79%) | 35% (22%–51%) | 19% (11%–29%) | 85% | 95% |
| Banking & investing | 34 | 62% (38%–79%) | 28% (17%–39%) | 11% (4%–21%) | 83% | 95% |
| Operations & general management | 39 | 47% (26%–67%) | 31% (19%–43%) | 27% (15%–39%) | 67% | 71% |
| Product | 21 | 57% (48%–64%) | 54% (42%–63%) | 17% (9%–26%) | 58% | 95% |
| Marketing | 27 | 64% (58%–70%) | 40% (30%–53%) | 15% (9%–23%) | 86% | 99% |
| Sales & partnerships | 15 | 69% (44%–74%) | 21% (13%–35%) | 15% (9%–22%) | 87% | 94% |
| Supply chain & procurement | 20 | 66% (40%–80%) | 44% (31%–65%) | 19% (11%–28%) | 68% | 93% |
| People | 18 | 67% (31%–75%) | 23% (17%–28%) | 14% (6%–24%) | 83% | 90% |
| Risk & compliance | 16 | 36% (21%–63%) | 20% (14%–34%) | 13% (5%–23%) | 75% | 84% |
| Analytics | 14 | 70% (43%–73%) | 58% (45%–74%) | 21% (10%–32%) | 54% | 90% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 73% and above | the top quarter of same-role resumes | 71% to 75% | 25% | 3% | 0% |
| In range for the role | 52% to 73% | from the score that best splits same-role from adjacent-role resumes | 45% to 56% | 36% | 15% | 3% |
| Related background | 27% to 52% | above three in four other-field resumes | 26% to 28% | 22% | 38% | 22% |
| A different field so far | below 27% | | | 17% | 45% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_mba.json`. The two upper lines are the same for every role: in range from 52%, reads like people in the role from 73%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 31% | 30% to 33% | 37% / 15% / 35% / 13% | 75% / 21% / 4% / 0% |
| Finance | 29% | 28% to 30% | 8% / 0% / 44% / 48% | 75% / 23% / 2% / 0% |
| Banking & investing | 21% | 20% to 22% | 6% / 38% / 24% / 32% | 75% / 24% / 0% / 0% |
| Operations & general management | 39% | 37% to 41% | 44% / 13% / 26% / 18% | 75% / 14% / 10% / 1% |
| Product | 26% | 25% to 28% | 5% / 29% / 52% / 14% | 75% / 22% / 3% / 0% |
| Marketing | 23% | 21% to 25% | 0% / 15% / 67% / 19% | 75% / 24% / 1% / 0% |
| Sales & partnerships | 22% | 21% to 23% | 7% / 27% / 20% / 47% | 75% / 24% / 1% / 0% |
| Supply chain & procurement | 28% | 27% to 29% | 10% / 25% / 20% / 45% | 75% / 24% / 1% / 0% |
| People | 24% | 23% to 25% | 11% / 28% / 33% / 28% | 75% / 24% / 1% / 0% |
| Risk & compliance | no bands | held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers) | | |
| Analytics | 32% | 31% to 34% | 21% / 7% / 50% / 21% | 75% / 20% / 5% / 1% |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 52 | 31% (30% to 33%) | 52% (34% to 60%) | 65% (59% to 70%) |
| Finance | 25 | 29% (28% to 30%) | 52% (51% to 55%) | 79% (75% to 82%) |
| Banking & investing | 34 | 21% (20% to 22%) | 37% (34% to 58%) | 79% (70% to 86%) |
| Operations & general management | 39 | 39% (37% to 41%) | 54% (34% to 62%) | 67% (58% to 77%) |
| Product | 21 | 26% (25% to 28%) | 71% (33% to 71%) | 64% (58% to 78%) |
| Marketing | 27 | 23% (21% to 25%) | 46% (43% to 60%) | 70% (66% to 74%) |
| Sales & partnerships | 15 | 22% (21% to 23%) | 45% (24% to 66%) | 74% (69% to 75%) |
| Supply chain & procurement | 20 | 28% (27% to 29%) | 70% (33% to 74%) | 80% (74% to 82%) |
| People | 18 | 24% (23% to 25%) | 44% (26% to 44%) | 75% (70% to 82%) |
| Risk & compliance | 16 | 23% (22% to 24%) | 29% (20% to 58%) | 63% (37% to 77%) |
| Analytics | 14 | 32% (31% to 34%) | 69% (21% to 79%) | 73% (71% to 83%) |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
