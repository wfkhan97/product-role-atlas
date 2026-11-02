# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-11-02 from 304 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 51 role families of the MBA graph (US postings, all levels). 281 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (11 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 281 | 14% | 37% | 60% | 73% | 85% |
| Adjacent role (against the other roles of its group) | 1325 | 6% | 18% | 30% | 45% | 69% |
| Other field (against the roles of other groups) | 13898 | 2% | 8% | 17% | 27% | 46% |

The score ranks a same-role score above an other-field score 89% of the time, and above an adjacent-role score 77% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 51 in 136 of 281; its highest-scoring role is in its own group in 195 of 281. The level read agrees with the seniority read from the resume in 182 of 281.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 281 same-role resumes, the matcher read the role as held in 162. Their median score against their own role is 71%; the median of the 119 where the role was not read as held is 33%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 152 of 162.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 52 | 50% (24%–63%) | 24% (14%–38%) | 20% (12%–30%) | 72% | 78% |
| Finance | 25 | 73% (61%–81%) | 36% (21%–50%) | 19% (11%–30%) | 87% | 96% |
| Banking & investing | 34 | 60% (41%–75%) | 29% (19%–40%) | 11% (4%–23%) | 82% | 94% |
| Operations & general management | 39 | 45% (19%–69%) | 31% (19%–46%) | 26% (14%–39%) | 63% | 68% |
| Product | 21 | 56% (48%–64%) | 54% (41%–62%) | 16% (8%–25%) | 59% | 95% |
| Marketing | 27 | 64% (57%–71%) | 41% (29%–55%) | 15% (9%–23%) | 86% | 99% |
| Sales & partnerships | 15 | 67% (40%–72%) | 22% (14%–35%) | 14% (9%–21%) | 85% | 93% |
| Supply chain & procurement | 20 | 74% (48%–82%) | 47% (32%–65%) | 19% (11%–28%) | 72% | 94% |
| People | 18 | 69% (33%–74%) | 23% (18%–27%) | 14% (6%–22%) | 82% | 90% |
| Risk & compliance | 16 | 45% (27%–66%) | 22% (14%–35%) | 13% (5%–26%) | 79% | 86% |
| Analytics | 14 | 66% (40%–70%) | 52% (43%–70%) | 18% (10%–28%) | 57% | 90% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 73% and above | the top quarter of same-role resumes | 71% to 75% | 25% | 3% | 0% |
| In range for the role | 54% to 73% | from the score that best splits same-role from adjacent-role resumes | 47% to 55% | 35% | 12% | 2% |
| Related background | 27% to 54% | above three in four other-field resumes | 26% to 28% | 22% | 40% | 23% |
| A different field so far | below 27% | | | 18% | 45% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_mba.json`. The two upper lines are the same for every role: in range from 54%, reads like people in the role from 73%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 30% | 29% to 32% | 33% / 21% / 33% / 13% | 75% / 23% / 2% / 0% |
| Finance | 30% | 28% to 31% | 8% / 0% / 44% / 48% | 75% / 22% / 2% / 1% |
| Banking & investing | 23% | 22% to 24% | 6% / 38% / 26% / 29% | 75% / 24% / 0% / 0% |
| Operations & general management | 39% | 37% to 42% | 44% / 10% / 26% / 21% | 75% / 15% / 9% / 1% |
| Product | 25% | 24% to 28% | 5% / 33% / 43% / 19% | 75% / 22% / 3% / 0% |
| Marketing | 23% | 21% to 25% | 0% / 15% / 67% / 19% | 75% / 24% / 1% / 0% |
| Sales & partnerships | 21% | 20% to 22% | 7% / 33% / 40% / 20% | 75% / 24% / 1% / 0% |
| Supply chain & procurement | 28% | 27% to 29% | 10% / 20% / 15% / 55% | 75% / 24% / 1% / 0% |
| People | 22% | 21% to 23% | 11% / 28% / 33% / 28% | 75% / 24% / 1% / 0% |
| Risk & compliance | no bands | held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers) | | |
| Analytics | 28% | 26% to 30% | 21% / 14% / 43% / 21% | 75% / 23% / 2% / 0% |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 52 | 30% (29% to 32%) | 49% (34% to 55%) | 63% (60% to 69%) |
| Finance | 25 | 30% (28% to 31%) | 58% (55% to 60%) | 81% (77% to 83%) |
| Banking & investing | 34 | 23% (22% to 24%) | 40% (37% to 59%) | 75% (65% to 85%) |
| Operations & general management | 39 | 39% (37% to 42%) | 51% (51% to 61%) | 69% (59% to 77%) |
| Product | 21 | 25% (24% to 28%) | 55% (30% to 72%) | 64% (57% to 76%) |
| Marketing | 27 | 23% (21% to 25%) | 46% (46% to 55%) | 71% (67% to 75%) |
| Sales & partnerships | 15 | 21% (20% to 22%) | 36% (24% to 66%) | 72% (64% to 76%) |
| Supply chain & procurement | 20 | 28% (27% to 29%) | 70% (41% to 75%) | 82% (79% to 84%) |
| People | 18 | 22% (21% to 23%) | 30% (26% to 46%) | 74% (71% to 80%) |
| Risk & compliance | 16 | 26% (24% to 28%) | 23% (23% to 64%) | 66% (48% to 83%) |
| Analytics | 14 | 28% (26% to 30%) | 54% (22% to 79%) | 70% (67% to 81%) |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
