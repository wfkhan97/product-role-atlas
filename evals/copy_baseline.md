# Copy baseline

Written by `node evals/copy.mjs --baseline` (evals/README.md, "The copy eval"). The rule: sentences of at most
20 words, active voice, none of utilize, leverage, facilitate, in order to, via. The three gated files must show zero; the editorial data files
are reported for the editorial pass (PLAN.md, "Later"). A quoted posting sentence (_evidence.json) is a posting's own words.

| file | strings | long | passive | stoplist |
|---|---:|---:|---:|---:|
| web/copy.js (gated) | 1179 | 0 | 0 | 0 |
| web/data/sp27_campus.json (gated) | 182 | 0 | 0 | 0 |
| web/data/games.json (gated) | 54 | 0 | 0 | 0 |
| web/data/graph_mba.json | 13160 | 65 | 46 | 17 |
| web/data/role_blurbs.json | 72 | 2 | 5 | 0 |
| web/data/graph_mba/_evidence.json | 4351 | 1862 | 135 | 142 |
| web/data/subskills_mba.json | 1590 | 0 | 0 | 3 |
| web/data/subskills.json | 325 | 0 | 0 | 1 |

## The gated files

### web/copy.js (gated)

1179 strings · 0 long · 0 passive · 0 stoplist

### web/data/sp27_campus.json (gated)

182 strings · 0 long · 0 passive · 0 stoplist

### web/data/games.json (gated)

54 strings · 0 long · 0 passive · 0 stoplist

## The editorial data files

### web/data/graph_mba.json

13160 strings · 65 long · 46 passive · 17 stoplist

**sentences over 20 words** (65, first 20)

- `skills.product_strategy.what`: 21 words: Choosing where to play and how to win: which customers, which problems, which bets, and what you will deliberately not do
- `skills.product_vision.what`: 22 words: Painting a credible picture of where the product is going in 2–5 years, vivid enough that teams can make decisions against it
- `skills.prioritization.what`: 23 words: Deciding what to do first, what to defer, and what to kill, with a rationale others can check, under constraints you don't control
- `skills.prioritization.fields.product.line`: 21 words: Prioritised a backlog of 200 requests into 4 quarterly themes with a scoring model; said no to 150 with written reasons
- `skills.prd.what`: 24 words: Writing the document that tells engineering and design exactly what problem to solve, for whom, with what constraints, and how we'll know it worked
- `skills.product_lifecycle.build[0]`: 21 words: Project: ship something real end to end (a side project, a no-code tool, an internal tool) and write up each stage
- `skills.feature_definition.what`: 21 words: Deciding what's in and out of a feature so it solves the problem without ballooning: the minimum that proves the idea
- `skills.product_sense.what`: 21 words: Judgment about what makes a product good: spotting the right problem, the elegant solution, and the detail that will annoy users
- `skills.ux_design_collab.what`: 22 words: Working with designers as a partner: framing the problem, reviewing work with specifics, and understanding enough of the craft to be useful
- `skills.problem_solving.fields.people.line`: 21 words: Analysed attrition in a 500-person unit, found 2 manager spans driving 60% of exits, and fixed the structure in a quarter
- `skills.problem_solving.fields.role:ma_integration.line`: 22 words: Traced a 6-week slip in the systems migration to 2 vendor dependencies; re-planned and recovered the date for 3 of 4 sites
- `skills.problem_solving.fields.role:corp_dev.reads_as`: 21 words: Breaking a deal question into the analyses that answer it: is this target worth it, at what price, with what risks
- `skills.problem_solving.fields.role:treasury.line`: 23 words: Traced a $6M cash forecast miss to 2 collection accounts in a week; the fix held forecast error under 3% for the year
- `skills.pricing_packaging.what`: 23 words: Deciding what to charge, how to bundle features into tiers, and how the model shapes who buys and how they use the product
- `skills.gtm.fields.supply_chain.line`: 21 words: Took a new category strategy to 12 business units with a buying guide and preferred suppliers; 85% compliance in a year
- `skills.market_research.fields.role:commercial_banking_rm.line`: 22 words: Mapped 120 mid-market companies in 3 industries for the region's calling plan; 15 became clients with $40M of loans in a year
- `skills.sales_enablement.what`: 21 words: Giving sales and customer-facing teams what they need to sell and support the product: training, materials, and a feedback channel back
- `skills.customer_interviews.what`: 23 words: Talking to users one-on-one to learn how they actually behave and what they struggle with, without leading them to the answer you want
- `skills.personas_jtbd.what`: 26 words: Describing who you are building for in a way that is specific enough to change decisions: segments, personas, and the jobs they hire the product for
- `skills.surveys_feedback.what`: 22 words: Collecting feedback at scale and turning it into something the team can act on: surveys, NPS, beta programs, and in-product feedback loops

**passive constructions** (46, first 20)

- `kinds.practice.how`: were trusted — "Say who you worked with, how many, and what you were trusted with."
- `kinds.behaviour.meaning`: was done — "A way of working that every field asks for and no one lists. Shown through how the other work was done."
- `skills.prd.subskills[4].example`: is written — "Walk engineering through the doc before a line of code is written."
- `skills.feature_definition.build[2]`: is being planned — "At work: propose the smaller first release of whatever is being planned."
- `skills.feature_definition.build[2]`: being planned — "At work: propose the smaller first release of whatever is being planned."
- `skills.ux_design_collab.subskills[3].example`: is justified — "Know when a new pattern is justified versus reusing the system."
- `skills.positioning_messaging.what`: is described — "Deciding how the product is described: to whom, against what alternative, and why it is better, in words customers repeat."
- `skills.positioning_messaging.fields.product.reads_as`: is described — "How the product is described: the value proposition and the narrative marketing and sales repeat."
- `skills.customer_interviews.ladder.lead`: is funded — "Ensures continuous discovery is funded and practiced across teams."
- `skills.personas_jtbd.build[2]`: are backed — "At work: audit whether the current personas are backed by data; propose fixes."
- `skills.metrics_kpis.fields.consulting_strategy.reads_as`: is tracked — "The scorecard a transformation is tracked on: baseline, targets and the value delivered."
- `skills.metrics_kpis.fields.finance.reads_as`: are defined — "Management reporting KPIs: the numbers in the monthly package and how they are defined."
- `skills.data_modeling.what`: is structured — "Understanding how data is structured, moved, and governed: pipelines, warehouses, schemas, quality, and ownership."
- `skills.technical_fluency.what`: is built — "Understanding how software is built well enough to make good trade-offs with engineers, without needing to write the code yourself."
- `skills.technical_fluency.subskills[1].example`: is handled — "Read the PR to check the edge case is handled instead of asking."
- `skills.system_architecture.what`: are structured — "Understanding how large systems are structured and why: services, data stores, scaling limits, reliability, and what changes cost."
- `skills.ai_ml.subskills[0].example`: was labelled — "Know what the model is predicting, from what data, and how it was labelled."
- `skills.security_privacy.subskills[0].example`: be abused — "List how a feature could be abused before it ships."
- `skills.automotive_autonomy.subskills[2].example`: is won — "Understand how a program of record is won and funded."
- `skills.healthcare.subskills[3].example`: is paid — "Tie the feature to a quality measure the customer is paid on."

**stoplist words (utilize, leverage, facilitate, in order to, via)** (17)

- `skills.launch.signals[0]`: via — "Launched the new onboarding to 100% in 3 weeks with no P1 incidents via a staged rollout."
- `skills.growth_loops.signals[0]`: via — "Owned activation; day-7 retention rose from 31% to 44% via onboarding redesign."
- `skills.communication.subskills[4].name`: facilitate — "Listening & facilitation"
- `skills.collaboration.fields.banking_investing.line`: leverage — "Coordinated a 9-person deal team across M&A, leveraged finance and counsel to close a $350M acquisition in 4 months."
- `skills.figma.signals[1]`: facilitate — "Facilitated journey-mapping workshops in Miro with 20 stakeholders."
- `skills.credit_analysis.build.bank[0]`: leverage — "Read "The Credit Risk Evaluation Process" in the OCC handbook Rating Credit Risk. Note cash flow, liquidity and leverage."
- `skills.client_coverage.build.bank[1]`: leverage — "Read "The Credit Risk Evaluation Process" in the OCC handbook Rating Credit Risk. Note cash flow, liquidity and leverage."
- `skills.lean_six_sigma.subskills[4].example`: facilitate — "You facilitate Kaizen events with employees, customers, and suppliers."
- `skills.succession_workforce_planning.subskills[8].example`: facilitate — "You facilitate talent review and calibration sessions to identify high-potential talent for succession planning."
- `skills.learning_design.what`: facilitate — "Designing and delivering training: needs analysis, curricula, facilitation and measuring whether it worked."
- `skills.learning_design.subskills[0].name`: facilitate — "Workshop and session facilitation"
- `skills.learning_design.subskills[8].example`: facilitate — "You design curricula, facilitator guides, and job aids using instructional-design principles."
- `skills.leadership_dev_coaching.how_shown.verbs[3]`: facilitate — "facilitated"
- `skills.leadership_dev_coaching.subskills[0].example`: facilitate — "You facilitate talent reviews and succession planning."
- `skills.leadership_dev_coaching.subskills[6].example`: facilitate — "You facilitate leadership assessments and development planning."
- `skills.governance_design.subskills[5].name`: facilitate — "Decision forum facilitation"
- `skills.resource_planning.how_shown.measures[1]`: utilize — "utilisation"

### web/data/role_blurbs.json

72 strings · 2 long · 5 passive · 0 stoplist

**sentences over 20 words** (2)

- `_note`: 25 words: One sentence per role on what the person does, shown under the title on the role page and under each role on a field page
- `product.product_engineer`: 21 words: Builds the feature end to end, spec to shipped code, with AI coding tools; owns what it does to the numbers

**passive constructions** (5)

- `_note`: are keyed — "One sentence per role on what the person does, shown under the title on the role page and under each role on a field page. Hand-written 202…"
- `pmm`: is described — "Decides how a product is described and sold: positioning, launches, what sales says."
- `governance`: is run — "Runs the policies, committees and controls that decide how the company is run."
- `product.pmm`: is described — "Decides how a product is described and sold: positioning, launches, what sales says."
- `product.product_analyst`: is used — "Measures how a product is used and tells the team what to change."

### web/data/graph_mba/_evidence.json

4351 strings · 1862 long · 135 passive · 142 stoplist

**sentences over 20 words** (1862, first 20)

- `roadmap.staff[0]`: 38 words: Act as a key contributor to the roadmap for all categories of Qualcomm Snapdragon chipsets: - Participate in synchronizing the Technology IP roadmaps…
- `roadmap.staff[1]`: 21 words: Product Strategy and Roadmap: Own the product vision, strategy, and multi-year roadmap for autonomous delivery, from R&D through deployment at scale
- `roadmap.senior[0]`: 22 words: Product Strategy & Roadmap: Own the end-to-end product strategy, vision, and 12-18 month roadmap for Muon Space’s Information Systems and internal to…
- `roadmap.senior[1]`: 22 words: Own the product roadmap: Define, prioritize, and maintain a clear product roadmap for Skylo's service offerings aligned with the overall company stra…
- `roadmap.senior[2]`: 26 words: Roadmap and Rollout: Be a true partner in shaping the annual people program roadmap, bringing a clear POV on recommendations that move the People tea…
- `roadmap.lead[0]`: 22 words: Roadmap Mastery: Serve as the field’s source of truth on the Identity product roadmap, translating upcoming strategic vision into clear customer posi…
- `roadmap.lead[1]`: 21 words: Lead the evolution of, and effectively manage, the FP&A technology roadmap and ensure alignment with both the finance and enterprise roadmaps
- `roadmap.lead[2]`: 23 words: Define and oversee a testing roadmap: Build a roadmap for new packaging, pricing, and positioning concepts, and translate results into a go-to-market…
- `roadmap.early[0]`: 26 words: Business Case Analyses, Business Needs, Business Outcomes, Business Processes, Collaboration, Cross-Functional Teamwork, Product Discovery, Product M…
- `roadmap.early[2]`: 22 words: Developing technology roadmaps in conjunction with product lines within the company, and executing IRAD, CRAD, and programs in support of those roadm…
- `roadmap.early[3]`: 26 words: Ability to lead the charge to create a roadmap to progress from the current state to the new future state, and drive execution against that roadmap
- `product_strategy.early[2]`: 21 words: Are equally comfortable with strategic thinking and technical execution-you want to define the strategy and build the system that delivers it
- `product_strategy.senior[0]`: 21 words: 6+ years of management consulting experience in corporate strategy, business unit strategy, strategic planning, growth strategy, commercial strategy,…
- `product_strategy.senior[1]`: 21 words: Communicate and gain support for product vision and strategy and drive organizational alignment to drive execution of product strategies and roadmaps
- `product_strategy.senior[3]`: 22 words: Product Strategy & Roadmap: Own the end-to-end product strategy, vision, and 12-18 month roadmap for Muon Space’s Information Systems and internal to…
- `product_strategy.staff[0]`: 21 words: Experience developing business strategy, portfolio strategy, pricing strategy, product strategy, or growth strategies within technology, devices, har…
- `product_strategy.lead[1]`: 28 words: The Strategic Planning Senior Director is a senior leadership role responsible for driving enterprise strategic planning and ensuring alignment of st…
- `product_strategy.lead[2]`: 22 words: Provide strategic direction for PGS AI governance and quality tools, including AIRIF and AIQAS, and their alignment with the PGS platform strategy
- `product_vision.senior[1]`: 27 words: Inspire the team with the product vision, generate buy-in for the product vision with leadership and partner teams, and work cross-functionally to br…
- `product_vision.senior[2]`: 25 words: Strategy & Vision - Define the multi‑year product vision and strategy for Microsoft AI Experience Index Pipelines, related Success metrics, Feedback …

**passive constructions** (135, first 20)

- `feature_definition.senior[2]`: is fast paced — "Our work is fast paced and dynamic, driving engagement across product architecture, feature definition and program execution across multipl…"
- `customer_success.early[2]`: is composed — "The Customer Success organization is composed of four teams: pre-sales, customer success management, account management and support."
- `partnerships.early[2]`: be a trusted — "This candidate will be a trusted advisor for our OEM and ISV partnerships and will be focusing on driving a successful GTM business strateg…"
- `partnerships.early[2]`: be measured — "This candidate will be a trusted advisor for our OEM and ISV partnerships and will be focusing on driving a successful GTM business strateg…"
- `pnl.senior[3]`: are met — "PM will be responsible for profit and loss (P&L) accountability, driving financial performance on assigned projects and ensuring business t…"
- `python_r.early[3]`: are also required — "Air Bag diagnostic knowledge and replacement after vehicles have been in a collision, R/I dash and motors, and R/R front suspension parts a…"
- `technical_fluency.senior[2]`: is highly valued — "An MBA or a mandatory computer science degree (though a technical background is highly valued, we care about what you can build, not your c…"
- `technical_fluency.staff[0]`: is also valued — "Bachelor’s or Master’s degree in Computer Science, Engineering, or a related technical discipline; an MBA, advanced technical degree, or eq…"
- `technical_fluency.early[2]`: is often required — "Project management skills, rather than technical skills, are key, but a strong technical background is often required to manage competing i…"
- `cloud.staff[0]`: is tied — "Familiarity with cloud/platform environments such as OCI, AWS, Azure, or Google Cloud (IaaS/PaaS/SaaS), especially where supply planning is…"
- `cloud.early[3]`: is tied — "Familiarity with cloud/platform environments such as OCI, AWS, Azure, or Google Cloud (IaaS/PaaS/SaaS), especially where supply planning is…"
- `automotive_autonomy.senior[0]`: be kept — "Experience in environments where physical asset state and software state must be kept reconciled, in autonomous vehicles, automotive, EV, r…"
- `telecom.lead[2]`: be obtained — "If you will be working at home occasionally or permanently, the internet connection must be obtained through a cable broadband or fiber opt…"
- `cross_functional.senior[1]`: are managed — "Lead Cross-Functional Teams: Guide and collaborate with cross-functional teams (Engineering, Design, Product Marketing, Platform Risk, Comp…"
- `influence.staff[0]`: are skilled — "You are skilled at influencing without authority, building trust with Product, Policy, Legal, Investigations, and regional partners to driv…"
- `exec_communication.staff[1]`: are realized — "QBR Cadence & Account Growth: Lead structured Quarterly Business Reviews (QBRs) and executive steering committees to ensure joint milestone…"
- `people_management.senior[0]`: are met — "This role involves managing and leading a team of Operations and Area Managers, coaching and mentoring them to ensure performance objective…"
- `ownership.senior[0]`: is overlooked — "Accountability and Ownership: Strong sense of ownership and the drive to master your craft, take initiative, and ensure no detail is overlo…"
- `ownership.senior[1]`: are driven — "Entrepreneurial and Self-Motivated: You are driven and proactive, taking ownership of your role and responsibilities."
- `ownership.senior[2]`: being a self-motivated — "Experience establishing clear accountability and ownership for project deliverables across other teams while taking accountability for indi…"

**stoplist words (utilize, leverage, facilitate, in order to, via)** (142, first 20)

- `product_strategy.staff[2]`: leverage — "Drive Strategy and Innovation: Leverage market trends, customer insights, and competitive analysis to define the strategy and deliver the b…"
- `prioritization.early[0]`: via — "Drive impact via ruthless prioritization by clearly defining problems, solution options forward, clarity on both business & technical trade…"
- `prioritization.staff[1]`: utilize — "Ambiguity to Execution: A demonstrated ability to lead ambiguous product spaces from zero to strategy, through execution, utilizing data an…"
- `feature_definition.senior[1]`: leverage — "Warehouse MVP: Deliver a WMS MVP focused on highest-leverage workflows: receiving, putaway, replenishment, pick/pack, ship confirmation, cy…"
- `problem_solving.senior[1]`: utilize — "Proven business analytical skills (ability to utilize critical thinking and analytical skills to identify issues and trends, develop soluti…"
- `user_research.lead[1]`: leverage — "Lead customer research and insight programs, leveraging quantitative and qualitative methodologies to identify unmet customer needs, emergi…"
- `discovery.early[1]`: facilitate — "Facilitate discovery sessions, stakeholder interviews, and process reviews to understand operating needs, pain points, controls, and desire…"
- `personas_jtbd.early[3]`: leverage — "Segmentation & Personalization: Leverage audience insights to build sophisticated segments, ensuring highly relevant content for diverse ri…"
- `surveys_feedback.staff[2]`: leverage — "Leverage AI to draft PRDs, map user flows, validate product launch readiness, synthesize research and customer feedback, produce competitiv…"
- `surveys_feedback.staff[3]`: utilize — "Familiarity with customer success metrics and operational KPIs such as Net Promoter Score (NPS), Average Handle Time (AHT), First Contact R…"
- `metrics_kpis.senior[3]`: utilize — "Designing and developing reports and dashboards to measure performance metrics of clients, utilizing Salesforce Reports and Dashboards and …"
- `metrics_kpis.lead[2]`: leverage — "KPIs and dashboards: Develop and refine KPIs, scorecards, dashboards, and analytical frameworks that highlight trends, track operating leve…"
- `data_driven.early[3]`: leverage — "Data Analytics & Business Intelligence: Leverage data analytics and visualization tools to analyze datasets, identify spend trends, and gen…"
- `data_driven.senior[1]`: utilize — "Utilizes critical thinking and data analytics mindset to provide management with data driven results and recommendations and promote focus …"
- `ab_testing.lead[1]`: via — "6+ years measuring commercial effectiveness via promotional response analysis, closed-loop measurement, A/B testing, or quasi-experimental …"
- `sql.lead[2]`: in order to — "Experience with SQL, ETL/data pipelines, excel, and BI Tools (Looker or equivalent in order to properly query data sets for data cleanlines…"
- `python_r.senior[3]`: utilize — "Leverage object-oriented programming (OOP) principles, utilizing C++, Python and R programming languages to implement high performance mode…"
- `python_r.senior[3]`: leverage — "Leverage object-oriented programming (OOP) principles, utilizing C++, Python and R programming languages to implement high performance mode…"
- `data_modeling.lead[2]`: utilize — "Enterprise data architecture utilizing Snowflake, Databricks, data lakes, data warehouses, master data management, metadata management, AI …"
- `statistics.early[0]`: utilize — "Monitor and Review historical usage trends, research demand drivers, utilize forecast data ad statistical forecast models, analyze auto gen…"

### web/data/subskills_mba.json

1590 strings · 0 long · 0 passive · 3 stoplist

**stoplist words (utilize, leverage, facilitate, in order to, via)** (3)

- `learning_design[0].name`: facilitate — "Workshop and session facilitation"
- `governance_design[5].name`: facilitate — "Decision forum facilitation"
- `communication[4].name`: facilitate — "Listening & facilitation"

### web/data/subskills.json

325 strings · 0 long · 0 passive · 1 stoplist

**stoplist words (utilize, leverage, facilitate, in order to, via)** (1)

- `communication[4].name`: facilitate — "Listening & facilitation"
