# Extraction baseline: regex vs model judgment on 200 random PM postings (seed 7)

Produced by `pipeline/experiments/decisions_audit.py` (lenient prompt, plus `--strict`) and `decisions_compare.py`. Model answers were recorded once on 2026-10-10; after a taxonomy change, rerun with `--reuse data/experiments/decisions_results.jsonl --tag after` to recompute only the regex side (no API calls) and regenerate this file. Raw answers live in `data/experiments/` (local, gitignored).

## Change from the tagging-bugs pass (2026-10-19)

Four patterns tightened after the review of real passages for the game Spot the real ask (PR #43) found false positives in the answer key. The product set has 8,765 postings; the MBA set 46,560.

1. `apis` ("APIs & integrations"): the bare word "integration" needs a software, system or API context on one side ("system integration", "integration with Salesforce", "integration points"); the plural "integrations" keeps the product sense unless the merger words are next to it. "M&A, integration, separation", "IT integration efforts related to mergers" and the title "M&A Integration Manager" no longer match. Postings tagged: product 3,200 -> 2,855, MBA 7,676 -> 5,689; the lost matches read by eye were merger, hardware, process and "work-life integration" senses.
2. `genai_llm`: "agent" needs an AI context ("AI agents", "agent frameworks", "building agents", "humans and agents"). "Enrolled Agent", insurance and real-estate agents, "change agent" and call-centre agents no longer match. Product 3,087 -> 2,968, MBA 8,917 -> 8,135.
3. `ownership`: the noun "entrepreneur(s)" and "entrepreneurship" are gone; "entrepreneurial" stays as a trait and not before a company word ("entrepreneurial environment", "the entrepreneurial ecosystem"). Product 6,858 -> 6,833, MBA 31,737 -> 30,828 (634 of them one EY boilerplate line).
4. Degrees: the text is normalised for matching so the typographic apostrophe (’) reads as ' (3,046 MBA and 617 product postings said only "Master’s"); `degree in X` does not count as a bachelor's after master's, MBA, graduate, advanced or PhD; "undergraduate degree" is not a graduate degree; "MS Office", "MS Excel" and the other Microsoft tools are not a master's. `bachelors` product 4,560 -> 4,530, MBA 27,109 -> 26,951; `masters_mba` product 1,913 -> 2,277, MBA 12,686 -> 12,939.

On the 197 sampled postings, regex-only cases go from 431 to 424 and agreed cases from 4,090 to 4,086. The saved answers cover no credential skill, so the degree patterns do not appear here; `ownership` did not move on this sample. Skills whose regex share moved:

| skill | cluster | regex before | regex after | model (lenient) | regex-only before | regex-only after |
|---|---|---|---|---|---|---|
| APIs & integrations | technical | 40% | 37% | 34% | 23 | 17 |
| Generative AI / LLMs & agents | technical | 40% | 38% | 44% | 7 | 6 |

## Change from the role-set pass (2026-10-11)

Three things changed for the product set.

1. One job board is now one employer. This removed 399 double-counted postings; 3 of the 200 sampled postings fell out and 197 remain.
2. Eight patterns that fired on everyday phrasing outside product work were anchored: `sigma` (Six Sigma), `schedules` (work and shift schedules), `partnership` ("in partnership with"), `retention` (employee and records retention), `commercial` (commercial banking and lending), `survey` (salary surveys), `integration` (merger integration) and `forecast` (budget and revenue forecasts, which are finance work).
3. The cleaner now drops the employer's own description ("X is a leading global ...") before tagging.

Regex-only cases across all skills go from 457 to 431. Cases where regex and model agree go from 4,121 to 4,090: the lines removed carried as many accepted matches as rejected ones, because a company description can name a skill the role also asks for elsewhere. Skills whose regex share moved:

| skill | cluster | regex before | regex after | model (lenient) | regex-only before | regex-only after |
|---|---|---|---|---|---|---|
| Product strategy | craft | 65% | 64% | 98% | 0 | 0 |
| Customer obsession / user empathy | craft | 52% | 52% | 91% | 1 | 1 |
| Product sense & judgment | craft | 26% | 25% | 99% | 0 | 0 |
| UX & design collaboration | craft | 37% | 37% | 56% | 12 | 12 |
| Pricing & packaging | gtm | 25% | 24% | 19% | 15 | 14 |
| Go-to-market strategy | gtm | 36% | 34% | 60% | 8 | 7 |
| Partnerships & ecosystem | gtm | 27% | 21% | 44% | 14 | 8 |
| Surveys & feedback loops | discovery | 14% | 13% | 41% | 3 | 2 |
| Statistics & forecasting | analytics | 17% | 16% | 47% | 7 | 7 |
| APIs & integrations | technical | 41% | 40% | 34% | 24 | 23 |
| Systems & architecture | technical | 46% | 44% | 71% | 9 | 9 |
| Generative AI / LLMs & agents | technical | 42% | 40% | 44% | 9 | 7 |
| Networking & connectivity | technical | 6% | 6% | 10% | 4 | 3 |
| Automotive, autonomy & robotics | domain | 9% | 7% | 3% | 12 | 9 |
| Payments, fintech & banking | domain | 29% | 29% | 23% | 17 | 16 |
| E-commerce, retail & marketplaces | domain | 21% | 19% | 13% | 18 | 14 |
| Enterprise SaaS & B2B | domain | 34% | 33% | 36% | 19 | 17 |
| Adaptability & fast-paced environments | leadership | 61% | 60% | 84% | 12 | 12 |
| Collaboration & teamwork | leadership | 73% | 72% | 100% | 0 | 0 |
| Customer & executive-facing engagement | leadership | 15% | 14% | 62% | 3 | 3 |
| Program & project management | delivery | 41% | 37% | 99% | 1 | 1 |
| Execution & delivery | delivery | 73% | 73% | 100% | 0 | 0 |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) | tools | 6% | 5% | 17% | 5 | 4 |
| AI tooling in daily work | tools | 24% | 23% | 21% | 20 | 18 |

## Change from the precision/recall pass (2026-10-10)

Regex share before and after the taxonomy edits, with the lenient model share for reference. "Regex-only" = postings the regex tags and the model rejects (the false-positive proxy). Sorted by size of change; skills that moved under 3 points are omitted.

| skill | cluster | regex before | regex after | model (lenient) | regex-only before | regex-only after |
|---|---|---|---|---|---|---|
| Automotive, autonomy & robotics | domain | 43% | 9% | 3% | 81 | 12 |
| Personas & segmentation | discovery | 31% | 9% | 34% | 31 | 4 |
| Consumer products & B2C | domain | 38% | 16% | 27% | 38 | 9 |
| Regulated industries & compliance | domain | 44% | 22% | 38% | 25 | 5 |
| PRDs & requirements writing | craft | 24% | 43% | 63% | 1 | 2 |
| Product strategy | craft | 47% | 65% | 98% | 0 | 0 |
| Product launches | craft | 21% | 38% | 72% | 2 | 2 |
| Security & privacy | technical | 32% | 16% | 29% | 27 | 5 |
| SDLC, DevOps & CI/CD | technical | 24% | 8% | 11% | 33 | 5 |
| Supply chain, logistics & operations | domain | 29% | 14% | 12% | 37 | 7 |
| Vendor, budget & contract management | delivery | 20% | 5% | 9% | 27 | 4 |
| Executive communication & reviews | leadership | 9% | 22% | 59% | 0 | 0 |
| Customer success & support partnership | gtm | 26% | 14% | 28% | 19 | 5 |
| Energy, industrial & manufacturing | domain | 22% | 10% | 9% | 29 | 5 |
| Networking & connectivity | technical | 17% | 6% | 10% | 17 | 4 |
| Partnerships & ecosystem | gtm | 37% | 27% | 44% | 27 | 14 |
| Hardware, devices & embedded | technical | 24% | 15% | 11% | 31 | 14 |
| Agile / Scrum | delivery | 31% | 22% | 19% | 25 | 8 |
| AI tooling in daily work | tools | 32% | 24% | 21% | 33 | 20 |
| Product vision | craft | 24% | 32% | 81% | 0 | 0 |
| Developer tools & infrastructure products | domain | 20% | 12% | 18% | 20 | 8 |
| User research | discovery | 15% | 20% | 61% | 0 | 0 |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) | tools | 11% | 6% | 17% | 15 | 5 |
| Advertising & media | domain | 12% | 8% | 10% | 11 | 5 |
| Growth, funnels & retention | gtm | 27% | 22% | 30% | 13 | 7 |
| Positioning & messaging | gtm | 27% | 23% | 42% | 13 | 8 |
| Enterprise SaaS & B2B | domain | 38% | 34% | 36% | 26 | 19 |
| Pricing & packaging | gtm | 28% | 25% | 19% | 21 | 15 |
| Data modeling & pipelines | technical | 18% | 15% | 19% | 13 | 8 |
| E-commerce, retail & marketplaces | domain | 24% | 21% | 13% | 24 | 18 |

Regex-only cases across all skills: 889 → 457. On industry and technical skills: 533 → 238.

## Full table after the pass (regex vs lenient vs strict)

| skill | cluster | regex | lenient | strict | strict agreement | regex-only (strict) | model-only (strict) |
|---|---|---|---|---|---|---|---|
| Ownership & bias for action | leadership | 75% | 93% | 24% | 48% | 101 | 1 |
| Structured problem solving | craft | 44% | 98% | 7% | 61% | 75 | 2 |
| Systems & architecture | technical | 46% | 71% | 10% | 64% | 71 | 0 |
| AI / machine learning | technical | 66% | 57% | 30% | 63% | 71 | 1 |
| Enterprise SaaS & B2B | domain | 34% | 36% | 1% | 67% | 65 | 0 |
| Influence without authority | leadership | 47% | 98% | 15% | 67% | 64 | 1 |
| Process design & operational rigor | delivery | 38% | 84% | 6% | 68% | 63 | 0 |
| Product discovery & validation | discovery | 46% | 85% | 15% | 66% | 64 | 3 |
| Collaboration & teamwork | leadership | 73% | 100% | 42% | 59% | 70 | 10 |
| APIs & integrations | technical | 41% | 34% | 11% | 70% | 59 | 0 |
| Generative AI / LLMs & agents | technical | 42% | 44% | 14% | 72% | 56 | 0 |
| UX & design collaboration | craft | 37% | 56% | 12% | 70% | 54 | 5 |
| Adaptability & fast-paced environments | leadership | 61% | 84% | 37% | 68% | 56 | 8 |
| Risk & dependency management | delivery | 32% | 77% | 9% | 75% | 48 | 2 |
| Payments, fintech & banking | domain | 29% | 23% | 7% | 77% | 45 | 0 |
| Technical fluency | technical | 45% | 91% | 23% | 68% | 54 | 10 |
| Prioritization & trade-offs | craft | 60% | 100% | 38% | 72% | 49 | 6 |
| Go-to-market strategy | gtm | 36% | 60% | 14% | 78% | 43 | 0 |
| Cross-functional leadership | leadership | 84% | 100% | 62% | 72% | 49 | 6 |
| Stakeholder management | leadership | 65% | 99% | 44% | 73% | 47 | 6 |
| End-to-end product lifecycle | craft | 45% | 87% | 26% | 73% | 46 | 8 |
| Healthcare & life sciences | domain | 20% | 13% | 1% | 81% | 37 | 0 |
| E-commerce, retail & marketplaces | domain | 21% | 13% | 2% | 81% | 37 | 0 |
| Growth, funnels & retention | gtm | 22% | 30% | 4% | 82% | 36 | 0 |
| Statistics & forecasting | analytics | 17% | 47% | 0% | 83% | 33 | 0 |
| Customer obsession / user empathy | craft | 52% | 91% | 36% | 68% | 48 | 16 |
| Product sense & judgment | craft | 26% | 99% | 10% | 81% | 35 | 3 |
| Cloud platforms | technical | 22% | 18% | 6% | 84% | 32 | 0 |
| Regulated industries & compliance | domain | 22% | 38% | 7% | 84% | 31 | 1 |
| Positioning & messaging | gtm | 23% | 42% | 8% | 85% | 30 | 0 |
| PRDs & requirements writing | craft | 43% | 63% | 28% | 84% | 30 | 1 |
| Pricing & packaging | gtm | 25% | 19% | 10% | 85% | 29 | 0 |
| Consumer products & B2C | domain | 16% | 27% | 1% | 85% | 29 | 0 |
| Partnerships & ecosystem | gtm | 27% | 44% | 12% | 76% | 38 | 9 |
| Written & verbal communication | leadership | 76% | 97% | 61% | 84% | 30 | 2 |
| Agile / Scrum | delivery | 22% | 19% | 8% | 86% | 28 | 0 |
| Hardware, devices & embedded | technical | 15% | 11% | 2% | 87% | 26 | 0 |
| Financial modeling & analysis | analytics | 16% | 34% | 3% | 85% | 27 | 2 |
| AI tooling in daily work | tools | 24% | 21% | 12% | 81% | 30 | 7 |
| Data modeling & pipelines | technical | 15% | 19% | 4% | 89% | 21 | 0 |
| Security & privacy | technical | 16% | 29% | 5% | 83% | 27 | 6 |
| Developer tools & infrastructure products | domain | 12% | 18% | 2% | 89% | 21 | 0 |
| Surveys & feedback loops | discovery | 14% | 41% | 3% | 87% | 23 | 2 |
| Customer success & support partnership | gtm | 14% | 28% | 5% | 89% | 20 | 1 |
| People management & coaching | leadership | 20% | 17% | 11% | 86% | 23 | 5 |
| Energy, industrial & manufacturing | domain | 10% | 9% | 1% | 91% | 18 | 0 |
| Automotive, autonomy & robotics | domain | 9% | 3% | 0% | 91% | 17 | 0 |
| Supply chain, logistics & operations | domain | 14% | 12% | 5% | 90% | 18 | 1 |
| Office suite (Excel, PowerPoint, Google Workspace) | tools | 10% | 11% | 1% | 91% | 17 | 0 |
| Metrics & KPIs | analytics | 52% | 82% | 44% | 81% | 27 | 11 |
| A/B testing & experimentation | analytics | 18% | 18% | 10% | 92% | 15 | 0 |
| Personas & segmentation | discovery | 9% | 34% | 2% | 92% | 15 | 0 |
| SDLC, DevOps & CI/CD | technical | 8% | 11% | 1% | 93% | 14 | 0 |
| Market & competitive analysis | gtm | 29% | 59% | 23% | 88% | 18 | 5 |
| Advertising & media | domain | 8% | 10% | 2% | 94% | 12 | 0 |
| CRM & GTM tools (Salesforce, HubSpot, Gong) | tools | 7% | 3% | 1% | 93% | 13 | 1 |
| Execution & delivery | delivery | 73% | 100% | 67% | 64% | 41 | 29 |
| Roadmapping | craft | 71% | 86% | 65% | 92% | 13 | 2 |
| Product launches | craft | 38% | 72% | 44% | 77% | 17 | 28 |
| P&L / revenue ownership | gtm | 12% | 25% | 7% | 92% | 13 | 2 |
| Mobile platforms | technical | 6% | 4% | 0% | 94% | 11 | 0 |
| Executive communication & reviews | leadership | 22% | 59% | 17% | 86% | 19 | 8 |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) | tools | 6% | 17% | 1% | 95% | 10 | 0 |
| Business cases & ROI | gtm | 17% | 40% | 13% | 94% | 10 | 2 |
| Vendor, budget & contract management | delivery | 5% | 9% | 1% | 95% | 9 | 1 |
| Product strategy | craft | 65% | 98% | 69% | 84% | 12 | 19 |
| Networking & connectivity | technical | 6% | 10% | 3% | 93% | 10 | 4 |
| Product vision | craft | 32% | 81% | 29% | 92% | 10 | 5 |
| Customer & executive-facing engagement | leadership | 15% | 62% | 13% | 83% | 19 | 14 |
| Jira / Confluence / Asana / Linear | tools | 5% | 4% | 3% | 97% | 5 | 0 |
| Python / R / scripting | technical | 4% | 5% | 2% | 97% | 5 | 0 |
| Feature definition & scoping | craft | 7% | 92% | 9% | 90% | 8 | 12 |
| Sales enablement & field partnership | gtm | 10% | 35% | 8% | 89% | 12 | 9 |
| Telecommunications | domain | 2% | 2% | 1% | 98% | 3 | 0 |
| Program & project management | delivery | 41% | 99% | 39% | 73% | 28 | 25 |
| Data-driven decision making | analytics | 44% | 94% | 45% | 75% | 24 | 26 |
| User research | discovery | 20% | 61% | 21% | 90% | 9 | 11 |
| Quality, testing & acceptance | delivery | 11% | 50% | 12% | 89% | 10 | 12 |
| Figma / design tools | tools | 3% | 3% | 2% | 99% | 2 | 0 |
| OKRs & goal setting | craft | 3% | 25% | 4% | 98% | 1 | 2 |
| Customer interviews | discovery | 6% | 39% | 5% | 90% | 10 | 9 |
| SQL | technical | 8% | 9% | 8% | 99% | 1 | 0 |
| Experimentation & feature-flag tools | tools | 0% | 7% | 0% | 100% | 0 | 0 |

mean strict agreement 83%; skills moving ≥15 pts under strict: 30 of 83; under lenient: 44

cluster: mean strict Δ vs regex, mean agreement
  leadership   -21%   73%
  craft        -11%   80%
  technical    -16%   83%
  domain       -14%   86%
  delivery     -11%   79%
  discovery    -10%   85%
  gtm          -11%   86%
  analytics    -9%   83%
  tools        -5%   94%
