# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-11-06 from 304 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 64 role families of the MBA graph (US postings, all levels). 281 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (12 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 281 | 15% | 38% | 60% | 73% | 85% |
| Adjacent role (against the other roles of its group) | 1559 | 6% | 18% | 30% | 47% | 70% |
| Other field (against the roles of other groups) | 17616 | 2% | 8% | 17% | 27% | 47% |

The score ranks a same-role score above an other-field score 89% of the time, and above an adjacent-role score 76% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 64 in 121 of 281; its highest-scoring role is in its own group in 187 of 281. The level read agrees with the seniority read from the resume in 182 of 281.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 281 same-role resumes, the matcher read the role as held in 161. Their median score against their own role is 71%; the median of the 120 where the role was not read as held is 33%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 152 of 161.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 52 | 50% (24%–63%) | 24% (14%–39%) | 21% (12%–31%) | 72% | 78% |
| Finance | 25 | 73% (61%–81%) | 36% (22%–50%) | 20% (11%–30%) | 86% | 96% |
| Banking & investing | 34 | 60% (41%–75%) | 30% (19%–40%) | 12% (4%–24%) | 82% | 94% |
| Operations & general management | 39 | 46% (19%–68%) | 32% (19%–49%) | 27% (14%–41%) | 62% | 68% |
| Product | 21 | 57% (49%–65%) | 50% (41%–60%) | 17% (9%–26%) | 62% | 95% |
| Marketing | 27 | 65% (54%–71%) | 35% (25%–49%) | 15% (9%–23%) | 87% | 99% |
| Sales & partnerships | 15 | 67% (42%–72%) | 19% (12%–29%) | 14% (8%–22%) | 87% | 93% |
| Supply chain & procurement | 20 | 75% (49%–81%) | 47% (31%–66%) | 19% (11%–28%) | 72% | 94% |
| People | 18 | 69% (33%–74%) | 23% (11%–28%) | 14% (6%–21%) | 83% | 90% |
| Risk & compliance | 16 | 45% (27%–65%) | 24% (15%–39%) | 12% (5%–26%) | 75% | 86% |
| Analytics | 14 | 66% (40%–68%) | 60% (39%–69%) | 16% (8%–27%) | 54% | 91% |
| Sustainability & policy | 0 | – | – | 25% (11%–38%) | – | – |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 73% and above | the top quarter of same-role resumes | 71% to 75% | 25% | 3% | 0% |
| In range for the role | 54% to 73% | from the score that best splits same-role from adjacent-role resumes | 47% to 55% | 35% | 13% | 2% |
| Related background | 27% to 54% | above three in four other-field resumes | 26% to 28% | 22% | 39% | 22% |
| A different field so far | below 27% | | | 19% | 44% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_mba.json`. The two upper lines are the same for every role: in range from 54%, reads like people in the role from 73%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 31% | 30% to 32% | 33% / 21% / 33% / 13% | 75% / 22% / 3% / 0% |
| Finance | 30% | 29% to 31% | 8% / 0% / 40% / 52% | 75% / 23% / 2% / 1% |
| Banking & investing | 24% | 22% to 24% | 6% / 38% / 24% / 32% | 75% / 25% / 0% / 0% |
| Operations & general management | 41% | 39% to 43% | 49% / 5% / 26% / 21% | 75% / 14% / 10% / 1% |
| Product | 26% | 24% to 28% | 5% / 33% / 57% / 5% | 75% / 23% / 2% / 0% |
| Marketing | 23% | 21% to 25% | 0% / 26% / 56% / 19% | 75% / 24% / 1% / 0% |
| Sales & partnerships | 22% | 21% to 23% | 7% / 27% / 40% / 27% | 75% / 24% / 1% / 0% |
| Supply chain & procurement | 28% | 27% to 29% | 10% / 20% / 15% / 55% | 75% / 24% / 1% / 0% |
| People | 21% | 20% to 23% | 11% / 28% / 28% / 33% | 75% / 24% / 1% / 0% |
| Risk & compliance | no bands | held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers) | | |
| Analytics | 27% | 25% to 28% | 21% / 14% / 43% / 21% | 75% / 22% / 3% / 0% |
| Sustainability & policy | no bands | fewer than 10 same-role resumes | | |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 52 | 31% (30% to 32%) | 53% (37% to 55%) | 63% (59% to 69%) |
| Finance | 25 | 30% (29% to 31%) | 56% (55% to 60%) | 81% (77% to 83%) |
| Banking & investing | 34 | 24% (22% to 24%) | 40% (33% to 59%) | 75% (65% to 86%) |
| Operations & general management | 39 | 41% (39% to 43%) | 58% (52% to 63%) | 68% (61% to 76%) |
| Product | 21 | 26% (24% to 28%) | 51% (20% to 68%) | 65% (57% to 70%) |
| Marketing | 27 | 23% (21% to 25%) | 45% (45% to 55%) | 71% (66% to 74%) |
| Sales & partnerships | 15 | 22% (21% to 23%) | 36% (23% to 66%) | 72% (65% to 76%) |
| Supply chain & procurement | 20 | 28% (27% to 29%) | 70% (42% to 75%) | 81% (79% to 83%) |
| People | 18 | 21% (20% to 23%) | 31% (27% to 62%) | 74% (71% to 80%) |
| Risk & compliance | 16 | 26% (23% to 27%) | 25% (22% to 56%) | 65% (49% to 82%) |
| Analytics | 14 | 27% (25% to 28%) | 65% (64% to 78%) | 68% (66% to 80%) |
| Sustainability & policy | 0 | too few | too few | too few |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
