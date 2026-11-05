# Extraction baseline: the TECH role set

Produced by `pipeline/experiments/role_coverage.py` on 2026-11-05 from `data/processed/jobs_tech.json` (6,796 postings, United States; 159 skills, 61 of them specific to this role set). Shares are the fraction of a role's postings whose title or cleaned description matches a skill's patterns, with each employer held to 5% of a role. "Defines the role" lists skills on at least 80% of the role's postings and at least 2.5 times as common as in other roles: the role's own field. Roles marked * have fewer than 60 postings. Regenerate after any taxonomy change.

## Per role

| # | role | postings | employers | skills per posting (median) | role-set skills per posting (median) | defines the role | most asked beyond that |
|---|---|---|---|---|---|---|---|
| 1 | Software Engineer | 3,867 | 654 | 22 | 5 | – | Ownership & bias for action 82%, Collaboration & teamwork 70%, APIs & integrations 66%, Written & verbal communication 59%, Cloud platforms 59%, Adaptability & fast-paced environments 56%, SDLC, DevOps & CI/CD 56%, CS / engineering degree or background 54%, Systems & architecture 53%, Generative AI / LLMs & agents 48%, Cross-functional leadership 46%, Python / R / scripting 45% |
| 2 | ML / AI Engineer | 1,232 | 363 | 23 | 5 | – | Generative AI / LLMs & agents 86%, Ownership & bias for action 80%, AI / machine learning 77%, Collaboration & teamwork 67%, Python / R / scripting 66%, CS / engineering degree or background 58%, Written & verbal communication 53%, Adaptability & fast-paced environments 53%, Technical fluency 51%, Model evaluation (evals) 49%, APIs & integrations 49%, Cloud platforms 45% |
| 3 | Data Engineer | 294 | 187 | 25 | 5 | Data modeling & pipelines 99% | Ownership & bias for action 88%, Python / R / scripting 72%, SQL 71%, Cloud platforms 68%, Collaboration & teamwork 63%, Written & verbal communication 60%, Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) 57%, Cross-functional leadership 55%, Generative AI / LLMs & agents 54%, SDLC, DevOps & CI/CD 54%, Adaptability & fast-paced environments 54%, Supply chain, logistics & operations 53% |
| 4 | Security Engineer | 621 | 265 | 25 | 6 | Security & privacy 98% | Ownership & bias for action 86%, Cloud platforms 78%, SDLC, DevOps & CI/CD 71%, Written & verbal communication 70%, Collaboration & teamwork 64%, Python / R / scripting 58%, Generative AI / LLMs & agents 57%, Adaptability & fast-paced environments 57%, Detection and incident response 54%, Risk & dependency management 53%, Cross-functional leadership 52%, Hardware, devices & embedded 50% |
| 5 | Product / UX Designer | 414 | 240 | 22 | 4 | – | Ownership & bias for action 81%, Collaboration & teamwork 74%, Product sense & judgment 74%, Prototyping 73%, Written & verbal communication 72%, Adaptability & fast-paced environments 65%, Design systems 62%, Cross-functional leadership 60%, Interaction design 58%, Visual design 56%, Generative AI / LLMs & agents 55%, Execution & delivery 53% |
| 6 | UX Researcher* | 15 | 15 | 25 | 2 | Data-driven decision making 100%, User research 87% | Ownership & bias for action 87%, Adaptability & fast-paced environments 87%, Cross-functional leadership 87%, Written & verbal communication 73%, Surveys & feedback loops 67%, Collaboration & teamwork 67%, Prioritization & trade-offs 67%, Execution & delivery 60%, Roadmapping 53%, Product sense & judgment 53%, Stakeholder management 53%, Influence without authority 53% |
| 7 | In-house Counsel | 353 | 184 | 21 | 4 | JD / law degree 86% | Adaptability & fast-paced environments 85%, Collaboration & teamwork 80%, Ownership & bias for action 80%, Written & verbal communication 78%, Influence without authority 77%, Process design & operational rigor 64%, Cross-functional leadership 60%, Commercial contracts 60%, Stakeholder management 59%, Regulated industries & compliance 59%, Risk & dependency management 54%, Execution & delivery 45% |

## Per skill

| skill | cluster | all postings | asked most by |
|---|---|---|---|
| Roadmapping (shared) | craft | 20.6% | UX Researcher 53%, Product / UX Designer 23%, Data Engineer 22%, Software Engineer 22% |
| Product strategy (shared) | craft | 8.6% | UX Researcher 47%, Product / UX Designer 27%, In-house Counsel 10%, Security Engineer 9% |
| Product vision (shared) | craft | 3.9% | Product / UX Designer 18%, UX Researcher 7%, Data Engineer 5%, ML / AI Engineer 4% |
| Prioritization & trade-offs (shared) | craft | 32.9% | UX Researcher 67%, Security Engineer 42%, Data Engineer 35%, Product / UX Designer 34% |
| PRDs & requirements writing (shared) | craft | 11.9% | Data Engineer 18%, Product / UX Designer 18%, Software Engineer 13%, Security Engineer 9% |
| End-to-end product lifecycle (shared) | craft | 12.9% | Product / UX Designer 44%, UX Researcher 40%, In-house Counsel 14%, Software Engineer 12% |
| Product launches (shared) | craft | 15.2% | UX Researcher 33%, Product / UX Designer 30%, In-house Counsel 17%, Software Engineer 17% |
| Feature definition & scoping (shared) | craft | 2.5% | UX Researcher 7%, Product / UX Designer 4%, Software Engineer 3%, ML / AI Engineer 2% |
| Customer obsession / user empathy (shared) | craft | 17.7% | UX Researcher 47%, Product / UX Designer 37%, Software Engineer 19%, ML / AI Engineer 16% |
| Product sense & judgment (shared) | craft | 23.4% | Product / UX Designer 74%, UX Researcher 53%, Software Engineer 23%, Security Engineer 19% |
| UX & design collaboration (shared) | craft | 3.6% | UX Researcher 33%, Product / UX Designer 14%, Software Engineer 4%, ML / AI Engineer 1% |
| Structured problem solving (shared) | craft | 31.3% | Product / UX Designer 41%, In-house Counsel 36%, Security Engineer 34%, Software Engineer 31% |
| OKRs & goal setting (shared) | craft | 1.9% | Product / UX Designer 2%, Software Engineer 2%, Data Engineer 2%, ML / AI Engineer 2% |
| Pricing & packaging (shared) | gtm | 4.7% | UX Researcher 20%, In-house Counsel 8%, Data Engineer 7%, Software Engineer 5% |
| Go-to-market strategy (shared) | gtm | 6.0% | UX Researcher 20%, In-house Counsel 20%, Data Engineer 16%, Product / UX Designer 8% |
| Market & competitive analysis (shared) | gtm | 2.9% | UX Researcher 7%, Product / UX Designer 5%, In-house Counsel 4%, Software Engineer 3% |
| Positioning & messaging (shared) | gtm | 6.4% | UX Researcher 47%, Product / UX Designer 22%, In-house Counsel 8%, Software Engineer 6% |
| Sales enablement & field partnership (shared) | gtm | 2.7% | In-house Counsel 17%, UX Researcher 13%, Product / UX Designer 3%, Data Engineer 3% |
| Customer success & support partnership (shared) | gtm | 5.0% | In-house Counsel 7%, Software Engineer 6%, Product / UX Designer 4%, ML / AI Engineer 4% |
| Partnerships & ecosystem (shared) | gtm | 8.9% | In-house Counsel 44%, Security Engineer 11%, Data Engineer 9%, Product / UX Designer 7% |
| Business cases & ROI (shared) | gtm | 1.2% | Data Engineer 2%, ML / AI Engineer 2%, Security Engineer 2%, In-house Counsel 1% |
| P&L / revenue ownership (shared) | gtm | 3.6% | Data Engineer 9%, In-house Counsel 6%, Software Engineer 4%, Product / UX Designer 3% |
| Growth, funnels & retention (shared) | gtm | 7.9% | UX Researcher 33%, Product / UX Designer 17%, Data Engineer 13%, Software Engineer 8% |
| Customer interviews (shared) | discovery | 1.9% | UX Researcher 20%, Product / UX Designer 8%, Software Engineer 2%, Data Engineer 1% |
| User research (shared) | discovery | 3.4% | UX Researcher 87%, Product / UX Designer 32%, ML / AI Engineer 3%, Security Engineer 2% |
| Product discovery & validation (shared) | discovery | 14.1% | UX Researcher 47%, Product / UX Designer 31%, ML / AI Engineer 20%, Software Engineer 12% |
| Personas & segmentation (shared) | discovery | 3.9% | UX Researcher 33%, Security Engineer 10%, Product / UX Designer 6%, ML / AI Engineer 4% |
| Surveys & feedback loops (shared) | discovery | 7.8% | UX Researcher 67%, Product / UX Designer 13%, ML / AI Engineer 11%, Software Engineer 8% |
| Metrics & KPIs (shared) | analytics | 22.1% | Data Engineer 43%, ML / AI Engineer 28%, UX Researcher 27%, Software Engineer 22% |
| Data-driven decision making (shared) | analytics | 12.7% | UX Researcher 100%, Data Engineer 30%, ML / AI Engineer 18%, Product / UX Designer 15% |
| A/B testing & experimentation (shared) | analytics | 19.4% | UX Researcher 47%, ML / AI Engineer 44%, Product / UX Designer 24%, Software Engineer 15% |
| SQL (shared) | technical | 11.1% | Data Engineer 71%, UX Researcher 13%, Software Engineer 10%, ML / AI Engineer 9% |
| Python / R / scripting (shared) | technical | 46.3% | Data Engineer 72%, ML / AI Engineer 66%, Security Engineer 58%, Software Engineer 45% |
| Data modeling & pipelines (shared) | technical | 33.4% | Data Engineer 99%, ML / AI Engineer 39%, Software Engineer 33%, Security Engineer 22% |
| Statistics & forecasting (shared) | analytics | 11.5% | UX Researcher 33%, ML / AI Engineer 28%, Data Engineer 14%, Software Engineer 9% |
| Financial modeling & analysis (shared) | analytics | 12.4% | UX Researcher 33%, Data Engineer 15%, In-house Counsel 14%, Product / UX Designer 14% |
| Technical fluency (shared) | technical | 41.9% | ML / AI Engineer 51%, Security Engineer 46%, Software Engineer 45%, Data Engineer 34% |
| APIs & integrations (shared) | technical | 55.4% | Software Engineer 66%, Security Engineer 50%, ML / AI Engineer 49%, Data Engineer 44% |
| Systems & architecture (shared) | technical | 41.0% | Software Engineer 53%, ML / AI Engineer 38%, Data Engineer 33%, Security Engineer 19% |
| Cloud platforms (shared) | technical | 53.3% | Security Engineer 78%, Data Engineer 68%, Software Engineer 59%, ML / AI Engineer 45% |
| AI / machine learning (shared) | technical | 31.5% | ML / AI Engineer 77%, Data Engineer 35%, Software Engineer 22%, Security Engineer 21% |
| Generative AI / LLMs & agents (shared) | technical | 55.8% | ML / AI Engineer 86%, Security Engineer 57%, Product / UX Designer 55%, Data Engineer 54% |
| Mobile platforms (shared) | technical | 11.9% | Product / UX Designer 27%, Software Engineer 14%, UX Researcher 13%, Security Engineer 10% |
| Security & privacy (shared) | technical | 34.6% | Security Engineer 98%, In-house Counsel 44%, Data Engineer 35%, Software Engineer 30% |
| SDLC, DevOps & CI/CD (shared) | technical | 48.0% | Security Engineer 71%, Software Engineer 56%, Data Engineer 54%, ML / AI Engineer 39% |
| Hardware, devices & embedded (shared) | technical | 33.6% | Security Engineer 50%, ML / AI Engineer 41%, Software Engineer 33%, In-house Counsel 20% |
| Networking & connectivity (shared) | technical | 8.8% | Security Engineer 17%, Software Engineer 10%, In-house Counsel 5%, Data Engineer 4% |
| Automotive, autonomy & robotics (shared) | domain | 17.2% | ML / AI Engineer 22%, Software Engineer 18%, Security Engineer 13%, Data Engineer 12% |
| Payments, fintech & banking (shared) | domain | 21.8% | UX Researcher 40%, In-house Counsel 33%, Product / UX Designer 30%, Security Engineer 28% |
| Healthcare & life sciences (shared) | domain | 21.3% | Data Engineer 25%, In-house Counsel 24%, Product / UX Designer 24%, Security Engineer 22% |
| E-commerce, retail & marketplaces (shared) | domain | 10.2% | UX Researcher 13%, Data Engineer 13%, In-house Counsel 12%, ML / AI Engineer 12% |
| Supply chain, logistics & operations (shared) | domain | 19.5% | Data Engineer 53%, In-house Counsel 36%, Security Engineer 27%, UX Researcher 27% |
| Advertising & media (shared) | domain | 9.3% | Data Engineer 12%, ML / AI Engineer 10%, Software Engineer 10%, In-house Counsel 8% |
| Enterprise SaaS & B2B (shared) | domain | 22.7% | Product / UX Designer 40%, UX Researcher 40%, In-house Counsel 35%, Security Engineer 32% |
| Consumer products & B2C (shared) | domain | 7.3% | UX Researcher 27%, Product / UX Designer 20%, Software Engineer 7%, In-house Counsel 7% |
| Energy, industrial & manufacturing (shared) | domain | 12.4% | Software Engineer 14%, Product / UX Designer 13%, Data Engineer 11%, In-house Counsel 10% |
| Telecommunications (shared) | domain | 1.7% | Data Engineer 3%, In-house Counsel 3%, Software Engineer 2%, ML / AI Engineer 1% |
| Developer tools & infrastructure products (shared) | domain | 28.9% | Data Engineer 51%, ML / AI Engineer 31%, Software Engineer 30%, Security Engineer 26% |
| Regulated industries & compliance (shared) | domain | 20.6% | In-house Counsel 59%, Security Engineer 41%, Data Engineer 23%, Software Engineer 17% |
| Cross-functional leadership (shared) | leadership | 47.5% | UX Researcher 87%, In-house Counsel 60%, Product / UX Designer 60%, Data Engineer 55% |
| Stakeholder management (shared) | leadership | 29.1% | In-house Counsel 59%, UX Researcher 53%, Data Engineer 51%, Product / UX Designer 45% |
| Influence without authority (shared) | leadership | 26.7% | In-house Counsel 77%, UX Researcher 53%, Product / UX Designer 39%, Security Engineer 30% |
| Written & verbal communication (shared) | leadership | 60.9% | In-house Counsel 78%, UX Researcher 73%, Product / UX Designer 72%, Security Engineer 70% |
| Executive communication & reviews (shared) | leadership | 5.5% | In-house Counsel 17%, UX Researcher 13%, Security Engineer 11%, Product / UX Designer 9% |
| People management & coaching (shared) | leadership | 27.2% | UX Researcher 40%, Software Engineer 31%, Product / UX Designer 27%, Security Engineer 24% |
| Ownership & bias for action (shared) | leadership | 81.9% | Data Engineer 88%, UX Researcher 87%, Security Engineer 86%, Software Engineer 82% |
| Adaptability & fast-paced environments (shared) | leadership | 57.3% | UX Researcher 87%, In-house Counsel 85%, Product / UX Designer 65%, Security Engineer 57% |
| Collaboration & teamwork (shared) | leadership | 69.1% | In-house Counsel 80%, Product / UX Designer 74%, Software Engineer 70%, ML / AI Engineer 67% |
| Customer & executive-facing engagement (shared) | leadership | 15.3% | ML / AI Engineer 20%, Security Engineer 16%, Software Engineer 15%, Data Engineer 14% |
| Agile / Scrum (shared) | delivery | 9.8% | Software Engineer 12%, Security Engineer 8%, Product / UX Designer 7%, ML / AI Engineer 7% |
| Program & project management (shared) | delivery | 19.8% | In-house Counsel 31%, UX Researcher 27%, Product / UX Designer 24%, Software Engineer 21% |
| Risk & dependency management (shared) | delivery | 21.2% | In-house Counsel 54%, Security Engineer 53%, Software Engineer 18%, ML / AI Engineer 13% |
| Execution & delivery (shared) | delivery | 40.9% | UX Researcher 60%, Product / UX Designer 53%, In-house Counsel 45%, Software Engineer 42% |
| Process design & operational rigor (shared) | delivery | 31.3% | In-house Counsel 64%, Security Engineer 40%, Data Engineer 34%, Software Engineer 30% |
| Quality, testing & acceptance (shared) | delivery | 11.3% | Software Engineer 16%, Data Engineer 9%, ML / AI Engineer 7%, Product / UX Designer 5% |
| Vendor, budget & contract management (shared) | delivery | 6.7% | In-house Counsel 29%, UX Researcher 20%, Security Engineer 13%, Data Engineer 10% |
| Jira / Confluence / Asana / Linear (shared) | tools | 6.4% | Security Engineer 9%, Product / UX Designer 8%, ML / AI Engineer 7%, Data Engineer 7% |
| Figma / design tools (shared) | tools | 4.1% | Product / UX Designer 47%, UX Researcher 13%, Software Engineer 2%, Data Engineer 1% |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) (shared) | tools | 6.9% | Data Engineer 57%, UX Researcher 20%, Software Engineer 5%, Security Engineer 5% |
| Experimentation & feature-flag tools (shared) | tools | 1.5% | Software Engineer 2%, ML / AI Engineer 1%, Product / UX Designer 1%, Data Engineer 0% |
| Office suite (Excel, PowerPoint, Google Workspace) (shared) | tools | 4.5% | In-house Counsel 9%, Security Engineer 7%, UX Researcher 7%, Product / UX Designer 5% |
| CRM & GTM tools (Salesforce, HubSpot, Gong) (shared) | tools | 7.5% | In-house Counsel 15%, Data Engineer 12%, Product / UX Designer 7%, Security Engineer 7% |
| AI tooling in daily work (shared) | tools | 29.1% | Product / UX Designer 51%, UX Researcher 47%, Data Engineer 32%, Security Engineer 30% |
| Prior product management experience (shared) | credentials | 0.6% | Product / UX Designer 1%, Data Engineer 1%, Software Engineer 1%, In-house Counsel 1% |
| Bachelor's degree (shared) | credentials | 29.6% | Software Engineer 34%, Security Engineer 31%, ML / AI Engineer 30%, Data Engineer 26% |
| Master's / MBA (shared) | credentials | 15.7% | ML / AI Engineer 30%, UX Researcher 20%, Software Engineer 15%, Security Engineer 10% |
| PhD / research background (shared) | credentials | 11.8% | ML / AI Engineer 33%, UX Researcher 27%, Security Engineer 11%, Software Engineer 8% |
| CS / engineering degree or background (shared) | credentials | 47.7% | ML / AI Engineer 58%, Software Engineer 54%, Security Engineer 42%, Data Engineer 39% |
| Startup / scale-up experience (shared) | credentials | 28.1% | Product / UX Designer 33%, In-house Counsel 33%, Software Engineer 29%, Data Engineer 28% |
| Large-scale / big-tech experience (shared) | credentials | 19.2% | Security Engineer 22%, ML / AI Engineer 20%, Software Engineer 20%, In-house Counsel 16% |
| Consulting / banking / finance background (shared) | credentials | 5.4% | UX Researcher 13%, In-house Counsel 9%, Data Engineer 8%, Product / UX Designer 6% |
| Security clearance / citizenship (shared) | credentials | 5.9% | Software Engineer 7%, Security Engineer 6%, Data Engineer 5%, In-house Counsel 5% |
| Deep domain expertise required (shared) | credentials | 14.4% | ML / AI Engineer 20%, UX Researcher 20%, Security Engineer 14%, Software Engineer 13% |
| Employment law & HR compliance | people | 2.2% | In-house Counsel 13%, ML / AI Engineer 3%, Security Engineer 2%, Software Engineer 1% |
| Third-party & vendor risk | risk | 1.5% | Security Engineer 12%, In-house Counsel 3%, Software Engineer 0%, ML / AI Engineer 0% |
| Regulatory analysis & change management | risk | 1.8% | In-house Counsel 23%, Security Engineer 3%, Software Engineer 0%, Data Engineer 0% |
| Policy development & management | risk | 2.9% | In-house Counsel 14%, Security Engineer 12%, Data Engineer 2%, Software Engineer 1% |
| Security compliance frameworks (SOC 2, ISO 27001, NIST) | risk | 8.7% | Security Engineer 40%, Software Engineer 7%, In-house Counsel 5%, Data Engineer 4% |
| Data governance & stewardship | risk | 5.6% | Data Engineer 33%, Security Engineer 9%, In-house Counsel 6%, ML / AI Engineer 4% |
| AI governance & responsible AI | risk | 3.0% | In-house Counsel 17%, UX Researcher 13%, Security Engineer 9%, ML / AI Engineer 3% |
| Technology & cyber risk | risk | 2.8% | Security Engineer 22%, UX Researcher 7%, In-house Counsel 2%, Product / UX Designer 1% |
| Board & committee governance | risk | 1.0% | In-house Counsel 16%, Security Engineer 1%, ML / AI Engineer 0%, Product / UX Designer 0% |
| Dashboards & data visualisation | analytics | 10.9% | Data Engineer 34%, UX Researcher 20%, Product / UX Designer 13%, Software Engineer 11% |
| GRC platforms (Archer, ServiceNow GRC, OneTrust, Vanta) | tools | 0.8% | UX Researcher 7%, Security Engineer 5%, In-house Counsel 1%, Software Engineer 0% |
| BI development tools (DAX, Power Query, SSRS, Qlik) | tools | 1.1% | Data Engineer 18%, ML / AI Engineer 1%, Product / UX Designer 0%, Software Engineer 0% |
| JD / law degree | credentials | 4.8% | In-house Counsel 86%, Data Engineer 1%, Security Engineer 1%, Software Engineer 0% |
| Java / JVM languages | tools | 13.6% | Software Engineer 18%, Data Engineer 16%, ML / AI Engineer 9%, Security Engineer 9% |
| JavaScript / TypeScript | tools | 22.9% | Software Engineer 32%, ML / AI Engineer 15%, Security Engineer 14%, Data Engineer 6% |
| Go | tools | 15.4% | Security Engineer 26%, Software Engineer 19%, ML / AI Engineer 11%, Data Engineer 10% |
| C / C++ | tools | 14.6% | ML / AI Engineer 20%, Software Engineer 18%, Security Engineer 8%, Data Engineer 4% |
| Rust | tools | 8.4% | Software Engineer 11%, Security Engineer 11%, ML / AI Engineer 5%, Data Engineer 2% |
| Ruby / Rails | tools | 4.3% | Software Engineer 6%, Security Engineer 3%, Data Engineer 2%, ML / AI Engineer 2% |
| C# / .NET | tools | 3.3% | UX Researcher 7%, Software Engineer 4%, ML / AI Engineer 2%, Security Engineer 2% |
| Frontend web development | engineering | 21.1% | Software Engineer 29%, Product / UX Designer 23%, ML / AI Engineer 11%, Security Engineer 11% |
| Backend services | engineering | 26.5% | Software Engineer 37%, Data Engineer 20%, ML / AI Engineer 20%, Security Engineer 10% |
| Databases | engineering | 21.0% | Data Engineer 30%, Software Engineer 29%, ML / AI Engineer 15%, Security Engineer 4% |
| Algorithms and data structures | engineering | 10.9% | ML / AI Engineer 22%, Software Engineer 11%, Data Engineer 8%, Security Engineer 2% |
| Performance and concurrency | engineering | 19.0% | ML / AI Engineer 23%, Software Engineer 23%, Data Engineer 22%, Security Engineer 7% |
| Linux and systems programming | engineering | 17.5% | Security Engineer 23%, Software Engineer 21%, ML / AI Engineer 15%, Data Engineer 6% |
| Code review and code quality | engineering | 31.5% | Software Engineer 42%, Data Engineer 38%, ML / AI Engineer 22%, Security Engineer 21% |
| Infrastructure as code | tools | 16.9% | Security Engineer 30%, Data Engineer 25%, Software Engineer 20%, ML / AI Engineer 8% |
| Observability tools | tools | 9.0% | Software Engineer 13%, Security Engineer 9%, Data Engineer 6%, ML / AI Engineer 4% |
| Workflow orchestration (Airflow, Dagster) | tools | 6.7% | Data Engineer 50%, ML / AI Engineer 7%, Software Engineer 6%, Security Engineer 1% |
| Streaming data | data_ml | 10.5% | Data Engineer 38%, Software Engineer 13%, ML / AI Engineer 7%, Security Engineer 3% |
| Lakehouse and table formats | tools | 2.4% | Data Engineer 28%, Software Engineer 2%, ML / AI Engineer 1%, Product / UX Designer 0% |
| Deep learning frameworks | tools | 7.5% | ML / AI Engineer 31%, Software Engineer 3%, In-house Counsel 1%, Security Engineer 1% |
| Model training and fine-tuning | data_ml | 12.5% | ML / AI Engineer 45%, Data Engineer 9%, Software Engineer 6%, Security Engineer 5% |
| Model evaluation (evals) | data_ml | 15.5% | ML / AI Engineer 49%, UX Researcher 13%, Software Engineer 10%, Data Engineer 8% |
| MLOps and model serving | data_ml | 12.3% | ML / AI Engineer 37%, Data Engineer 11%, Security Engineer 9%, Software Engineer 7% |
| Inference and GPU optimization | data_ml | 7.4% | ML / AI Engineer 22%, Software Engineer 5%, Security Engineer 3%, In-house Counsel 1% |
| LLM frameworks and vector stores | tools | 7.1% | ML / AI Engineer 19%, Data Engineer 7%, UX Researcher 7%, Security Engineer 6% |
| Research publications | credentials | 2.2% | ML / AI Engineer 9%, Security Engineer 1%, Software Engineer 1%, Data Engineer 0% |
| Threat modeling | security | 4.3% | Security Engineer 37%, Software Engineer 1%, Product / UX Designer 0%, ML / AI Engineer 0% |
| Application security | security | 4.3% | Security Engineer 33%, Software Engineer 2%, ML / AI Engineer 1% |
| Detection and incident response | security | 7.0% | Security Engineer 54%, Software Engineer 3%, Product / UX Designer 2%, ML / AI Engineer 2% |
| Penetration testing and red teaming | security | 4.2% | Security Engineer 33%, Data Engineer 2%, ML / AI Engineer 2%, Software Engineer 1% |
| Vulnerability management | security | 4.2% | Security Engineer 32%, Software Engineer 2%, ML / AI Engineer 0%, Product / UX Designer 0% |
| Cryptography | security | 5.0% | Security Engineer 23%, Software Engineer 5%, ML / AI Engineer 1%, Data Engineer 1% |
| Security certifications | credentials | 2.4% | Security Engineer 22%, Software Engineer 1%, In-house Counsel 0%, ML / AI Engineer 0% |
| Interaction design | design | 4.8% | Product / UX Designer 58%, UX Researcher 13%, Software Engineer 2%, ML / AI Engineer 1% |
| Visual design | design | 4.6% | Product / UX Designer 56%, UX Researcher 7%, Software Engineer 2%, ML / AI Engineer 1% |
| Prototyping | design | 17.8% | Product / UX Designer 73%, ML / AI Engineer 29%, UX Researcher 20%, Software Engineer 13% |
| Design systems | design | 7.0% | Product / UX Designer 62%, UX Researcher 13%, Software Engineer 5%, ML / AI Engineer 2% |
| Accessibility | design | 8.0% | Product / UX Designer 22%, Software Engineer 9%, Data Engineer 7%, UX Researcher 7% |
| Design critique and rationale | design | 2.3% | Product / UX Designer 27%, UX Researcher 13%, ML / AI Engineer 1%, Security Engineer 1% |
| Design portfolio | credentials | 2.8% | Product / UX Designer 40%, UX Researcher 7%, Data Engineer 1%, In-house Counsel 1% |
| Commercial contracts | legal | 3.3% | In-house Counsel 60%, Security Engineer 1%, Product / UX Designer 0%, Software Engineer 0% |
| Product counseling | legal | 2.5% | In-house Counsel 18%, Security Engineer 5%, Software Engineer 1%, ML / AI Engineer 1% |
| Privacy and data protection law | legal | 8.2% | In-house Counsel 24%, Security Engineer 16%, Data Engineer 13%, ML / AI Engineer 7% |
| Intellectual property | legal | 4.1% | In-house Counsel 27%, Security Engineer 6%, ML / AI Engineer 4%, Data Engineer 4% |
| Corporate and securities law | legal | 2.3% | In-house Counsel 26%, Software Engineer 1%, Product / UX Designer 1%, Security Engineer 1% |
| Litigation and disputes | legal | 2.0% | In-house Counsel 30%, UX Researcher 7%, Software Engineer 1%, Security Engineer 0% |
| Managing outside counsel | legal | 2.0% | In-house Counsel 39%, Security Engineer 0%, Software Engineer 0% |
| Contract management tools | tools | 0.8% | In-house Counsel 10%, Data Engineer 1%, Product / UX Designer 0%, ML / AI Engineer 0% |

## Skills no role asks for in 3% of its postings

OKRs & goal setting, Business cases & ROI, Experimentation & feature-flag tools, Prior product management experience
