# Calibration for the MBA role set: what a match score means

Produced by `node evals/calibrate.mjs --roles mba` on 2026-10-14 from 304 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 50 role families of the MBA graph (US postings, all levels). 281 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (11 groups, from `web/data/roles_mba.json`); roles of other groups are another field. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 281 | 17% | 38% | 60% | 74% | 85% |
| Adjacent role (against the other roles of its group) | 1273 | 6% | 18% | 31% | 46% | 69% |
| Other field (against the roles of other groups) | 13646 | 2% | 9% | 17% | 28% | 47% |

The score ranks a same-role score above an other-field score 89% of the time, and above an adjacent-role score 77% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 50 in 140 of 281; its highest-scoring role is in its own group in 200 of 281. The level read agrees with the seniority read from the resume in 182 of 281.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 281 same-role resumes, the matcher read the role as held in 161. Their median score against their own role is 72%; the median of the 120 where the role was not read as held is 33%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 153 of 161.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Consulting & strategy | 52 | 50% (26%–64%) | 27% (15%–40%) | 21% (12%–31%) | 73% | 80% |
| Finance | 25 | 73% (60%–80%) | 36% (22%–50%) | 19% (11%–29%) | 86% | 96% |
| Banking & investing | 34 | 66% (41%–78%) | 28% (20%–38%) | 12% (5%–22%) | 84% | 94% |
| Operations & general management | 39 | 46% (22%–69%) | 30% (19%–44%) | 27% (15%–39%) | 65% | 69% |
| Product | 21 | 57% (48%–64%) | 54% (42%–63%) | 17% (9%–26%) | 58% | 95% |
| Marketing | 27 | 63% (58%–72%) | 40% (31%–55%) | 15% (9%–23%) | 85% | 99% |
| Sales & partnerships | 15 | 69% (44%–73%) | 23% (14%–35%) | 15% (9%–21%) | 86% | 94% |
| Supply chain & procurement | 20 | 75% (46%–82%) | 45% (30%–65%) | 19% (11%–28%) | 72% | 94% |
| People | 18 | 70% (31%–77%) | 23% (17%–28%) | 14% (6%–24%) | 83% | 90% |
| Risk & compliance | 16 | 43% (29%–68%) | 21% (13%–32%) | 13% (5%–26%) | 80% | 88% |
| Analytics | 14 | 70% (42%–72%) | 58% (45%–74%) | 21% (11%–33%) | 54% | 90% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 74% and above | the top quarter of same-role resumes | 72% to 76% | 25% | 3% | 0% |
| In range for the role | 55% to 74% | from the score that best splits same-role from adjacent-role resumes | 47% to 57% | 34% | 12% | 2% |
| Related background | 28% to 55% | above three in four other-field resumes | 27% to 29% | 22% | 41% | 23% |
| A different field so far | below 28% | | | 19% | 45% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_mba.json`. The two upper lines are the same for every role: in range from 55%, reads like people in the role from 74%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Consulting & strategy | 31% | 30% to 33% | 33% / 23% / 33% / 12% | 75% / 22% / 3% / 0% |
| Finance | 29% | 28% to 31% | 8% / 0% / 44% / 48% | 75% / 23% / 1% / 1% |
| Banking & investing | 22% | 21% to 23% | 6% / 38% / 21% / 35% | 75% / 25% / 0% / 0% |
| Operations & general management | 39% | 37% to 41% | 44% / 13% / 26% / 18% | 75% / 16% / 8% / 1% |
| Product | 26% | 25% to 28% | 5% / 33% / 48% / 14% | 75% / 22% / 2% / 0% |
| Marketing | 23% | 22% to 25% | 0% / 15% / 67% / 19% | 75% / 24% / 1% / 0% |
| Sales & partnerships | 21% | 20% to 23% | 7% / 27% / 47% / 20% | 75% / 25% / 0% / 0% |
| Supply chain & procurement | 28% | 27% to 29% | 10% / 25% / 10% / 55% | 75% / 24% / 1% / 0% |
| People | 24% | 22% to 25% | 11% / 28% / 28% / 33% | 75% / 24% / 1% / 0% |
| Risk & compliance | no bands | held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers) | | |
| Analytics | 33% | 31% to 35% | 21% / 14% / 43% / 21% | 75% / 21% / 3% / 1% |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Consulting & strategy | 52 | 31% (30% to 33%) | 49% (23% to 58%) | 64% (59% to 71%) |
| Finance | 25 | 29% (28% to 31%) | 58% (54% to 58%) | 80% (76% to 83%) |
| Banking & investing | 34 | 22% (21% to 23%) | 35% (35% to 61%) | 78% (70% to 85%) |
| Operations & general management | 39 | 39% (37% to 41%) | 53% (51% to 62%) | 69% (58% to 77%) |
| Product | 21 | 26% (25% to 28%) | 71% (33% to 71%) | 64% (58% to 77%) |
| Marketing | 27 | 23% (22% to 25%) | 55% (45% to 57%) | 72% (67% to 76%) |
| Sales & partnerships | 15 | 21% (20% to 23%) | 46% (24% to 66%) | 73% (68% to 74%) |
| Supply chain & procurement | 20 | 28% (27% to 29%) | 74% (42% to 78%) | 82% (78% to 84%) |
| People | 18 | 24% (22% to 25%) | 44% (26% to 44%) | 77% (71% to 82%) |
| Risk & compliance | 16 | 26% (24% to 28%) | 22% (21% to 53%) | 68% (44% to 85%) |
| Analytics | 14 | 33% (31% to 35%) | 68% (56% to 79%) | 72% (70% to 83%) |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
