# Extraction audit: the MBA role set, regex against model judgment

Produced by `pipeline/experiments/skill_audit.py` on 2026-10-11. For each skill, a sample of postings the patterns tagged (accepted = the model agrees the posting asks for it) and a sample from the skill's three most common roles that the patterns did not tag (missed = the model says the posting asks for it). Model answers at probability 0.5 or more count as yes. The samples are small, so read each row as a flag, not a measurement. After a taxonomy change rerun with `--reuse` to recompute the regex side without new model calls.

Across 180 skills: the model accepts 1,371 of 1,678 tagged samples (82%) and finds the skill in 569 of 1,911 untagged samples from the same roles (30%).

| skill | cluster | tagged: accepted | untagged: missed |
|---|---|---|---|
| BI development tools (DAX, Power Query, SSRS, Qlik) | tools | 4/10 (40%) | 0/10 |
| Transformation programme leadership | strategy | 4/10 (40%) | 7/10 |
| Board & committee governance | risk | 3/7 (43%) | 0/13 |
| HRIS (Workday, SuccessFactors, ADP) | tools | 4/9 (44%) | 2/11 |
| Development, entitlements & construction | real_estate | 4/9 (44%) | 1/10 |
| HR operations, onboarding & payroll | people | 5/10 (50%) | 2/10 |
| Procurement platforms (Ariba, Coupa) | tools | 5/10 (50%) | 0/10 |
| Leasing & tenant relations | real_estate | 5/10 (50%) | 1/10 |
| Property types (multifamily, industrial, office, retail) | real_estate | 4/8 (50%) | 2/12 |
| Risk, audit & compliance certifications (CISA, CRISC, CIA, FRM, CAMS, CRCM, CIPP) | credentials | 5/9 (56%) | 0/11 |
| Investor relations & fundraising | finance | 4/7 (57%) | 1/13 |
| Portfolio-company value creation | deals | 4/7 (57%) | 1/13 |
| Credit analysis & underwriting | deals | 6/10 (60%) | 5/10 |
| Demand & supply planning (S&OP) | operations | 6/10 (60%) | 3/10 |
| GRC platforms (Archer, ServiceNow GRC, OneTrust, Vanta) | tools | 6/10 (60%) | 1/10 |
| Audit & SOX | risk | 6/10 (60%) | 3/10 |
| Shift & labour management | operations | 6/10 (60%) | 4/10 |
| Deal sourcing & pipeline | deals | 5/8 (62%) | 3/12 |
| Performance management & talent reviews | people | 5/8 (62%) | 0/12 |
| Lean & Six Sigma methods | operations | 6/9 (67%) | 1/11 |
| Litigation & economic consulting | strategy | 4/6 (67%) | 0/14 |
| M&A execution | deals | 6/9 (67%) | 2/11 |
| Retail category & assortment planning | operations | 6/9 (67%) | 0/10 |
| Security compliance frameworks (SOC 2, ISO 27001, NIST) | risk | 6/9 (67%) | 0/11 |
| Channel, reseller & distributor sales | sales | 7/10 (70%) | 1/10 |
| Banking relationships & product cross-sell | deals | 7/10 (70%) | 1/10 |
| Client engagement delivery | strategy | 7/10 (70%) | 6/10 |
| Budget, cost & schedule control | delivery | 7/10 (70%) | 7/10 |
| Creative development & agency management | marketing | 7/10 (70%) | 1/10 |
| Data governance & stewardship | risk | 7/10 (70%) | 1/10 |
| Equipment, facilities & maintenance | operations | 7/10 (70%) | 1/10 |
| Enterprise risk frameworks & reporting | risk | 7/10 (70%) | 3/10 |
| Executive thought partnership | strategy | 7/10 (70%) | 7/10 |
| Credit, market & liquidity risk | risk | 7/10 (70%) | 2/10 |
| FINRA licences (SIE, Series 7, 63, 79) | credentials | 7/10 (70%) | 0/10 |
| Government contracts & subcontracts (FAR/DFARS) | operations | 7/10 (70%) | 0/9 |
| Investment memos & committee approval | deals | 7/10 (70%) | 0/9 |
| Leadership development & coaching | people | 7/10 (70%) | 6/10 |
| Operational risk & resilience | risk | 7/10 (70%) | 3/10 |
| Partner co-selling & joint go-to-market | sales | 7/10 (70%) | 1/10 |
| Digital & performance marketing | marketing | 7/10 (70%) | 2/10 |
| Pipeline management & sales forecasting | sales | 7/10 (70%) | 5/10 |
| Policy development & management | risk | 7/10 (70%) | 4/10 |
| PR & communications | marketing | 7/10 (70%) | 3/10 |
| Quality systems & standards | operations | 7/10 (70%) | 2/10 |
| Regulatory analysis & change management | risk | 7/10 (70%) | 6/10 |
| Renewals, upsell & expansion | sales | 7/10 (70%) | 4/10 |
| Sales process & operations | sales | 7/10 (70%) | 3/9 |
| Self-service BI enablement | analytics | 7/10 (70%) | 3/10 |
| SEO, website & conversion optimisation | marketing | 7/10 (70%) | 0/10 |
| Talent acquisition & recruiting | people | 7/10 (70%) | 3/10 |
| Territory & account planning | sales | 7/10 (70%) | 7/10 |
| Valuation (DCF, comps, LBO) | deals | 7/10 (70%) | 3/10 |
| Consumer-finance regulations (UDAAP, fair lending) | risk | 5/7 (71%) | 0/13 |
| Quota & revenue target attainment | sales | 5/7 (71%) | 6/12 |
| Accounting: close, GAAP & controls | finance | 6/8 (75%) | 2/12 |
| Compliance programme management | risk | 6/8 (75%) | 4/12 |
| Content & social media marketing | marketing | 6/8 (75%) | 2/12 |
| Consumer-goods brand work (CPG innovation, shopper & trade) | marketing | 6/8 (75%) | 1/12 |
| FX & interest-rate hedging | finance | 3/4 (75%) | 0/16 |
| Learning platforms & authoring tools (LMS, Articulate) | tools | 6/8 (75%) | 0/12 |
| Lifecycle, CRM & email marketing | marketing | 6/8 (75%) | 1/12 |
| Investment portfolio management | deals | 6/8 (75%) | 3/12 |
| Purchasing & procure-to-pay | operations | 6/8 (75%) | 4/12 |
| Property acquisitions & dispositions | real_estate | 3/4 (75%) | 3/15 |
| Property & asset management | real_estate | 6/8 (75%) | 3/12 |
| Quota-carrying sales experience | credentials | 9/12 (75%) | 5/8 |
| Advanced Excel modelling | tools | 8/10 (80%) | 6/10 |
| Brand strategy & equity | marketing | 8/10 (80%) | 4/10 |
| Capital markets & financing transactions | deals | 8/10 (80%) | 3/10 |
| Controls design & testing | risk | 8/10 (80%) | 2/10 |
| Deal structuring & negotiation | deals | 8/10 (80%) | 8/10 |
| Demand generation & ABM | marketing | 8/10 (80%) | 1/10 |
| Employee relations & investigations | people | 8/10 (80%) | 2/10 |
| Employee engagement & culture | people | 8/10 (80%) | 7/10 |
| ERP & finance systems (SAP, Oracle, NetSuite, Anaplan, Hyperion) | tools | 8/10 (80%) | 2/10 |
| Executive & equity compensation | people | 8/10 (80%) | 0/10 |
| Finance, accounting or economics degree | credentials | 8/10 (80%) | 0/10 |
| AML, KYC & sanctions | risk | 8/10 (80%) | 0/10 |
| Employment law & HR compliance | people | 8/10 (80%) | 8/10 |
| Investment research & asset classes | deals | 8/10 (80%) | 7/10 |
| Logistics & transportation | operations | 8/10 (80%) | 3/10 |
| Pitch books & deal marketing materials | deals | 8/10 (80%) | 5/10 |
| Proposals, RFP responses & capture | sales | 8/10 (80%) | 2/10 |
| Real estate underwriting, pro formas & market comps | real_estate | 4/5 (80%) | 2/14 |
| RFx & competitive bidding | operations | 8/10 (80%) | 3/10 |
| Workplace safety & EHS | operations | 8/10 (80%) | 2/10 |
| Strategic planning cycles | strategy | 8/10 (80%) | 4/10 |
| Succession & workforce planning | people | 8/10 (80%) | 4/10 |
| Supply-chain planning & execution systems (WMS, TMS, Kinaxis) | tools | 8/10 (80%) | 1/10 |
| Technology & digital strategy | strategy | 8/10 (80%) | 6/10 |
| Warehouse & fulfilment operations | operations | 8/10 (80%) | 1/10 |
| Treasury workstations & bank portals | tools | 5/6 (83%) | 0/14 |
| Wealth planning & private clients | deals | 5/6 (83%) | 0/14 |
| Financial & management reporting | finance | 11/13 (85%) | 6/7 |
| Business unit / site leadership | strategy | 6/7 (86%) | 6/13 |
| Due diligence | deals | 6/7 (86%) | 4/13 |
| Performance improvement & cost reduction | strategy | 13/15 (87%) | 4/5 |
| Marketing campaigns | marketing | 9/10 (90%) | 6/10 |
| Capacity & production planning | operations | 9/10 (90%) | 5/10 |
| Capital projects & equipment spend | operations | 9/10 (90%) | 1/10 |
| Compensation programme design | people | 9/10 (90%) | 0/10 |
| Consultative & solution selling | sales | 9/10 (90%) | 8/10 |
| Customer health & business reviews | sales | 9/10 (90%) | 8/10 |
| Dashboards & data visualisation | analytics | 9/10 (90%) | 1/10 |
| Debt financing & capital structure | finance | 9/10 (90%) | 3/10 |
| Earned value management & integrated master schedule | delivery | 9/10 (90%) | 0/10 |
| Executive decks & storylining | strategy | 9/10 (90%) | 5/10 |
| Governance frameworks & decision forums | risk | 9/10 (90%) | 4/10 |
| HR business partnering | people | 9/10 (90%) | 7/10 |
| Hypothesis-driven analysis & problem framing | strategy | 9/10 (90%) | 10/10 |
| Post-merger integration | deals | 9/10 (90%) | 2/10 |
| Technology & cyber risk | risk | 9/10 (90%) | 1/10 |
| JD / law degree | credentials | 9/10 (90%) | 0/10 |
| Lean Six Sigma belt | credentials | 9/10 (90%) | 1/10 |
| Pay benchmarking & job architecture | people | 9/10 (90%) | 1/10 |
| Marketing measurement & attribution | marketing | 9/10 (90%) | 6/10 |
| Model risk & validation | risk | 9/10 (90%) | 1/10 |
| New product introduction & manufacturing ramp | operations | 9/10 (90%) | 1/10 |
| Customer onboarding & adoption | sales | 9/10 (90%) | 6/10 |
| Operating model design | strategy | 9/10 (90%) | 3/10 |
| Productivity & service-level performance | operations | 9/10 (90%) | 9/10 |
| Organization design & effectiveness | people | 9/10 (90%) | 4/10 |
| Prospecting & lead generation | sales | 9/10 (90%) | 6/10 |
| Rotational programme assignments | people | 9/10 (90%) | 0/10 |
| Scenario & sensitivity modelling | finance | 9/10 (90%) | 5/10 |
| Strategic sourcing & category strategy | operations | 9/10 (90%) | 6/10 |
| Strategic initiatives & special projects | strategy | 9/10 (90%) | 6/10 |
| Spend analysis & cost savings | operations | 9/10 (90%) | 6/10 |
| Analytics packages (SAS, Alteryx, Minitab) | tools | 9/10 (90%) | 0/10 |
| Supplier negotiation & contracts (MSAs, SOWs) | operations | 9/10 (90%) | 4/10 |
| Supply-chain & procurement certifications (CPSM, CPIM, CSCP) | credentials | 9/10 (90%) | 0/10 |
| Supply-market intelligence & benchmarking | operations | 9/10 (90%) | 7/10 |
| Supplier risk & supply continuity | operations | 9/10 (90%) | 5/10 |
| Syndicated retail data (Nielsen, Circana) | tools | 9/10 (90%) | 0/10 |
| Cost modelling (TCO, should-cost) | operations | 9/10 (90%) | 1/10 |
| Budgeting & forecasting | finance | 10/11 (91%) | 7/9 |
| Deal negotiation & structuring | sales | 11/12 (92%) | 7/8 |
| Reporting automation & ad hoc analysis | analytics | 11/12 (92%) | 6/8 |
| Ad platforms (Google Ads, Meta, LinkedIn) | tools | 2/2 (100%) | 0/18 |
| AI governance & responsible AI | risk | 10/10 (100%) | 2/10 |
| AI strategy & adoption | strategy | 10/10 (100%) | 5/10 |
| Analytics requirements & business partnering | analytics | 10/10 (100%) | 8/9 |
| Benefits design & administration | people | 4/4 (100%) | 1/16 |
| Capital allocation & capex | finance | 10/10 (100%) | 6/10 |
| Cash & liquidity management | finance | 6/6 (100%) | 2/14 |
| CFA / CAIA | credentials | 10/10 (100%) | 0/10 |
| Change management | strategy | 10/10 (100%) | 8/10 |
| Compliance monitoring & testing | risk | 10/10 (100%) | 6/10 |
| Consumer insights | marketing | 10/10 (100%) | 6/10 |
| CPA / CMA | credentials | 10/10 (100%) | 0/10 |
| CTP (Certified Treasury Professional) | credentials | 10/10 (100%) | 0/10 |
| Customer stories & advocacy | marketing | 10/10 (100%) | 2/10 |
| Events & field marketing | marketing | 5/5 (100%) | 2/15 |
| Finance business partnering | finance | 11/11 (100%) | 8/9 |
| Financial statements (P&L, balance sheet, cash flow) | finance | 10/10 (100%) | 6/10 |
| HR certification (SHRM, PHR/SPHR) | credentials | 10/10 (100%) | 0/10 |
| Inventory management | operations | 10/10 (100%) | 2/10 |
| Issue management & remediation | risk | 10/10 (100%) | 9/10 |
| Key account & client relationships | sales | 10/10 (100%) | 9/10 |
| Learning programmes & instructional design | people | 5/5 (100%) | 3/15 |
| Market data platforms (Bloomberg, Capital IQ, FactSet, PitchBook) | tools | 10/10 (100%) | 0/10 |
| Marketing automation (Marketo, Braze, Pardot) | tools | 4/4 (100%) | 0/16 |
| Operating cadence & business reviews | strategy | 10/10 (100%) | 8/10 |
| People analytics & HR reporting | people | 10/10 (100%) | 5/10 |
| Project & change certifications (PMP, Prosci) | credentials | 10/10 (100%) | 0/10 |
| Scheduling tools (MS Project, Primavera, Smartsheet) | tools | 4/4 (100%) | 3/16 |
| PMO governance & programme reviews | delivery | 10/10 (100%) | 5/10 |
| Real estate software (Argus, CoStar, Yardi) | tools | 10/10 (100%) | 0/10 |
| Regulator exams & relations | risk | 3/3 (100%) | 0/17 |
| Resource planning for programmes | delivery | 10/10 (100%) | 3/10 |
| Rewards certification (CCP, CEBS) | credentials | 10/10 (100%) | 0/10 |
| Root-cause analysis & corrective action | operations | 10/10 (100%) | 1/10 |
| Sales team leadership & coaching | sales | 5/5 (100%) | 4/15 |
| Corporate & growth strategy development | strategy | 10/10 (100%) | 9/9 |
| Supplier relationship & performance management | operations | 10/10 (100%) | 6/9 |
| Insights, synthesis & recommendations | strategy | 11/11 (100%) | 8/9 |
| Third-party & vendor risk | risk | 10/10 (100%) | 0/10 |
| Trade compliance & export controls | risk | 4/4 (100%) | 2/16 |
| Variance analysis | finance | 10/10 (100%) | 10/10 |
