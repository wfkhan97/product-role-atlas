# Matcher: diagnosis and redesign notes

Written 2026-10-09; the redesign below landed on 2026-10-10 in `web/match.js`. Context: the old matcher
gave a decent internet-sample PM resume a 36% match against a PM role. Under the old scoring our own
PM sample scored 52%, the grad-student sample 38% at associate, the PhD pivoter 33%. After the redesign
they read 77%, 56% and 54% with 0 false positives (see [baseline.md](baseline.md)).

## Status

Done (steps 0 to 8 below, first pass): matcher extracted to `web/match.js`; per-line evidence with
sections and strength; tiered requirements with one industry slot and one AI slot; credentials read from
titles, dates and degrees; persona and level read; transfer vocabulary with rewrite suggestions; evidence
lines, unmapped lines and a what-if in the UI; resume-language patterns and a drop list for posting
patterns that misfire on resumes.

Next round (calibration): add real resumes to `evals/resumes/`, starting with the 36% internet sample;
tune `score_band`s once a few real ones are in; grow `RESUME_PATTERNS` and `RESUME_DROP` from eval
failures only; add TPM and PMM samples; consider section-aware weighting for pivoters with long
non-product careers (currently every work bullet counts the same).

## Why decent resumes score in the 30s and 50s

**1. The bar is the union of every posting, which no posting sets.** A target slice requires every
skill that at least 20% of its postings mention: 42 skills at PM associate, 53 at senior, 56 across all
levels. An average PM posting tags 29. The required set includes nine mutually exclusive domains
(public sector, automotive, fintech, supply chain, e-commerce, energy, dev tools, enterprise SaaS,
consumer) worth 16% of the total weight; one resume can honestly cover one or two. It also includes
three AI skills (ai_ml 0.66, genai_llm 0.40, ai_tools 0.30) that together outweigh roadmapping, and
credentials such as `pm_experience` (weight 0.60) whose regex needs posting phrasing like "product
management experience". A resume titled "Senior Product Manager" does not match it.

**2. Partial credit is non-monotonic.** In the scoring loop, a skill whose top-level pattern matched
and no sub-skill matched scores 1.0. The same skill with one of five sub-skills matched scores
0.5 + 0.5 x 1/4 = 0.63. Adding evidence lowers the score. The baseline lists 10 to 22 such skills per
sample ("partial credit despite being named"). The UI text ("naming it once earns half credit")
describes a different rule from the code.

**3. Patterns speak posting language; resumes speak outcome language.** Postings list nouns
("cross-functional", "data-driven", "market research"). Resumes narrate verbs and numbers. Misses in
the baseline: "worked with two engineers" (cross_functional wants "working with"), "competitive
analyses" (plural), "60+ semi-structured interviews" (customer_interviews), "2 designers"
(ux_design_collab), "Senior Product Manager" (pm_experience), "Big Tech Co" (big_tech_experience).

**4. Precision is poor on domains and sub-skills.** "shipping features" tags supply chain, "GDPR
compliance" tags public sector, "electrical engineering" tags hardware, "panel" and "themes" and
"delivery" and "subscriber" promote parents from sub-skill patterns. Across the four samples, 5 of 37
false-positive checks pass. Seeing "Supply chain: covered" on a SaaS resume costs more trust than a
missed skill does.

**5. The product frames one number as a verdict.** No level read, no persona, no transfer, no line of
evidence per skill. The depth data (plain-English definition for all 98 skills, level ladder for 64,
build steps and resume signal lines for all 98) is shown on skill cards but not used in the match.

## Who is asking, and what they need

Three users land on "Match me", and the same number means something different to each.

- **Experienced in the role.** Wants a level read, not a fit score. "You read as mid; senior postings
  additionally expect X, Y" (the ladder). Then depth: which core skills are named but thin.
- **New to the role (the grad student).** Wants to know what foundations they already have and what to
  do in the next two semesters. Coursework, capstones and internships are legitimate evidence at the
  associate bar and should be read that way, not as a failed senior match. Build steps per skill
  already exist in the depth files.
- **Pivoter with a range of experience.** Wants to know which experience counts and how to say it.
  The HCI PhD has 60 interviews, six studies and an RCT; the matcher sees none of the interviews. The
  useful output is three buckets: evidenced, transferable (with a translated resume line), and gap.

A single percentage cannot carry any of that. It can stay as a summary, but calibrated so that a
strong profile for the target level reads as strong.

## Design (as implemented)

**0. Extract the matcher.** Move `tagText` and the scoring into `web/match.js` as a pure function
`match(text, target, data) -> result` that `app.js` renders and `evals/run.mjs` imports. Everything
below is then testable without the browser.

**1. Evidence model, per line.** Split the input into bullets and lines, detect sections (experience,
projects, education, coursework, skills), and tag each line. Each hit becomes
`{skill, sub, line, section, strength}`. Strength: 1 keyword only (a skills list); 2 in a work or
project bullet; 3 a bullet with a number or outcome. Sub-skill hits only add. The score is monotonic
by construction, and every covered skill can show the line that earned it.

**2. Tiered requirements instead of a flat 20% cut.** Core = asked in at least half of the slice;
common = 25% to 50%; differentiators = below 25%. Collapse the domain cluster to one slot: the best
matching domain counts, the rest are shown as "industries hiring for this role", not as gaps. Merge
ai_ml, genai_llm and ai_tools into one AI-literacy requirement for scoring. Credentials (years, titles,
degrees, employer type) come from a structured read of the header and experience lines, not from
posting-noun regexes.

**3. A readiness read with three numbers, not one.** Core coverage (share of core weight evidenced at
strength 2 or more), depth (share of evidenced core skills with a sub-skill or outcome), breadth
(differentiators evidenced). The headline is a sentence: "Reads like a mid-level PM profile. Core:
11 of 13. Thin: metrics, discovery. Missing: AI literacy, product strategy." The percentage, if kept,
is core coverage, so a strong profile lands above 80%.

**4. Level read against the ladder.** Estimate level from years, titles and scope words (team sizes,
revenue, "owned"). For each core skill with a ladder, show the rung for the target level next to the
line that evidenced it. This is the experienced-PM value and it costs no new data.

**5. Transfer map for pivoters.** A small table from background to PM skills with patterns in the
source vocabulary: academic research (studies, participants, thematic analysis, RCT) to interviews,
research, experimentation, statistics; consulting to stakeholders, strategy, business cases, exec
communication; engineering to technical fluency, APIs, architecture, agile; design to UX collaboration,
prototyping, discovery; marketing to positioning, GTM, surveys; finance and ops to pricing, analysis,
process. A transferred skill shows as amber with a suggested rewrite built from the skill's `signals`
lines ("Ran 60 semi-structured interviews" becomes "Ran 60 customer interviews and synthesised them into
design guidelines adopted by two partners").

**6. New-to-role path.** When the detected level is associate or there is no PM title, score against
the associate bar with project and coursework evidence at full strength, and lead with "foundations you
have" and a next-six-months list drawn from `build` steps for the top gaps. The course-list input gets
this view by default.

**7. Trust surfaces.** Per covered skill, the evidencing line. A list of bullets that mapped to nothing
("we could not read these; the market phrases this as..."). A what-if: how the headline moves if the
top three gaps were evidenced.

**8. Pattern work, driven by the evals.** Add `resume_patterns` per skill for verb forms, plurals and
academic or consulting synonyms. Tighten domain patterns: require an anchor term or two independent
hits. Stop promoting a parent skill from single-word sub-skill patterns such as "panel", "themes",
"delivery", "schedules". Each change is one commit with a baseline diff.

## Eval plan for the next round

- The expectation files are the spec. False-positive lists are the hard constraint; score bands are
  tuned after the model in steps 1 to 3 exists.
- Add the real-world internet sample that scored 36%, then two or three more personas: engineer to PM,
  consultant to PM, and one each for TPM and PMM targets.
- New checks to add to the runner once the module exists: level read equals `expected_level`; persona
  detection; each `must_evidence` skill carries at least one evidence line; a property test that
  appending any bullet never lowers any score.
- Re-run `--baseline` with every matcher commit and read the diff before merging.
