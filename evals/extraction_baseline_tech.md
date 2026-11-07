# Extraction baseline: the TECH role set

Produced by `pipeline/experiments/role_coverage.py` on 2026-11-07 from `data/processed/jobs_tech.json` (14,165 postings, United States; 158 skills, 61 of them specific to this role set). Shares are the fraction of a role's postings whose title or cleaned description matches a skill's patterns, with each employer held to 5% of a role. "Defines the role" lists skills on at least 80% of the role's postings and at least 2.5 times as common as in other roles: the role's own field. Roles marked * have fewer than 60 postings. Regenerate after any taxonomy change.

## Per role

| # | role | postings | employers | skills per posting (median) | role-set skills per posting (median) | defines the role | most asked beyond that |
|---|---|---|---|---|---|---|---|
| 1 | Software Engineer | 7,206 | 971 | 22 | 4 | – | Ownership & bias for action 74%, Collaboration & teamwork 74%, CS / engineering degree or background 66%, APIs & integrations 64%, Written & verbal communication 64%, Cloud platforms 59%, SDLC, DevOps & CI/CD 58%, Technical fluency 56%, Bachelor's degree 54%, Systems & architecture 50%, Python / R / scripting 46%, Cross-functional leadership 45% |
| 2 | ML / AI Engineer | 2,396 | 552 | 24 | 5 | – | Generative AI / LLMs & agents 84%, AI / machine learning 77%, Ownership & bias for action 75%, Collaboration & teamwork 70%, CS / engineering degree or background 69%, Python / R / scripting 68%, Technical fluency 63%, Written & verbal communication 57%, Cloud platforms 56%, APIs & integrations 52%, SDLC, DevOps & CI/CD 48%, Bachelor's degree 48% |
| 3 | Data Engineer | 906 | 353 | 26 | 5 | Data modeling & pipelines 98% | Ownership & bias for action 76%, Cloud platforms 75%, SQL 72%, Python / R / scripting 71%, Written & verbal communication 69%, Collaboration & teamwork 69%, CS / engineering degree or background 63%, Bachelor's degree 59%, Technical fluency 58%, SDLC, DevOps & CI/CD 56%, Stakeholder management 55%, APIs & integrations 51% |
| 4 | Security Engineer | 1,711 | 491 | 23 | 5 | Security & privacy 96% | Ownership & bias for action 75%, Cloud platforms 72%, Written & verbal communication 71%, Collaboration & teamwork 68%, SDLC, DevOps & CI/CD 64%, Bachelor's degree 58%, Technical fluency 56%, CS / engineering degree or background 54%, Python / R / scripting 51%, Risk & dependency management 51%, Detection and incident response 50%, APIs & integrations 46% |
| 5 | Product / UX Designer | 853 | 352 | 21 | 4 | – | Written & verbal communication 78%, Collaboration & teamwork 76%, Ownership & bias for action 71%, Prototyping 66%, Cross-functional leadership 61%, Product sense & judgment 60%, Interaction design 56%, Design systems 51%, Stakeholder management 48%, Visual design 47%, Execution & delivery 44%, Figma / design tools 44% |
| 6 | UX Researcher* | 54 | 35 | 22 | 2 | User research 91%, Data-driven decision making 90% | Cross-functional leadership 82%, Written & verbal communication 80%, Surveys & feedback loops 74%, Collaboration & teamwork 74%, Stakeholder management 59%, Ownership & bias for action 57%, Influence without authority 57%, AI tooling in daily work 54%, Customer obsession / user empathy 52%, A/B testing & experimentation 51%, Product sense & judgment 51%, Generative AI / LLMs & agents 48% |
| 7 | In-house Counsel | 1,039 | 397 | 17 | 4 | JD / law degree 92% | Written & verbal communication 84%, Collaboration & teamwork 82%, Influence without authority 77%, Ownership & bias for action 66%, Stakeholder management 58%, Regulated industries & compliance 55%, Cross-functional leadership 47%, Risk & dependency management 46%, Litigation and disputes 44%, Commercial contracts 43%, Managing outside counsel 41%, Structured problem solving 40% |

## Per skill

| skill | cluster | all postings | asked most by |
|---|---|---|---|
| Roadmapping (shared) | craft | 17.3% | UX Researcher 40%, ML / AI Engineer 20%, Data Engineer 18%, Product / UX Designer 18% |
| Product strategy (shared) | craft | 10.3% | UX Researcher 39%, Product / UX Designer 27%, In-house Counsel 13%, Security Engineer 12% |
| Product vision (shared) | craft | 3.7% | Product / UX Designer 16%, UX Researcher 4%, Data Engineer 4%, ML / AI Engineer 3% |
| Prioritization & trade-offs (shared) | craft | 28.3% | UX Researcher 43%, Security Engineer 34%, Data Engineer 30%, Product / UX Designer 30% |
| PRDs & requirements writing (shared) | craft | 16.4% | Data Engineer 28%, Product / UX Designer 19%, Software Engineer 19%, ML / AI Engineer 12% |
| End-to-end product lifecycle (shared) | craft | 9.6% | Product / UX Designer 35%, UX Researcher 20%, Software Engineer 9%, ML / AI Engineer 8% |
| Product launches (shared) | craft | 9.7% | Product / UX Designer 21%, UX Researcher 13%, Software Engineer 11%, In-house Counsel 9% |
| Feature definition & scoping (shared) | craft | 2.1% | Software Engineer 2%, Product / UX Designer 2%, UX Researcher 2%, ML / AI Engineer 2% |
| Customer obsession / user empathy (shared) | craft | 17.8% | UX Researcher 52%, Product / UX Designer 40%, Software Engineer 18%, ML / AI Engineer 16% |
| Product sense & judgment (shared) | craft | 15.5% | Product / UX Designer 60%, UX Researcher 51%, Software Engineer 15%, Security Engineer 11% |
| UX & design collaboration (shared) | craft | 2.7% | UX Researcher 31%, Product / UX Designer 15%, Software Engineer 3%, ML / AI Engineer 1% |
| Structured problem solving (shared) | craft | 39.5% | Data Engineer 43%, Software Engineer 41%, Product / UX Designer 41%, Security Engineer 40% |
| OKRs & goal setting (shared) | craft | 1.4% | Product / UX Designer 3%, Software Engineer 2%, Data Engineer 1%, ML / AI Engineer 1% |
| Pricing & packaging (shared) | gtm | 4.9% | UX Researcher 7%, In-house Counsel 6%, Software Engineer 6%, Product / UX Designer 5% |
| Go-to-market strategy (shared) | gtm | 3.7% | In-house Counsel 10%, UX Researcher 7%, Data Engineer 6%, Product / UX Designer 5% |
| Market & competitive analysis (shared) | gtm | 3.9% | UX Researcher 16%, Product / UX Designer 10%, In-house Counsel 4%, Data Engineer 4% |
| Positioning & messaging (shared) | gtm | 1.6% | UX Researcher 16%, Product / UX Designer 7%, In-house Counsel 2%, ML / AI Engineer 1% |
| Sales enablement & field partnership (shared) | gtm | 2.3% | In-house Counsel 9%, UX Researcher 4%, Product / UX Designer 3%, ML / AI Engineer 2% |
| Customer success & support partnership (shared) | gtm | 4.5% | Software Engineer 5%, UX Researcher 4%, Data Engineer 4%, Product / UX Designer 4% |
| Partnerships & ecosystem (shared) | gtm | 9.8% | In-house Counsel 29%, Security Engineer 10%, Product / UX Designer 10%, Data Engineer 9% |
| Business cases & ROI (shared) | gtm | 1.5% | Data Engineer 3%, ML / AI Engineer 2%, Software Engineer 1%, Product / UX Designer 1% |
| P&L / revenue ownership (shared) | gtm | 2.2% | Data Engineer 4%, Software Engineer 2%, In-house Counsel 2%, ML / AI Engineer 2% |
| Growth, funnels & retention (shared) | gtm | 6.4% | UX Researcher 16%, Data Engineer 11%, Product / UX Designer 11%, Software Engineer 6% |
| Customer interviews (shared) | discovery | 1.0% | UX Researcher 11%, Product / UX Designer 5%, Software Engineer 1%, ML / AI Engineer 1% |
| User research (shared) | discovery | 3.2% | UX Researcher 91%, Product / UX Designer 32%, ML / AI Engineer 3%, Security Engineer 1% |
| Product discovery & validation (shared) | discovery | 12.6% | UX Researcher 45%, Product / UX Designer 28%, ML / AI Engineer 17%, In-house Counsel 16% |
| Personas & segmentation (shared) | discovery | 4.6% | UX Researcher 38%, Product / UX Designer 10%, Security Engineer 10%, ML / AI Engineer 5% |
| Surveys & feedback loops (shared) | discovery | 6.1% | UX Researcher 74%, Product / UX Designer 14%, ML / AI Engineer 9%, Software Engineer 6% |
| Metrics & KPIs (shared) | analytics | 21.6% | UX Researcher 40%, Data Engineer 36%, ML / AI Engineer 26%, Security Engineer 24% |
| Data-driven decision making (shared) | analytics | 17.1% | UX Researcher 90%, Data Engineer 41%, ML / AI Engineer 22%, Product / UX Designer 17% |
| A/B testing & experimentation (shared) | analytics | 15.6% | UX Researcher 51%, ML / AI Engineer 37%, Product / UX Designer 22%, Data Engineer 14% |
| SQL (shared) | technical | 15.6% | Data Engineer 72%, Software Engineer 16%, UX Researcher 13%, ML / AI Engineer 12% |
| Python / R / scripting (shared) | technical | 45.8% | Data Engineer 71%, ML / AI Engineer 68%, Security Engineer 51%, Software Engineer 46% |
| Data modeling & pipelines (shared) | technical | 31.5% | Data Engineer 98%, ML / AI Engineer 41%, Software Engineer 29%, Security Engineer 18% |
| Statistics & forecasting (shared) | analytics | 13.0% | UX Researcher 44%, ML / AI Engineer 28%, Data Engineer 24%, Software Engineer 11% |
| Financial modeling & analysis (shared) | analytics | 1.8% | Data Engineer 5%, ML / AI Engineer 2%, Software Engineer 2%, In-house Counsel 1% |
| Technical fluency (shared) | technical | 51.6% | ML / AI Engineer 63%, Data Engineer 58%, Security Engineer 56%, Software Engineer 56% |
| APIs & integrations (shared) | technical | 52.2% | Software Engineer 64%, ML / AI Engineer 52%, Data Engineer 51%, Security Engineer 46% |
| Systems & architecture (shared) | technical | 38.7% | Software Engineer 50%, ML / AI Engineer 42%, Data Engineer 37%, Security Engineer 22% |
| Cloud platforms (shared) | technical | 54.5% | Data Engineer 75%, Security Engineer 72%, Software Engineer 59%, ML / AI Engineer 56% |
| AI / machine learning (shared) | technical | 29.2% | ML / AI Engineer 77%, Data Engineer 43%, Software Engineer 20%, Security Engineer 18% |
| Generative AI / LLMs & agents (shared) | technical | 46.4% | ML / AI Engineer 84%, UX Researcher 48%, Security Engineer 43%, Data Engineer 42% |
| Mobile platforms (shared) | technical | 12.3% | Product / UX Designer 24%, Software Engineer 14%, UX Researcher 12%, Security Engineer 12% |
| Security & privacy (shared) | technical | 36.6% | Security Engineer 96%, Data Engineer 44%, Software Engineer 30%, ML / AI Engineer 26% |
| SDLC, DevOps & CI/CD (shared) | technical | 49.7% | Security Engineer 64%, Software Engineer 58%, Data Engineer 56%, ML / AI Engineer 48% |
| Hardware, devices & embedded (shared) | technical | 30.4% | Security Engineer 41%, ML / AI Engineer 39%, Software Engineer 32%, Data Engineer 14% |
| Networking & connectivity (shared) | technical | 11.6% | Security Engineer 26%, Software Engineer 13%, Data Engineer 6%, ML / AI Engineer 6% |
| Automotive, autonomy & robotics (shared) | domain | 13.1% | ML / AI Engineer 18%, Security Engineer 14%, Software Engineer 14%, Data Engineer 8% |
| Payments, fintech & banking (shared) | domain | 23.6% | In-house Counsel 36%, Security Engineer 28%, Software Engineer 23%, Product / UX Designer 22% |
| Healthcare & life sciences (shared) | domain | 20.4% | Data Engineer 30%, In-house Counsel 25%, Software Engineer 20%, ML / AI Engineer 20% |
| E-commerce, retail & marketplaces (shared) | domain | 9.4% | Product / UX Designer 15%, UX Researcher 14%, In-house Counsel 11%, Software Engineer 9% |
| Supply chain, logistics & operations (shared) | domain | 16.9% | Data Engineer 38%, In-house Counsel 28%, Security Engineer 19%, UX Researcher 17% |
| Advertising & media (shared) | domain | 10.0% | Data Engineer 12%, ML / AI Engineer 12%, Software Engineer 10%, Product / UX Designer 8% |
| Enterprise SaaS & B2B (shared) | domain | 18.3% | Product / UX Designer 27%, Security Engineer 24%, UX Researcher 23%, Software Engineer 17% |
| Consumer products & B2C (shared) | domain | 7.3% | Product / UX Designer 19%, UX Researcher 18%, ML / AI Engineer 7%, Software Engineer 7% |
| Energy, industrial & manufacturing (shared) | domain | 14.8% | Product / UX Designer 21%, Software Engineer 17%, In-house Counsel 15%, Security Engineer 11% |
| Telecommunications (shared) | domain | 3.2% | In-house Counsel 4%, Software Engineer 4%, Data Engineer 3%, Security Engineer 2% |
| Developer tools & infrastructure products (shared) | domain | 22.2% | Data Engineer 33%, ML / AI Engineer 28%, Software Engineer 24%, Security Engineer 18% |
| Regulated industries & compliance (shared) | domain | 22.8% | In-house Counsel 55%, Security Engineer 40%, Data Engineer 21%, Software Engineer 18% |
| Cross-functional leadership (shared) | leadership | 46.7% | UX Researcher 82%, Product / UX Designer 61%, Data Engineer 51%, In-house Counsel 47% |
| Stakeholder management (shared) | leadership | 36.1% | UX Researcher 59%, In-house Counsel 58%, Data Engineer 55%, Product / UX Designer 48% |
| Influence without authority (shared) | leadership | 30.9% | In-house Counsel 77%, UX Researcher 57%, Product / UX Designer 43%, Security Engineer 30% |
| Written & verbal communication (shared) | leadership | 66.2% | In-house Counsel 84%, UX Researcher 80%, Product / UX Designer 78%, Security Engineer 71% |
| Executive communication & reviews (shared) | leadership | 7.2% | In-house Counsel 16%, UX Researcher 14%, Security Engineer 12%, Product / UX Designer 9% |
| People management & coaching (shared) | leadership | 21.0% | Software Engineer 23%, Data Engineer 20%, Security Engineer 20%, Product / UX Designer 20% |
| Ownership & bias for action (shared) | leadership | 73.9% | Data Engineer 76%, ML / AI Engineer 75%, Security Engineer 75%, Software Engineer 74% |
| Adaptability & fast-paced environments (shared) | leadership | 33.1% | UX Researcher 44%, Product / UX Designer 36%, Security Engineer 34%, Software Engineer 33% |
| Collaboration & teamwork (shared) | leadership | 72.9% | In-house Counsel 82%, Product / UX Designer 76%, UX Researcher 74%, Software Engineer 74% |
| Customer & executive-facing engagement (shared) | leadership | 12.5% | ML / AI Engineer 17%, UX Researcher 17%, Security Engineer 14%, In-house Counsel 12% |
| Agile / Scrum (shared) | delivery | 18.7% | Data Engineer 28%, Software Engineer 24%, ML / AI Engineer 13%, Security Engineer 12% |
| Program & project management (shared) | delivery | 25.8% | Product / UX Designer 33%, UX Researcher 31%, Security Engineer 28%, Software Engineer 27% |
| Risk & dependency management (shared) | delivery | 25.4% | Security Engineer 51%, In-house Counsel 46%, Software Engineer 22%, Data Engineer 21% |
| Execution & delivery (shared) | delivery | 33.7% | Product / UX Designer 44%, UX Researcher 39%, In-house Counsel 38%, Software Engineer 35% |
| Process design & operational rigor (shared) | delivery | 29.8% | Data Engineer 37%, Software Engineer 32%, Security Engineer 30%, In-house Counsel 26% |
| Quality, testing & acceptance (shared) | delivery | 16.3% | Software Engineer 24%, Data Engineer 16%, ML / AI Engineer 12%, Security Engineer 6% |
| Vendor, budget & contract management (shared) | delivery | 8.5% | In-house Counsel 24%, Data Engineer 11%, Security Engineer 10%, UX Researcher 9% |
| Jira / Confluence / Asana / Linear (shared) | tools | 7.4% | Software Engineer 9%, Data Engineer 9%, Security Engineer 7%, ML / AI Engineer 6% |
| Figma / design tools (shared) | tools | 3.4% | Product / UX Designer 44%, UX Researcher 13%, Software Engineer 1%, ML / AI Engineer 1% |
| Analytics tools (Amplitude, Mixpanel, GA, Looker, Tableau) (shared) | tools | 6.5% | Data Engineer 39%, UX Researcher 10%, Software Engineer 5%, Security Engineer 5% |
| Experimentation & feature-flag tools (shared) | tools | 1.0% | Software Engineer 2%, ML / AI Engineer 1%, Product / UX Designer 0%, Data Engineer 0% |
| Office suite (Excel, PowerPoint, Google Workspace) (shared) | tools | 5.6% | Product / UX Designer 10%, In-house Counsel 10%, UX Researcher 9%, Security Engineer 6% |
| CRM & GTM tools (Salesforce, HubSpot, Gong) (shared) | tools | 4.9% | In-house Counsel 6%, UX Researcher 6%, Product / UX Designer 5%, Data Engineer 5% |
| AI tooling in daily work (shared) | tools | 27.5% | UX Researcher 54%, Product / UX Designer 43%, Data Engineer 30%, ML / AI Engineer 28% |
| Prior product management experience (shared) | credentials | 0.4% | Product / UX Designer 1%, ML / AI Engineer 0%, Software Engineer 0%, Security Engineer 0% |
| Bachelor's degree (shared) | credentials | 49.5% | Data Engineer 59%, Security Engineer 58%, Software Engineer 54%, ML / AI Engineer 48% |
| Master's / MBA (shared) | credentials | 23.7% | ML / AI Engineer 41%, UX Researcher 37%, Data Engineer 23%, Software Engineer 23% |
| PhD / research background (shared) | credentials | 12.4% | ML / AI Engineer 33%, UX Researcher 29%, In-house Counsel 13%, Security Engineer 9% |
| CS / engineering degree or background (shared) | credentials | 57.1% | ML / AI Engineer 69%, Software Engineer 66%, Data Engineer 63%, Security Engineer 54% |
| Startup / scale-up experience (shared) | credentials | 14.8% | Product / UX Designer 18%, Software Engineer 17%, ML / AI Engineer 14%, In-house Counsel 13% |
| Large-scale / big-tech experience (shared) | credentials | 19.2% | ML / AI Engineer 23%, Data Engineer 19%, Software Engineer 19%, Security Engineer 19% |
| Consulting / banking / finance background (shared) | credentials | 1.2% | UX Researcher 4%, ML / AI Engineer 2%, Product / UX Designer 2%, In-house Counsel 1% |
| Security clearance / citizenship (shared) | credentials | 7.6% | Security Engineer 13%, Software Engineer 8%, Data Engineer 8%, ML / AI Engineer 6% |
| Employment law & HR compliance | people | 2.4% | In-house Counsel 9%, Security Engineer 3%, ML / AI Engineer 2%, Software Engineer 2% |
| Third-party & vendor risk | risk | 1.1% | Security Engineer 5%, In-house Counsel 3%, Software Engineer 0%, Product / UX Designer 0% |
| Regulatory analysis & change management | risk | 3.0% | In-house Counsel 25%, Security Engineer 4%, Data Engineer 1%, Software Engineer 1% |
| Policy development & management | risk | 3.9% | In-house Counsel 14%, Security Engineer 13%, Data Engineer 3%, Software Engineer 2% |
| Security compliance frameworks (SOC 2, ISO 27001, NIST) | risk | 8.1% | Security Engineer 36%, Software Engineer 5%, ML / AI Engineer 3%, Data Engineer 3% |
| Data governance & stewardship | risk | 7.8% | Data Engineer 47%, ML / AI Engineer 8%, Security Engineer 7%, In-house Counsel 5% |
| AI governance & responsible AI | risk | 6.6% | ML / AI Engineer 15%, In-house Counsel 10%, Security Engineer 10%, Data Engineer 5% |
| Technology & cyber risk | risk | 4.2% | Security Engineer 22%, UX Researcher 2%, Software Engineer 2%, Data Engineer 2% |
| Board & committee governance | risk | 1.5% | In-house Counsel 13%, Security Engineer 1%, Data Engineer 1%, Software Engineer 1% |
| Dashboards & data visualisation | analytics | 10.4% | Data Engineer 29%, UX Researcher 24%, Product / UX Designer 11%, Security Engineer 10% |
| GRC platforms (Archer, ServiceNow GRC, OneTrust, Vanta) | tools | 0.6% | Security Engineer 3%, UX Researcher 2%, ML / AI Engineer 0%, In-house Counsel 0% |
| BI development tools (DAX, Power Query, SSRS, Qlik) | tools | 2.1% | Data Engineer 19%, ML / AI Engineer 2%, Software Engineer 1%, Product / UX Designer 0% |
| JD / law degree | credentials | 7.2% | In-house Counsel 92%, Security Engineer 1%, Data Engineer 1%, Software Engineer 0% |
| Java / JVM languages | tools | 19.8% | Software Engineer 27%, Data Engineer 26%, ML / AI Engineer 16%, Security Engineer 12% |
| JavaScript / TypeScript | tools | 18.6% | Software Engineer 28%, ML / AI Engineer 15%, Security Engineer 9%, Data Engineer 6% |
| Go | tools | 11.0% | Security Engineer 16%, Software Engineer 14%, ML / AI Engineer 11%, Data Engineer 5% |
| C / C++ | tools | 15.1% | ML / AI Engineer 20%, Software Engineer 20%, Security Engineer 11%, Data Engineer 5% |
| Rust | tools | 5.3% | Software Engineer 7%, Security Engineer 6%, ML / AI Engineer 4%, Data Engineer 1% |
| Ruby / Rails | tools | 2.8% | Software Engineer 4%, Security Engineer 3%, Data Engineer 1%, ML / AI Engineer 1% |
| C# / .NET | tools | 6.4% | Software Engineer 9%, Security Engineer 5%, ML / AI Engineer 5%, Data Engineer 3% |
| Frontend web development | engineering | 18.8% | Software Engineer 27%, Product / UX Designer 18%, Security Engineer 12%, ML / AI Engineer 12% |
| Backend services | engineering | 24.9% | Software Engineer 36%, ML / AI Engineer 23%, Data Engineer 17%, Security Engineer 11% |
| Databases | engineering | 19.3% | Data Engineer 34%, Software Engineer 27%, ML / AI Engineer 15%, Security Engineer 5% |
| Algorithms and data structures | engineering | 11.8% | ML / AI Engineer 24%, Data Engineer 13%, Software Engineer 12%, Security Engineer 5% |
| Performance and concurrency | engineering | 18.9% | ML / AI Engineer 25%, Data Engineer 25%, Software Engineer 23%, Security Engineer 7% |
| Linux and systems programming | engineering | 19.0% | Security Engineer 28%, Software Engineer 23%, ML / AI Engineer 16%, Data Engineer 10% |
| Code review and code quality | engineering | 32.2% | Software Engineer 43%, Data Engineer 40%, ML / AI Engineer 31%, Security Engineer 19% |
| Infrastructure as code | tools | 15.4% | Security Engineer 22%, Software Engineer 19%, Data Engineer 18%, ML / AI Engineer 10% |
| Observability tools | tools | 8.3% | Software Engineer 11%, Security Engineer 10%, Data Engineer 9%, ML / AI Engineer 5% |
| Workflow orchestration (Airflow, Dagster) | tools | 5.7% | Data Engineer 33%, ML / AI Engineer 7%, Software Engineer 4%, Security Engineer 2% |
| Streaming data | data_ml | 10.8% | Data Engineer 39%, Software Engineer 13%, ML / AI Engineer 8%, Security Engineer 3% |
| Lakehouse and table formats | tools | 2.8% | Data Engineer 27%, ML / AI Engineer 2%, Software Engineer 1%, Security Engineer 1% |
| Deep learning frameworks | tools | 6.5% | ML / AI Engineer 31%, Software Engineer 2%, Security Engineer 1%, Data Engineer 1% |
| Model training and fine-tuning | data_ml | 9.7% | ML / AI Engineer 39%, Data Engineer 6%, Software Engineer 4%, Security Engineer 4% |
| Model evaluation (evals) | data_ml | 12.4% | ML / AI Engineer 43%, UX Researcher 16%, Software Engineer 7%, Data Engineer 6% |
| MLOps and model serving | data_ml | 10.8% | ML / AI Engineer 37%, Data Engineer 11%, Security Engineer 7%, Software Engineer 6% |
| Inference and GPU optimization | data_ml | 5.7% | ML / AI Engineer 20%, Software Engineer 4%, Security Engineer 2%, Data Engineer 1% |
| LLM frameworks and vector stores | tools | 7.6% | ML / AI Engineer 24%, Data Engineer 8%, Security Engineer 5%, Software Engineer 4% |
| Research publications | credentials | 1.5% | ML / AI Engineer 7%, Security Engineer 1%, Software Engineer 0%, Data Engineer 0% |
| Threat modeling | security | 4.1% | Security Engineer 28%, Software Engineer 1%, ML / AI Engineer 1%, Product / UX Designer 0% |
| Application security | security | 6.3% | Security Engineer 29%, Software Engineer 4%, ML / AI Engineer 2%, Data Engineer 1% |
| Detection and incident response | security | 7.6% | Security Engineer 50%, Software Engineer 2%, ML / AI Engineer 2%, Data Engineer 1% |
| Penetration testing and red teaming | security | 3.7% | Security Engineer 24%, ML / AI Engineer 1%, Data Engineer 1%, Software Engineer 1% |
| Vulnerability management | security | 5.1% | Security Engineer 29%, Software Engineer 3%, ML / AI Engineer 1%, Data Engineer 1% |
| Cryptography | security | 6.3% | Security Engineer 25%, Data Engineer 6%, Software Engineer 5%, ML / AI Engineer 2% |
| Security certifications | credentials | 4.4% | Security Engineer 30%, Data Engineer 1%, Software Engineer 1%, ML / AI Engineer 1% |
| Interaction design | design | 4.7% | Product / UX Designer 56%, UX Researcher 24%, Software Engineer 2%, ML / AI Engineer 2% |
| Visual design | design | 3.8% | Product / UX Designer 47%, UX Researcher 7%, Software Engineer 1%, ML / AI Engineer 1% |
| Prototyping | design | 15.0% | Product / UX Designer 66%, ML / AI Engineer 26%, UX Researcher 24%, Software Engineer 10% |
| Design systems | design | 5.5% | Product / UX Designer 51%, UX Researcher 7%, Software Engineer 4%, ML / AI Engineer 2% |
| Accessibility | design | 8.2% | Product / UX Designer 27%, UX Researcher 14%, Data Engineer 9%, Software Engineer 9% |
| Design critique and rationale | design | 2.0% | Product / UX Designer 26%, UX Researcher 4%, Software Engineer 1%, ML / AI Engineer 1% |
| Design portfolio | credentials | 2.4% | Product / UX Designer 35%, UX Researcher 10%, Software Engineer 0%, Data Engineer 0% |
| Commercial contracts | legal | 3.3% | In-house Counsel 43%, Security Engineer 0%, Software Engineer 0%, Product / UX Designer 0% |
| Product counseling | legal | 2.0% | In-house Counsel 10%, Security Engineer 3%, Software Engineer 1%, ML / AI Engineer 1% |
| Privacy and data protection law | legal | 6.0% | In-house Counsel 14%, Data Engineer 10%, Security Engineer 10%, ML / AI Engineer 5% |
| Intellectual property | legal | 3.8% | In-house Counsel 21%, ML / AI Engineer 5%, Security Engineer 3%, Product / UX Designer 2% |
| Corporate and securities law | legal | 2.4% | In-house Counsel 23%, Security Engineer 1%, Software Engineer 1%, Product / UX Designer 0% |
| Litigation and disputes | legal | 3.8% | In-house Counsel 44%, UX Researcher 2%, Security Engineer 1%, Software Engineer 1% |
| Managing outside counsel | legal | 3.1% | In-house Counsel 41%, Security Engineer 0%, Data Engineer 0%, Software Engineer 0% |
| Contract management tools | tools | 0.6% | In-house Counsel 5%, Data Engineer 1%, Product / UX Designer 0%, ML / AI Engineer 0% |

## Skills no role asks for in 3% of its postings

Feature definition & scoping, OKRs & goal setting, Business cases & ROI, Experimentation & feature-flag tools, Prior product management experience, GRC platforms (Archer, ServiceNow GRC, OneTrust, Vanta)
