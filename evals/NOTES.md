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
- Overlapping pairs kept for now: performance improvement / spend and cost savings; synthesis &
  recommendations / insights & storytelling; operating model design / organization design; three negotiation
  skills by context (deals, sales, suppliers).
- Company blurbs at banks and asset managers ("we provide capital markets and wealth solutions") still trip
  capital markets, wealth advisory, investment research and client coverage in non-investing roles there.
- A few employers dominate some roles (Amazon is a quarter of operations managers), so those shares lean on
  one template.
- Small roles: venture capital associate (18 postings), the three real-estate roles (119 together), M&A
  integration (35), digital transformation (35). Their percentages swing on a few postings.

**Not yet done.** The model audit of the new skills (`skill_audit.py`, 3,197 requests prepared): the OpenAI key
in `.env` had expired. Until it runs, the new patterns are checked by reading samples only.
