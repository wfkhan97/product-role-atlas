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

## Evaluation of the implemented logic (2026-10-10)

Honest read of `web/match.js` after the first round, strongest concerns first.

1. **PDF uploads lost every line break** (fixed in this PR). pdf.js text items were joined with spaces,
   so a PDF became one paragraph: no headings, no role lines, no dates. Everything then read as "body"
   text, the persona fell back to new-to-role with zero years, and credentials vanished. The evals never
   caught it because they feed plain text. Fix: honour pdf.js's `hasEOL`. Still untested on a real PDF;
   the next calibration round must include a PDF sample run through the browser.
2. **Evidence strength is a proxy, not a judgment.** "Done with an outcome" means "the line contains a
   number or an impact verb". "Led a team of 8" and "lifted conversion 11%" both score 3. Specificity,
   scope and recency are not read.
3. **Vocabulary coverage is a treadmill.** Resume-language patterns fix the misses the four samples
   exposed; every new resume will expose more paraphrases. The unmapped-lines panel is the safety valve,
   not a solution.
4. **Persona and level rules are brittle.** Years come from date ranges on role lines; titles decide
   seniority; backgrounds come from a handful of title words ("analyst" implies consulting). A resume
   with unusual formatting (two-column, dates on the right, "2019–present" split across lines) degrades
   quietly.
5. **Posting-side noise flows into the requirements.** Public sector at 47% of PM postings and systems
   architecture at 52% come from loose extraction patterns in `pipeline/extract.py`. The tiering hides
   some of it; a single-posting target shows all of it ("and 12 more").
6. **Coursework and projects count the same at every target level.** Right for associate, generous for
   senior. Section-aware weighting by target level is the obvious next step.
7. **No real resumes in the evals yet.** The score bands are my judgment on four samples I wrote.

## Would the OpenAI Decisions API help?

What it is (per the docs, public beta, model `gpt-6-luna` only): one request carries a shared `input`
(text, images) and a list of independent `questions`, each `predicate` (probability 0–1), `choice`
(option, probabilities, confidence) or `score` (probability-weighted index over ordered `levels`).
Priced at $0.10 per 1M input tokens, no output charge, described as about 10x faster than Responses.
It has no feedback or reward loop and no notion of candidate actions; despite the name it is a fast,
cheap, calibrated classifier, not a decision optimiser.

**Where it maps onto the matcher.** The `score` type is exactly the evidence ladder: one request per
resume with one `score` question per skill, levels "not shown / named / done / done with a concrete
outcome", would replace `tag()`'s regexes and sub-skill heuristics with a model judgment that reads
paraphrase, scope and specificity (concerns 2, 3 and 4 above). A `choice` question gives the level read
and the persona with probabilities. A `predicate` per skill ("shown in a non-product role, using another
field's vocabulary") gives transferability. Cost per match is around a tenth of a cent; a 98-question
request over a one-page resume is a few thousand input tokens.

**Where it would help most, and first: the posting side.** Running a `predicate` per skill over each
of the 9,351 postings is about 14M input tokens, roughly $1.40, offline, on public text. That attacks
concern 5, which the resume-side matcher inherits no matter how good it gets, and it needs no change to
the privacy model. The regex tags become the baseline the model tags are calibrated against.

**What it costs on the resume side.**
- The match modal promises "everything runs in your browser; nothing is uploaded anywhere." Sending
  resumes to OpenAI breaks that promise and the static-site architecture: the key must live behind a
  proxy, so the published artifact cannot ship the feature on its own. For grad students uploading
  resumes, that means explicit opt-in and the Zero Data Retention tier.
- Model answers are not deterministic. The evals would need recorded fixtures for replay and tolerance
  bands instead of exact sets, and CI would need a key or a replay mode.
- Beta, single model, pricing and shape may change. Thresholds must be set from labelled examples,
  which is the calibration set this repo is building anyway.
- It does not replace the taxonomy, the tiers, the industry and AI slots, the ladders, build steps,
  signal lines, or the UI. It replaces one function (`tag`) and could inform `profileOf`.

**Recommendation.** Keep the regex matcher as the private, offline, always-on path and as the eval
baseline. Stage any model use:
1. Postings first: add a pipeline stage that asks one `predicate` per skill per posting, compare with
   the regex tags on a few hundred postings, set thresholds, and rebuild the graph from the better tags.
   No privacy change, biggest error mass, fully measurable.
2. Then, if the posting result is good, an opt-in "deeper read" on the resume side behind a proxy:
   model `score`s per skill feed the same `rows` structure, regex still supplies the evidence lines and
   runs when the user declines. Record model answers for the eval samples as fixtures so `run.mjs`
   stays deterministic.
Any model with structured outputs can do the same job; the distinctive parts of this API are price,
speed, and calibrated probabilities over many questions on one input, which fit the per-skill ladder
unusually well.

## Extraction audit (2026-10-10): the map's biggest nodes are partly noise

The scraped cache is intact: 9,374 postings with full descriptions in `data/raw/jobs/` (local, gitignored).
Running the taxonomy patterns over 1,500 random PM postings after `extract.clean()` and removing the
generic words that dominate each skill:

| skill | share | share without the generic words | generic words |
|---|---|---|---|
| public_sector | 49% | 9% | regulat, compliance, policy, federal, audit |
| automotive_autonomy | 43% | 6% | mission, autonomous, defense |
| system_architecture | 51% | 24% | architecture, infrastructure |
| ai_ml | 64% | 25% | `\bAI\b` |
| supply_chain | 34% | 21% | shipping |
| hardware | 25% | 17% | silicon, embedded, electrical/mechanical engineering |

"Mission" fires on company mission statements, "federal" on equal-opportunity boilerplate that the
cleaner does not catch, "shipping" on "shipping products", "silicon" on "Silicon Valley". The truth sits
between the two columns (a fintech compliance PM genuinely needs "compliance"), but public sector and
automotive are shown on the map as asked for in roughly half of PM postings when the honest number is
probably 10–15%. Across all 98 skills, the single-pattern dependence table (same script, top 30) also
flags `community` → consumer, `craft` → product_sense, `network(ing)` → networking, `experiment` →
ab_testing as single generic words carrying most of a skill's share.

This is a core-offering defect, independent of the resume matcher, and most of it is fixable with
anchored patterns and no model. The Decisions API is the right tool for the residual: deciding whether
"AI" or "compliance" in a posting is a requirement of the role or a mention in the company blurb.
`pipeline/experiments/decisions_audit.py` runs that comparison on a sample once `OPENAI_API_KEY` is set;
`--dry-run` writes the requests without sending anything.

## Decisions API experiment results (2026-10-10, live)

Setup: 200 random PM postings (seed 7), one `predicate` per skill for all 83 non-credential skills, two
prompts. Lenient: "does the posting ask the person to have or use this skill; ignore company blurb and
boilerplate". Strict: "does the text explicitly name the skill; do not infer from the title". Two runs cost
well under a dollar. Full table in [extraction_baseline.md](extraction_baseline.md).

**1. The model is a reliable veto on industry and technical nouns.** It rejects 48% of the 1,017 regex
hits on industry and technical skills under the lenient prompt, and the strict prompt agrees on the same
skills. Checked by eye, the rejections are right: "mission statement" is not automotive, "shipping
features" is not supply chain, "Mechanical Engineering" in a degree list is not hardware, "Flexible PTO
policy" and "in compliance with federal law" are not public sector, AI in the company blurb is not an AI
role. Regex share vs lenient model share: automotive 42% → 3%, supply chain 30% → 12%, hardware 25% → 11%,
DevOps 24% → 10%, energy 22% → 10%, e-commerce 24% → 12%, vendor management 20% → 9%, agile 30% → 18%.

**2. Neither prompt is a calibrated measure of craft and soft skills.** Lenient infers from the title:
product strategy, prioritization, stakeholder management, program management and product sense all come
back at 98–100%, which would flatten the map. Strict denies explicit mentions: it rejects the literal word
"roadmap" in 14 postings, tool names (analytics tools 10% → 0%), "large-enterprise customers" for
enterprise SaaS. On skills with unmistakable vocabulary (tool names, SQL, roadmap, PRD, OKR, A/B testing)
the lenient prompt accepts 87% of regex hits, strict only 58%. So: lenient is a good judge of "is this
mention real", strict is not, and neither should redefine what the map measures.

**3. The regex has recall gaps the model exposes.** Under both prompts the model finds mentions the
regex misses for launch ("from concept through launch"), product vision ("vision, roadmap, execution"),
executive communication ("partner closely with leadership and executive stakeholders"), user research and
PRDs. Those are pattern additions, found by reading the strict model-only cases.

**4. Some "regex hits" the model rejected were plain regex bugs**: `Segment` (the analytics tool) matching
"Teen segment", `quer(y|ies)` matching "explicit queries" for SQL, "experimentation" matching
"experimenting with AI tools" for A/B testing.

**5. Scrape quality is fine; duplicates are not.** Of 9,374 cached postings, 3 are under 800 characters,
13 start with ATS login boilerplate (Broadcom's Workday) but carry real text after it, 43 lack any
responsibilities or qualifications wording. 628 postings are exact-description duplicates of another
(mostly one role reposted per city: Anduril 114 copies, OpenAI 41, Home Depot 25). They move aggregate
shares by under half a point but inflate company counts and the company filter.

### What this means for the product

The map should keep measuring **what postings explicitly say**. That is a consistent definition, it is
what differentiates skills, and it is what a grad student can act on (the words screeners look for).
The model's job is precision, not redefinition.

Plan, in order:
1. **Precision pass on the taxonomy** for the industry and technical skills above: anchored phrases,
   drop the generic words. Validate against the 200-posting lenient answers: after the pass, regex-only
   cases on those skills should be near zero.
2. **Recall pass** for launch, product vision, executive communication, user research, PRDs, product
   strategy, from the strict model-only examples. Fix the Segment / queries / experimentation bugs.
3. **Dedupe reposts** in `build_graph.py` (same company, title and description; keep one, union the
   locations).
4. **Re-extract and rebuild**, then rerun `decisions_audit.py` on the same seed and diff
   `extraction_baseline.md`. This is the extraction eval loop; it costs cents per run.
5. Only after that, consider the model as a live veto stage in `extract.py` for the long tail (about
   $1.40 for the full corpus). Not for the resume side, where the privacy promise holds.

The resume matcher inherits all of step 1: once public sector and automotive stop being "asked in half
of PM postings", they stop appearing as gaps for everyone.

## Round 2 (2026-10-10): precision and recall pass, dedupe, re-extract

Branch `fix/extraction-precision`, stacked on the matcher PR. Every change below was chosen from the
per-pattern precision table (model acceptance rate among postings where a pattern fired) and validated
against the saved model answers before re-extracting; see [extraction_baseline.md](extraction_baseline.md).

- **Precision**: dropped or anchored 60-odd patterns. Notable bugs: `persona` matched "personal",
  `\bSAFe\b` matched "safe", `segment` matched "Teen segment", `mission` carried most of automotive,
  `shipping` most of supply chain, `subscription` for enterprise SaaS, `AI-native` / `AI-first` as
  company self-descriptions, `salesforce` as an employer. "Public sector, regulated & compliance" was
  relabelled "Regulated industries & compliance" and every pattern anchored, since bare `compliance`,
  `policy`, `audit` and `federal` were firing on benefits and legal boilerplate.
- **Recall**: added phrasings for launch ("concept to launch", "post-launch"), product vision ("own
  the vision", "vision and strategy"), executive communication ("executive stakeholders", "present to
  leadership"), user research, PRDs ("product requirements", "define requirements") and product
  strategy ("commercial strategy", "set the strategy").
- **Dedupe**: `extract.py` now drops exact reposts (same company, title and cleaned text): 186 of
  9,351 postings. Company counts and the company filter no longer count one role per city.

Effect on the 200-posting sample, regex share before → after (lenient model share for reference):
automotive 43% → 9% (3%), regulated 44% → 22% (38%), consumer 38% → 16% (27%), personas 31% → 9%
(34%), security 32% → 16% (29%), DevOps 24% → 8% (11%), supply chain 29% → 14% (12%), vendor 20% → 5%
(9%); launch 21% → 38% (72%), PRDs 24% → 43% (63%), product strategy 47% → 65% (98%), executive
communication 9% → 22% (59%). Regex-only cases (regex tags it, model rejects) fell from 889 to 457
across all skills and from 533 to 238 on industry and technical skills. The remaining model-only gap
on craft skills is the lenient prompt inferring from the title, which the map does not count by design.

Across the full corpus (PM family): regulated 47% → 20%, automotive 43% → 6%, supply chain 33% → 18%,
hardware 27% → 20%, personas 35% → 12%, launch 25% → 37%, PRDs 26% → 46%, product strategy 47% → 62%.
Resume evals: 163 pass, 0 fail on the rebuilt graph; sample scores moved by at most 4 points.

Not done, deliberately: a live model veto in `extract.py`. The residual regex-only count is small
enough that the next gain is in labelled data, not in another model pass. Next calibration round:
real resumes (including the 36% sample), a PDF sample through the browser, TPM and PMM samples.

## Taxonomy for the MBA role set (2026-10-11)

Branch `feat/mba-taxonomy`. The 50 MBA roles were scraped with title rules only; this round gives them skills.

**Structure.** One taxonomy, not two. A skill marked `only: ["mba"]` is tagged for that role set alone, an
unmarked skill is shared, and `pipeline/tax.py` hands each role set its part. The product map therefore keeps
its 98 skills (its taxonomy file is byte-identical after the additions) until its interface is designed for
more. `extract.py` runs both sets through one path and tags in worker processes.

**How the skills were written.** From the postings, not from a syllabus: `role_terms.py` ranks the phrases that
set a role's postings apart, `skill_probe.py` shows what a draft pattern matches, and four drafting passes (one
per group of related roles) iterated on those. 190 drafts were merged to 181 skills in nine new clusters
(strategy & consulting, corporate finance & accounting, banking/deals/investing, real estate, marketing & brand,
sales & customer relationships, operations & supply chain, people & organization, risk/compliance/governance)
plus additions to analytics, delivery, tools and credentials. Each has a one-line definition in
`pipeline/depth/mba_*.json`; sub-skills, ladders and build steps wait for the interface design.

**Result.** [extraction_baseline_mba.md](extraction_baseline_mba.md): 21,589 US postings, a median of 29 skills
per posting, 7 of them from the new skills; 4% of postings get none of the new skills. Product Manager postings
get a median of 2 (their skills are the shared product ones), general managers 5, leadership-programme
associates 4.

**Found along the way.**
- 96 startups were in the registry under two names and their postings counted twice (399 product postings).
  Fixed in `merge_registry.py`, with a repeated-URL guard in `extract.py`.
- Seven shared patterns fired on everyday phrasing in the new roles and were anchored (see
  [extraction_baseline.md](extraction_baseline.md)). "Analytics tools" was tagging 69% of operational-excellence
  postings through the word "sigma".
- DEI was dropped as a skill: once boilerplate is removed, almost no posting asks for it as work.

**Known weak spots, kept on purpose or not yet fixed.**
- Shared skills that restate a role or its industry: "Supply chain, logistics & operations" on nearly every
  supply and procurement posting, "Payments, fintech & banking" on every banking and treasury posting,
  "Risk & dependency management" on 97% of enterprise-risk postings, "Consulting / banking / finance
  background" on most strategy and banking postings. True, but uninformative for those roles; the interface
  should treat a role's own domain as given.
- "Statistics & forecasting" tags most FP&A postings through `forecast`, next to the new "Budgeting &
  forecasting". Splitting forecasting out of statistics is a naming decision for both role sets.
- Three negotiation skills by context (deals, sales, suppliers) are kept apart: the work differs. The other
  overlapping pairs were merged or separated on 2026-10-11.
- Company blurbs at banks and asset managers ("we provide capital markets and wealth solutions") still trip
  capital markets, wealth advisory, investment research and client coverage in non-investing roles there.
- A few employers dominate some roles (Amazon is a quarter of operations managers), so those shares lean on
  one template.
- Small roles: venture capital associate (18 postings), the three real-estate roles (119 together), M&A
  integration (35), digital transformation (35). Their percentages swing on a few postings.

**Model audit (2026-10-11).** `skill_audit.py` put 3,600 judgments to the model: for each of the 180 skills,
10 postings the patterns tagged and 10 untagged postings from the skill's main roles. First pass: the model
accepted 75% of tagged samples; 17 skills were under 50%. The false matches were mostly bare words that are also
employers or everyday terms ("Meta, Google" in alumni lists for ad platforms; "regulators" as an audience;
"MarTech"; "land" inside "landscape"), page-footer headings (ITAR), perks blurbs (learning stipends, events) and
one employer's boilerplate repeated across its postings. 42 skills were tightened and 8 given phrasings the
model found in untagged postings. Recomputed against the same answers: 82% accepted, 5 skills under 50%, the
missed share 33% -> 30%. See [extraction_audit_mba.md](extraction_audit_mba.md).

Read the 82% with care: the patterns were fixed on the same sample that measures them, so it is optimistic. A
fresh sample (a new `--seed`, new model calls) gives the honest number. Ten flagged skills were left as they
are: the model rejects a tool named in the qualifications (BI tools, procurement platforms), or the posting
mentions the thing without the person doing it (transformation programmes, another team's name). About 21
skills show a high missed share because the model infers the skill from the role; nothing in the posting names it.

## Role held counts as evidence (2026-10-11)

Branch `feat/held-role-scoring`. A staff PM put a real resume in and read 42% against entry-level product roles.
The sample resumes did not show the problem (the experienced sample, retitled staff, read 81% there), so the
cause is how real senior resumes are written: short lines, outcomes, few posting nouns. The new sample
`staff_pm_terse` reproduces it: eleven years in product, 19% against associate roles, 5 of 24 requirements read.

**Rule.** A person who held the target role family for a year or more, at the target level or above, was
qualified to hold it. A requirement their resume does not show is then *presumed*, not a gap.

- Credit is below a line of evidence (1.0), so adding the line always raises the score: 0.75 for what most
  postings at the level they held ask for and 0.6 for the rest of the target's core and common asks, when they
  held a level above the target; 0.6 and 0.4 when they held the same level (there, only what postings at that
  level ask for is presumed). Plus 0.1 when their own employer's postings ask for it.
- The employer is read from the role line and matched to the companies we hold postings for (five or more
  postings in the family). Then the bar comes from that firm, not from the market average.
- Never presumed: the industry slot, and AI literacy (a recent ask that years in the role do not imply).
  Differentiators are not presumed either.
- No presumption for students, pivoters, internships, or a level above the one held.

**Result.** `staff_pm_terse`: 19% -> 66% against associate, 24% -> 70% against senior, 23% -> 57% against staff,
with 18 to 20 requirements shown as presumed and the headline saying the role was held above the level.
`experienced_pm`: 83% -> 87% at senior. Student and pivoter samples do not move. The runner checks a floor for
every target where a role was held (60% above the level, 50% at it). 193 checks pass.

**Open.** The employer rule has no eval sample yet (no sample names an employer we hold postings for). The
credit values are a first setting; tune them on real resumes in `evals/resumes/private/`. Presumption covers the
six product families only until the MBA role set has a graph. The real resume that started this is not in the
samples yet.

### The real resume (2026-10-11, same branch)

The resume that started this then read 40% against product owner. The cause was upstream of scoring: the parser
read **no roles at all** from it (zero years, "early-career, new to product"), so nothing held could count. It
is a one-page PDF in a common layout that none of the samples had:

- dates written `05/2025 – 04/2026` (the date pattern knew month names and bare years only);
- the employer in capitals on its own line above several roles;
- bullets wrapped onto a second line, which read as separate lines;
- hyphens spaced out by the PDF text layer ("purpose - built", "self - learning");
- a "Technical proficiency" heading.

The parser now handles each of these. Two more rules: a product manager counts as having held the product owner
role (`COVERS`), and an employer line in capitals is matched to our companies in any case. Resume patterns added
for direct reports and for a named metric that moved (NPS, ARR, handling time).

Result on that resume: product owner (senior) 40% -> 69%, product manager (senior) 47% -> 78%, entry-level
51% -> 85%; read as senior with 5.6 years in product and American Express recognised. Against staff roles it
reads 48%: nothing is presumed above the level held. The resume itself stays in `evals/resumes/private/`
(gitignored). `senior_pm_pdf_layout` is a synthetic sample with the same layout and an employer we hold postings
for, so the layout and the employer rule are both guarded. 220 checks pass.

### Real sample resumes, the reader and calibration (2026-10-11 to 12, same branch)

**Why.** Samples we write ourselves cannot show the layouts we did not think of. 299 published sample resumes
were found for the indexed roles (`external_sources.json`); 21 from universities and professional bodies are
fetched by script, 157 from resume sites were downloaded by hand (their terms forbid automated retrieval), and
70 web pages were saved as text. The files stay in a gitignored folder. Real people's resumes are left out.

**What they broke.** On the web-page set the reader got the job title right on 7 of 70. Resume builders put
title, employer, city and dates each on a line of its own; two-column pages and Word text boxes bunch the
headings together; narrow columns break a date range in two; one employer line carries the dates for several
roles. The reader now anchors a job on its dates and looks for the title on that line, up to three label lines
above or two below. 82 single resumes have expectations written by reading them first; all pass. Parse health
over 239 single-resume files: 210 read with no flag.

**Known misses.** Placeholder years ("20XX"), a year split by the PDF ("20 21"), resumes with no dates, a column
of dates printed apart from job lines that carry none, lost ligatures ("So ware").

**Calibration** ([calibration.md](calibration.md)). The role a sample was written for is the answer key. Same-role
resumes score a median of 64% against their own product role, adjacent-role 34%, other-field 22%; the score ranks
same-role above other-field 95% of the time. Bands of fit come from those distributions with bootstrap
intervals, not from round numbers. The interface should show the band, not the percentage.

**Level read.** Years alone now reach senior; lead needs a title that says so; a current associate or junior
title holds the read at mid. The publishers' seniority labels are too loose to score this well: a ten-year
"Product Manager" sample is labelled mid.

**Open.** A resume's own role is its top-scoring product role in about two of three cases: product manager and
product owner requirements overlap heavily. The samples are tidier than real resumes, so real ones sit lower in
each band. Only product roles can be scored until the MBA role set has a graph.

## The reader and the matcher on the 50 MBA roles (2026-10-11 to 12)

Branch `feat/mba-resume-matcher`. Goal: read resumes written for the MBA roles as well as product resumes, and
measure it on published samples. Steps 1 to 4 below are done. Step 5 (scoring and bands for the MBA roles) waits
for the MBA graph (`web/data/graph_mba*.json`), which did not exist when this branch was written.

**1. Coverage.** 258 sample files are on the machine (248 before; ten more fetched from university pages). After
reading each file, 18 of the 50 roles have three or more files, a PDF or DOCX, and an early and a senior sample.
The publishers' seniority labels were wrong often enough that the count uses the seniority read from each resume.
196 more published samples were found for the thin roles (`external_sources.json`, 495 entries). Most are on
resume sites and must be downloaded by hand. Twelve university samples are marked `ask`: the page calls the file
a sample and does not say that the person is invented, so nothing is fetched until the owner decides. No source
was found for an early M&A integration sample or a senior governance sample.

**2. Reading.** Every single-resume file now has parse expectations, written from the file's text before the
reader ran on it (244 files; 9 more are templates). The five packets are cut into their 37 resumes by line range
(24 with real dates). 250 of 269 parse expectations pass; before this branch the same expectations gave 211 of
260. Parse health: 252 of 268 read with no flag (210 of 239 before). One class of layout at a time:

| layout class | seen in | change | layout variant |
|---|---|---|---|
| Ligatures set apart by the PDF ("pro fi t", "for   fi nance") | 71 files | joined | `ligatures_split` |
| A line that only starts like a heading ("Project planning" in a skills list, the start of a wrapped bullet) | 73 distinct lines | a heading is made of heading words | (guarded by the samples) |
| A side column's heading inside the work history (Word text boxes, two-column PDFs) | 10 expectations | a dated job title under Summary, Skills or Education is a job | `side_heading_inside_jobs` |
| Dates in a column apart from the job lines | 3 files | dated entries with no title are paired, in order, with undated "title, employer, place" lines | `dates_in_a_column` |
| Placeholder years ("20XX") | 8 files | read as dates; the job has a title and no years; the result page says so | sample `template_placeholder_years` |
| A year split in two ("Summer 20 24") | 2 files | joined | `dates_year_split` |
| Only a place beside the dates ("2019 - 2023 / Detroit, MI"), titles with no manager word (teller, processor, buyer) | 8 expectations | the place is not a title; more job nouns | `dates_with_place` |
| Schooling printed away from its heading | 14 expectations | a degree written out is read anywhere; dates beside a school and no title are not a job | (guarded by the samples) |
| Seasons and short ranges ("Fall 2021 - present", "May – August 2025") | 4 expectations | read as ranges | (guarded by the samples) |

The layout check is stricter now: a variant must evidence the same skills as the original, not only the same
roles, years and score. That showed a false tag in the product samples: a word in an employer's name counted as
a skill ("Beta Apps" gave quality testing). A job line is now read for skills by its title only.

**Held-out measure.** The ten files fetched late in the branch were read by a person first and then by the
reader, with no tuning in between: one of nine passed. After three general fixes, five of nine pass. The 250 of
269 above is measured on files the reader was tuned on, so it is optimistic. New files from the download list
give the next honest number.

**Second held-out round (2026-10-12, branch `data/accepted-university-samples`).** The owner accepted the twelve
university samples that waited under `ask`. Eleven are resumes with real dates and one is a template. Read by a
person first, then by the reader with no tuning: 8 of 11 pass, against 1 of 9 in the first round. The three that
fail are left failing: every year split three and one by the PDF ("Feb 201 6"), all dates in one block at the end
of the page, and an employer line that carries the dates of the stay and a title of its own. With them, 258 of
280 parse expectations pass on 270 files. `fetch_external.mjs` could not reach the UConn host (the request failed
in node; the same single request with curl worked), so those three files were fetched with curl.

**Known misses (19 expectations failed at the merge of the first branch).** Words and month names broken letter by letter by the PDF ("Dece m b er
2011"); a year split three and one ("Jan 202 2"); a ligature lost as a NUL character ("So ware"); a title printed
below its bullets, or apart from its employer by another job's bullets; a functional resume with twelve one-line
jobs; a page header ("Name | Page 2") inside a job; dated publications, courses and memberships read as jobs;
resumes with no dates (four files). They are in `external_expectations.json` and fail by name in
`node evals/run.mjs --external`.

**3. Skill expectations.** 130 resumes, two or three per role, each have `must_evidence` and `must_not_tag`
lists against the MBA taxonomy (1,238 and 807 checks), written by reading the resume. They run with a matcher
built on `pipeline/taxonomy.json` as the MBA role set sees it. With posting patterns alone the matcher found 871
of 1,238 (70%) and held 649 of 807. After a pass of resume-language patterns and drops driven by the failures:
1,022 (83%) and 672 (83%). What is left: skills shown by meaning with no fixed wording (performance improvement,
client work), course lines and skills lists counted as evidence for experienced people,
and reader judgment calls ("strategic partnerships" with agencies). The 135 false tags and 216 misses are listed
per sample by the runner. A certificate or licence now counts wherever it is listed; a line under Interests,
Awards or Languages is a mention, not evidence.

**4. Role families in resumes.** `createMatcher` takes `roles`: for each family an id, a label, title patterns,
optional patterns that rule a title out, and `covers` (the families a person is taken to have held when they
held this one). Each job gets `roleFamily`; the read of a person (in the role, pivoter, new to the role) and the
presumption of skills are relative to the family asked about when it is not a product family. Product reads do
not change. A title that is only a grade ("Associate") is read with its employer line.
The branch was written against a stand-in copied from `pipeline/roles_mba.py`; at the merge the evals moved to
`web/data/roles_mba.json`, with the same results, and the stand-in was deleted. `evals/resume_titles.json` holds 156 resume titles with the family each
must get: 149 pass, 7 are marked `known_gap` (a consultant or a bare grade at a firm whose business is the role,
which the posting side reads from the employer's category; "Associate Strategy Manager" read as analyst;
"Strategic Planning Analyst" read as manager; "Growth Marketer"; "Asset Manager"). On the samples themselves, the
role a mid or senior sample was written for is read from one of its job titles in 129 of 191. Most misses are
neighbouring titles (a "Business Analyst" sample filed under business analytics manager).

**Product results.** `node evals/run.mjs`: 444 pass (272 before, plus new variants, a sample and the title
eval). Sample scores in `baseline.md` do not move; `experienced_pm` loses one false tag. `calibration.md` now
counts 263 resumes (packet parts and new files included): bands 34%, 50% and 69% (70% before), same-role above
other-field 95% of the time, above adjacent-role 88% (89%).

**Open, for the owner.**
- Level from a bank or consulting grade on a resume ("Vice President" at a bank is mid-career). The posting side
  knows the employer's category; a resume does not. Not handled.
- Course lines count as evidence at every level. Right for a student, generous for a director.
## The MBA graph and its evals (2026-10-12)

Branch `feat/mba-graph`. Data layer only: `pipeline.build_graph --roles mba`, `web/data/roles_mba.json`, and the
evals for titles, levels, countries, golden postings and integrity (`evals/run_pipeline.py`). The interface is not
designed. `web/match.js` and `web/app.js` were not touched. Design in [PLAN.md](../PLAN.md), usage in
[README.md](README.md).

**Order of work.** Labels first: 629 titles, 280 locations and 99 postings were labelled by readers that did not
see the code. Then the rules were run on them. That order found what follows.

**What the labels found.**

- **Country.** The old reader placed 28 of 276 locations wrongly. "US - Remote" had no country. A state
  abbreviation anywhere made a posting American ("PARIS LA DÉFENSE", "IN - Bengaluru, India", "DE - Munich").
  Country codes were not read. SuccessFactors postings (2,300, EY among them) have no location field; the city is
  in the URL. The new reader (`pipeline/geo.py`) is used for the MBA set only. Result: 21,586 -> 22,378 US
  postings; 68 postings have no location, down from 2,368.
- **Titles.** 31 sure labels disagreed with the rules. Sales enablement, sales operations and sales compensation
  were sales managers. A hotel general manager, a supply-chain software engineer and an auditor "for investment
  banking" each got a role. At consulting firms, practice titles went to whatever general rule matched first
  ("Strategy Associate" at Bain was a corporate strategy analyst); the firm's rule now goes first. Management
  consultant grew from 845 to 1,057 US postings. "Investment Banking Associate, M&A" was corporate development.
- **Levels.** 39 sure labels disagreed. An analyst read as mid-level on the corporate ladder. "Chief of Staff"
  read as `staff` (the word) and "Chief of Staff to the Head of X" as VP. "Assistant Brand Manager" read as mid. A
  principal at a fund read as `staff`, and "Associate Partner" as partner. The three ladders are now explicit
  lists in `pipeline/roles_mba.py`. Banks in the Fortune list with no employer category (State Street, PNC, BNY)
  use the bank ladder by Fortune's industry label. Entry-level postings rose from 1,105 to 1,566.
- **Golden postings.** The tagger finds 85% of the skills a reader says a posting asks for and tags 15.5% of the
  hard negatives (skills a keyword could wrongly assign). Most missed: people management, synthesis and
  recommendations, process improvement. Most wrongly tagged: capital markets, AI/ML, energy, healthcare. Many of
  these are shared skills, so fixing them moves the product map. No pattern was changed in this round; the
  per-posting list is in [pipeline_baseline_mba.md](pipeline_baseline_mba.md).

**What the integrity checks found.**

- **The cleaner deleted whole postings.** Some boards send a posting as one line. Any boilerplate phrase then
  removed all of it: 966 MBA postings (AMD, PepsiCo, Ulta, ZS) kept under 30% of their text and 186 US postings had
  no skills. Long lines are now cut into sentences first, for the MBA set. 98 product postings have the same
  defect; the product path is unchanged in this branch because the fix moves the product graph.
- **The 5% cap was not 5%.** Cutting a large employer lowers the total, so its share rose again, to 8% in some
  roles. `pipeline/balance.py` now solves for the limit. A role with fewer than 20 employers cannot meet 5%;
  there every employer is cut to the same weight, down to three postings.
- **Two employers were in the registry twice** (Coterra Energy pointing at Devon Energy's board; J.M. Smucker
  under two names). The URL guard kept each posting once, but under the wrong name for Coterra.
- **The matcher looks at the first posting of a graph** to see how skills are stored. A first posting with no
  skills left every posting unread. The build now puts postings with no skills last in a role file.

**Choices and what each costs.**

- *One file per role.* Small loads and no file consequence for grouping. Cost: 50 files change on a refresh, and
  a view across roles loads many files (all of them: 22 MB).
- *One level scale, names per ladder.* The matcher keeps one order of levels. Cost: a bank VP and a consulting
  Manager are treated as the same seniority, which is a convention, not a fact. The corporate ladder puts
  "Senior Analyst" at mid-level and "Associate Director" at `group`.
- *Shares weighted in the index; the matcher counts postings unweighted.* Until the matcher uses `w`, its
  requirement tiers for a role lean on large employers and can differ from the shares the index shows.
- *"Defines the role" by rule* (80% of the role, 2.5 times elsewhere). 27 of 50 roles have at least one such
  skill. Cost: a role with a broad field (program manager, brand manager) has none, and a credential can be
  one ("Consulting / banking / finance background" for consultants).
- *Unsure labels are not counted.* 196 of 629 titles. Cost: the hard cases are the ones left out.
- *Rules were fixed on the labelled sets.* "All pass" is optimistic; a fresh sample gives the honest rate.
- *Puerto Rico is its own entry*, so its postings are not shown (confirmed on 2026-10-12: the 50 states and DC). Postings whose location is only "Remote" (282)
  have no country and are not shown.
- *Covers: confirmed on 2026-10-12.* Seven pairs, each the same function with the covered role narrower or junior
  (strategy manager covers strategy analyst; strategic finance and financial manager cover FP&A; product manager
  covers product strategy; procurement covers strategic sourcing; transformation covers digital transformation;
  business analytics covers business intelligence). A data test did not help: most roles' postings ask for most
  of another role's core skills.

**Changes the matcher needs to use this graph well (not made here).**

1. Use each posting's weight `w` in `shares()`, so requirement tiers are company-balanced like the index.
2. Decide how skills are stored from any posting, not from `jobs[0]`.
3. Treat a role's `defining` skills as given for someone targeting that role (as the industry slot is), not as
   requirements with gaps.
4. Read `covers` from `web/data/roles_mba.json`. Its entries have `patterns` and `exclude` as lists and `covers`
   as "holding this role counts as holding those".
5. Use the employer's category and the ladder when reading a resume title: "Associate" at a bank is mid-level,
   "Vice President" is senior. `roles_mba.json` has `employers`, `employer_rules` and `ladders.*.grades` for this;
   `evals/roles_mba.mjs` shows the order of the rules.
6. Show a level by its ladder's name (`ladders.<ladder>.levels`), not by `level_labels` alone.
7. `SOFT`, the AI group and the `domain` cluster are product choices. For the MBA roles, decide which clusters
   form the industry slot (the taxonomy has `domain`; `real_estate` and `deals` behave like industries too).
8. Load the index and role files on demand (`evals/graph_mba.mjs` is the pattern); taxonomy and sub-skills
   come from `taxonomy_mba.json` and `subskills_mba.json`.

**Open.** Skill depth for the 180 MBA skills is proposed in PLAN.md and not built. The golden postings have one
reader each. The product map still has the one-line cleaner defect and the old country reader.

## Scores and bands for the MBA roles (2026-10-12)

Branch `feat/mba-calibration`. Step 5 of the resume work, done when the MBA graph landed.
`node evals/calibrate.mjs --roles mba` scores 274 published samples against the 50 roles (US postings, all levels)
and writes [calibration_mba.md](calibration_mba.md). 251 samples were written for one of the 50 roles. Adjacent
roles are the other roles of the same group (the 11 groups of `web/data/roles_mba.json`).

**What the score does.** Same-role scores have a median of 61%, adjacent-role 35%, other-field 23%. A same-role
score is above an other-field score 86% of the time and above an adjacent-role score 75% of the time. For the
product roles the same two numbers are 95% and 88%: the score separates less well here. A resume's own role is
its top role of the 50 in 124 of 251, and its top role is in its own group in 174 of 251.

**Bands, all 50 roles together.** From the distributions, with bootstrap intervals: related background from 33%
(32% to 35%), in range from 55% (48% to 58%), reads like people in the role from 72% (71% to 73%). The product
bands are 34%, 50% and 69%.

**The role held carries most of the same-role score.** The matcher read the role as held in 144 of the 251
same-role resumes. Their median score is 71%. The median of the other 107 is 36%, close to an adjacent-role score.
So a same-role resume scores high mainly when one of its job titles is read as the role, and the title rules were
written for postings: they miss neighbouring resume titles (see the section above: 129 of 191). The floor the
runner checks holds in 139 of 144.

**By group.** Finance, banking and investing, marketing and product separate same-role from other-field well
(92% to 97%). Operations and general management (72%) and consulting and strategy (79%) are weaker: their postings
ask for general skills that most resumes show. Risk and compliance does not work yet: the same-role median is
30% and it separates from other fields 68% of the time. Nine of its thirteen samples are law-school compliance
resumes of students and career changers, so this is as much the samples as the matcher. Product and analytics
separate poorly from their adjacent roles (62% and 58%), as the product roles did: the roles in those groups ask
for nearly the same things.

**Cut points by group** are in the file. Their intervals are wide (the middle cut for product runs from 20% to
63%), because a group has 13 to 45 same-role resumes. One set of bands for all 50 roles is the defensible choice
today; the per-group table says where that set fits badly.

**Level.** The level read against a sample's own role agrees with the seniority read from the resume in 165 of
251. When the role is not read as held, the read falls back to years of work and the early or pivot rule.

**Open.**
- Resume-side title reading for the MBA roles (employer categories, neighbouring titles). It decides whether the
  role is read as held, and so most of the score. `evals/roles_mba.mjs` already reads employer categories for
  postings; the matcher does not use them yet.
- Risk and compliance needs samples of people who hold the role, and then a second look.
- One set of bands or a set per group: the owner's decision. The interface should show the band, not the
  percentage.

