# Extraction baseline: regex vs model judgment on 200 random PM postings (seed 7, 2026-10-10)

Produced by `pipeline/experiments/decisions_audit.py` (lenient and `--strict` prompts) and `decisions_compare.py`. Raw per-posting answers are in `data/experiments/` (local, gitignored). Regenerate after any taxonomy change to see which shares move.

| skill | cluster | regex | lenient | strict | strict agreement | regex-only (strict) | model-only (strict) |
|---|---|---|---|---|---|---|---|
| Ownership & bias for action | leadership | 75% | 94% | 24% | 48% | 103 | 1 |
| Automotive, autonomy & robotics | domain | 42% | 3% | 0% | 57% | 85 | 0 |
| Public sector, regulated & compliance | domain | 45% | 39% | 7% | 62% | 76 | 0 |
| Structured problem solving | craft | 44% | 98% | 6% | 61% | 76 | 2 |
| Enterprise SaaS & B2B | domain | 38% | 36% | 1% | 64% | 73 | 0 |
| Consumer products & B2C | domain | 37% | 26% | 1% | 64% | 72 | 0 |
| Systems & architecture | technical | 46% | 71% | 11% | 64% | 71 | 0 |
| AI / machine learning | technical | 66% | 57% | 31% | 64% | 71 | 1 |
| APIs & integrations | technical | 44% | 34% | 10% | 67% | 66 | 0 |
| Influence without authority | leadership | 47% | 98% | 14% | 66% | 66 | 1 |
| Process design & operational rigor | delivery | 38% | 84% | 6% | 68% | 64 | 0 |
| Product discovery & validation | discovery | 46% | 84% | 15% | 66% | 65 | 3 |
| Personas & segmentation | discovery | 32% | 34% | 2% | 70% | 59 | 0 |
| Collaboration & teamwork | leadership | 72% | 100% | 42% | 60% | 70 | 11 |
| Generative AI / LLMs & agents | technical | 42% | 44% | 14% | 72% | 57 | 0 |
| Security & privacy | technical | 32% | 30% | 5% | 70% | 57 | 2 |
| Partnerships & ecosystem | gtm | 38% | 44% | 12% | 68% | 58 | 7 |
| Adaptability & fast-paced environments | leadership | 62% | 84% | 36% | 67% | 58 | 8 |
| UX & design collaboration | craft | 36% | 56% | 12% | 70% | 54 | 5 |
| SDLC, DevOps & CI/CD | technical | 24% | 10% | 0% | 76% | 48 | 0 |
| Supply chain, logistics & operations | domain | 30% | 12% | 6% | 76% | 48 | 0 |
| Risk & dependency management | delivery | 32% | 76% | 8% | 74% | 49 | 2 |
| Customer success & support partnership | gtm | 28% | 28% | 4% | 77% | 46 | 0 |
| Technical fluency | technical | 46% | 91% | 23% | 67% | 56 | 10 |
| Growth, funnels & retention | gtm | 26% | 30% | 4% | 78% | 45 | 0 |
| Hardware, devices & embedded | technical | 25% | 11% | 2% | 78% | 45 | 0 |
| Payments, fintech & banking | domain | 29% | 23% | 6% | 78% | 45 | 0 |
| Agile / Scrum | delivery | 30% | 18% | 8% | 78% | 45 | 0 |
| Product launches | craft | 22% | 72% | 44% | 67% | 11 | 55 |
| E-commerce, retail & marketplaces | domain | 24% | 12% | 2% | 78% | 44 | 0 |
| Prioritization & trade-offs | craft | 60% | 100% | 38% | 72% | 50 | 6 |
| Go-to-market strategy | gtm | 36% | 60% | 14% | 78% | 44 | 0 |
| Cross-functional leadership | leadership | 84% | 100% | 62% | 72% | 50 | 6 |
| Product strategy | craft | 47% | 98% | 68% | 74% | 4 | 47 |
| Stakeholder management | leadership | 66% | 100% | 44% | 72% | 49 | 6 |
| Energy, industrial & manufacturing | domain | 22% | 10% | 0% | 78% | 43 | 0 |
| AI tooling in daily work | tools | 32% | 21% | 12% | 76% | 44 | 4 |
| Positioning & messaging | gtm | 28% | 42% | 8% | 80% | 39 | 0 |
| Vendor, budget & contract management | delivery | 20% | 9% | 0% | 80% | 39 | 0 |
| End-to-end product lifecycle | craft | 45% | 88% | 26% | 72% | 47 | 9 |
| Healthcare & life sciences | domain | 20% | 13% | 1% | 81% | 38 | 0 |
| Developer tools & infrastructure products | domain | 20% | 18% | 2% | 81% | 38 | 0 |
| Statistics & forecasting | analytics | 18% | 46% | 0% | 82% | 36 | 0 |
| Pricing & packaging | gtm | 28% | 18% | 10% | 82% | 35 | 0 |
| Cloud platforms | technical | 23% | 19% | 6% | 82% | 35 | 0 |
| Product sense & judgment | craft | 27% | 100% | 10% | 80% | 37 | 3 |
| Customer obsession / user empathy | craft | 52% | 91% | 36% | 68% | 49 | 16 |
| Data modeling & pipelines | technical | 18% | 20% | 4% | 86% | 29 | 0 |
| Written & verbal communication | leadership | 76% | 97% | 62% | 84% | 30 | 2 |
| Networking & connectivity | technical | 18% | 11% | 4% | 86% | 28 | 0 |
| Financial modeling & analysis | analytics | 16% | 33% | 3% | 86% | 27 | 2 |
| Surveys & feedback loops | discovery | 14% | 42% | 3% | 87% | 24 | 2 |
| Advertising & media | domain | 12% | 10% | 2% | 90% | 21 | 0 |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) | tools | 10% | 16% | 0% | 90% | 20 | 0 |
| People management & coaching | leadership | 20% | 16% | 10% | 86% | 24 | 5 |
| Office suite (Excel, PowerPoint, Google Workspace) | tools | 10% | 11% | 1% | 92% | 17 | 0 |
| Metrics & KPIs | analytics | 52% | 82% | 44% | 81% | 27 | 11 |
| CRM & GTM tools (Salesforce, HubSpot, Gong) | tools | 8% | 2% | 0% | 92% | 16 | 0 |
| Executive communication & reviews | leadership | 9% | 59% | 16% | 90% | 2 | 17 |
| A/B testing & experimentation | analytics | 18% | 18% | 10% | 92% | 15 | 0 |
| Market & competitive analysis | gtm | 30% | 59% | 24% | 88% | 18 | 5 |
| Execution & delivery | delivery | 74% | 100% | 67% | 64% | 42 | 29 |
| User research | discovery | 14% | 60% | 20% | 88% | 6 | 18 |
| Roadmapping | craft | 72% | 86% | 66% | 92% | 14 | 2 |
| Mobile platforms | technical | 6% | 4% | 0% | 94% | 11 | 0 |
| Product vision | craft | 24% | 81% | 29% | 88% | 7 | 18 |
| P&L / revenue ownership | gtm | 12% | 25% | 6% | 92% | 13 | 2 |
| PRDs & requirements writing | craft | 24% | 63% | 28% | 82% | 13 | 23 |
| Business cases & ROI | gtm | 16% | 40% | 12% | 94% | 10 | 2 |
| Python / R / scripting | technical | 4% | 4% | 2% | 98% | 5 | 0 |
| Jira / Confluence / Asana / Linear | tools | 5% | 4% | 2% | 98% | 5 | 0 |
| Customer & executive-facing engagement | leadership | 16% | 63% | 14% | 84% | 19 | 14 |
| Program & project management | delivery | 41% | 100% | 38% | 72% | 30 | 25 |
| Feature definition & scoping | craft | 6% | 92% | 8% | 90% | 8 | 12 |
| Telecommunications | domain | 2% | 2% | 0% | 98% | 4 | 0 |
| Sales enablement & field partnership | gtm | 10% | 34% | 8% | 90% | 12 | 9 |
| Customer interviews | discovery | 6% | 39% | 5% | 90% | 12 | 9 |
| Data-driven decision making | analytics | 43% | 94% | 44% | 75% | 24 | 26 |
| SQL | technical | 8% | 9% | 8% | 99% | 2 | 0 |
| Figma / design tools | tools | 3% | 3% | 2% | 99% | 2 | 0 |
| Quality, testing & acceptance | delivery | 11% | 50% | 12% | 89% | 10 | 12 |
| OKRs & goal setting | craft | 3% | 24% | 4% | 98% | 1 | 2 |
| Experimentation & feature-flag tools | tools | 0% | 7% | 0% | 100% | 0 | 0 |

mean strict agreement 79%; skills moving ≥15 pts under strict: 47 of 83; under lenient: 42

cluster: mean strict Δ vs regex, mean agreement
  leadership   -20%   73%
  domain       -24%   76%
  craft        -7%   78%
  technical    -20%   79%
  delivery     -15%   75%
  discovery    -13%   80%
  gtm          -15%   83%
  tools        -7%   92%
  analytics    -9%   83%
