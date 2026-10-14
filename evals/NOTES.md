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
30% and it separates from other fields 68% of the time. Eight of its thirteen samples are law-school compliance
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
- The interface should show the band, not the percentage.

**Bands in use (owner's decision, 2026-10-12).** The two upper lines are shared by all roles (in range from 55%,
reads like people in the role from 72%). The bottom line is each group's own, because it is steady in every group
(intervals of two to four points) and it is where groups differ most: other-field resumes score high against
operations roles (47%) and low against banking roles (26%). Risk and compliance gets no bands until its samples
are better: its own cut points come out of order. The rule is in `calibrate.mjs`, not a list of names: a group
with too few same-role resumes or with cut points out of order gets none. `evals/bands_mba.json` holds the result
for the interface, and `Matcher.bandOf` reads it. Copying it into `web/data/` is the graph build's step.


## Postings backlog, entry-level titles and more employers (2026-10-13)

Branch `feat/postings-backlog`. The depth pilot (below) showed that about 40% of ladder rungs would be empty when
every statement must be asked for by two employers. A measurement of the gaps found the reasons were mostly ours,
not the market's.

**What was wrong.**

- **A refresh threw postings away.** `scrape --force` replaced a company's file. The median posting was 21 days
  old, so each refresh lost most of the stock. The raw files are now a backlog: a refresh adds, marks `closed`
  and never drops (`pipeline.scrape.merge`, with an eval). A closed posting is not listed as open and counts in
  the statistics for 12 months.
- **Every Workday search stopped at 40 postings.** The API gives the total on the first page only; the adapter
  read it on each page. 315 employers, and the product scrape too.
- **Campus titles got no role**: "Summer Analyst", "2028 US Analyst Program (Full-Time)", "Full-Time Analyst
  2027", "Summer Business Analyst", "Advisory Intern".
- **Bankers who cover technology were dropped**, because "technology" was an exclusion word.
- **Fortune banks and investors had no employer category**, so the bank title rules and searches never ran for
  them. Goldman Sachs had one US analyst posting.
- **17 roles had almost no entry-level postings by design**: the title rules wanted a manager word.

**Decisions (the owner's, 2026-10-13).**

- Keep closed postings; refresh weekly; US only; add the 60 employers of the sourcing plan.
- Analyst and associate grades are a role's entry level, case by case. They count for 20 roles (financial
  analyst, supply chain analyst, procurement analyst, sourcing analyst, category analyst, compliance analyst,
  risk analyst, governance analyst, operations analyst and supervisor, marketing associate, analyst and
  specialist, growth associate, HR analyst and specialist, program analyst, partnerships associate, transformation
  analyst, commercial banking analyst and credit analyst at a bank). They do not count for sales manager,
  general manager and chief of staff (`NO_ENTRY_LEVEL`): a sales associate is another job. Left out on purpose:
  buyers, planners, coordinators, assistants, hourly operations associates, accountants, plain "Business Analyst"
  and "Data Analyst".
- An MBA internship that names a function is that role at entry level ("Brand Management Intern, MBA" is a brand
  manager posting). The programme role is for titles that name none.

**Result.** Backlog 34,434 -> 45,780 raw postings (11,346 new, 2,392 closed). US postings in the graph 22,378 ->
26,887 (26,213 open). Entry-level US postings: consulting ladder 65 -> 132, bank ladder 371 -> 663, corporate
1,130 -> 2,419. Employers with US postings 1,434 -> 1,489. Title eval: 785 titles (156 new, labelled before the
patterns were written). All pipeline evals pass (2,255 checks).

**Employers.** 60 added to the list; 37 have a board we can read. Adapters for tal.net (L.E.K., CohnReznick) and
Yello (Kearney). Repaired: Two Sigma, Truist Securities, Silicon Valley Bank, LaSalle.

**Left alone, and why.**

- Boards behind a captcha or bot check: Evercore, Needham, Citadel, CBRE, Health Advances, Stephens.
- 12 board types with no adapter (list in `data/raw/registry_mba_employers_new60.json` notes).
- Parent boards that cannot be narrowed to one business: Nuveen, Publicis Sapient, Putnam, Bain Capital Ventures.
- Bare "Associate" or "Analyst" at Big Four and general advisory firms: usually tax or audit there. Boutiques
  such as Accordion lose postings to this rule.
- Three refreshes returned almost nothing and closed nothing (Bank of America, Dollar General, Deloitte). Bank
  of America's posting URLs changed, so its backlog holds old and new copies; the repost rule in `extract`
  merges those with the same title and text.

**Costs.**

- The raw files grow with every refresh and are in git.
- "Closed" means "not returned by our searches". On a search-based board a posting can stop matching a search
  and still be open.
- Resume titles follow the same rules: `evals/resume_titles.json` had "Financial Analyst", "Operations
  Analyst", "Marketing Analyst" and "Supply Chain Analyst" as no role; they are now the entry level of their role.
- `evals/calibration_mba.md` was made on the earlier graph. Rerun it (`node evals/calibrate.mjs --roles mba`).
- The product map still drops closed postings (its interface cannot hide them yet), and its next scrape will
  bring more Workday postings.

**MBA entry level is not one rung** (built on the same day: see "Entry mark" below). A strategy house hires an
MBA as Consultant or Associate (`mid`), Deloitte as Senior Consultant (`senior`), an investment bank as Associate
(`mid`); a McKinsey "Associate" is post-MBA and a BCG "Associate" is pre-MBA. The answer is a per-posting mark
from a table of firm titles, not a change of levels.

## Skill depth pilot (2026-10-12 to 13)

Branch `feat/depth-pilot` holds `pipeline/depth_gen.py`; nothing is published. Twelve skills, four per ladder,
through OpenRouter (drafter `openai/gpt-6.1-sol`, critic `anthropic/claude-haiku-5.5`), about $4 in total.

- Posting evidence gives sub-skills and rungs. It does not give build steps: they came back as duties with
  "practice" in front. Build steps need another source (plan in `data/experiments/depth/build_steps_plan.md`).
- A rung that cites one employer is true of one posting. With every statement asked for by two employers, 29 of
  48 rungs survived on the old data. With 14 sentences per level the shared part was the general part; with 40
  the drafter found shared specifics.
- The critic's "is it supported" check drops almost nothing once the draft must quote its evidence. The code
  checks and the test "can a reader tell the level from the text" do the filtering. The cheap critic agreed
  with the strong one on 128 of 130 claims after it was told that the level comes from the job title.
## Resume titles read with the employer's kind (2026-10-13)

Branch `feat/resume-title-reading`. The matcher now reads a title by all the steps of `web/data/roles_mba.json`
(the same steps as `evals/roles_mba.mjs`), not by the first step alone. A resume has no employer category, so the
matcher takes it from the job line: an employer we hold by name (176 of them), or the words of the employer's own
name ("... Capital Partners", "... Ventures", "... Consulting", "... Asset Management", "... Realty", "... Bank").
At a bank or a consulting firm the level comes from that ladder: a bank "Vice President" reads as senior, not as
a lead.

- `resume_titles.json`: 171 of 171, with 3 known gaps left (7 before). New cases include ones that must not
  match: a recruiter at a venture firm, an engineer at a consulting firm, a teller at a bank.
- Two known gaps are pattern order in the role file, for the graph thread: "Associate Strategy Manager" is read
  as the analyst role, "Strategic Planning Analyst" as the manager role.

**It did not move the scores much, and that corrects the last section.** The role is read as held in 147 of 251
same-role resumes (144 before); same-role above adjacent-role 76% of the time (75%). The other 104 break down as:
60 mid or senior samples with no job title in the family at all (a "Business Analyst" filed under business
analytics manager, a "Change Manager" under transformation), 29 early-career samples, 7 where no jobs were read,
4 internships, 4 held for under a year. So most are not title-reading misses; the person did not hold the role.

**What the breakdown shows instead.** A resume of a person who held the role shows on the page a median of 35%
of what the role's postings ask for; the 70% median score comes from the presumption. Resumes where the role is
not held show about the same share (core 40%, common 27%). Evidence reading is the weak part for these roles, for
everyone. That is the next lever: resume wording for the MBA skills, and which asks a role's postings really set.

## Reader: a third pass on known misses (2026-10-13)

Branch `fix/reader-known-misses`. 259 of 280 parse expectations pass (258 before).
- A year split three and one after a month ("Feb 201 6", "June 202 1") is joined, as "20 24" was.
- An employer line in capitals that has a title of its own (on the next line) is a job. It was dropped as "the
  dates of a whole stay" when a later job fell within a year of it.
- Under Education, a line of dates alone whose title stands on the line above is a job (two-column templates).
- Degree letters set apart by spaces ("B . S . Finance") are read.
- **One expectation was wrong and is corrected:** `compliance_universityofwi_1` has three dated jobs, not two.
  The third prints its year as "202 1"; the person who first read the file missed it, and so did the reader.

Still failing (21): letter-by-letter damage, a NUL for a ligature, a title below its bullets, all dates in one
block at the end of the page, a functional resume, page headers inside jobs, dated publications and class
projects read as jobs, and a heading glued to the end of a bullet by the PDF.

## Distinctive asks (2026-10-13)

Branch `feat/mba-skill-evidence`. Owner's decision: weigh an ask by how distinctive it is for the role.

**Why.** For 203 mid and senior same-role resumes, the asks of their own role that most often go unshown are not
role skills. They are phrases that postings of almost every role contain, tagged by loose shared patterns:
stakeholder management (asked of 203, shown by 71), prioritization (138, 6), systems and architecture (94, 5),
product strategy (149, 30), AI literacy (166, 13). The people who read 130 of these resumes marked prioritization
as shown zero times. Such an ask lowers every resume's score against every role by the same amount, so it tells
nothing about fit; and a resume that happens to say "stakeholders" looks a little like every role.

**What.** `createMatcher({ ..., distinct: { floor, full } })`. An ask's weight is its share in the role's postings
times a factor from its lift (that share over the mean share across the role families of the graph, each family
counted once). At lift 1 or below the factor is `floor`; from lift `full` up it is 1. The share shown to the user
(`w`) does not change; `weight` on each row is what the score counts. The industry slot keeps its weight. Tiers
still come from the share. Off unless passed: the product app does not pass it, so product scores are unchanged.

**Setting.** floor 0.2, full 2. Five settings were tried (floor 0, 0.2, 0.4; full 1.5, 2, 3): all gave 88% to 90%
and 76% to 77% on the two separation measures, so the setting is not tuned further. It is stored in
`bands_mba.json` (`scoring.distinct`) because the cut points hold for it alone; the interface must create the MBA
matcher with it. `run.mjs` checks the weights and that evidence never lowers a score.

**Result on the MBA roles** ([calibration_mba.md](calibration_mba.md)). Same-role above other-field 86% -> 89%,
above adjacent-role 76% -> 77%. Other-field median 23% -> 17%; same-role median 61% -> 60%. By group, above
other-field: sales 85% -> 93%, supply chain 85% -> 91%, people 82% -> 89%, risk and compliance 68% -> 83%;
operations 72% -> 69% (its roles have few distinctive asks, so little is left to score on). A resume's own role
is its top role in 119 of 251 (123 before); its top role is in its own group in 179 (176).

**Bands now.** In range from 52%, reads like people in the role from 73%; related background per group from 21%
(banking) to 40% (operations). Risk and compliance now has cut points in order, but the owner holds it back until
its samples improve; that is an explicit entry (`HOLD` in `calibrate.mjs`), no longer an effect of the numbers.

**On the product roles** (tried, not turned on): same-role above adjacent-role 88% -> 90%, above other-field 95%
unchanged, own role on top 33 -> 35 of 51. Turning it on would move the product bands and every product score,
and it is set where the app creates its matcher (`web/app.js`), so it is a separate decision.

**For the graph thread.** The cleaner fix is at the source: the shared patterns for prioritization ("prioriti"),
systems and architecture ("infrastructure", "architecture"), product strategy ("strategic direction",
"strategic planning"), stakeholder management ("stakeholder", "VP") fire on most MBA postings. The weighting
makes the score robust to that; tightening them would also clean the map.

## Courses and loose list items for experienced people (2026-10-13)

Branch `feat/course-lines-experienced`. Owner's decision. For a person who is not a current student and has three
or more years of work, a course line is a mention, not evidence, and so is a short list-like line outside any job
(five words or fewer, no number; a skills column whose heading a two-column PDF moved away). A named tool in
such a list still counts. Nothing changes for a current student ("expected", "candidate", "class of",
"graduating"), whatever their years of work, or for a pasted course list with no work history.

- False tags on the published samples: 135 -> 120 of 807. Skills correctly found: 1,022 of 1,238, unchanged.
- New sample `experienced_with_coursework` guards it: before the change it was tagged with A/B testing, AI,
  product strategy, financial modeling and go-to-market from its course list and its unheaded skills column.
- The other in-repo sample scores do not move.
- Bands. Product: 34%, 51%, 69% (the middle line was 50%). MBA: in range from 48% (52% before), like the role
  from 73%, related per group 21% to 40%. The MBA middle line is the least steady cut (its interval is 45% to
  55%); separation is unchanged at 89% and 77%.

**Known cost.** A career changer who has finished a degree and no longer writes "expected" or "candidate" loses
credit for coursework. Reading degree dates (keep the credit for two years after the last degree) would cover
that case; not built.

## Graph and interface items, third held-out round (2026-10-13)

Branch `feat/shared-patterns-product-weighting`. The owner asked for the open graph and interface items to be
done from the resume thread. This branch touches `pipeline/` and `web/data/`.

**Third held-out round.** 31 more files came from the hand list (25 early-career). Read by a person first, then
by the reader with no tuning: 26 of 30 parse expectations pass (one file is a template); on their skill lists
169 of 216 found, 154 of 174 held. Rounds so far: 1 of 9, 8 of 11, 26 of 30. Three of the four failures are one
layout: every date in a block apart from the jobs, with the education years in the same block. All parse
expectations: 286 of 311. Skill lists: 1,195 of 1,456 found, 847 of 987 held.

**Title rules** (`pipeline/roles_mba.py`). "Associate Strategy Manager" is the manager role; "Strategic Planning
Analyst" is the analyst role. Posting title eval: 778 pass. Both resume-side known gaps are closed.

**Loose shared patterns.** A shared skill can now be worded more strictly for one role set
(`"patterns_for": {"mba": [...]}` in `pipeline/taxonomy.json`; `tax.for_roles` and the extractor apply it). The
product part of the taxonomy and the product data are unchanged, byte for byte. Four skills were tried; two were
kept, because the golden postings decide:
- Systems & architecture: a bare "infrastructure" or "architecture" no longer tags it (29% of MBA postings -> 12%).
  No labelled posting lost.
- Product strategy: "strategic direction" and "strategic planning" no longer tag it (36% -> 16%). One of three
  labelled postings lost.
- Prioritization and stakeholder management were tightened and then put back. The golden postings label "strong
  prioritization skills" and "build relationships with key stakeholders" as real asks; the strict wording lost 8
  of 16 and 11 of 28 of them and pushed must-found to 83.7%, under its 85% floor. Those two patterns are not
  wrong. The ask is universal, and the weighting by distinctiveness is the answer to that.
Golden postings after the change: must found 85.0% (floor 85%), must-not tagged 15.3% (ceiling 16%).
`evals/run_pipeline.py`: 1,965 pass.

**Bands are interface data now.** `calibrate.mjs` writes `web/data/bands.json` (product) and
`web/data/bands_mba.json`, each with the scoring its cut points were made with. `web/app.js` loads `bands.json`
and creates its matcher with that scoring. The evals read the MBA taxonomy from `web/data/taxonomy_mba.json`.

**The matcher counts postings by weight.** The MBA graph gives each posting a weight so that no employer counts
for more than 5% of a role; the map's shares use it and the matcher did not. It does now (product postings carry
no weight, so nothing changes there).

**A group with no bands.** The rule was "its own cut points come out of order". After the rebuild that rule
dropped the product group, whose two roles ask for the same things, though its resumes sort well against other
fields (95%). The rule now looks at what the bands use: a group gets none when half of its same-role resumes
score below its own bottom line. Risk and compliance stays held by the owner.

**MBA calibration now** (304 resumes, 281 same-role): same-role above other-field 89%, above adjacent 76%.
Bands: in range from 52%, like the role from 73%, related per group 21% to 39%.

**Weighting for the product roles: built, measured, not turned on.** Among the six product families nothing is
distinctive (they ask for the same skills), so their baseline is the mean share across the 50 MBA roles
(`distinct.baseline`). With it: same-role above adjacent 88% -> 90%, above other-field 95% -> 96%, own role on
top 33 -> 37 of 51, bands 28% / 46% / 68%. But the sample `grad_student_new` (an MBA student with one PM
internship, the core user) scores 43% against entry-level PM roles, under its expected 45% to 70% and just under
"in range" (46%); without the weighting it scores 56%, in range. That score band is part of the spec, so the
weighting stays off for the product roles (`scoring.distinct: null` in `bands.json`) until the owner decides.
`PRODUCT_DISTINCT=1 node evals/calibrate.mjs` prints the report with it on.

**After the merge with the postings backlog (same day).** Main gained 4,500 US postings, 60 employers and
entry-level title rules while this branch waited. The code merged cleanly; the MBA data, graph and baselines were
regenerated from the merged code (26,887 US postings; `run_pipeline.py` 2,255 pass; golden must-found 85.0%) and
both calibrations rerun. MBA bands: in range from 55%, like the role from 74%, related per group 21% to 39%;
same-role above other-field 89%, above adjacent 77%. Product bands: 33%, 51%, 69%.



## Entry mark: who enters at a posting (2026-10-13)

Question from the owner: which level is "entry" for an MBA graduate? Research (2026-10-12, firm pages and our
postings) says it is not one level per ladder. So levels stay, and each posting gets a mark: `entry` (`mba`,
`pre_mba`, null), `intern` (true or false), `entry_src` (the evidence). Rules and table: `pipeline/entry_mba.json`,
`roles_mba.entry()`. Eval: `evals/entry_mba.json`, `run_pipeline.py --only entry`.

**Counts (measured, 26,887 US postings).** In brackets: postings where the posting itself says who it is for.

| ladder | MBA job | MBA internship | pre-MBA job | pre-MBA internship |
|---|---|---|---|---|
| corporate | 31 (31) | 146 (145) | 260 (260) | 289 (289) |
| bank | 161 (8) | 46 (42) | 161 (76) | 67 (67) |
| consulting | 143 (4) | 12 (3) | 71 (56) | 45 (38) |

25,455 postings have no mark. 331 employers have a marked posting, 133 an MBA mark.

**The main finding: two kinds of mark.** Only 43 full-time postings say they are for new MBA graduates.
Firms hire MBAs through the internship and through school portals. The other 292 full-time MBA marks are
grade marks: the title is the grade an MBA joins at. 109 of the 143 on the consulting ladder are Deloitte
"Senior Consultant" postings, most of them for experienced hires in one practice. 153 are investment-bank
"Associate" postings. So `entry_src` matters: `title` and `text` mean "posted for", `firm` and `category` mean
"the grade". The index gives both numbers. An interface that shows the grade marks as "MBA jobs" is wrong.

**Eval (measured).** 231 labelled rows: 172 pass, 0 fail, 1 known miss, 60 unsure rows not counted (19 of them
differ). The labels were written first by a model reader that had the spec and the research, not the code. The
rules were then written by someone who had seen the labels, on the full data. "All pass" is optimistic.

**Precision, by reading samples (measured; the reader was the author of the rules, one posting per employer).**

- Text, MBA: first read 33, 3 wrong (experienced jobs: "earned or pursuing an MBA", "may include pursuing an
  MBA", "working towards CPA and/or MBA"). Patterns tightened. Second read, new seed, 31 of 61 postings: 0 wrong;
  4 are open to MBA and other graduate students alike.
- Text, pre-MBA: first read 60, 1 wrong (a legal line with "entry level job seekers") and 2 doubtful (internships
  for master's or MBA students). Second read 45: 1 wrong (a programme for people who leave the military), 1 doubtful.
- Title, pre-MBA, full-time: about 120 titles read, about 7 doubtful (a retail store programme, a branch trainee,
  fund "Associate 2027" classes that ask for banking years, two Amazon 2027 programmes that may be for MBAs).
- Category, investment-bank Associate: 24 read with their text. The grade is right in all 24. None is written
  for new MBA graduates. 6 name an MBA as a way in. 5 ask for experience at the associate grade. After that a
  posting that asks for more than 3 years gets no mark from the default (53 postings dropped).
- A plain "MBA" in the text is not used. Only a line about a degree in progress or a graduation year counts,
  and not when the line says "preferred", "a plus", "desired" or "post-MBA".

**What the research says and our postings do not support (measured). No rule was built for these.**

- Brand management. 43 "Associate Brand / Marketing Manager" postings. The campus and internship postings say
  MBA (General Mills, Keurig Dr Pepper, Mondelez). The others ask for a bachelor's degree and 1 to 5 years, "MBA
  preferred". The title alone is not an MBA mark.
- Private equity. Fund "Senior Associate" postings ask for a bachelor's degree and 2 to 7 years; fund "Analyst"
  postings ask for 1 to 3 years. No default. One labelled row ("Private Equity Analyst", Blackstone) is a known miss.
- Big Four other than Deloitte, Accenture, asset managers, commercial banks, venture capital: no default. The
  Accenture "Consultant" postings ask for a bachelor's degree and 3 years.
- Strategy houses have a default for the analyst grade only. "Associate" and "Consultant" need a firm row.
- William Blair and AlixPartners, named in the research, were already right after the backlog change.

**Level rules changed (41 US postings move).** (1) "Sr. Associate" and "Sr. Consultant" are read as "Senior" on
the bank and consulting ladders: 40 postings go from `mid` to `senior`. (2) In a title with "MBA", a grade word
before "Program" is part of the programme's name: "MBA Investment Director Program" goes from `director` to `mid`.
Six labelled titles were added for these (`titles_mba.json`, set `entry-mark-2026-10-13`). The old title eval
still passes.

**Level rules not changed, and why.** BCG "Associate" stays `mid`: three labelled titles say so, and the mark
now says `pre_mba`. Internships stay on the lowest level; the mark tells MBA internships apart. Programmes
(`ldp`) stay `associate`: whether an MBA programme is `associate` or `mid` is a product decision. Oliver Wyman
postings on the Marsh & McLennan board stay on the corporate ladder: the ladder comes from the registry employer.

**What each choice costs.**

- Grade marks make Deloitte and the banks look rich in MBA jobs. Counter: the `posted` number and `entry_src`.
- null means "experienced hire or no evidence". A real entry job with a plain title and a text without student
  words gets no mark. Recall was not measured.
- A posting for PhD graduates only gets no mark, also where the firm treats a PhD as an MBA hire.
- A programme or an internship with no audience in title or text is read as pre-MBA. Some are for MBAs.
- `intern` misses a title where a word stands between "Summer" and the grade (2 postings).

**What stays uncertain.** The Kearney and Oliver Wyman rows rest on secondary sources (`basis` in the table).
Bain and L.E.K. have no US consultant postings in the data, so their rows are tested on written titles only.
Titles are the US autumn 2026 cycle. One reader made the labels; 60 of 231 rows are unsure.

## Build steps pilot (2026-10-13)

Branch `feat/build-steps-pilot` (on top of `feat/depth-pilot`). `pipeline/build_steps.py`, `pipeline/build_lexicon.json`,
`data/raw/build_sources.json`. Nothing is published. Output and the report are in `data/experiments/depth/build_pilot*`
(gitignored). The plan is `data/experiments/depth/build_steps_plan.md` in the main checkout.

**Rule.** Two keys, or no step. Postings choose the target: a certification, tool, document or qualification that
three employers name at entry level for the skill on the ladder. A target in the skill's own sentences is "skill"
level; a target elsewhere in the posting is "role" level and says only "postings that ask for this skill also ask
for X". A source on the allow-list (US government, regulators, certification bodies) says what the target contains.
The model picks a target, a passage and slot values; the code writes the sentence from one of eight templates
(learn, practise, prove). Fewer than three steps, or none, is a valid result.

**Measured on 12 pairs** (4 bank, 4 consulting, 4 corporate; drafter `openai/gpt-6.1-sol`, critic
`anthropic/claude-haiku-5.5`; 218 requests sent, 155 answered, $0.52):

- 143 targets pass the three-employer rule; 80 have something in the registry of 29 sources.
- 28 steps drafted, 20 final. Pairs with 3, 2, 1, 0 steps: 2, 5, 4, 1. Six drafting requests got no answer (OpenRouter
  refused them for lack of credit), so five pairs had no second request and one had no first request.
- 13 of the 20 final steps rest on a role-level target. The critic calls 7 of 20 specific to the skill, and says for
  7 of 20 that the source itself says what the target contains.
- Bank skills: the regulator's exam pages and one OCC handbook ground learn and prove steps. Series 79 needs a firm's
  sponsorship, so only the SIE and Series 63 can be a "prove" step for a student. No allowed source that may be
  quoted says what a DCF or LBO model contains; the SEC bulletin on Form 10-K grounds the input only.
- Consulting skills: no certification exists and postings name almost no document. What is left is "Learn Tableau"
  from an O*NET software list. That is the role's tool, not the skill.
- O*NET task statements are job duties. They ground no step. Its software lists name a tool and say nothing about it.
- Sites that refuse scripts were not read by script (bls.gov, dol.gov, careeronestop.org, investor.gov). FINRA forbids
  scraping; its two exam pages were read once by hand and only titles and our own words are kept.

**The eval.** `python -m pipeline.build_steps check` runs the code checks on a finished run with no model (demand,
source allow-list and reachability, skill link, template, quote, licence, vendor block-list, style, not a duty,
exam access, slots only, numbers, different kinds and targets). 12 planted faults were caught by the named check.
It reads `data/experiments/depth/`; it moves to `evals/` when steps are published.

## Depth: full run, stopped at 209 of 366 pairs (2026-10-13)

`pipeline.depth_gen --pairs all` on the refreshed data, cheap critic. The OpenRouter account ran out of credit
part-way ($25 of credit; the key's own limit is $50). Answers are cached and failed requests are not, so a rerun
sends only what is missing: 157 pairs still need a draft, about $10 at the rate so far. Nothing is published.

| ladder | pairs done | rungs kept of rungs with evidence |
|---|---|---|
| corporate | 83 | 184 of 327 (56%) |
| bank | 74 | 132 of 256 (52%) |
| consulting | 52 | 55 of 156 (35%) |

Sub-skills: 1,235 kept of 1,630; 335 dropped because their patterns match too few postings. Empty rungs: for 169
the drafter found nothing that two employers both ask; 177 could not be told from a neighbouring level; 56 failed
the critic's two-employer check. The 50% is an upper bound: some rungs of the last pairs were drafted and not
yet put to the level test when the credit ran out.

**Decided for the build steps (owner, 2026-10-13), not yet in the code.** A licence, an exam or a degree is a
step of the role and is shown once per role and ladder, not under each skill. A tool is not a target unless a
source says what to learn. A request to FINRA and the certification bodies for leave to quote their outline
topics is drafted in `data/experiments/depth/permission_request.md` for the owner to send. Consulting stays
empty until a source is agreed. Six drafting requests of the pilot got no answer (no credit); rerun
`python -m pipeline.build_steps run` when credit is there.

## The interface around journeys, step 1 (2026-10-13)

Branch `feat/ui-journeys`. The web app is rewritten as pages (`web/atlas.js`, `web/app.js`, `web/index.html`,
`web/style.css`); `web/match.js` is untouched. Decisions by the owner: a first-visit choice, three questions plus an
optional resume, Explore as fields sized by open postings with Product opening the product role set, the skill grid
(rows by share tier, two columns by level growth), the fit as a band scale, level and employer filters in the chip row
with the rest behind "More", a side panel on desktop, and no phone layout at all.

**Measured, and it shaped the grid.** Over the whole role, the share of a skill barely moves with level for most
skills. Skills asked at least 1.5 times as often in leadership postings (and in at least 15% of them) as in entry
postings: FP&A 31 of 67 skills over 10%, management consultant 22 of 64, investment banking associate 18 of 53,
marketing manager 31 of 77, supply chain 24 of 81, product manager 27 of 66. Skills asked more at entry than in
leadership: 1 to 11 per role (Office suite, pitch books, data-driven decision making). So level is a two-way split and
a filter, not an axis: a seniority axis spread the dots over nothing.

**Not built yet, for the next steps.** The three questions and the resume reader (step 2); the band of fit shown as
a four-step scale, with plain words for a group that has no bands (`bands_mba.json` `no_bands`); the course check and
the event screens (step 3); industry, employer and location filters behind "More filters" (step 4). What the matcher
does not return and the journeys need will be listed here as each step is built.

**Known.** The product set has no defining skills (`defining` is computed for the MBA roles only; the product families
ask for the same things), so no ◆ appears on product roles. The product set is one 8.9 MB file, fetched when the
Product field or a product role is opened; the Explore screen shows its count once the file arrives.

## The interface around journeys, step 2: the questions and the fit (2026-10-13)

Branch `feat/ui-fit` on top of `feat/ui-journeys`. `web/match.js` untouched.

**How the fit is made.** `Atlas.matcher(R)` creates the matcher per role the way `evals/calibrate.mjs` does: the MBA
set with `bands_mba.json` `scoring.distinct` plus a `baseline` of the mean share of each skill over the 50 roles
(computed from `by_family` in the index, so no role file beyond the one opened is loaded); the product set with the
whole product graph and `scoring.distinct` null. The target is the postings in the current view (level and employer
chips); `familyJobs` is the whole role. The band is `Matcher.bandOf(overall, bands, group)` with the group from
`bands_mba.json` `group_of`.

**The rough read on Explore** (`Atlas.roughFit`) is not the matcher's score: it is the share of a role's main asks
(share at least 0.5, plus the defining skills) the resume shows at strength 2 or more, from the index alone, plus the
roles the title reader says the person held. It ranks; it never shows a band. A role with a rough read of 0.6 or more
gets "your resume reads close to it" on the field screen. Not evaluated; it should get an eval when the fields it
picks can be compared with the full matcher's bands across the 50 roles (cost: 29 MB of role files per resume).

**What the journeys need that the matcher does not return (for the matcher thread).**
- The `__domain` and `__ai` slots come back with the names "Industry fit" and "AI literacy"; the fit screen writes
  its own plain words for them (which industries, which AI skills). A `members` list on the row would make that
  generic.
- Presumed skills have no sub-skill reading, so the skill card cannot tick their sub-skills.
- No per-course read: step 3 (check a course) will call `tag()` on the syllabus text and compare the skills found
  with the role's grid; what is missing is a reading of a syllabus as a course (a course line is a mention for an
  experienced person, see the 2026-10-13 entry above), so the course check will read the text as a student's.
- The level option is one of four ladder keys; the fit screen maps the four level steps onto them, so an MBA
  student who picks "Analyst / associate" on a bank ladder is scored at the associate bar. The entry mark
  (`entry: "mba"`) is not used by the matcher.

**Checked in the browser.** The questions, a dropped PDF (262 words read) and a dropped DOCX, the Explore chip
"Fields that fit you", the field marks, the fit screen for an MBA role (in range), a group without bands (compliance:
the notice, no verdict), a product role (different field so far), the painted grid, light and dark.
