# Calibration for the tech role set: what a match score means

Produced by `node evals/calibrate.mjs --roles tech` on 2026-11-06 from 376 published sample resumes in `evals/resumes/external/` (the files are not in the repository; see `external_sources.json`). Each is scored against the 7 role families of the tech graph (US postings, all levels), with asks weighed against the MBA and tech roles together. 72 were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other tech roles (a tech résumé against a tech role it was not written for); another field is a résumé written for an MBA or product role, against every tech role. An ask counts by how distinctive it is for the role (`distinct`: an ask that the role's postings set no more often than the mean of all roles keeps 0.2 of its weight; one set 2 times as often or more keeps all of it).

## Score by group of resumes

| group | scores | 5th pct | 25th | median | 75th | 95th |
|---|---|---|---|---|---|---|
| Same role (a resume against its own role) | 72 | 0% | 16% | 38% | 54% | 71% |
| Adjacent role (against the other roles of its group) | 432 | 0% | 2% | 6% | 20% | 47% |
| Other field (against the roles of other groups) | 2128 | 0% | 3% | 7% | 15% | 38% |

The score ranks a same-role score above an other-field score 80% of the time, and above an adjacent-role score 78% of the time (50% would be chance). A resume's own role is its highest-scoring role of the 7 in 49 of 72; its highest-scoring role is in its own group in 55 of 72. The level read agrees with the seniority read from the resume in 65 of 72.

## Role held

A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the 72 same-role resumes, the matcher read the role as held in 7. Their median score against their own role is 61%; the median of the 65 where the role was not read as held is 35%. The floor that `run.mjs` checks (60% when held above the level, 50% at it) holds in 7 of 7.

## By role group

Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.

| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |
|---|---|---|---|---|---|---|
| Software engineering | 18 | 41% (32%–59%) | 5% (2%–19%) | 3% (1%–13%) | 89% | 97% |
| Data & AI engineering | 5 | 51% (24%–52%) | 13% (3%–27%) | 5% (3%–12%) | 82% | 93% |
| Security | 11 | 49% (36%–56%) | 8% (3%–21%) | 5% (2%–11%) | 93% | 99% |
| Design & research | 8 | 54% (34%–60%) | 4% (1%–10%) | 9% (5%–15%) | 96% | 98% |
| Legal | 30 | 13% (0%–41%) | 6% (0%–20%) | 19% (6%–36%) | 64% | 49% |

## Bands of fit, all roles together

Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.

| band | score | rule | interval | same role | adjacent role | other field |
|---|---|---|---|---|---|---|
| Reads like people in the role | 54% and above | the top quarter of same-role resumes | 49% to 58% | 25% | 4% | 1% |
| In range for the role | 29% to 54% | from the score that best splits same-role from adjacent-role resumes | 22% to 32% | 42% | 10% | 10% |
| Related background | 15% to 29% | above three in four other-field resumes | 15% to 16% | 8% | 16% | 14% |
| A different field so far | below 15% | | | 25% | 69% | 75% |

Read each row across: of the scores in a group, the share that lands in the band.

## The bands in use

Written to `web/data/bands_tech.json`. The two upper lines are the same for every role: in range from 29%, reads like people in the role from 54%. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.

| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |
|---|---|---|---|---|
| Software engineering | 13% | 11% to 15% | 0% / 17% / 56% / 28% | 75% / 19% / 5% / 1% |
| Data & AI engineering | no bands | fewer than 10 same-role resumes | | |
| Security | 11% | 10% to 13% | 0% / 18% / 45% / 36% | 75% / 22% / 3% / 0% |
| Design & research | no bands | fewer than 10 same-role resumes | | |
| Legal | no bands | half of its same-role resumes score below its own bottom line | | |

Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.

## Cut points by role group

The same three rules, on the roles of one group. A group with fewer than 10 same-role resumes gets no cut points of its own.

| role group | same-role resumes | related background from | in range from | reads like people in the role from |
|---|---|---|---|---|
| Software engineering | 18 | 13% (11% to 15%) | 21% (20% to 31%) | 59% (42% to 71%) |
| Data & AI engineering | 5 | too few | too few | too few |
| Security | 11 | 11% (10% to 13%) | 23% (22% to 38%) | 56% (48% to 64%) |
| Design & research | 8 | too few | too few | too few |
| Legal | 30 | 36% (35% to 38%) | 36% (28% to 36%) | 41% (29% to 53%) |

## Limits

- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.
- The role a sample is filed under is the publisher's. A "Business Analyst" sample filed under business analytics manager counts as same-role here.
- Groups are small. Read the intervals before the cut points.
- Scores are against all levels of a role, and against US postings only.
