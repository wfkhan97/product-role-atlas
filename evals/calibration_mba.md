# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-11-07 from 304 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 64 role families of the MBA graph (US postings, all levels). 281 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (12 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 281 | 15% | 39% | 59% | 73% | 85% |
| Adjacent role (against the other roles of its group) | 1559 | 6% | 17% | 31% | 47% | 71% |
| Other field (against the roles of other groups) | 17616 | 1% | 8% | 16% | 27% | 48% |

The score ranks a same-role score above an other-field score 90% of the time, and above an adjacent-role score 77% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 64 in 112 of 281; its highest-scoring role is in its own group in 180 of 281. The level read agrees with the seniority read from the resume in 182 of 281.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 281 same-role resumes, the matcher read the role as held in 161. Their median score against their own role is 71%; the median of the 120 where the role was not read as held is 37%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 152 of 161.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 52 | 51% (24%–63%) | 25% (14%–39%) | 20% (12%–31%) | 70% | 77% |
| Finance | 25 | 73% (61%–82%) | 35% (21%–50%) | 18% (10%–29%) | 86% | 96% |
| Banking & investing | 34 | 61% (40%–75%) | 30% (19%–39%) | 11% (4%–23%) | 82% | 95% |
| Operations & general management | 39 | 51% (38%–69%) | 35% (20%–49%) | 29% (13%–45%) | 70% | 76% |
| Product | 21 | 56% (49%–65%) | 51% (41%–63%) | 16% (8%–26%) | 60% | 95% |
| Marketing | 27 | 65% (52%–70%) | 36% (22%–50%) | 15% (9%–23%) | 87% | 99% |
| Sales & partnerships | 15 | 67% (43%–72%) | 20% (12%–30%) | 14% (8%–21%) | 86% | 93% |
| Supply chain & procurement | 20 | 73% (49%–82%) | 46% (31%–67%) | 18% (10%–28%) | 72% | 95% |
| People | 18 | 69% (33%–74%) | 21% (10%–27%) | 12% (6%–19%) | 84% | 92% |
| Risk & compliance | 16 | 47% (28%–65%) | 24% (14%–39%) | 10% (4%–25%) | 77% | 87% |
| Analytics | 14 | 66% (42%–70%) | 61% (39%–69%) | 16% (8%–27%) | 56% | 91% |
| Sustainability & policy | 0 | – | – | 24% (11%–37%) | – | – |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 73% and above | the top quarter of same-role resumes | 71% to 75% | 25% | 4% | 0% |
| In range for the role | 49% to 73% | from the score that best splits same-role from adjacent-role resumes | 43% to 55% | 41% | 18% | 4% |
| Related background | 27% to 49% | above three in four other-field resumes | 26% to 28% | 20% | 35% | 21% |
| A different field so far | below 27% | | | 14% | 43% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_mba.json`. The two upper lines are the same for every role: in range from 49%, reads like people in the role from 73%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 31% | 29% to 32% | 33% / 15% / 38% / 13% | 75% / 20% / 5% / 0% |
| Finance | 29% | 27% to 30% | 8% / 0% / 40% / 52% | 75% / 22% / 3% / 1% |
| Banking & investing | 23% | 21% to 24% | 6% / 35% / 26% / 32% | 75% / 24% / 1% / 0% |
| Operations & general management | 45% | 43% to 48% | 44% / 0% / 36% / 21% | 75% / 5% / 18% / 3% |
| Product | 26% | 24% to 28% | 5% / 19% / 67% / 10% | 75% / 20% / 4% / 0% |
| Marketing | 23% | 22% to 25% | 0% / 19% / 63% / 19% | 75% / 23% / 2% / 0% |
| Sales & partnerships | 21% | 21% to 23% | 7% / 27% / 40% / 27% | 75% / 24% / 1% / 0% |
| Supply chain & procurement | 28% | 26% to 29% | 10% / 15% / 20% / 55% | 75% / 23% / 2% / 0% |
| People | 19% | 18% to 19% | 11% / 22% / 39% / 28% | 75% / 24% / 1% / 0% |
| Risk & compliance | no bands | held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers) | | |
| Analytics | 27% | 25% to 28% | 21% / 7% / 50% / 21% | 75% / 21% / 4% / 0% |
| Sustainability & policy | no bands | fewer than 10 same-role resumes | | |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 52 | 31% (29% to 32%) | 50% (34% to 56%) | 63% (57% to 68%) |
| Finance | 25 | 29% (27% to 30%) | 57% (56% to 59%) | 82% (77% to 83%) |
| Banking & investing | 34 | 23% (21% to 24%) | 38% (32% to 62%) | 75% (65% to 83%) |
| Operations & general management | 39 | 45% (43% to 48%) | 50% (34% to 55%) | 69% (57% to 76%) |
| Product | 21 | 26% (24% to 28%) | 51% (42% to 67%) | 65% (57% to 72%) |
| Marketing | 27 | 23% (22% to 25%) | 44% (39% to 63%) | 70% (66% to 74%) |
| Sales & partnerships | 15 | 21% (21% to 23%) | 37% (24% to 61%) | 72% (64% to 79%) |
| Supply chain & procurement | 20 | 28% (26% to 29%) | 72% (43% to 78%) | 82% (79% to 84%) |
| People | 18 | 19% (18% to 19%) | 30% (23% to 64%) | 74% (71% to 80%) |
| Risk & compliance | 16 | 25% (22% to 27%) | 25% (23% to 55%) | 65% (50% to 82%) |
| Analytics | 14 | 27% (25% to 28%) | 66% (66% to 75%) | 70% (67% to 81%) |
| Sustainability & policy | 0 | too few | too few | too few |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
