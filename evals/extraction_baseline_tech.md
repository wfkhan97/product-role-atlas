# Extraction baseline: the TECH role set

Produced by `pipeline/experiments/role_coverage.py` on 2026-11-05 from `data/processed/jobs_tech.json` (13,831 postings, United States; 159 skills, 61 of them specific to this role set). Shares are the fraction of a role's postings whose title or cleaned description matches a skill's patterns, with each employer held to 5% of a role. "Defines the role" lists skills on at least 80% of the role's postings and at least 2.5 times as common as in other roles: the role's own field. Roles marked * have fewer than 60 postings. Regenerate after any taxonomy change.

## Per role

| # | role | postings | employers | skills per posting (median) | role-set skills per posting (median) | defines the role | most asked beyond that |
|---|---|---|---|---|---|---|---|
| 1 | Software Engineer | 7,103 | 966 | 23 | 4 | – | Ownership & bias for action 74%, Collaboration & teamwork 73%, CS / engineering degree or background 66%, APIs & integrations 64%, Written & verbal communication 63%, Cloud platforms 59%, SDLC, DevOps & CI/CD 58%, Technical fluency 56%, Bachelor's degree 54%, Systems & architecture 51%, Adaptability & fast-paced environments 49%, Cross-functional leadership 46% |
| 2 | ML / AI Engineer | 2,348 | 547 | 25 | 5 | – | Generative AI / LLMs & agents 83%, AI / machine learning 77%, Ownership & bias for action 75%, Collaboration & teamwork 70%, CS / engineering degree or background 69%, Python / R / scripting 68%, Technical fluency 63%, Written & verbal communication 57%, Cloud platforms 55%, APIs & integrations 52%, SDLC, DevOps & CI/CD 48%, Adaptability & fast-paced environments 48% |
| 3 | Data Engineer | 879 | 350 | 26 | 5 | Data modeling & pipelines 98% | Ownership & bias for action 77%, Cloud platforms 75%, SQL 72%, Python / R / scripting 70%, Collaboration & teamwork 69%, Written & verbal communication 68%, CS / engineering degree or background 62%, Bachelor's degree 59%, Technical fluency 58%, SDLC, DevOps & CI/CD 57%, Stakeholder management 55%, APIs & integrations 51% |
| 4 | Security Engineer | 1,576 | 478 | 24 | 5 | Security & privacy 97% | Ownership & bias for action 75%, Cloud platforms 72%, Written & verbal communication 71%, Collaboration & teamwork 68%, SDLC, DevOps & CI/CD 64%, Risk & dependency management 60%, Bachelor's degree 57%, Technical fluency 55%, CS / engineering degree or background 53%, Python / R / scripting 52%, Detection and incident response 52%, Adaptability & fast-paced environments 47% |
| 5 | Product / UX Designer | 849 | 344 | 21 | 4 | – | Written & verbal communication 78%, Collaboration & teamwork 76%, Ownership & bias for action 71%, Prototyping 64%, Cross-functional leadership 61%, Product sense & judgment 59%, Execution & delivery 57%, Interaction design 55%, Adaptability & fast-paced environments 54%, Design systems 50%, Stakeholder management 49%, Visual design 47% |
| 6 | UX Researcher* | 50 | 33 | 23.5 | 2 | User research 95%, Data-driven decision making 92% | Written & verbal communication 81%, Cross-functional leadership 80%, Surveys & feedback loops 76%, Collaboration & teamwork 72%, Stakeholder management 62%, Adaptability & fast-paced environments 61%, Ownership & bias for action 55%, AI tooling in daily work 54%, A/B testing & experimentation 54%, Influence without authority 52%, Positioning & messaging 52%, Generative AI / LLMs & agents 50% |
| 7 | In-house Counsel | 1,026 | 391 | 18 | 4 | JD / law degree 92% | Written & verbal communication 84%, Collaboration & teamwork 83%, Influence without authority 77%, Ownership & bias for action 66%, Stakeholder management 59%, Adaptability & fast-paced environments 58%, Regulated industries & compliance 55%, Risk & dependency management 53%, Cross-functional leadership 48%, Execution & delivery 44%, Litigation and disputes 44%, Commercial contracts 43% |

## Per skill

| skill | cluster | all postings | asked most by |
|---|---|---|---|
| Roadmapping (shared) | craft | 17.4% | UX Researcher 43%, ML / AI Engineer 20%, Data Engineer 19%, Software Engineer 18% |
| Product strategy (shared) | craft | 10.2% | UX Researcher 40%, Product / UX Designer 26%, In-house Counsel 13%, Security Engineer 11% |
| Product vision (shared) | craft | 3.8% | Product / UX Designer 16%, Data Engineer 4%, ML / AI Engineer 3%, Software Engineer 3% |
| Prioritization & trade-offs (shared) | craft | 28.4% | UX Researcher 47%, Security Engineer 35%, Data Engineer 31%, Product / UX Designer 30% |
| PRDs & requirements writing (shared) | craft | 16.3% | Data Engineer 28%, Product / UX Designer 19%, Software Engineer 19%, ML / AI Engineer 12% |
| End-to-end product lifecycle (shared) | craft | 9.6% | Product / UX Designer 34%, UX Researcher 20%, Software Engineer 9%, ML / AI Engineer 8% |
| Product launches (shared) | craft | 9.8% | Product / UX Designer 21%, UX Researcher 14%, Software Engineer 11%, In-house Counsel 8% |
| Feature definition & scoping (shared) | craft | 2.1% | Software Engineer 2%, UX Researcher 2%, Product / UX Designer 2%, ML / AI Engineer 2% |
| Customer obsession / user empathy (shared) | craft | 17.8% | UX Researcher 50%, Product / UX Designer 39%, Software Engineer 18%, ML / AI Engineer 16% |
| Product sense & judgment (shared) | craft | 15.6% | Product / UX Designer 59%, UX Researcher 48%, Software Engineer 15%, Security Engineer 11% |
| UX & design collaboration (shared) | craft | 2.7% | UX Researcher 31%, Product / UX Designer 14%, Software Engineer 3%, ML / AI Engineer 1% |
| Structured problem solving (shared) | craft | 39.4% | Data Engineer 42%, Product / UX Designer 41%, Software Engineer 41%, Security Engineer 40% |
| OKRs & goal setting (shared) | craft | 1.4% | Product / UX Designer 3%, Software Engineer 2%, Data Engineer 1%, ML / AI Engineer 1% |
| Pricing & packaging (shared) | gtm | 4.9% | UX Researcher 7%, In-house Counsel 6%, Software Engineer 6%, Product / UX Designer 5% |
| Go-to-market strategy (shared) | gtm | 3.7% | In-house Counsel 10%, UX Researcher 7%, Data Engineer 6%, Product / UX Designer 5% |
| Market & competitive analysis (shared) | gtm | 3.9% | UX Researcher 12%, Product / UX Designer 11%, In-house Counsel 4%, Data Engineer 4% |
| Positioning & messaging (shared) | gtm | 7.7% | UX Researcher 52%, Product / UX Designer 22%, Software Engineer 8%, Data Engineer 6% |
| Sales enablement & field partnership (shared) | gtm | 2.3% | In-house Counsel 9%, UX Researcher 5%, Product / UX Designer 3%, ML / AI Engineer 2% |
| Customer success & support partnership (shared) | gtm | 4.4% | Software Engineer 5%, UX Researcher 5%, Data Engineer 4%, Product / UX Designer 4% |
| Partnerships & ecosystem (shared) | gtm | 9.9% | In-house Counsel 29%, Product / UX Designer 11%, Security Engineer 10%, Data Engineer 9% |
| Business cases & ROI (shared) | gtm | 1.5% | Data Engineer 3%, ML / AI Engineer 2%, Software Engineer 1%, Security Engineer 1% |
| P&L / revenue ownership (shared) | gtm | 2.2% | Data Engineer 4%, Software Engineer 2%, In-house Counsel 2%, ML / AI Engineer 2% |
| Growth, funnels & retention (shared) | gtm | 6.3% | UX Researcher 18%, Data Engineer 11%, Product / UX Designer 10%, Software Engineer 6% |
| Customer interviews (shared) | discovery | 1.0% | UX Researcher 12%, Product / UX Designer 5%, Software Engineer 1%, ML / AI Engineer 1% |
| User research (shared) | discovery | 3.2% | UX Researcher 95%, Product / UX Designer 31%, ML / AI Engineer 2%, Security Engineer 1% |
| Product discovery & validation (shared) | discovery | 12.6% | UX Researcher 44%, Product / UX Designer 27%, ML / AI Engineer 17%, In-house Counsel 16% |
| Personas & segmentation (shared) | discovery | 4.6% | UX Researcher 39%, Product / UX Designer 10%, Security Engineer 9%, ML / AI Engineer 5% |
| Surveys & feedback loops (shared) | discovery | 6.1% | UX Researcher 76%, Product / UX Designer 13%, ML / AI Engineer 9%, Software Engineer 6% |
| Metrics & KPIs (shared) | analytics | 21.4% | UX Researcher 39%, Data Engineer 36%, ML / AI Engineer 26%, Security Engineer 24% |
| Data-driven decision making (shared) | analytics | 17.0% | UX Researcher 92%, Data Engineer 41%, ML / AI Engineer 22%, Product / UX Designer 17% |
| A/B testing & experimentation (shared) | analytics | 15.6% | UX Researcher 54%, ML / AI Engineer 37%, Product / UX Designer 21%, Data Engineer 14% |
| SQL (shared) | technical | 15.5% | Data Engineer 72%, Software Engineer 15%, UX Researcher 14%, ML / AI Engineer 12% |
| Python / R / scripting (shared) | technical | 45.6% | Data Engineer 70%, ML / AI Engineer 68%, Security Engineer 52%, Software Engineer 45% |
| Data modeling & pipelines (shared) | technical | 31.4% | Data Engineer 98%, ML / AI Engineer 41%, Software Engineer 29%, Security Engineer 17% |
| Statistics & forecasting (shared) | analytics | 13.1% | UX Researcher 43%, ML / AI Engineer 28%, Data Engineer 24%, Software Engineer 11% |
| Financial modeling & analysis (shared) | analytics | 12.0% | In-house Counsel 15%, UX Researcher 15%, Product / UX Designer 13%, Software Engineer 13% |
| Technical fluency (shared) | technical | 51.4% | ML / AI Engineer 63%, Data Engineer 58%, Software Engineer 56%, Security Engineer 55% |
| APIs & integrations (shared) | technical | 52.1% | Software Engineer 64%, ML / AI Engineer 52%, Data Engineer 51%, Security Engineer 45% |
| Systems & architecture (shared) | technical | 38.8% | Software Engineer 51%, ML / AI Engineer 43%, Data Engineer 38%, Security Engineer 20% |
| Cloud platforms (shared) | technical | 54.3% | Data Engineer 75%, Security Engineer 72%, Software Engineer 59%, ML / AI Engineer 55% |
| AI / machine learning (shared) | technical | 29.1% | ML / AI Engineer 77%, Data Engineer 44%, Software Engineer 20%, Security Engineer 18% |
| Generative AI / LLMs & agents (shared) | technical | 46.4% | ML / AI Engineer 83%, UX Researcher 50%, Security Engineer 43%, Data Engineer 42% |
| Mobile platforms (shared) | technical | 12.5% | Product / UX Designer 25%, Software Engineer 14%, UX Researcher 13%, Security Engineer 12% |
| Security & privacy (shared) | technical | 36.3% | Security Engineer 97%, Data Engineer 43%, Software Engineer 30%, ML / AI Engineer 26% |
| SDLC, DevOps & CI/CD (shared) | technical | 49.5% | Security Engineer 64%, Software Engineer 58%, Data Engineer 57%, ML / AI Engineer 48% |
| Hardware, devices & embedded (shared) | technical | 31.0% | Security Engineer 42%, ML / AI Engineer 39%, Software Engineer 33%, Product / UX Designer 15% |
| Networking & connectivity (shared) | technical | 11.6% | Security Engineer 27%, Software Engineer 13%, Data Engineer 6%, ML / AI Engineer 6% |
| Automotive, autonomy & robotics (shared) | domain | 13.3% | ML / AI Engineer 18%, Security Engineer 15%, Software Engineer 14%, Data Engineer 8% |
| Payments, fintech & banking (shared) | domain | 23.4% | In-house Counsel 36%, Security Engineer 27%, Software Engineer 23%, Product / UX Designer 22% |
| Healthcare & life sciences (shared) | domain | 20.4% | Data Engineer 30%, In-house Counsel 25%, Software Engineer 20%, ML / AI Engineer 20% |
| E-commerce, retail & marketplaces (shared) | domain | 9.3% | UX Researcher 15%, Product / UX Designer 14%, In-house Counsel 11%, Software Engineer 9% |
| Supply chain, logistics & operations (shared) | domain | 16.9% | Data Engineer 39%, In-house Counsel 28%, Security Engineer 19%, UX Researcher 16% |
| Advertising & media (shared) | domain | 10.1% | Data Engineer 13%, ML / AI Engineer 12%, Software Engineer 11%, Product / UX Designer 9% |
| Enterprise SaaS & B2B (shared) | domain | 18.2% | Product / UX Designer 26%, UX Researcher 26%, Security Engineer 23%, Software Engineer 17% |
| Consumer products & B2C (shared) | domain | 7.4% | Product / UX Designer 19%, UX Researcher 17%, Software Engineer 7%, ML / AI Engineer 7% |
| Energy, industrial & manufacturing (shared) | domain | 14.8% | Product / UX Designer 21%, Software Engineer 17%, In-house Counsel 15%, Security Engineer 11% |
| Telecommunications (shared) | domain | 3.2% | In-house Counsel 4%, Software Engineer 4%, Data Engineer 3%, Security Engineer 2% |
| Developer tools & infrastructure products (shared) | domain | 22.3% | Data Engineer 34%, ML / AI Engineer 28%, Software Engineer 24%, Security Engineer 17% |
| Regulated industries & compliance (shared) | domain | 22.6% | In-house Counsel 55%, Security Engineer 40%, Data Engineer 21%, Software Engineer 18% |
| Cross-functional leadership (shared) | leadership | 46.8% | UX Researcher 80%, Product / UX Designer 61%, Data Engineer 51%, In-house Counsel 48% |
| Stakeholder management (shared) | leadership | 36.2% | UX Researcher 62%, In-house Counsel 59%, Data Engineer 55%, Product / UX Designer 49% |
| Influence without authority (shared) | leadership | 30.8% | In-house Counsel 77%, UX Researcher 52%, Product / UX Designer 42%, Security Engineer 31% |
| Written & verbal communication (shared) | leadership | 66.0% | In-house Counsel 84%, UX Researcher 81%, Product / UX Designer 78%, Security Engineer 71% |
| Executive communication & reviews (shared) | leadership | 7.2% | In-house Counsel 16%, UX Researcher 15%, Security Engineer 12%, Product / UX Designer 10% |
| People management & coaching (shared) | leadership | 26.9% | Software Engineer 30%, Data Engineer 29%, UX Researcher 28%, Product / UX Designer 26% |
| Ownership & bias for action (shared) | leadership | 73.9% | Data Engineer 77%, ML / AI Engineer 75%, Security Engineer 75%, Software Engineer 74% |
| Adaptability & fast-paced environments (shared) | leadership | 49.6% | UX Researcher 61%, In-house Counsel 58%, Product / UX Designer 54%, Software Engineer 49% |
| Collaboration & teamwork (shared) | leadership | 72.9% | In-house Counsel 83%, Product / UX Designer 76%, Software Engineer 73%, UX Researcher 72% |
| Customer & executive-facing engagement (shared) | leadership | 12.5% | UX Researcher 19%, ML / AI Engineer 17%, Security Engineer 14%, In-house Counsel 12% |
| Agile / Scrum (shared) | delivery | 18.5% | Data Engineer 28%, Software Engineer 24%, ML / AI Engineer 13%, Security Engineer 12% |
| Program & project management (shared) | delivery | 25.8% | Product / UX Designer 34%, UX Researcher 32%, Security Engineer 28%, Software Engineer 27% |
| Risk & dependency management (shared) | delivery | 29.2% | Security Engineer 60%, In-house Counsel 53%, Software Engineer 25%, Data Engineer 23% |
| Execution & delivery (shared) | delivery | 41.6% | Product / UX Designer 57%, UX Researcher 48%, In-house Counsel 44%, Software Engineer 42% |
| Process design & operational rigor (shared) | delivery | 34.6% | Security Engineer 41%, In-house Counsel 40%, Data Engineer 40%, Software Engineer 35% |
| Quality, testing & acceptance (shared) | delivery | 16.3% | Software Engineer 24%, Data Engineer 16%, ML / AI Engineer 12%, Security Engineer 6% |
| Vendor, budget & contract management (shared) | delivery | 8.5% | In-house Counsel 24%, Data Engineer 11%, Security Engineer 10%, Software Engineer 8% |
| Jira / Confluence / Asana / Linear (shared) | tools | 7.4% | Data Engineer 9%, Software Engineer 9%, Security Engineer 7%, ML / AI Engineer 6% |
| Figma / design tools (shared) | tools | 3.4% | Product / UX Designer 43%, UX Researcher 15%, Software Engineer 1%, ML / AI Engineer 1% |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) (shared) | tools | 6.5% | Data Engineer 40%, UX Researcher 11%, Software Engineer 5%, Security Engineer 5% |
| Experimentation & feature-flag tools (shared) | tools | 1.0% | Software Engineer 2%, ML / AI Engineer 1%, Product / UX Designer 0%, Data Engineer 0% |
| Office suite (Excel, PowerPoint, Google Workspace) (shared) | tools | 5.5% | Product / UX Designer 10%, In-house Counsel 10%, Security Engineer 7%, Software Engineer 5% |
| CRM & GTM tools (Salesforce, HubSpot, Gong) (shared) | tools | 5.0% | In-house Counsel 7%, UX Researcher 6%, Data Engineer 5%, Software Engineer 5% |
| AI tooling in daily work (shared) | tools | 27.4% | UX Researcher 54%, Product / UX Designer 43%, Data Engineer 30%, ML / AI Engineer 28% |
| Prior product management experience (shared) | credentials | 0.4% | Product / UX Designer 1%, ML / AI Engineer 0%, Software Engineer 0%, Security Engineer 0% |
| Bachelor's degree (shared) | credentials | 49.3% | Data Engineer 59%, Security Engineer 57%, Software Engineer 54%, ML / AI Engineer 48% |
| Master's / MBA (shared) | credentials | 23.6% | ML / AI Engineer 41%, UX Researcher 40%, Data Engineer 23%, Software Engineer 23% |
| PhD / research background (shared) | credentials | 12.5% | ML / AI Engineer 33%, UX Researcher 32%, In-house Counsel 13%, Security Engineer 9% |
| CS / engineering degree or background (shared) | credentials | 56.9% | ML / AI Engineer 69%, Software Engineer 66%, Data Engineer 62%, Security Engineer 53% |
| Startup / scale-up experience (shared) | credentials | 15.0% | Product / UX Designer 18%, Software Engineer 17%, ML / AI Engineer 14%, In-house Counsel 13% |
| Large-scale / big-tech experience (shared) | credentials | 19.1% | ML / AI Engineer 23%, Data Engineer 19%, Software Engineer 19%, Security Engineer 18% |
| Consulting / banking / finance background (shared) | credentials | 6.4% | In-house Counsel 12%, UX Researcher 8%, Data Engineer 8%, Security Engineer 7% |
| Security clearance / citizenship (shared) | credentials | 7.6% | Security Engineer 13%, Software Engineer 8%, Data Engineer 8%, ML / AI Engineer 6% |
| Deep domain expertise required (shared) | credentials | 16.0% | ML / AI Engineer 19%, Security Engineer 18%, In-house Counsel 17%, UX Researcher 17% |
| Employment law & HR compliance | people | 2.4% | In-house Counsel 9%, Security Engineer 3%, ML / AI Engineer 2%, Data Engineer 2% |
| Third-party & vendor risk | risk | 1.0% | Security Engineer 6%, In-house Counsel 3%, Software Engineer 0%, ML / AI Engineer 0% |
| Regulatory analysis & change management | risk | 3.0% | In-house Counsel 25%, Security Engineer 4%, Data Engineer 1%, Software Engineer 1% |
| Policy development & management | risk | 3.9% | In-house Counsel 14%, Security Engineer 13%, Data Engineer 3%, Product / UX Designer 2% |
| Security compliance frameworks (SOC 2, ISO 27001, NIST) | risk | 8.0% | Security Engineer 36%, Software Engineer 6%, ML / AI Engineer 3%, Data Engineer 3% |
| Data governance & stewardship | risk | 7.7% | Data Engineer 46%, ML / AI Engineer 8%, Security Engineer 7%, In-house Counsel 5% |
| AI governance & responsible AI | risk | 6.5% | ML / AI Engineer 15%, In-house Counsel 10%, Security Engineer 9%, Data Engineer 5% |
| Technology & cyber risk | risk | 4.2% | Security Engineer 23%, UX Researcher 2%, Software Engineer 2%, In-house Counsel 2% |
| Board & committee governance | risk | 1.5% | In-house Counsel 13%, Security Engineer 1%, Data Engineer 1%, Software Engineer 1% |
| Dashboards & data visualisation | analytics | 10.4% | Data Engineer 29%, UX Researcher 24%, Product / UX Designer 11%, Software Engineer 10% |
| GRC platforms (Archer, ServiceNow GRC, OneTrust, Vanta) | tools | 0.6% | Security Engineer 3%, UX Researcher 2%, ML / AI Engineer 0%, In-house Counsel 0% |
| BI development tools (DAX, Power Query, SSRS, Qlik) | tools | 2.1% | Data Engineer 19%, ML / AI Engineer 2%, Software Engineer 1%, Product / UX Designer 0% |
| JD / law degree | credentials | 7.2% | In-house Counsel 92%, Security Engineer 1%, Data Engineer 1%, Software Engineer 0% |
| Java / JVM languages | tools | 19.7% | Software Engineer 27%, Data Engineer 26%, ML / AI Engineer 16%, Security Engineer 11% |
| JavaScript / TypeScript | tools | 18.7% | Software Engineer 28%, ML / AI Engineer 15%, Security Engineer 9%, Data Engineer 6% |
| Go | tools | 11.0% | Security Engineer 15%, Software Engineer 14%, ML / AI Engineer 11%, Data Engineer 5% |
| C / C++ | tools | 15.2% | ML / AI Engineer 20%, Software Engineer 20%, Security Engineer 11%, Data Engineer 5% |
| Rust | tools | 5.4% | Software Engineer 8%, Security Engineer 6%, ML / AI Engineer 4%, Data Engineer 1% |
| Ruby / Rails | tools | 2.8% | Software Engineer 4%, Security Engineer 3%, Data Engineer 1%, ML / AI Engineer 1% |
| C# / .NET | tools | 6.4% | Software Engineer 9%, Security Engineer 5%, ML / AI Engineer 5%, Data Engineer 3% |
| Frontend web development | engineering | 18.8% | Software Engineer 27%, Product / UX Designer 18%, ML / AI Engineer 12%, Security Engineer 12% |
| Backend services | engineering | 24.9% | Software Engineer 36%, ML / AI Engineer 23%, Data Engineer 18%, Security Engineer 10% |
| Databases | engineering | 19.3% | Data Engineer 34%, Software Engineer 27%, ML / AI Engineer 16%, Security Engineer 4% |
| Algorithms and data structures | engineering | 11.7% | ML / AI Engineer 24%, Data Engineer 13%, Software Engineer 12%, Security Engineer 4% |
| Performance and concurrency | engineering | 18.8% | Data Engineer 25%, ML / AI Engineer 25%, Software Engineer 23%, Security Engineer 6% |
| Linux and systems programming | engineering | 19.0% | Security Engineer 28%, Software Engineer 23%, ML / AI Engineer 16%, Data Engineer 10% |
| Code review and code quality | engineering | 32.2% | Software Engineer 43%, Data Engineer 40%, ML / AI Engineer 31%, Security Engineer 18% |
| Infrastructure as code | tools | 15.4% | Security Engineer 22%, Software Engineer 19%, Data Engineer 18%, ML / AI Engineer 10% |
| Observability tools | tools | 8.3% | Software Engineer 11%, Security Engineer 10%, Data Engineer 9%, ML / AI Engineer 5% |
| Workflow orchestration (Airflow, Dagster) | tools | 5.7% | Data Engineer 33%, ML / AI Engineer 7%, Software Engineer 4%, Security Engineer 1% |
| Streaming data | data_ml | 10.8% | Data Engineer 39%, Software Engineer 13%, ML / AI Engineer 8%, Security Engineer 3% |
| Lakehouse and table formats | tools | 2.8% | Data Engineer 27%, ML / AI Engineer 2%, Software Engineer 1%, Security Engineer 0% |
| Deep learning frameworks | tools | 6.5% | ML / AI Engineer 30%, Software Engineer 2%, Security Engineer 1%, Data Engineer 1% |
| Model training and fine-tuning | data_ml | 9.7% | ML / AI Engineer 39%, Data Engineer 5%, Software Engineer 4%, Security Engineer 4% |
| Model evaluation (evals) | data_ml | 12.5% | ML / AI Engineer 43%, UX Researcher 17%, Software Engineer 7%, Data Engineer 6% |
| MLOps and model serving | data_ml | 10.9% | ML / AI Engineer 38%, Data Engineer 11%, Security Engineer 6%, Software Engineer 6% |
| Inference and GPU optimization | data_ml | 5.7% | ML / AI Engineer 20%, Software Engineer 4%, Security Engineer 2%, Data Engineer 1% |
| LLM frameworks and vector stores | tools | 7.6% | ML / AI Engineer 24%, Data Engineer 8%, Security Engineer 5%, Software Engineer 4% |
| Research publications | credentials | 1.5% | ML / AI Engineer 7%, Security Engineer 1%, Software Engineer 0%, Data Engineer 0% |
| Threat modeling | security | 4.1% | Security Engineer 29%, Software Engineer 1%, ML / AI Engineer 1%, Product / UX Designer 0% |
| Application security | security | 6.2% | Security Engineer 29%, Software Engineer 5%, ML / AI Engineer 2%, Data Engineer 2% |
| Detection and incident response | security | 7.6% | Security Engineer 52%, Software Engineer 2%, ML / AI Engineer 2%, Data Engineer 1% |
| Penetration testing and red teaming | security | 3.7% | Security Engineer 25%, ML / AI Engineer 1%, Data Engineer 1%, Software Engineer 1% |
| Vulnerability management | security | 5.0% | Security Engineer 29%, Software Engineer 3%, ML / AI Engineer 1%, Data Engineer 1% |
| Cryptography | security | 6.2% | Security Engineer 24%, Data Engineer 6%, Software Engineer 5%, ML / AI Engineer 2% |
| Security certifications | credentials | 4.3% | Security Engineer 31%, Data Engineer 1%, Software Engineer 1%, ML / AI Engineer 1% |
| Interaction design | design | 4.7% | Product / UX Designer 55%, UX Researcher 22%, Software Engineer 2%, ML / AI Engineer 2% |
| Visual design | design | 3.9% | Product / UX Designer 47%, UX Researcher 8%, Software Engineer 1%, ML / AI Engineer 1% |
| Prototyping | design | 15.0% | Product / UX Designer 64%, UX Researcher 26%, ML / AI Engineer 26%, Software Engineer 10% |
| Design systems | design | 5.5% | Product / UX Designer 50%, UX Researcher 7%, Software Engineer 4%, ML / AI Engineer 2% |
| Accessibility | design | 8.1% | Product / UX Designer 26%, UX Researcher 15%, Data Engineer 9%, Software Engineer 9% |
| Design critique and rationale | design | 2.0% | Product / UX Designer 25%, UX Researcher 5%, Software Engineer 1%, ML / AI Engineer 1% |
| Design portfolio | credentials | 2.4% | Product / UX Designer 34%, UX Researcher 11%, Software Engineer 0%, Data Engineer 0% |
| Commercial contracts | legal | 3.4% | In-house Counsel 43%, Security Engineer 0%, Software Engineer 0%, Product / UX Designer 0% |
| Product counseling | legal | 2.0% | In-house Counsel 10%, Security Engineer 3%, Software Engineer 1%, ML / AI Engineer 1% |
| Privacy and data protection law | legal | 5.9% | In-house Counsel 14%, Data Engineer 10%, Security Engineer 10%, ML / AI Engineer 5% |
| Intellectual property | legal | 3.8% | In-house Counsel 21%, ML / AI Engineer 5%, Security Engineer 3%, Data Engineer 2% |
| Corporate and securities law | legal | 2.4% | In-house Counsel 23%, Security Engineer 1%, Software Engineer 1%, Product / UX Designer 0% |
| Litigation and disputes | legal | 3.8% | In-house Counsel 44%, UX Researcher 2%, Security Engineer 1%, Software Engineer 1% |
| Managing outside counsel | legal | 3.1% | In-house Counsel 41%, Security Engineer 0%, Data Engineer 0%, Software Engineer 0% |
| Contract management tools | tools | 0.6% | In-house Counsel 5%, Data Engineer 1%, Product / UX Designer 0%, ML / AI Engineer 0% |

## Skills no role asks for in 3% of its postings

Feature definition & scoping, OKRs & goal setting, Business cases & ROI, Experimentation & feature-flag tools, Prior product management experience, GRC platforms (Archer, ServiceNow GRC, OneTrust, Vanta)
