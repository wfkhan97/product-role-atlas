/* Product Role Atlas — resume matcher.
   Pure logic, no DOM. Loaded as a classic script in the browser (window.Matcher) and required from
   node by evals/run.mjs. app.js renders the result; evals/ checks it against sample resumes.

   Pipeline: parseResume(text) -> lines with section / role context
             tag(parsed)        -> per-skill evidence {strength, lines, subs, via}
             requirements(...)  -> core / common / differentiator tiers, one industry slot, one AI slot
             readRoles(...)     -> the role family of each job title, from data (the product families are built in)
             standing(...)      -> skills presumed from a role the person held at or above the target level
             score(...)         -> coverage, depth, breadth, level read, persona, what-if */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Matcher = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SOFT = new Set(["ownership", "adaptability", "collaboration", "communication", "influence", "problem_solving", "customer_obsession", "product_sense", "execution"]);
  const AI_GROUP = ["ai_ml", "genai_llm", "ai_tools"];
  const TIER = { core: 0.5, common: 0.25, diff: 0.1 };
  const CREDIT = [0, 0.5, 1, 1]; // by evidence strength: none / mentioned / done / done with an outcome
  // A person who held the target role was qualified to hold it. A requirement their resume does not show is then
  // presumed, not a gap, for less credit than a line of evidence earns (so adding the line always helps).
  // Credit by how sure the presumption is: what most postings at the level they held ask for (core) counts more
  // than what a quarter to a half of them ask for (common); holding a level above the target counts more than
  // holding the same level; their own employer's postings asking for it adds a little. Two things are never
  // presumed: the industry, and AI literacy, which is a recent ask that years in the role do not imply.
  const PRESUMED = { above: { core: 0.75, common: 0.6 }, same: { core: 0.6, common: 0.4 }, employer: 0.1, minYears: 1, minEmployerPostings: 5 };
  const LEVEL_ORDER = ["associate", "mid", "senior", "lead"];
  // A role that covers another role's work: a product manager does what a product owner does.
  const COVERS = { product_owner: ["pm"] };
  const LEVEL_GROUP = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };
  // which product family a job title belongs to (first match wins; a plain product title is "pm")
  const TITLE_FAMILY = [["tpm", /technical program|\bTPM\b/i], ["pmm", /product marketing/i], ["product_owner", /product owner/i], ["product_analyst", /product (data )?(analyst|analytics|scientist)/i], ["product_ops", /product (operations|ops)/i]];
  const PRODUCT_FAMILIES = new Set(["pm", "product_owner", "tpm", "pmm", "product_analyst", "product_ops"]);
  // A title that is only a grade. At a bank, a fund or a consulting firm the employer says what the job is
  // ("Associate" under "Harris Williams, Investment Banking"), so the whole job line is read, not the title alone.
  const BARE_RANK = /^(summer |senior |sr\.? |junior |jr\.? )?(analyst|associate|vice president|vp|principal|consultant|manager|director|managing director|partner|intern)( intern)?$/i;
  const LEVEL_TO_LADDER = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };
  const LADDER_LABEL = { associate: "associate", mid: "mid-level", senior: "senior", lead: "lead" };

  // Posting-language patterns that fire on everyday resume words. Dropped in resume mode only;
  // posting extraction in pipeline/extract.py is untouched. Matched by exact string.
  const RESUME_DROP = {
    supply_chain: ["shipping", "transportation", "procurement", "inventory"],
    automotive_autonomy: ["mission", "defense", "drone"],
    public_sector: ["regulat", "compliance", "audit", "policy", "legal (team|requirements)"],
    developer_tools: ["storage", "\\bcompute\\b", "\\bdatabase\\b", "\\bgithub\\b", "open[- ]source"],
    enterprise_saas: ["subscription", "procurement", "\\bCRM\\b"],
    consumer: ["\\bcommunity\\b", "\\bmembers?\\b (experience|engagement)", "\\bgames?\\b", "entertainment"],
    networking: ["network(ing)?\\b", "connectivity"],
    telecom: ["\\bcable\\b", "subscriber", "fiber"],
    ads_media: ["creators?\\b", "publishers?\\b", "attribution", "streaming", "(ad|marketing|media) campaigns?"],
    ecommerce_retail: ["\\bcart\\b", "catalog", "\\bsellers?\\b", "\\bbuyers?\\b", "marketplace"],
    energy_industrial: ["utility", "\\bplant\\b", "\\bgrid\\b", "climate", "sustainab", "carbon", "industrial"],
    hardware: ["embedded"],
    fintech: ["payments?\\b", "\\bwires?\\b transfer", "underwriting"],
    system_architecture: ["technical (design|architecture|tradeoffs|trade-offs)", "infrastructure", "architecture", "reliability engineering"],
    security_privacy: [],
    program_mgmt: ["schedules?\\b", "deliverables", "on[- ]time", "status (report|update)s?"],
    vendor_mgmt: ["contract", "budget (management|ownership|planning)"],
    customer_facing_exec: ["conference", "speak(ing)? at"],
    cloud: ["\\bcloud\\b", "\\bPaaS\\b"], // "Oracle HCM Cloud", "Adobe Creative Cloud" are product names
    partnerships: ["partnerships\\b|(?<!in )(?<!in close )(?<!close )(?<!business )partnership\\b(?! with\\b)"], // "partnerships with designers" are colleagues
    big_tech_experience: ["global scale", "enterprise[- ]scale", "large[- ]scale (systems|products|platforms|organizations|programs)"],
    pm_experience: ["shipping (software )?products"],
    // skills of the MBA role set
    strategic_planning: ["strategic plan(s|ning)\\b"], // "aiding strategic planning" is a phrase, not the planning cycle
    erp_finance_systems: ["\\bSAP\\b", "peoplesoft", "quickbooks"], // SAP SuccessFactors and PeopleSoft HCM are HR systems
    investment_research: ["financial markets"], // a line of interests
    internal_audit_sox: ["audit (findings|plans?|committee|evidence|issues|engagements?|readiness|reports?|program|methodology|observations|universe|work ?papers|testing|procedures)|(internal|external|regulatory|independent|third[- ]party|customer|IT|compliance) audits\\b"], // being audited, or the audit committee as an audience
  };

  // Resume-language patterns, per skill. `via` marks vocabulary from another discipline: a hit is
  // real evidence but shows as "transferable" with a suggested rewrite, since the resume does not yet
  // say it the way product postings do.
  const RESUME_PATTERNS = {
    cross_functional: [
      "cross[- ]functional", "(with|across) \\d+\\+? (departments|functions|business units)", "(global|regional) functional teams",
      "(led|lead|leading|managed|coordinated|partnered|worked|collaborated|aligned) (closely )?(with|alongside|across) (a |the |an |\\d+ |two |three |four |five |six )?(cross|team of|engineers?|engineering|designers?|design|data|marketing|sales|legal|finance|operations|support|clinicians|researchers|stakeholders|agency)",
      "team of \\d+ (engineers|developers|designers|people)",
      "engineers? (and|,) (\\d+ |two |three )?(designers?|data|researchers|marketers)",
      { p: "(clinicians|physicians|nurses|faculty|collaborators) (and|,|across)", via: "research" },
      { p: "(client|partner) (teams|stakeholders|engineering)", via: "consulting" },
    ],
    stakeholder_mgmt: [
      "manag(ed|ing) (stakeholder|expectations|up)", "stakeholders?", "executive team", "buy[- ]in", "align(ed|ing|ment) (with|across) (leadership|stakeholders|teams|departments)",
      { p: "(client|partner) (stakeholders|leadership|executives)|steering committee", via: "consulting" },
    ],
    exec_communication: ["(present|report)\\w* [^.]{0,50}(to|for) (the )?(senior |upper |executive )?(management|leadership|executives|VPs?|C-?suite|CFO|CEO|CIO|COO|board)\\b", "executive (readouts?|briefings?|presentations?)", "present(ed|ing|ations?) .{0,40}(executive|leadership|founders|board|c-?suite|panel|clients|senior)", "(quarterly|monthly) (business )?reviews?", "executive (summary|readout|update)", { p: "(published|presented) .{0,30}(papers?|at [A-Z]{2,}|conference|workshop)", via: "research" }, { p: "(pitched|pitch(ed)? to) .{0,30}(panel|judges|investors|founders)", via: "founder" }],
    customer_interviews: ["(conducted|ran|led|completed) \\d+\\+? (user |customer |stakeholder |client )?interviews", "customer (interview|conversation|call)s?", "user interviews?", { p: "semi-?structured interviews?", via: "research" }, { p: "interviews? with (\\d+\\+? )?(users|customers|participants|patients|clinicians|practitioners|experts)", via: "research" }, { p: "(client|stakeholder) interviews?", via: "consulting" }],
    user_research: ["user research", "usability (test|stud)", "user stud(y|ies)", "contextual inquir", "diary stud", { p: "mixed[- ]methods", via: "research" }, { p: "(n ?= ?\\d+|\\d+ participants|study participants)", via: "research" }, { p: "ethnograph|field stud(y|ies)|observational stud", via: "research" }, { p: "thematic analysis|qualitative (coding|analysis)", via: "research" }],
    surveys_feedback: ["surveys?", "\\bNPS\\b", "(customer|user|app) (feedback|reviews)", "support tickets", { p: "questionnaire|likert|mixed[- ]methods", via: "research" }],
    discovery: ["(identif|understand|uncover|diagnos)\\w* .{0,40}(friction|pain|needs|problems|drop-?off|why)", "drop-?offs?", "opportunit(y|ies) (assessment|sizing)", "problem (space|statement|discovery)", { p: "research questions?|formative (study|research)", via: "research" }],
    personas_jtbd: ["personas?", "jobs[- ]to[- ]be[- ]done", "segment(s|ation|ed)?\\b.{0,30}(users|customers|audience)", "(user|customer) segments?"],
    data_driven: ["analy[sz]ed .{0,50}(data|funnel|usage|metrics|results|behaviou?r|performance)", "data[- ]driven", "(usage|product|behaviou?ral) (data|analytics)", "\\bSQL\\b", "(Amplitude|Mixpanel|Looker|Tableau|Google Analytics|Heap|Pendo)", { p: "quantitative (analysis|methods|study|research)", via: "research" }, { p: "(analy[sz]ed|modell?ed) .{0,40}(client|market|financial) data", via: "consulting" }],
    metrics_kpis: ["\\bKPIs?\\b", "\\bOKRs?\\b", "success metrics", "dashboards?", "\\b(NPS|CSAT|ARR|MRR|MAU|DAU|WAU)\\b[^.]{0,40}\\d|\\d[^.]{0,40}\\b(NPS|CSAT|ARR|MRR|MAU|DAU|WAU)\\b", "(handling|resolution|response|deployment|cycle) time[^.]{0,30}\\d|\\d[^.]{0,40}(handling|resolution|response|deployment|cycle) time", "(north[- ]star|guardrail) metric", "(activation|retention|conversion|engagement|churn) (rate|metrics)?", "track(ed|ing)? (adoption|retention|usage|engagement)", { p: "(primary|secondary) (outcome|endpoint)s?|outcome measures?", via: "research" }, { p: "campaign performance|(monthly|weekly) report(s|ing)", via: "marketing" }],
    okrs: ["\\bOKRs?\\b", "objectives and key results"],
    ab_testing: ["\\bA/?B[- ]?tests?(ing)?\\b", "split test", "multivariate", "experiment(s|ed|ation)?\\b.{0,40}(lift|conversion|variant|control|treatment)", { p: "randomi[sz]ed|controlled (trial|experiment|stud)|\\bRCTs?\\b", via: "research" }, { p: "(between|within)[- ]subjects?", via: "research" }],
    statistics: ["statistic(s|al)", "regression", "significan(ce|t)", "hypothesis test", "confidence interval", "(in|using) R\\b", "\\bSPSS\\b|\\bStata\\b|scipy|statsmodels"],
    prioritization: ["prioriti[sz](ed|ing|ation)", "\\bRICE\\b|\\bMoSCoW\\b|\\bICE\\b scor", "backlog", "trade-?offs?", "(cut|descoped|deferred) .{0,30}(scope|features)", "sequenc(ed|ing)"],
    roadmap: ["roadmaps?", "(quarterly|annual|h[12]) plan(ning)?", "now[/ -]next[/ -]later"],
    product_strategy: ["(product|platform|portfolio) strateg(y|ies)", "strategic (direction|vision|plan|bets?)", "long[- ]term (vision|strategy|plan)", "(defined|set|shaped) .{0,20}(strategy|direction)", { p: "strategy (engagement|project|case|recommendation)|market entry|growth strategy", via: "consulting" }, { p: "(capstone|thesis).{0,40}strateg", via: "coursework" }],
    product_vision: ["product vision", "\\bvision\\b"],
    prd: ["\\bPRDs?\\b", "product requirements?", "(wrote|authored|owned|drafted) .{0,30}(specs?|requirements|user stories|acceptance criteria|design docs?)", "user stories", "acceptance criteria", "functional (spec|requirements)", { p: "requirements (gathering|elicitation|documentation)|documented requirements|gathered requirements", via: "consulting" }, { p: "design docs?", via: "engineering" }],
    feature_definition: ["(defined|scoped|specced|designed) .{0,30}(feature|MVP|flow|experience)", "\\bMVP\\b", "scope(d)? (the )?(MVP|v1|feature)"],
    product_lifecycle: ["end[- ]to[- ]end", "(led|oversaw|managed|drove|owned|spearheaded|directed|pioneered) (the )?(end-to-end |full )?(development|delivery|design|build|rollout|creation)( and (launch|delivery|release|rollout))? of (an? |the |new |[\\w'’-]+ ){0,6}(features?|products?|platforms?|apps?|applications?|tools?|modules?|services?|chatbots?|models?)\\b", "(developed|built|delivered|shipped|released) (an? |the )?(new |first )?([\\w'’-]+ ){0,5}(features?|products?|platforms?|apps?|applications?|tools?|chatbots?)\\b", "shipped \\d+\\+? (features|products|releases)", "from (idea|concept|discovery|zero|0) to (launch|ship|scale|one|1)", "(owned|drove|led) .{0,40}(from|through) (discovery|concept|launch)", "0[- ]to[- ]1|zero[- ]to[- ]one", "full (product )?lifecycle"],
    launch: ["launch(ed|es|ing)?\\b", "released?\\b", "shipped\\b", "go[- ]live", "rolled? out", { p: "deployed .{0,30}(to|with) \\d+ (users|participants|customers)", via: "research" }, { p: "shipped (behind|under) (a )?feature flag", via: "engineering" }],
    gtm: ["go[- ]to[- ]market", "\\bGTM\\b", "launch (plan|strategy|messaging|campaign)", { p: "(campaign|channel) (strategy|planning|launch)", via: "marketing" }, { p: "market entry", via: "consulting" }],
    positioning_messaging: ["positioning", "messaging", "value prop(osition)?", { p: "brand (voice|guidelines|campaign|strategy)|copywriting|content strategy", via: "marketing" }],
    pricing_packaging: ["pricing", "packaging", "(pricing|plan) tiers?", "monetization", { p: "unit economics|willingness[- ]to[- ]pay|price (elasticity|sensitivity)", via: "finance" }],
    market_research: ["market (research|analysis|sizing|landscape|entry|opportunity|trends)", "competit(ive|or)s? (analys[ie]s|landscape|research|benchmark|intelligence|positioning)?", "\\bTAM\\b|\\bSAM\\b|\\bSOM\\b", "industry (analysis|trends|research)"],
    business_case: ["business case", "(built|wrote|made) .{0,20}(the )?case for", "recommendation(s)? .{0,30}(to|for) (leadership|executives|clients|founders|the board|a panel)", "\\bROI\\b", { p: "(strategic|client) recommendations?|final (deck|report|presentation)", via: "consulting" }, { p: "pitch(ed)? .{0,30}(panel|judges|investors)", via: "founder" }],
    financial_analysis: ["financial (model|analysis|projections|forecast)", "unit economics", "\\bP&L\\b", "budget(s|ing|ed)?\\b", "forecast(s|ing|ed)?", "\\bLTV\\b|\\bCAC\\b|payback"],
    growth_loops: ["(signup|sign-up|onboarding|activation|checkout) funnel", "funnel", "(conversion|activation|retention|engagement) (rate|lift|improvement)?", "(increas|improv|lift|grew|boost)\\w* .{0,30}(conversion|activation|retention|engagement|adoption|sign-?ups|MAU|DAU)", "growth (loop|experiment|strategy)", "\\b(MAU|DAU|WAU)\\b", { p: "(acquisition|email|lifecycle) (campaign|marketing)|open rates?|click-?through", via: "marketing" }],
    customer_success: ["onboarding", "customer success", "retention", "churn", "\\bCSMs?\\b", "customer (support|service) (team|tickets)"],
    partnerships: ["(strategic|channel|technology|distribution|co-?marketing|reseller|ecosystem|commercial|corporate) (partnerships?|alliances)", "partnership (agreements?|deals?|programs?|pipeline|revenue|strategy)", "(signed|closed|negotiated|secured|sourced|launched|formed|established|managed) [^.]{0,40}partnerships?\\b", "(partner|channel) (program|ecosystem)", "integration partners?", { p: "(agency|vendor|academic|industry) partners", via: "marketing" }],
    customer_facing_exec: ["customer[- ]facing", "(met|meeting|meetings) with customers", "customer (advisory|council|visits)", "(sales|customer) (calls|demos)", "demo(ed|s)? .{0,20}(to|for) (customers|prospects)"],
    cross_functional_alias: [],
    agile_scrum: ["Scrum ?Master|\\bSAFe\\b", "\\bagile\\b", "\\bscrum\\b", "sprints?\\b", "stand-?ups?", "kanban", "retrospectives?|retros\\b", "backlog (grooming|refinement)", "story points"],
    program_mgmt: ["(deliver|complet|led|manag)\\w* [^.]{0,60}(projects?|implementations?|migrations?|rollouts?|programs?) [^.]{0,40}(on time|ahead of schedule|within budget|under budget|days ahead)", "(led|managed|oversaw) (the )?[^.]{0,30}(migration|implementations?|rollout|integration project|consolidation project)", "program management", "project management", "(project|program) plans?", "timelines?", "milestones?", "work-?streams?", "(coordinated|managed) .{0,30}(timeline|schedule|delivery|dependencies)", "\\bPMP\\b", "critical path", "\\bRAID\\b"],
    risk_mgmt: ["risks? (register|mitigation|assessment|management)", "mitigat", "contingenc", "\\bIRB\\b"],
    process_improvement: ["(redesigned|mapped|re-?engineered|standardi[sz]ed|overhauled|streamlined) [^.]{0,40}(process(es)?|workflows?|procedures?)", "policies and procedures|procedures and processes|new procedures", "manual (handoffs|steps|processes)", "process (re-?engineering|design|standardi[sz]ation|efficienc\\w+)", "process (improvement|redesign|optimization|mapping)", "streamlin", "automat(ed|ing|ion)", "reduc(ed|ing) .{0,30}(time|cost|cycle|manual|errors)", "\\bSOPs?\\b", "operational (efficiency|excellence)", "\\blean\\b|six sigma"],
    quality_testing: ["\\bQA\\b", "(acceptance|regression|user acceptance) test", "\\bUAT\\b", "bug (bash|triage)", "test (plans?|cases)"],
    vendor_mgmt: ["vendors?\\b", "suppliers?\\b", "\\bRFPs?\\b", "\\bSOWs?\\b", "\\bSLAs?\\b", "(managed|negotiated) .{0,30}(contract|agency|vendor)"],
    people_management: ["(led|lead|leads|managed|manage|manages|supervised|supervise|directed|oversaw|oversee|spearheaded) (a |an |the )?([\\w-]+ ){0,3}team of (\\d+\\+?|two|three|four|five|six|seven|eight|nine|ten|twelve)(?! (software |data |ML )?(engineers|developers|designers))\\b(?![^.]{0,25}(engineers|developers|designers))", "team of (\\d+\\+?|two|three|four|five|six|seven|eight|nine|ten|twelve) ([\\w-]+ ){0,2}(analysts|bankers|buyers|marketers|consultants|specialists|strategists|employees|staff|technicians|professionals|associates|representatives|reps|planners|agents|recruiters|accountants|managers)", "(managed|manage|supervised|supervise|mentored|coached|developed) (\\d+\\+?|two|three|four|five|six) ([\\w-]+ ){0,3}(analysts|bankers|buyers|technicians|specialists|employees|staff|consultants|representatives|reps|associates|managers|dispatchers)", "(supervised|mentored|coached|developed|trained) (and (mentored|developed|trained|coached) )?(junior|new) (staff|consultants|analysts|bankers|buyers|associates|employees|team members)", "(managing|developing|coaching)[^.]{0,30}team members", "(led|managed|supervised|mentored) a team of ([\\w-]+ )?(professionals|analysts|sales representatives|product managers|consultants)", "(manage|managed|manages) (two|three|four|five|\\d+) (program|project|product|account|sales) managers", "direct reports", "\\d+ direct reports?", "(managed|led|mentored|coached) (a team of )?\\d+ (engineers|PMs|product managers|analysts|designers|interns)[^.]{0,40}direct report", "managed (a )?team of \\d+ (PMs|product managers|people|reports|analysts|associates)", "hired (and|,) (managed|coached|developed|onboarded|mentored)", "(mentored|coached|managed) \\d+ (PMs|product managers|APMs|analysts|engineers|designers)", "(hiring|performance) (manager|reviews)", "(managed|led) \\d+ (PMs|product managers|direct reports)"],
    technical_fluency: ["technical (background|depth|fluency|trade-?offs|discussions|design)", "(worked|collaborated|partnered) (closely |directly )?with (a team of )?(\\d+ )?(software |data |ML )?(engineers|developers|engineering|data scientists)", "(led|managed) (a (scrum )?team of )?\\d+ (software |data |ML )?(engineers|developers)", "computer science", "engineering (degree|background)", "(partnered|worked) with engineer(s|ing) on .{0,30}(technical|architecture|trade)", { p: "(software|engineering|developer) intern(ship)?|software engineer|full[- ]stack|built (a |the )?(prototype|backend|front-?end|pipeline|app|API)|implemented (a )?feature", via: "engineering" }, { p: "(Python|Java|JavaScript|TypeScript|React|Golang|C\\+\\+|Flask|Django|Node\\.js)\\b", via: "engineering" }],
    apis: ["\\bAPIs?\\b", "\\bREST(ful)?\\b", "\\bGraphQL\\b", "endpoints?", "\\bSDKs?\\b", "integrations?\\b", "webhooks?"],
    system_architecture: ["system design", "distributed systems", "microservices", "scalab(le|ility)", "\\bbackend\\b|\\bback-end\\b", "(service|data|platform) architecture", { p: "design docs?|(designed|built) .{0,30}(backend|service|pipeline|system)", via: "engineering" }],
    data_modeling: ["data (model|modeling|modelling|pipeline|warehouse|schema)", "\\bETL\\b|\\bELT\\b", "schema"],
    sql: ["\\bSQL\\b", "\\bBigQuery\\b|\\bSnowflake\\b|\\bRedshift\\b|\\bPostgres(QL)?\\b", "(wrote|ran|built) .{0,20}queries"],
    python_r: ["\\bPython\\b", "\\bpandas\\b", "\\bR\\b (and|,|/)|\\bin R\\b|\\(R\\)", "\\bJupyter\\b", "\\bnotebooks?\\b"],
    cloud: ["\\bAWS\\b|\\bGCP\\b|\\bAzure\\b", "kubernetes|\\bk8s\\b|docker", "cloud[- ](migration|infrastructure|platforms?|architecture|computing|services|native|costs?|based|solutions?|strategy|adoption)", "(migrat\\w+|mov(ed|ing)) [^.]{0,40}to (the )?cloud", "\\bcloud\\b(?= (and|,|/))|(,|and|/) cloud\\b"],
    ai_ml: ["machine learning", "\\bML\\b", "\\bAI\\b", "(recommendation|ranking) (system|model|pipeline)", "(trained|deployed|built|fine-?tuned|evaluated) .{0,30}(ML|machine[- ]learning|prediction|predictive|classification|ranking|recommendation|language|vision|neural) models?", "deep learning|neural", "\\bNLP\\b|computer vision"],
    genai_llm: ["\\bLLMs?\\b", "generative AI|GenAI", "\\bGPT\\b|Claude|ChatGPT|OpenAI|Anthropic", "prompt(ing| engineering)", "\\bRAG\\b", "(AI|LLM)[- ](powered|driven|native|assistant|agent|copilot|feature)"],
    ai_tools: ["(ChatGPT|Claude|Copilot|Cursor|Gemini|Midjourney)", "AI tools?"],
    mobile: ["\\biOS\\b|\\bAndroid\\b", "mobile (app|product|experience)", "React Native|Flutter|Swift|Kotlin", "app store|play store"],
    security_privacy: ["\\bGDPR\\b|\\bCCPA\\b|\\bHIPAA\\b|\\bSOC ?2\\b", "privacy", "security (review|requirements|team)", "data (protection|governance|retention)"],
    devops_sdlc: ["\\bCI/CD\\b", "deploy(ed|ment|s)?\\b", "feature flags?", "release (process|management|train|cadence)", "\\bSDLC\\b", "code review"],
    ux_design_collab: ["\\bUX\\b", "user experience", "(with|and) (\\d+ |two |three |a |the )?(designers?|design team|UX)", "wireframes?", "prototyp(e|ed|es|ing)", "mock-?ups?", "\\bFigma\\b", "design (reviews?|crit(ique)?s?|system|sprint)", "interaction design", "usability"],
    jira: ["\\bJira\\b", "\\bAsana\\b|\\bLinear\\b|\\bTrello\\b|\\bMonday\\.com\\b"],
    figma: ["\\bFigma\\b", "\\bSketch\\b|\\bBalsamiq\\b|\\bMiro\\b"],
    analytics_tools: ["(Amplitude|Mixpanel|Looker|Tableau|Google Analytics|Heap|Pendo|Power ?BI|Metabase|Hex|Mode)\\b"],
    experimentation_tools: ["(Optimizely|LaunchDarkly|Statsig|Split\\.io|VWO|Eppo)\\b"],
    office_tools: ["\\bExcel\\b", "\\bPowerPoint\\b", "Google (Sheets|Slides|Docs|Workspace)", "(Microsoft|MS) Office|Office 365|\\bG Suite\\b|\\bMS (Word|Excel)"],
    crm_tools: ["\\bSalesforce\\b|\\bHubSpot\\b|\\bZendesk\\b|\\bIntercom\\b|\\bPipedrive\\b|\\bSugarCRM\\b|\\bZoho\\b|Dynamics CRM"],
    enterprise_saas: ["\\bB2B\\b", "\\bSaaS\\b", "enterprise (customers|software|clients|accounts|product)", "(self-?serve|admin) (onboarding|console|experience)"],
    consumer: ["\\bB2C\\b", "consumer (app|product|mobile|brand|experience|facing|internet)", "\\d+(M|K|\\+)? (MAU|DAU|users|downloads)", "social (app|media|network)"],
    fintech: ["fintech", "banking", "payments? (product|platform|flow|rails)", "lending|loans?\\b|mortgage|credit (card|risk)", "budgeting (app|feature|tool)", "\\bKYC\\b|\\bAML\\b", "personal finance|financial services|insurance|insurtech|wealth"],
    healthcare: ["health ?care", "clinical|clinicians?|patients?|hospital", "health (app|tech|system|data|plan)", "\\bHIPAA\\b|\\bEHR\\b|\\bFDA\\b", "medical|pharma|biotech|life sciences"],
    ecommerce_retail: ["e-?commerce", "\\bretail(er)?\\b", "marketplace", "checkout (flow|experience|conversion)", "(online|digital) (store|shopping)", "merchandising"],
    supply_chain: ["supply chain", "logistics", "fulfil+ment", "warehouse", "inventory (management|planning|system)", "last[- ]mile", "freight"],
    ads_media: ["ad ?tech", "advertis(ing|ers?)\\b", "\\bads\\b (product|platform|business)", "programmatic", "media (buying|planning|platform)", "streaming (service|platform|product)"],
    energy_industrial: ["\\benergy\\b", "oil (and|&) gas", "utilities", "renewables?", "manufacturing", "industrial (IoT|equipment|automation)", "\\bEV charging\\b"],
    telecom: ["telecom", "wireless (carrier|network)", "broadband", "\\bISP\\b", "5G"],
    developer_tools: ["developer (tools|platform|experience|products?|ecosystem)", "\\bdevtools?\\b", "\\bAPI platform\\b", "\\bCLI\\b|\\bIDE\\b", "infrastructure (product|platform)", "data infrastructure"],
    public_sector: ["public sector", "government", "federal|state agency|municipal", "\\bgov\\b", "civic", "\\bFedRAMP\\b"],
    automotive_autonomy: ["autonomous|self[- ]driving", "automotive|vehicle", "\\bADAS\\b", "aerospace|aviation", "robotics|drones?\\b"],
    hardware: ["hardware", "firmware", "\\bIoT\\b", "devices?\\b (product|team|platform)", "embedded (systems|software)", "silicon|semiconductor|chips?\\b"],
    pm_experience: ["product (manager|management|owner|lead)", "\\bAPM\\b|\\bPM\\b (intern|role|team)"],
    startup_experience: ["start-?ups?\\b", "founded|co-?founder|founder", "early[- ]stage|seed[- ]stage|series [a-c]\\b", "\\bYC\\b|y ?combinator"],
    big_tech_experience: ["big tech", "\\bFAANG\\b|\\bMAANG\\b", "\\b(Google|Meta|Facebook|Amazon|Apple|Microsoft|Netflix|Nvidia|Uber|Airbnb|Stripe|Salesforce|Oracle|Adobe|LinkedIn)\\b"],
    // skills of the MBA role set, in the words resumes use
    market_data_terminals: ["\\bBloomberg\\b|\\bEikon\\b|\\bFactSet\\b|Capital IQ|\\bCapIQ\\b|\\bPitchBook\\b"],
    due_diligence: ["\\bdiligence\\b"],
    performance_improvement: ["(reduc|cut|lower|sav)\\w* [^.]{0,40}(operating |operational |production |office |overhead |annual )?(costs?|expenses|expenditures?|waste)\\b", "cost[- ]sav(ing|ings)\\b", "\\d+% reduction in [^.]{0,30}(costs?|expenses|waste|cycle time|lead time)?", "(increas|improv)\\w* [^.]{0,30}(operational |operating )?efficienc(y|ies) by \\d", "reduc\\w+ (wait|cycle|lead|turnaround|processing) times?", "operational improvements"],
    client_engagement: ["(advis|consult)\\w+ (\\d+\\+? )?(clients?|businesses|companies|organi[sz]ations)\\b", "client (projects|executives|leadership teams?|satisfaction)", "Fortune \\d+ clients", "(assisted|helped|supported|engaged with) clients (in|with|to)", "for (a|an) [^.]{0,30}\\bclient\\b"],
    learning_design: ["(design|develop|buil[dt]|creat|deliver|led|execut|launch|implement)\\w* [^.]{0,40}(training|onboarding|learning|development) (programs?|curricul\\w+|frameworks?|modules?|workshops?|sessions|materials|courses)", "(designed|delivered|taught|facilitated|conducted) [^.]{0,30}(workshops|trainings|training sessions|courses)", "trained (over |more than )?\\d+\\+? (employees|staff|managers|associates|team members|new hires)", "(mentored and )?trained (over |more than )?\\d+ employees"],
    reporting_adhoc_analysis: ["(creat|buil[dt]|develop|automat|prepar|generat|produc|streamlin|draft)\\w* [^.]{0,50}\\breport(s|ing)\\b", "ad[- ]hoc (analys[ie]s|reports?|requests)", "(daily|weekly|operational|management|data) report(s|ing)\\b"],
    financial_reporting: ["(prepar|produc|creat|present|report|conduct)\\w* [^.]{0,40}(financial|performance|management|board|monthly|quarterly|annual) (reports?|statements|results|status|information)", "financial statements?", "(month|quarter|year)[- ]end (reporting|close)", "reported on [^.]{0,30}financial"],
    key_account_mgmt: ["(point of contact|primary contact) for \\d+", "(cultivat|maintain|manag|buil[dt]|foster)\\w* [^.]{0,30}relationships with (\\d+\\+? )?(key |existing |current |strategic |enterprise )?(clients|accounts|customers)", "(portfolio|book) of \\d+\\+? (clients|accounts|customers)", "key accounts?"],
    renewals_expansion: ["(upsold|upsell\\w*|cross-?s(ell\\w*|old)|renewals?)\\b", "(reduc\\w+|lower\\w+) (customer |client )?churn", "(increas|improv)\\w* [^.]{0,30}(customer retention|client retention|renewal|return clients|repeat (business|customers))"],
    budgeting_forecasting: ["(annual|operating|departmental|capital) budgets?", "budget (season|cycle|process|planning)", "(rolling|quarterly|monthly|long[- ]range) (forecasts?|plan)\\b", "forecasting models?", "(buil[dt]|develop|prepar|manag|own)\\w* [^.]{0,40}(budgets?|forecasts?|operating plans?|financial plans?)\\b"],
    marketing_analytics: ["(campaign|marketing|social media|channel) (analysis|analytics|performance|effectiveness|attribution|ROI)", "(measur|analy[sz]|track)\\w* [^.]{0,40}(campaign\\w*|marketing initiatives|site visits|web traffic|social media)"],
    dashboards_dataviz: ["dashboards?", "(Tableau|Power ?BI|Looker|Data Studio|Qlik)\\b[^.]{0,30}(reports?|visuali[sz]ations?|views)|reports? in (Tableau|Power ?BI|Looker)", "data visuali[sz]ation"],
    financial_risk: ["(credit|market|liquidity|counterparty|portfolio) risk", "risk exposure", "(loan )?(defaults?|delinquenc\\w+)\\b", "RiskManager|Value at Risk|\\bVaR\\b|stress test"],
    exec_decks: ["(presentations?|decks?|materials) (for|to) (the )?(senior |upper |client |executive )?(management|leadership|board|executives|clients|C-?suite|steering committee)", "board (materials|decks?|presentations?|packs?|books?)", "(buil[dt]|creat|develop|prepar|produc)\\w* [^.]{0,40}(presentations|decks|slides)\\b"],
    finance_partnering: ["partner(ed|ing|s)? with (the )?(CRO|CMO|COO|CTO|sales|marketing|operations|ops|engineering|product|department|business)[^.]{0,60}(budget|forecast|spend|pipeline|staffing|headcount|pricing|drivers|variance|plan)", "walk(ed|s)? (department|business|functional) (heads|leaders) through", "(advis|support)\\w+ [^.]{0,30}(business|department|functional) (leaders|heads|decisions)"],
    change_management: ["change management", "(organi[sz]ational|change) readiness", "(drove|drive|ensur\\w+|increas\\w+) [^.]{0,40}(user |employee |successful )?adoption\\b", "digital literacy"],
    supplier_contract_negotiation: ["(negotiat|renegotiat|secur)\\w+ [^.]{0,60}(suppliers?|vendors?|co-?manufactur\\w+|carriers?)\\b", "(negotiat|renegotiat)\\w+ [^.]{0,40}(contracts?|rebates?|terms|pricing)\\b[^.]{0,30}(with|from) [^.]{0,20}(suppliers?|vendors?)", "(supplier|vendor|supply) (contracts?|agreements?|negotiations?)"],
    strategic_planning: ["(led|lead|own|owned|ran|run|buil[dt]|developed|drove|facilitated|managed|coordinated) [^.]{0,40}(strategic|annual|long[- ]range|operating|three[- ]year|five[- ]year) plan(s|ning)?\\b", "strategic planning (process|cycle|sessions?|offsites?)"],
    erp_finance_systems: ["\\bSAP\\b(?! (SuccessFactors|Ariba|Concur|Fieldglass))", "peoplesoft(?! (HCM|HR))", "quickbooks(?! payroll)"],
    internal_audit_sox: ["(led|conducted|performed|executed|planned|managed) [^.]{0,30}(internal|operational|IT|financial) audits?\\b", "audit (plans?|work ?papers|testing|methodology|universe)"],
    pm_change_certs: ["(project|program) management professional", "change management professional", "\\bSAFe\\b (program consultant|\\(?SPC)"],
    finance_degree: ["(bachelor|master|\\bB\\.?S\\.?c?|\\bB\\.?A\\.?|\\bBBA|\\bMBA|\\bM\\.?S\\.?c?)\\b[^.\\n]{0,60}\\b(finance|accounting|accountancy|economics)\\b", "\\b(finance|accounting|economics)\\b[^.\\n]{0,30}\\b(BSc|MSc|BA|BS|degree)\\b"],
    consulting_banking: ["consult(ing|ant)", "\\bMBB\\b|McKinsey|\\bBain\\b|\\bBCG\\b|Deloitte|Accenture|\\bEY\\b|\\bKPMG\\b|\\bPwC\\b", "investment bank(ing)?|Goldman|Morgan Stanley|JPMorgan"],
  };
  // A credential is read from the structure of the resume (titles, dates, degrees), not from these
  // patterns alone. These only run on role / summary / education lines.
  // read from a line of schooling only
  const EDU_CREDENTIAL = new Set(["finance_degree", "law_degree"]);
  const STRUCTURAL = new Set(["pm_experience", "startup_experience", "big_tech_experience", "consulting_banking", "bachelors", "masters_mba", "phd", "cs_engineering_degree", "security_clearance", "domain_expertise", "yoe_2", "yoe_3", "yoe_5", "yoe_8", "yoe_10"]);
  const VIA_LABEL = { research: "academic research", consulting: "consulting / analyst work", engineering: "engineering", marketing: "marketing", finance: "finance / operations", founder: "founder / venture work", coursework: "coursework" };

  const OUTCOME = /\d+ ?%|\$\s?\d|\b\d+(\.\d+)?\s?(x|k|m|b|mm)\b|\b\d{2,}\+?\s?(users|customers|participants|clients|engineers|people|accounts|students|enterprise|interviews|studies|features|releases|papers)\b|\b(increas|reduc|improv|grew|lift|boost|cut|saved|doubled|tripled|drove|accelerat|won|adopted|published)\w*\b/i;
  const DATE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+|\d{1,2}[\/.])?(19|20)\d{2}\s*(–|-|—|to|through)\s*(((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+|\d{1,2}[\/.])?(19|20)\d{2}|present|current|now|today)|\b(summer|fall|autumn|spring|winter)\s+(19|20)\d{2}\b(\s*(–|-|—|to)\s*(present|current|now|today|((summer|fall|autumn|spring|winter)\s+)?(19|20)\d{2})\b)?|\((19|20)\d{2}\)|\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b|\b\d{1,2}\/\s?\d{2}\s*(–|-|—|to|through)\s*(\d{1,2}\/\s?\d{2}\b|present|current|now|today)|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+['’]\d{2}\s*(–|-|—|to|through)\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+['’]\d{2}|present|current|now|today)/i;
  // a word that marks a job title, to tell the title from the employer and the city when they sit on separate lines
  const TITLE_WORD = /\b(manager|director|analyst|engineer|associate|intern|lead|leader|officer|consultant|specialist|coordinator|president|head|owner|founder|developer|designer|scientist|representative|supervisor|trainee|assistant|strategist|partner|administrator|advisor|adviser|banker|accountant|auditor|buyer|planner|recruiter|researcher|fellow|architect|controller|treasurer|economist|underwriter|trader|broker|agent|clerk|technician|teacher|tutor|instructor|professor|editor|writer|marketer|generalist|apprentice|chief|vp|cfo|ceo|coo|cto|cmo|principal|executive|processor|teller|barista|cashier|nurse|operator|receptionist|secretary|bookkeeper|paralegal|attorney|counsel|lawyer|coach|commander|captain|programmer|tester|appraiser|investigator|examiner|inspector|merchandiser|purchaser|scheduler|bartender|extern|lecturer|trainer|producer|reporter|advocate|liaison|superintendent|foreman|estimator|dispatcher|counselor|organizer|facilitator|aide|expediter|sergeant|lieutenant|chef|steward|attendant|ambassador|cpa)\b/i;
  // a line that starts with a verb in the past tense is a sentence about work, not a title ("Tracked partner campaigns")
  const SENTENCE_START = /^(?!(certified|licensed|registered|chartered|accredited|advanced|integrated|associated|retired|embedded|distributed|applied|allied|united|unified|managed|skilled)\b)[A-Z][a-z]+ed\s/i;
  const titlePart = x => TITLE_WORD.test(x) && x.split(" ").length <= 8 && !SENTENCE_START.test(x);
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  // Every date on a line as a fractional year, in order: "Jan 2020", "January 2020", "01/2020", "9/17", "Jul '19", "2020".
  function datesOf(text) {
    const out = []; const yy = v => { const n = +v; return v.length === 4 ? n : n <= (new Date().getFullYear() % 100) + 1 ? 2000 + n : 1900 + n; };
    const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:((?:19|20)\d{2})|['’](\d{2}))|\b(\d{1,2})[\/.]\s?((?:19|20)\d{2}|\d{2})(?![\d\/])|\b((?:19|20)\d{2})\b/gi;
    for (const m of text.matchAll(re)) {
      if (m[1]) out.push({ y: yy(m[2] || m[3]), m: MONTHS[m[1].toLowerCase().slice(0, 3)] });
      else if (m[4]) { if (+m[4] >= 1 && +m[4] <= 12) out.push({ y: yy(m[5]), m: +m[4] }); }
      else out.push({ y: +m[6], m: null });
    }
    return out;
  }
  const SECTION = [
    [/^((professional|executive|career|personal) )?(summary|profile|objective|about( me)?|overview|highlights)\b/i, "summary"],
    [/^(professional |work |relevant |research |industry )?(experience|employment|history|positions?|career)\b/i, "experience"],
    [/^(research experience|research)\b/i, "experience"],
    [/^(leadership|volunteer|community|campus|extra[- ]?curricular)\b.*\b(experience|activities|involvement|service)$/i, "projects"],
    // "Business experience", "Related experience", "Other employment": a short line that ends with the word
    [/^([A-Za-z&]+ ){1,3}(experience|employment|internships?)$/i, "experience"],
    [/^(education|academic)\b/i, "education"],
    [/^(relevant )?(coursework|courses)/i, "coursework"],
    [/^(academic |class |course )?(projects?|capstone|selected projects|side projects|hackathons?|leadership( & activities)?|activities|extra[- ]?curricular|volunteer(ing| work| experience)?|organi[sz]ations|affiliations|memberships|involvement)\b/i, "projects"],
    [/^(technical |core |key )?(skills|tools|technologies|competencies|certifications?|proficienc(y|ies))\b/i, "skills"],
    [/^(publications?|awards?|honou?rs|interests|languages|references)\b/i, "other"],
  ];
  // The words a section heading is made of. A short line that only starts like a heading is not one: "Project
  // planning" in a skills list, "Leadership development", "research that led to" at the start of a wrapped bullet.
  const HEAD_WORD = /^(professional|work|relevant|research|industry|experience|employment|history|positions?|career|leadership|volunteer(ing)?|community|campus|extra-?curriculars?|activities|involvement|service|education|educational|academic|coursework|courses?|projects?|capstone|selected|side|hackathons?|organi[sz]ations?|affiliations?|memberships?|technical|core|key|skills?|tools?|technologies|competenc(y|ies)|certifications?|proficienc(y|ies)|summary|profile|objective|about|me|overview|highlights?|publications?|awards?|honou?rs|interests|languages?|references|and|of|additional|other|related|training|background|qualifications?|accomplishments?|achievements?|credentials?|licen[sc]es?|areas?|expertise|information|personal|executive|internships?|spoken|software|computer|cont|continued|select|special|optional|section|prior|previous)$/i;
  const headWords = s => s.replace(/\(cont(inued|\.|'d)?\)/i, "").replace(/[()]/g, " ").split(/[\s,\/&:\-–]+/).filter(Boolean);
  // "Health Law Experience", "ATHLETIC COACHING EXPERIENCE": any few capitalised words that end with the word
  const headingWords = s => { const w = headWords(s); return w.length > 0 && (w.every(x => HEAD_WORD.test(x)) || (/\b(experience|employment|internships?)$/i.test(s) && w.length <= 4 && w.every(x => /^[A-Z]/.test(x) || /^(and|of)$/.test(x)))); };
  const PM_TITLE = /\b(product (manager|management|owner|lead|director|marketing manager|(data )?analyst|operations|ops|strategist)|\bAPM\b|\bTPM\b|technical program manager|\bPM\b|head of product|chief product|\bCPO\b|\bVP,? product)/i;
  const INTERN = /\bintern(ship)?\b|\bco-?op\b|\bfellow(ship)?\b/i;
  const TITLE_LEVEL = [[/\b(chief|cpo|vp|vice president|head of|director|group product|principal|staff|lead)\b/i, "lead"], [/\b(senior|sr\.?)\b/i, "senior"], [/\b(associate|junior|jr\.?|apm|intern|assistant)\b/i, "associate"]];
  const DEGREE = [[/\b(ph\.?d|doctor(ate|al))\b/i, "phd"], [/\b(mba|m\.b\.a\.?|m\.?s\.?c?|m\.?eng|m\.?a\.?|master'?s?|ms in|m\.?phil|ll\.?m)\b|\bm\.b\.a\./i, "masters_mba"], [/\b(b\.?s\.?c?|b\.?a\.?|b\.?eng|bachelor'?s?|bsc|ba in|bs in|b\.?b\.?a|b\.?com|b\.?tech|b\.?pharm|b\.?f\.?a)\b/i, "bachelors"]];
  // A degree written out in full is a degree wherever it stands: columns and text boxes often print the education
  // lines away from the Education heading. ("MA" and "BA" alone are not enough: "Boston, MA".)
  const DEGREE_PHRASE = /\b(bachelor|master)(['’]?s)?\s+(of|in|degree)\b|\b(B\.?S\.?c?|B\.?A\.?|B\.?B\.?A\.?|M\.?S\.?c?|M\.?A\.?|M\.?B\.?A\.?)\s+in\s+[A-Z]|\b(B\.S\.|B\.A\.|B\.B\.A\.|M\.S\.|M\.A\.|M\.B\.A\.),|^\s*(BS|BA|BBA|MS|MBA),\s+[A-Z][a-z]|\bMBA,? (candidate|class of|\(?expected)|\b(doctor(ate)? (of|in)|ph\.?d\.? (in|candidate))\b/i;
  const CS_DEGREE = /computer science|\bCS\b|software|electrical|computer engineering|\bEE\b|\bECE\b|engineering|mathematics|\bstatistics\b|physics|data science/i;
  const COURSE_LINE = /^[A-Z]{2,5}\s?\d{3}[A-Z]?\b|^[A-Z][a-z]+ \d{3}\b/;

  function yearsBetween(text) {
    const d = datesOf(text); if (!d.length) return null;
    const now = new Date(); const open = /present|current|now|today/i.test(text);
    const seasons = [...text.matchAll(/\b(summer|fall|autumn|spring|winter)\s+(?:19|20)\d{2}/gi)].map(m => m[1].toLowerCase());
    if (seasons.length && d.length === 1 && !open) return 0.25;
    // a season names its months: a start is its first month, an end its last ("Fall 2021 – Spring 2023" is Sep 2021 to May 2023)
    const SEASON_START = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 1 }, SEASON_END = { spring: 5, summer: 8, fall: 11, autumn: 11, winter: 2 };
    if (seasons.length && d[0].m == null) d[0].m = SEASON_START[seasons[0]]; // "Fall 2021 - present"
    if (seasons.length > 1 && d.length > 1 && d[d.length - 1].m == null) d[d.length - 1].m = SEASON_END[seasons[seasons.length - 1]];
    if (d.length === 1 && !open) return 0.5;
    const frac = (x, end) => x.y + (x.m ? (x.m - (end ? 0 : 1)) / 12 : 0);
    let first = d[0], last = d[d.length - 1];
    if (!open && d.length > 1 && last.y + (last.m || 0) / 12 < first.y + (first.m || 0) / 12) [first, last] = [last, first]; // a reversed range ("12/2020 - 01/2019") is a typing slip: the later date is the end
    let a = frac(first, false), z = open ? now.getFullYear() + now.getMonth() / 12 : frac(last, true);
    if (z < a) [a, z] = [z, a];
    return Math.max(0.25, Math.min(40, z - a));
  }

  // first and last year of a dated line, "present" read as now
  function spanOf(text) {
    const d = datesOf(text).map(x => x.y); if (!d.length) return null;
    const end = /present|current|now|today/i.test(text) ? new Date().getFullYear() + 1 : d[d.length - 1];
    return [Math.min(d[0], end), Math.max(d[0], end)];
  }

  function rx(list) { return list.length ? new RegExp(list.map(p => "(?:" + p + ")").join("|"), "i") : null; }

  function parseResume(text) {
    // Word and most boards write the typographic apostrophe (’); the taxonomy's patterns spell the straight one
    text = text.replace(/[‘’ʼ]/g, "'");
    // the other dashes a resume may carry (hyphen U+2010, non-breaking hyphen, figure dash, horizontal bar, minus) read as a hyphen, so a date range written with one is a range
    text = text.replace(/[\u2010\u2011\u2012\u2015\u2212]/g, "-");
    // PDF text often spaces out hyphens ("purpose - built", "self - learning"); join them so words match again
    // and it often sets the ligatures fi, fl, ff apart from their word: "pro fi t", "work fl ow", "for   fi nance"
    // (one space on each side inside a word, a wide gap before it at the start of a word)
    text = text.replace(/([A-Za-z]) (ffi|ffl|ff|fi|fl) (?=[a-z])/g, "$1$2").replace(/(^|\s{2,}|[-(\/]\s?)(ffi|ffl|ff|fi|fl) (?=[a-z]{2})/gm, "$1$2");
    // a degree set with spaces between its letters: "B . S . Finance", "M . B. A."
    text = text.replace(/\b[BM] ?\. ?[A-Z] ?\.(?: ?[A-Z] ?\.)?/g, m => m.replace(/ /g, ""));
    // a range that names the year once: "May – August 2025", "September to December 2006"
    text = text.replace(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?)(\s*(?:–|-|—|to)\s*)((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+((?:19|20)\d{2}))\b/gi, (m, a, sep, b, y) => /^(may|mar|jan|jun|jul|aug|sep|oct|nov|dec|feb|apr)/i.test(a) ? `${a} ${y}${sep}${b}` : m);
    // a year the PDF split in two after a month or a season: "Summer 20 24", "May 20 xx"
    text = text.replace(/\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?|summer|fall|autumn|spring|winter)(\s+)(?:(19|20) (\d{2}|[xX]{2})|((?:19|20)\d) (\d))\b/gi, (m, a, gap, c, d, e, f) => a + gap + (c ? c + d : e + f)); // "20 24", "201 6"
    // The placeholder years of a template ("20XX", "19xx") are read as dates, so its jobs are found. They give
    // no years. 2098 stands in for the placeholder while the lines are read.
    let placeholderDates = false; const PH = "2098";
    text = text.replace(/\b(19|20)[xX]{2}\b/g, () => { placeholderDates = true; return PH; });
    const raw = text.replace(/\r/g, "").replace(/([A-Za-z]) - ([a-z])/g, "$1-$2").split(/\n|(?=\s[•▪●‣◦■\uf0b7\uf0a7\uf0d8]\s)|(?<=[a-z]{4}\.)\s{2,}(?=[A-Z])/);
    // a date range that a narrow column broke in two: "October 2020 -" / "Current", "June 2018 - October" / "2020"
    const MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
    const openEnd = new RegExp("(?:(?:19|20)\\d{2}|\\d{1,2}\\/\\d{2,4})\\s*[-–—]\\s*(?:" + MON + ")?\\s*$", "i"), closeStart = new RegExp("^\\s*(?:(?:" + MON + "\\s+)?(?:19|20)\\d{2}|\\d{1,2}\\/\\d{2,4}|present|current)\\b", "i");
    // also "| JUNE" / "2017 TO PRESENT" and "2020 to" / "Present"
    const monthEnd = new RegExp("\\b" + MON + "\\s*$", "i"), yearStart = /^\s*(?:19|20)\d{2}\b/, toEnd = /(?:19|20)\d{2}\s+(?:to|through)\s*$/i;
    // and a range in three pieces: "August 2015" / "- January" / "2018"
    const dashStart = new RegExp("^\\s*[-–—]\\s*(?:" + MON + "|present|current|(?:19|20)\\d{2})\\s*(?:(?:19|20)\\d{2})?\\s*$", "i");
    for (let k = 0; k < raw.length - 1; k++) if ((openEnd.test(raw[k]) && closeStart.test(raw[k + 1])) || (monthEnd.test(raw[k]) && yearStart.test(raw[k + 1]) && raw[k].length < 120) || (toEnd.test(raw[k]) && closeStart.test(raw[k + 1])) || (dashStart.test(raw[k + 1]) && /(?:19|20)\d{2}\s*$/.test(raw[k]) && raw[k].trim().length < 30)) { raw[k] = raw[k].trimEnd() + " " + raw[k + 1].trim(); raw.splice(k + 1, 1); k--; }
    // a heading set with a space between every letter: "E D U C AT I O N", "K E Y S K I L L S"
    const HEAD_WORDS = /(professional|work|relevant|experience|employment|history|education|academic|technical|key|core|skills|summary|profile|about|me|projects|certifications|awards|activities|leadership|additional|information)/g;
    for (let k = 0; k < raw.length; k++) { const t = raw[k].trim().replace(/\s+/g, " "); if (/^(?:[A-Z&]{1,2} ){3,}[A-Z]{1,2}$/.test(t)) raw[k] = t.replace(/ /g, "").toLowerCase().replace(HEAD_WORDS, " $1").replace(/\s+/g, " ").trim().toUpperCase(); }
    // small capitals set apart from the rest of their word: "P ROFESSIONAL   E XPERIENCE", "C HRIS   H UNTER"
    for (let k = 0; k < raw.length; k++) { const t = raw[k].trim(); if (t.length < 60 && /^(?:[A-Z] [A-Z]{2,}[.,:]?(?:\s+(?:&|AND|OF)\b)?(?:\s+|$))+$/.test(t)) raw[k] = t.replace(/\b([A-Z]) ([A-Z]{2,})/g, "$1$2").replace(/\s{2,}/g, " "); }
    // a heading with its content on the same line: "Relevant Coursework: Statistics, Finance", "Languages: Hindi"
    for (let k = 0; k < raw.length; k++) { const m = raw[k].match(/^\s*([A-Za-z][A-Za-z &\/]{2,28}?)\s*:\s+(\S.*)$/); if (m && m[1].split(" ").length <= 3 && headingWords(m[1]) && SECTION.some(([re]) => re.test(m[1]))) raw.splice(k, 1, m[1], m[2]); }
    const BULLET = /^\s*([•▪●‣◦■\uf0b7\uf0a7\uf0d8\-–—*·]\s+|o\s{2,})/; const usesBullets = raw.filter(r => BULLET.test(r)).length >= 3;
    // an employer on its own line above its roles: "AMERICAN EXPRESS   New York, NY"
    const EMPLOYER_LINE = /^[A-Z][A-Z0-9&.'’\-]+( [A-Z0-9&.'’\-]+)*(\s{2,}|\s*[|,]|$)/;
    for (let k = 0; k < raw.length; k++) { const m = raw[k].match(/^\s*(\S(?:.{0,30}?\S)?)\s{2,}(\S.*)$/); if (m && SECTION.some(([re]) => re.test(m[1])) && headingWords(m[1]) && m[1].split(" ").length <= 3 && !/\d/.test(m[1]) && !/^[a-z]/.test(m[2])) raw.splice(k, 1, m[1], m[2]); }
    const lines = []; let section = null; let role = -1; const roles = []; const degrees = new Set(); let csDegree = false; let employer = null; let strayMode = false;
    // a heading carries no year: "Project Engineer 2004-2007" is a job, not the Projects section
    const headerLike = s => s.length < 60 && !/[.;:]$/.test(s) && !/(19|20)\d{2}/.test(s) && !(TITLE_WORD.test(s) && !/\b(experience|summary|profile|history)\b/i.test(s)) && headingWords(s);
    // each line as written (r0, to see wide gaps), on single spaces (r), and whether it carried a bullet mark
    const items = raw.map(x => { const hadBullet = BULLET.test(x); const r0 = x.replace(/^\s*o\s{2,}/, "").replace(/^[\s•▪●‣◦■\uf0b7\uf0a7\uf0d8\-–—*·]+/, "").trim(); return { r0, r: r0.replace(/[ \t\u00a0]{2,}/g, " "), hadBullet }; }).filter(x => x.r);
    const isHeading = t => { const h = t.replace(/\s*:$/, ""); return headerLike(h) && SECTION.some(([re]) => re.test(h)); };
    // a short line that could name a job, an employer or a place: not a bullet, not a sentence, not a heading
    const labelLike = it => it && !it.hadBullet && it.r.length < 110 && (!/[.!?;]$/.test(it.r) || /\b(inc|ltd|co|corp|llc|llp|plc|l\.p|n\.a|s\.a|gmbh)\.$/i.test(it.r)) && it.r.split(" ").length <= 14 && !DATE.test(it.r) && !isHeading(it.r);
    const SEP = /\s*(?:,| at | \| |\||—|–| - |\(|\)|•|·)\s*/;
    const parts = t => t.split(SEP).map(x => x.trim()).filter(x => x.length > 1);
    for (let i = 0; i < items.length; i++) {
      const { r0, hadBullet } = items[i]; let r = items[i].r;
      const h = r.replace(/\s*:$/, ""); // "EDUCATION:" is a heading too
      if (headerLike(h)) { const hit = SECTION.find(([re]) => re.test(h)); if (hit) { section = hit[1]; employer = null; lines.push({ text: r, kind: "heading", section }); continue; } }
      const sec = section || (COURSE_LINE.test(r) ? "coursework" : "body");
      const isCourse = sec === "coursework" || (!section && COURSE_LINE.test(r));
      const hasDate = DATE.test(r);
      // a long bullet that mentions a date range ("sales from 2004-present") is not a job line
      // A dated line with a job title beside it is a job wherever it sits, unless it reads as schooling: columns
      // and text boxes can bunch the headings together and leave the wrong section in force.
      const SCHOOL = /\b(university|college|school|institute|academy|degree|bachelor|master|diploma|gpa|certificat\w*|certified|licen[sc]e)\b/i;
      // A summary or a skills list holds no dated job titles of its own, so there it is always a job (a side
      // column's heading has cut into the work history). Under Education the title must stand on the dated line
      // itself and the work of the job, or the next job, must follow it. Elsewhere, only in a resume whose jobs have not been found under an experience heading.
      const titled = x => parts(x).some(y => TITLE_WORD.test(y) && y.split(" ").length <= 7);
      const bareDateLine = x => { const m = x.match(DATE); return !!m && !parts(x.slice(0, m.index) + " | " + x.slice(m.index + m[0].length)).length; };
      const prevLine = lines[lines.length - 1];
      const eduTitled = hasDate && titled(r) && !!items[i + 1] && (items[i + 1].hadBullet || items[i + 1].r.length >= 90 || (DATE.test(items[i + 1].r) && titled(items[i + 1].r)));
      const eduAbove = hasDate && bareDateLine(r) && !!prevLine && prevLine.maybeLabel && titled(prevLine.text) && !SCHOOL.test(prevLine.text); // "Chief of Staff | Acme, Bozeman, MT" / "2017 – 2020"
      const strayHere = sec === "summary" || sec === "skills" ? true : sec === "education" ? (eduTitled || eduAbove) && !/\bassociate(['’]?s)? (of|in|degree)\b|\b(club|society|list|honou?rs?|scholar\w*|abroad|gpa)\b/i.test(r + " " + (eduAbove ? prevLine.text : "")) : (strayMode || !roles.length);
      const stray = strayHere && hasDate && sec !== "experience" && sec !== "body" && sec !== "projects" && !hadBullet && r.length < 160 && !SCHOOL.test(r)
        && [r, ...lines.slice(-3).filter(l => l.label || (sec === "education" && l.maybeLabel)).map(l => l.text), labelLike(items[i + 1]) ? items[i + 1].r : ""].some(x => x && !SCHOOL.test(x) && parts(x).some(y => TITLE_WORD.test(y) && y.split(" ").length <= 7));
      if (stray) { section = "experience"; strayMode = true; }
      if ((sec === "experience" || sec === "body" || sec === "projects" || stray) && hasDate && r.length < 160 && !/^[a-z]/.test(r) && !(hadBullet && r.length >= 90)) {
        // What stands on the dated line besides the dates: a title, an employer, a place, or nothing at all.
        const dateText = r.match(DATE)[0]; const dm = r.indexOf(dateText);
        const ownAll = parts(r.slice(0, dm) + " | " + r.slice(dm + dateText.length));
        // only a place beside the dates ("2019 - 2023 / Detroit, MI"): nothing there can be the title
        const own = ownAll.length <= 2 && /^[A-Z]{2}$/.test(ownAll[ownAll.length - 1] || "") && !ownAll.some(x => TITLE_WORD.test(x)) ? [] : ownAll;
        // the same dates printed again under a job line ("... | 2022 to Present |" then "2022 – Present")
        const lastRole = roles[roles.length - 1], sp = spanOf(dateText);
        if (!own.some(titlePart) && lastRole && lines[lines.length - 1].kind === "role" && lastRole.span && sp && lastRole.span[0] === sp[0] && lastRole.span[1] === sp[1]) continue;
        let title = own.find(titlePart); const near = [];
        // two or more lines of dates and nothing else, one after the other, are a column of dates: the lines
        // around them are not their titles (the pairing after the loop finds those)
        const bareDate = x => { const m = x && x.match(DATE); return !!m && !parts(x.slice(0, m.index) + " | " + x.slice(m.index + m[0].length)).length; };
        const column = !own.length && (bareDate(items[i + 1] && items[i + 1].r) || (lastRole && !lastRole.title && lines[lines.length - 1].kind === "role"));
        if (!title && !column) {
          // The title is on a line of its own: just above the dates ("Senior Product Manager" / "Plaid" /
          // "01/2021 - Present") or just below them ("Microsoft July 2015 - December 2019" / "Program Manager").
          const prev = []; for (let k = lines.length - 1; k >= 0 && prev.length < 3; k--) { const l = lines[k]; if ((l.label || (stray && l.maybeLabel)) && (l.section === sec || stray)) prev.push(l); else break; }
          const next = []; for (let k = i + 1; k < items.length && next.length < 2 && labelLike(items[k]); k++) next.push(items[k]);
          // Dates alone on a line belong with the label lines above them (title / city / employer / dates, or a title
          // line wrapped in two); dates that share a line with the employer often have the title just below.
          const order = (own.length ? [prev[0], next[0], prev[1], next[1], prev[2]] : [prev[0], prev[1], prev[2], next[0], next[1]]).filter(Boolean);
          const pick = order.find(c => parts(c.text || c.r).some(titlePart));
          if (pick) {
            title = parts(pick.text || pick.r).find(titlePart);
            if (pick.r !== undefined) { const upto = next.indexOf(pick); for (let k = 0; k <= upto; k++) { near.push(next[k].r); } i += upto + 1; }
          } else if (!own.length && prev[0]) title = parts(prev[0].text)[0];
          for (const l of prev) { l.kind = "employer"; near.push(l.text); }
        }
        if (!title) title = column ? "" : own[0] || "";
        const whole = [r, ...near].join(" | ");
        // dates beside a school or a degree and no job title: schooling printed away from its heading, not a job
        if (!TITLE_WORD.test(title) && (SCHOOL.test(whole) || DEGREE_PHRASE.test(whole))) {
          for (const [re, id] of DEGREE) if (re.test(whole)) { degrees.add(id); if (CS_DEGREE.test(whole)) csDegree = true; }
          lines.push({ text: whole, kind: "education", section: "education", role: -1 }); continue;
        }
        const isPM = PM_TITLE.test(title);
        const lvl = (TITLE_LEVEL.find(([re]) => re.test(title)) || [, isPM ? "mid" : null])[1];
        const family = isPM ? (TITLE_FAMILY.find(([, re]) => re.test(title)) || ["pm"])[0] : null;
        const around = [...own, ...near.flatMap(parts)].filter(x => x !== title).join(" | ");
        const ph = placeholderDates && dateText.includes(PH);
        roles.push({ title, text: whole, years: ph ? 0 : yearsBetween(dateText), placeholder: ph || undefined, isPM, family, isIntern: INTERN.test(title) || INTERN.test(r), level: lvl, section: stray ? "experience" : sec, line: lines.length, employerLine: [employer, around].filter(Boolean).join(" | ") || null, capsLead: EMPLOYER_LINE.test(r0) && !TITLE_WORD.test(own[0] || "") && !TITLE_WORD.test(title), span: ph ? null : spanOf(dateText) });
        role = roles.length - 1; lines.push({ text: whole, kind: "role", section: stray ? "experience" : sec, role }); continue;
      }
      if ((sec === "experience" || sec === "body") && !hadBullet && !hasDate && r.length < 80 && EMPLOYER_LINE.test(r0) && !TITLE_WORD.test(r) && !DEGREE_PHRASE.test(r)) { employer = r; lines.push({ text: r, kind: "employer", section: sec, role: -1, label: true }); continue; }
      // a wrapped bullet: in a resume that marks bullets, an unmarked line after a bullet continues it
      const last = lines[lines.length - 1];
      if (usesBullets && !hadBullet && !hasDate && last && last.kind === "bullet" && !last.label && last.section === sec && (sec === "experience" || sec === "body" || sec === "projects") && !/[.!?]$/.test(last.text) && !(labelLike(items[i]) && TITLE_WORD.test(r))) { last.text += " " + r; continue; }
      if (sec === "education" || /\b(university|college|school|institute)\b/i.test(r) && DEGREE.some(([re]) => re.test(r)) || (DEGREE_PHRASE.test(r) && r.length < 140 && !(hadBullet && sec === "experience"))) {
        for (const [re, id] of DEGREE) if (re.test(r)) { degrees.add(id); if (CS_DEGREE.test(r)) csDegree = true; }
      }
      lines.push({ text: r, r0, kind: isCourse ? "course" : sec === "skills" ? "skill" : sec === "summary" ? "summary" : sec === "education" ? "education" : sec === "other" ? "other" : "bullet", section: sec, role: sec === "experience" || sec === "body" ? role : -1, label: sec !== "education" && labelLike(items[i]), maybeLabel: labelLike(items[i]) });
    }
    // An employer line that carries the dates of the whole stay, with the roles held there dated beneath it
    // ("MAJOR TELECOM CORP. 1994 – 2017", then "Director (2001 – 2017)", "Manager (1999 – 2001)"): the employer
    // line is not a role, or its years would count twice.
    const drop = new Set();
    roles.forEach((u, i) => {
      if (!u.capsLead || !u.span) return;
      let nested = 0;
      for (let k = i + 1; k < roles.length && !roles[k].capsLead && roles[k].section === u.section; k++) {
        const sp = roles[k].span; if (!sp || sp[0] < u.span[0] - 0.01 || sp[1] > u.span[1] + 1.01) break;
        roles[k].employerLine = u.text; nested++;
      }
      if (nested) drop.add(i);
    });
    // A column of dates printed apart from the jobs they belong to leaves dated entries with no title; when a
    // titled job has the same dates, the bare entry is that job again.
    roles.forEach((u, i) => { if (!u.title && u.span && roles.some((v, k) => k !== i && v.title && v.span && v.span[0] === u.span[0] && v.span[1] === u.span[1])) drop.add(i); });
    // A column of dates printed apart from the job lines ("July 2016 - Current", "May 2014 - June 2016" in one
    // place; "Operations Manager   Lyft, San Francisco, CA" in another). When the resume has as many undated
    // "title, employer" lines as dated entries with no title, they are the same jobs in the same order.
    const bare = roles.map((u, i) => i).filter(i => !roles[i].title && !drop.has(i));
    if (bare.length) {
      const cand = lines.filter(l => l.label && l.kind !== "role" && l.kind !== "employer" && l.kind !== "heading" && l.kind !== "education" && !DATE.test(l.text))
        .map(l => ({ l, chunks: (l.r0 || l.text).split(/\s{2,}|\t|\s*[,|]\s*/).map(x => x.trim()).filter(Boolean) }))
        .filter(c => c.chunks.length >= 2 && TITLE_WORD.test(c.chunks[0]) && c.chunks[0].split(" ").length <= 7 && /,\s*[A-Z][A-Za-z.]*( [A-Z][A-Za-z.]*)?\s*$/.test(c.l.text)); // ends with a place or an employer: ", CA"
      if (cand.length === bare.length) bare.forEach((i, k) => {
        const u = roles[i], c = cand[k]; u.title = c.chunks[0]; u.text = c.l.text + " | " + u.text; u.section = "experience";
        u.isPM = PM_TITLE.test(u.title); u.level = (TITLE_LEVEL.find(([re]) => re.test(u.title)) || [, u.isPM ? "mid" : null])[1];
        u.family = u.isPM ? (TITLE_FAMILY.find(([, re]) => re.test(u.title)) || ["pm"])[0] : null; u.isIntern = INTERN.test(u.text);
        u.employerLine = c.chunks.slice(1).join(" | "); c.l.kind = "employer"; lines[u.line].text = u.text; lines[u.line].section = "experience";
      });
    }
    if (drop.size) {
      const remap = {}; let n = 0; roles.forEach((_, i) => { remap[i] = drop.has(i) ? -1 : n++; });
      for (const l of lines) { if (l.kind === "role" && drop.has(l.role)) { l.kind = "employer"; l.role = -1; } else if (l.role >= 0) l.role = remap[l.role]; }
      for (let i = roles.length - 1; i >= 0; i--) if (drop.has(i)) roles.splice(i, 1);
    }
    if (placeholderDates) { const back = t => t.split(PH).join("20XX"); for (const l of lines) l.text = back(l.text); for (const u of roles) { u.text = back(u.text); u.title = back(u.title); if (u.employerLine) u.employerLine = back(u.employerLine); } }
    if (csDegree) degrees.add("cs_engineering_degree");
    const work = roles.filter(r => !/teaching assistant|\bTA\b|tutor/i.test(r.title));
    // years of work: projects, clubs and activities are dated too, but they are not jobs
    const totalYears = work.filter(r => !r.isIntern && r.section !== "projects").reduce((a, r) => a + (r.years || 0), 0);
    const pmYears = work.filter(r => r.isPM && !r.isIntern).reduce((a, r) => a + (r.years || 0), 0);
    const pmIntern = work.some(r => r.isPM && r.isIntern);
    const isStudent = lines.some(l => (l.kind === "education" || l.kind === "summary" || l.kind === "bullet") && /\b(expected|candidate|anticipated|class of 20\d\d|graduating)\b/i.test(l.text));
    return { lines, roles, degrees, totalYears, pmYears, pmIntern, isStudent, placeholderDates, hasSections: lines.some(l => l.kind === "heading") };
  }

  // Role families beyond the product ones come from data (web/data/roles_mba.json, written by the graph build).
  // This reads a title by the steps that file states under "how", the same steps as evals/roles_mba.mjs: the
  // first family whose patterns match and whose excludes do not; at a firm whose business is the role (a bank,
  // a fund, a consulting firm) the employer's rule, which knows bare grades; then the level from the ladder of
  // that kind of employer. A plain list of { id, label, patterns, exclude, covers } is read by the first step alone.
  function compileRoles(roles) {
    const R = Array.isArray(roles) ? { families: roles } : roles || { families: [] };
    const fl = R.flags || "i", re = p => new RegExp(p, fl), opt = p => p ? re(p) : null, any = l => l && l.length ? re(l.map(p => "(?:" + p + ")").join("|")) : null;
    const fams = (R.families || []).map(f => ({ id: f.id, label: f.label, rx: any(f.patterns), ex: any(f.exclude), covers: f.covers || [], gate: f.product_gate }));
    const P = R.product, pFams = P ? P.families.map(f => ({ id: f.id, rx: re(f.pattern) })) : [];
    const pRx = P ? { exclude: re(P.exclude), keep: re(P.keep), nonproduct: re(P.nonproduct), food: re(P.food), manage: re(P.product_manage) } : null;
    const productFamily = t => (pFams.find(f => f.rx.test(t)) || {}).id || null;
    const productOk = t => !!productFamily(t) && !pRx.food.test(t) && !(pRx.exclude.test(t) && !pRx.keep.test(t)) && !(pRx.nonproduct.test(t) && !pRx.manage.test(t));
    const junk = opt(R.junk), consultant = opt(R.consultant), consultantEx = opt(R.consultant_exclude), employerEx = opt(R.employer_exclude), realEstateEx = opt(R.real_estate_exclude), corpDevNamed = opt(R.corp_dev_named);
    const employerRules = Object.fromEntries(Object.entries(R.employer_rules || {}).map(([c, list]) => [c, list.map(r => ({ family: r.family, rx: re(r.pattern) }))]));
    const first = new Set(R.employer_first || []), named = new Set(R.named_first || []), banks = new Set(R.banks || []), consulting = new Set(R.consulting_categories || []);
    const ladders = Object.fromEntries(Object.entries(R.ladders || {}).map(([k, l]) => [k, l.grades.map(g => ({ level: g.level, rx: re(g.pattern) }))]));
    const cos = opt(R.chief_of_staff), ldpStaff = opt(R.ldp_staff);
    // `ruledOut` is the text the excludes are looked for in (the title, when a whole job line is read)
    function general(t, ruledOut) {
      const x = ruledOut === undefined ? t : ruledOut;
      for (const f of fams) { if (!f.rx || !f.rx.test(t) || (f.ex && f.ex.test(x))) continue; if (f.gate && P && !(productOk(t) && productFamily(t) === f.gate)) continue; return f.id; }
      return null;
    }
    function employer(t, category) {
      if (!category) return null;
      if (consulting.has(category) && consultant && consultant.test(t)) return consultantEx && consultantEx.test(t) ? null : "management_consultant";
      if ((employerEx && employerEx.test(t)) || (category === "Real estate" && realEstateEx && realEstateEx.test(t))) return null;
      const hit = (employerRules[category] || []).find(r => r.rx.test(t)); return hit ? hit.family : null;
    }
    function family(title, who = {}) {
      const t = title || ""; if (junk && junk.test(t)) return null;
      const g = general(t);
      if (first.has(who.category) && !named.has(g)) { const f = employer(t, who.category); if (f) return f; }
      if (g === "corp_dev" && who.company && banks.has(who.company.toLowerCase()) && corpDevNamed && !corpDevNamed.test(t)) return "ib_associate";
      return g || employer(t, who.category);
    }
    function ladder(who = {}, fam) {
      const b = R.ladders && R.ladders.bank && R.ladders.bank.applies; if (!b) return "corporate";
      if (b.categories.includes(who.category) || (who.industry && b.industries.includes(who.industry)) || (who.company && banks.has(who.company.toLowerCase()))) return "bank";
      return consulting.has(who.category) && fam === "management_consultant" ? "consulting" : "corporate";
    }
    function level(title, who, fam) {
      const which = ladder(who, fam); if (!ladders[which]) return null;
      if (fam === "ldp" && ldpStaff && !ldpStaff.test(title)) return "associate";
      const t = cos ? title.replace(cos, "CoS") : title; const hit = ladders[which].find(g => g.rx.test(t)); return hit ? hit.level : "mid";
    }
    // Employers we hold, by name, with the kind of business each is. A one-word name ("Mars", "Baird") must be written as we hold it or in capitals.
    const known = Object.entries(R.employers || {}).flatMap(([name, e]) => name.split(/\s*[()]\s*/).filter(Boolean).flatMap(n => { const short = n.replace(/,? (Group|Inc\.?|Corporation|Corp\.?|& Company|& Co\.?|LLC|LLP|Holdings|Financial)$/i, ""); return / /.test(short) ? [n, short] : [n]; }) // "Goldman Sachs Group" is also "Goldman Sachs"; "Capital Group" is not "Capital"
      .filter((n, k, a) => n.length >= 2 && a.indexOf(n) === k).map(n => ({ name, e, len: n.length, rx: new RegExp("(^|[^A-Za-z0-9])(?:" + [n, n.toUpperCase()].map(v => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")($|[^A-Za-z0-9])", / /.test(n) ? "i" : "") }))).sort((a, b) => b.len - a.len);
    return { fams, general, family, ladder, level, known, full: !!R.employer_rules };
  }
  // What an employer's own name says about its business, for employers we do not hold. A resume gives no
  // category as a posting's source does; these words stand in for it. The first that matches wins.
  const EMPLOYER_HINT = [
    ["Investment banking", /\binvestment bank(ing|ers?)?\b|\bsecurities\b|\bcapital markets\b/i],
    ["Private equity", /\bprivate equity\b|\bbuyouts?\b|\b(capital|equity) partners\b/i],
    ["Venture capital", /\bventure capital\b|\bventures\b/i],
    ["Consulting and advisory", /\bconsult(ing|ants|ancy)\b|\badvisory\b/i],
    ["Asset management", /\b(asset|investment|wealth|fund) management\b|\binvestments\b|\binvestment (advisers|advisors|company|group|partners)\b/i],
    ["Real estate", /\breal estate\b|\brealty\b|\bproperties\b|\bREIT\b/i],
    ["Commercial and corporate banking", /\bbank\b|\bbancorp\b|\bbanking\b/i],
  ];
  // the same job under the name resumes give it
  const RESUME_TITLE = [["growth_manager", /\bgrowth marketer\b/i], ["org_dev", /\bchange manager\b/i]];

  function createMatcher({ taxonomy, subskills, graph, roles, distinct }) {
    const RR = compileRoles(roles); const FAMS = RR.fams;
    // the employer of a job, from the text beside its title: one we hold, or the kind its name gives away
    function employerOfLine(text) {
      if (!text) return {};
      const hit = RR.known.find(k => k.rx.test(text)); if (hit) return { company: hit.name, category: hit.e.category, industry: hit.e.industry };
      const hint = RR.full && EMPLOYER_HINT.find(([, re]) => re.test(text)); return hint ? { category: hint[0] } : {};
    }
    // The role family of a job title, or null: "FP&A Manager" -> fpa; "Associate" at a private-equity firm ->
    // pe_associate. An internship keeps its family; the reads that count years in a role leave internships out.
    function roleOf(title, line) {
      const t = (title || "").trim(); if (!t || !FAMS.length) return { family: null };
      const beside = line ? line.split(t).join(" ").replace(DATE, " ") : ""; const who = employerOfLine(beside);
      let family = RR.family(t, who);
      // a bare grade whose employer line names the role itself ("Associate | Harlow Reed Investment Banking")
      if (!family && BARE_RANK.test(t) && line) family = RR.general(line.replace(DATE, " "), t);
      if (!family) family = (RESUME_TITLE.find(([, re]) => re.test(t)) || [null])[0];
      const which = RR.full ? RR.ladder(who, family) : "corporate";
      return { family, who, ladder: which, level: family && which !== "corporate" ? LEVEL_GROUP[RR.level(t, who, family)] || null : null };
    }
    const roleFamilyOf = (title, line) => roleOf(title, line).family;
    // A bank or a consulting firm names grades its own way ("Vice President" at a bank is mid-career): there the
    // level comes from that ladder, not from the words of the title.
    function readRoles(parsed) {
      for (const r of parsed.roles) if (r.roleFamily === undefined) { const x = roleOf(r.title, [r.text, r.employerLine].filter(Boolean).join(" | ")); r.roleFamily = x.family; if (x.level) { r.level = x.level; r.ladder = x.ladder; } }
      return parsed;
    }
    // who counts as having held a role family: the family itself and every family that covers it
    const countsAs = family => [family, ...(COVERS[family] || []), ...FAMS.filter(f => f.covers.includes(family)).map(f => f.id)];
    const heldIn = (r, counts) => counts.includes(r.family) || counts.includes(r.roleFamily);
    const skills = taxonomy.skills; const byId = Object.fromEntries(skills.map(s => [s.id, s]));
    const G = graph;
    if (G.jobs.length && typeof G.jobs[0].skills[0] === "number") for (const j of G.jobs) { j.skills = j.skills.map(i => G.skill_ids[i]); j.sub = (j.sub || []).map(i => G.sub_ids[i]); }
    const gSkill = Object.fromEntries((G.skills || []).map(s => [s.id, s]));
    const CRED = new Set(skills.filter(s => s.cluster === "credentials").map(s => s.id));
    const DOMAIN = new Set(skills.filter(s => s.cluster === "domain").map(s => s.id));
    const compiled = skills.map(s => {
      const drop = new Set(RESUME_DROP[s.id] || []);
      const base = s.patterns.filter(p => !drop.has(p));
      const extra = (RESUME_PATTERNS[s.id] || []);
      const direct = rx([...base, ...extra.filter(p => typeof p === "string")]);
      const via = extra.filter(p => typeof p === "object").map(p => ({ rx: new RegExp(p.p, "i"), via: p.via }));
      return { id: s.id, direct, via };
    });
    const subRx = []; for (const [sid, list] of Object.entries(subskills)) for (const sub of list) subRx.push({ id: sub.id, name: sub.name, parent: sid, rx: rx(sub.patterns) });

    const DEGREE_IDS = new Set(["bachelors", "masters_mba", "phd", "cs_engineering_degree"]);
    const TOOLISH = new Set([...skills.filter(s => s.cluster === "tools").map(s => s.id), "sql", "python_r", "figma", "jira"]);
    function lineStrength(l, id) {
      if (l.kind === "other") return 1; // interests, awards, languages: a word there is a mention
      if (CRED.has(id) && !STRUCTURAL.has(id)) return 2; // a certificate or a licence is held wherever it is listed
      // A course is something done, not just a word: for a student it is evidence. For a person with years of
      // work who is not studying now, a course or an item of a list is a mention; the work lines carry the evidence.
      if (l.kind === "course") return seasoned ? 1 : 2;
      // a list item outside any job (a skills column whose heading the PDF moved away): a few words, no number
      if (seasoned && l.kind === "bullet" && l.role < 0 && l.label && l.text.split(" ").length <= 5 && !OUTCOME.test(l.text)) return TOOLISH.has(id) ? 2 : 1;
      if (l.kind === "skill") return TOOLISH.has(id) ? 2 : 1; // nobody writes a bullet about Jira
      if (l.kind === "employer") return DOMAIN.has(id) ? 2 : 1; // where a person worked shows the industry
      if (l.kind === "summary" || l.kind === "education" || l.kind === "heading") return 1;
      return OUTCOME.test(l.text) ? 3 : 2;
    }

    // not a current student, and three or more years of work: set by tag() for the resume in hand
    let seasoned = false; const SEASONED_YEARS = 3;
    function tag(parsed) {
      seasoned = !parsed.isStudent && parsed.totalYears >= SEASONED_YEARS;
      const ev = {}; const add = (id, l, i, strength, via) => {
        const e = ev[id] ||= { strength: 0, lines: [], subs: new Set(), via: new Set(), direct: false, nLines: new Set() };
        e.lines.push({ i, text: l.text, strength, via: via || null, kind: l.kind, role: l.role });
        e.nLines.add(i); if (via) e.via.add(via); else e.direct = true;
        e.strength = Math.max(e.strength, strength);
      };
      parsed.lines.forEach((l, i) => {
        if (l.kind === "heading") return;
        // An employer's name shows an industry or a kind of employer, never a skill ("Beta Apps" is not beta
        // testing): on a job line only the title is read for skills, and an employer line is read for none.
        const named = l.kind === "role" || l.kind === "employer";
        const own = l.kind === "role" ? (parsed.roles[l.role] || {}).title || "" : l.kind === "employer" ? "" : l.text;
        for (const c of compiled) {
          const base = lineStrength(l, c.id);
          const structural = STRUCTURAL.has(c.id);
          if (structural && !(DEGREE_IDS.has(c.id) ? l.kind === "education" : (l.kind === "role" || l.kind === "summary" || l.kind === "employer"))) continue;
          if (EDU_CREDENTIAL.has(c.id) && !(l.kind === "education" || DEGREE_PHRASE.test(l.text))) continue;
          const next = parsed.lines[i + 1];
          const text = EDU_CREDENTIAL.has(c.id) && next && next.kind === l.kind && next.text.length < 60 ? l.text + " " + next.text : named && !structural && !DOMAIN.has(c.id) ? own : l.text; // "Bachelor of Science" / "Finance"
          if (!text) continue;
          if (c.direct && c.direct.test(text)) add(c.id, l, i, structural ? 2 : base);
          else for (const v of c.via) if (v.rx.test(text)) { add(c.id, l, i, base, v.via); break; }
        }
        for (const s of subRx) if (s.rx && s.rx.test(own)) { const e = ev[s.parent] ||= { strength: 0, lines: [], subs: new Set(), via: new Set(), direct: false, nLines: new Set() }; e.subs.add(s.id); e.subLines = e.subLines || []; e.subLines.push({ i, text: l.text, sub: s.name }); }
      });
      // structural credentials
      const p = parsed;
      const cred = (id, strength, text) => { const e = ev[id] ||= { strength: 0, lines: [], subs: new Set(), via: new Set(), direct: true, nLines: new Set() }; e.strength = Math.max(e.strength, strength); e.direct = true; if (text) e.lines.push({ i: -1, text, strength, via: null, kind: "role", role: -1 }); };
      for (const d of p.degrees) cred(d, 2);
      if (p.pmYears > 0) cred("pm_experience", 3, `${p.pmYears.toFixed(1).replace(/\.0$/, "")} years in product roles`);
      else if (p.pmIntern) cred("pm_experience", 2, "product management internship");
      const yoe = p.totalYears;
      for (const [id, lo] of [["yoe_2", 2], ["yoe_3", 3], ["yoe_5", 5], ["yoe_8", 8], ["yoe_10", 10]]) if (yoe >= lo) cred(id, 2);
      // domain skills: one line is a hint unless it is a role / summary line
      for (const [id, e] of Object.entries(ev)) {
        if (e.lines.length === 0 && e.subs.size) { e.strength = 0; e.hintOnly = true; continue; } // sub-skill only: a hint, never credited
        if (DOMAIN.has(id)) { const strong = e.lines.some(l => l.kind === "role" || l.kind === "summary" || l.kind === "employer") || e.nLines.size >= 2; if (!strong) { e.strength = 0; e.capped = true; } }
        if (!e.direct && e.via.size) e.transfer = true;
      }
      return ev;
    }

    // How distinctive an ask is for a role. Postings of almost every role say "stakeholders" and "prioritize":
    // such an ask tells roles apart no better than chance, and a resume that does not show it is not a weaker
    // fit for this role than for any other. An ask is weighed by its lift: its share in the role's postings over
    // its mean share across the role families of the graph (each family counts once, whatever its size). At lift 1
    // or below it keeps `floor` of its weight; from lift `full` up, all of it. Off unless `distinct` is passed
    // ({ floor, full } or true for the defaults), so a role set opts in.
    const DISTINCT = distinct ? { floor: 0.2, full: 2, ...(distinct === true ? {} : distinct) } : null;
    // `baseline` ({ skill id: mean share }) says what "all roles" means when the graph in hand is too narrow to
    // say it: the six product families all ask for the same product skills, so among themselves nothing is
    // distinctive. Their baseline is the mean over the 50 roles of the MBA graph.
    const meanShare = (() => {
      if (!DISTINCT) return null; if (DISTINCT.baseline) return id => DISTINCT.baseline[id] || 0; const byFam = {}; for (const j of G.jobs) (byFam[j.family] ||= []).push(j);
      const fams = Object.values(byFam), sum = {};
      for (const jobs of fams) { const sh = shares(jobs).share, seen = new Set(jobs.flatMap(j => j.skills)); for (const k of seen) sum[k] = (sum[k] || 0) + sh(k); }
      return id => (sum[id] || 0) / (fams.length || 1);
    })();
    // the industry slot is one ask by design and keeps its weight; AI literacy is judged by its most asked member
    function lift(id, w) {
      if (!DISTINCT || id === "__domain") return 1;
      const a = id === "__ai" ? Math.max(...AI_GROUP.map(meanShare)) : meanShare(id); if (!a) return 1;
      return Math.max(DISTINCT.floor, Math.min(1, DISTINCT.floor + (1 - DISTINCT.floor) * (w / a - 1) / (DISTINCT.full - 1)));
    }
    // A posting may carry a weight `w` (the MBA graph balances employers: no one employer counts for more than a
    // set part of a role). Shares are of weight, as on the map; `n` stays the number of postings.
    function shares(jobs) { let n = 0; const cnt = {}; for (const j of jobs) { const w = j.w == null ? 1 : j.w; n += w; for (const k of j.skills) cnt[k] = (cnt[k] || 0) + w; } return { n: jobs.length, share: id => (cnt[id] || 0) / (n || 1) }; }

    // target: { jobs, job?, familyJobs?, label }
    function requirements(target) {
      const st = shares(target.job ? (target.familyJobs || target.jobs) : target.jobs);
      const inJob = target.job ? new Set(target.job.skills) : null;
      const tiers = { core: new Map(), common: new Map(), diff: new Map() }; const domains = new Map(); const ai = { ids: [], w: 0 }; const creds = new Map();
      for (const s of skills) {
        if (SOFT.has(s.id)) continue;
        const w = st.share(s.id); if (inJob && !inJob.has(s.id)) continue;
        if (CRED.has(s.id)) { if (w >= 0.15 || inJob) creds.set(s.id, w); continue; }
        if (DOMAIN.has(s.id)) { if (w >= TIER.diff || inJob) domains.set(s.id, w); continue; }
        if (AI_GROUP.includes(s.id)) { if (w >= TIER.diff || inJob) { ai.ids.push(s.id); ai.w = Math.max(ai.w, w); } continue; }
        const tier = inJob ? (w >= TIER.core ? "core" : "common") : w >= TIER.core ? "core" : w >= TIER.common ? "common" : w >= TIER.diff ? "diff" : null;
        if (tier) tiers[tier].set(s.id, w);
      }
      if (ai.ids.length) (ai.w >= TIER.core ? tiers.core : ai.w >= TIER.common ? tiers.common : tiers.diff).set("__ai", ai.w);
      const topDomain = Math.max(0, ...domains.values());
      if (domains.size) (topDomain >= TIER.core ? tiers.core : topDomain >= TIER.common ? tiers.common : tiers.diff).set("__domain", topDomain);
      const soft = skills.filter(s => SOFT.has(s.id) && st.share(s.id) >= 0.3 && (!inJob || inJob.has(s.id))).map(s => s.id);
      return { tiers, domains, ai, creds, soft, n: st.n, label: target.label, share: st.share };
    }

    // Level from years and titles. Years alone reach senior: lead needs a title that says so (staff, principal,
    // director, head). A current title of associate or junior holds the read at mid, however long it has been held.
    function levelFrom(years, titleLevel, held) {
      let level = years >= 5 ? "senior" : years >= 2 ? "mid" : "associate";
      if (titleLevel && LEVEL_ORDER.indexOf(titleLevel) > LEVEL_ORDER.indexOf(level)) level = titleLevel;
      const latest = held.filter(r => r.span).sort((a, b) => b.span[1] - a.span[1] || b.span[0] - a.span[0])[0];
      if (latest && latest.level === "associate" && LEVEL_ORDER.indexOf(level) > 1) level = "mid";
      return level;
    }

    // The read is relative to the role asked about. For a product role (or no role), any product title counts,
    // as before. For another role family, only jobs in that family (or one that covers it) count as "in the role".
    function profileOf(parsed, family) {
      readRoles(parsed);
      const years = parsed.totalYears;
      const other = family && !PRODUCT_FAMILIES.has(family) ? countsAs(family) : null;
      const inRole = r => other ? heldIn(r, other) : r.isPM;
      const work = parsed.roles.filter(r => !/teaching assistant|\bTA\b|tutor/i.test(r.title));
      const pm = other ? work.filter(r => inRole(r) && !r.isIntern).reduce((a, r) => a + (r.years || 0), 0) : parsed.pmYears;
      const pmIntern = other ? work.some(r => inRole(r) && r.isIntern) : parsed.pmIntern;
      const titleLevel = parsed.roles.filter(r => inRole(r) && !r.isIntern).map(r => r.level).reduce((a, l) => ({ lead: 4, senior: 3, mid: 2, associate: 1 }[l] > ({ lead: 4, senior: 3, mid: 2, associate: 1 }[a] || 0) ? l : a), null);
      let persona, level;
      if (pm > 0) { persona = "experienced_in_role"; level = levelFrom(pm, titleLevel, parsed.roles.filter(r => inRole(r) && !r.isIntern)); }
      else if (years >= 3 && !pmIntern) { persona = "pivoter"; level = years >= 8 ? "mid" : "associate"; } // a PM internship means the early-career path, not a pivot
      else { persona = "new_to_role"; level = "associate"; }
      const backgrounds = []; const bg = (re, id) => { if (parsed.roles.some(r => re.test(r.text)) || (id === "research" && parsed.degrees.has("phd"))) backgrounds.push(id); };
      bg(/research|phd|postdoc|lab\b|scientist|fellow/i, "research"); bg(/engineer|developer|\bswe\b|programmer/i, "engineering"); bg(/consult|analyst|strateg|advisory/i, "consulting"); bg(/design/i, "design"); bg(/marketing|brand|growth|content|communications/i, "marketing"); bg(/finance|financial|operations|supply|accounting|banking/i, "finance"); bg(/founder|co-?founder|founded/i, "founder");
      return { persona, level, years, pmYears: pm, pmIntern, family: family || null, backgrounds, titleLevel, roles: parsed.roles.length };
    }

    // Employers we hold postings for, to recognise on a role line ("Senior Product Manager, Stripe (2019 - 2022)").
    const byCompany = {}; for (const j of G.jobs) (byCompany[j.company] ||= []).push(j);
    const companyRx = Object.keys(byCompany).filter(c => c.length >= 4).map(c => ({ name: c, rx: new RegExp("(^|[^A-Za-z0-9])" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^A-Za-z0-9])", / /.test(c) ? "i" : ""), any: new RegExp("(^|[^A-Za-z0-9])" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^A-Za-z0-9])", "i") }));
    function employerOf(role) {
      // After the title a one-word name must be capitalised as we hold it ("Ramp", not "ramp up"). A line that is
      // an employer line by its form ("STRIPE   Chicago, IL") is matched in any case.
      const rest = role.text.slice(role.title.length), above = role.employerLine || "";
      const hit = companyRx.filter(c => c.rx.test(rest) || c.any.test(above)).sort((a, b) => b.name.length - a.name.length)[0];
      return hit ? hit.name : null;
    }
    function askedBy(jobs, min) { const st = shares(jobs); return new Set(skills.filter(s => !SOFT.has(s.id) && !CRED.has(s.id) && st.share(s.id) >= min).map(s => s.id)); }
    const coreOf = jobs => askedBy(jobs, TIER.core);

    // What a person is presumed to do because they held the target role. Null when they did not hold it,
    // held it for under a year, or held it only below the target level.
    function standing(parsed, profile, target, targetLevel) {
      const family = target.job ? target.job.family : (target.jobs[0] || {}).family;
      const counts = countsAs(family);
      const held = parsed.roles.filter(r => heldIn(r, counts) && !r.isIntern && !/teaching assistant|\bTA\b|tutor/i.test(r.title));
      const years = held.reduce((a, r) => a + (r.years || 0), 0);
      if (!family || !held.length || years < PRESUMED.minYears) return null;
      const byTitle = held.map(r => r.level).filter(Boolean).sort((a, b) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a))[0];
      const level = levelFrom(years, byTitle, held);
      const gap = LEVEL_ORDER.indexOf(level) - LEVEL_ORDER.indexOf(targetLevel);
      if (gap < 0) return null;
      const famJobs = G.jobs.filter(j => j.family === family);
      const atLevel = famJobs.filter(j => LEVEL_GROUP[j.level] === level);
      const market = coreOf(atLevel), marketCommon = askedBy(atLevel, TIER.common);
      const employers = [...new Set(held.map(employerOf).filter(Boolean))];
      const employerJobs = famJobs.filter(j => employers.includes(j.company));
      const employer = employerJobs.length >= PRESUMED.minEmployerPostings ? coreOf(employerJobs) : new Set();
      return { family, level, years, above: gap > 0, market, marketCommon, employer, employers: employerJobs.length >= PRESUMED.minEmployerPostings ? employers.filter(e => (byCompany[e] || []).some(j => j.family === family)) : [] };
    }
    function presumedCredit(st, id, tier) {
      if (!st || tier === "diff" || id === "__domain" || id === "__ai") return 0;
      const table = st.above ? PRESUMED.above : PRESUMED.same;
      const inEmployer = st.employer.has(id);
      // above the target level, every core or common ask of the target is within what they did
      const base = st.market.has(id) || inEmployer ? table.core : (st.above || st.marketCommon.has(id)) ? table.common : 0;
      return base ? base + (inEmployer ? PRESUMED.employer : 0) : 0;
    }

    // A ladder ({associate: "...", ...}) and build steps (["...", ...]) are flat for product skills and keyed by industry
    // ladder for MBA skills ({bank: {...}}, {bank: [step, ...]}): keyed ones are read on the target role's ladder
    // (opts.ladder), and a skill with none on it gets none.
    function ladderFor(id, level, ladder) {
      const s = gSkill[id]; let l = s && s.ladder; if (!l) return null;
      if (!Object.values(l).some(v => typeof v === "string")) l = ladder ? l[ladder] : null;
      return l ? l[level] || null : null;
    }
    function signalsFor(id) { const s = gSkill[id]; return (s && s.signals) || []; }
    function buildFor(id, ladder) { const s = gSkill[id]; const b = s && s.build; return !b ? [] : Array.isArray(b) ? b : (ladder && b[ladder]) || []; }
    function nameOf(id) { if (id === "__ai") return "AI literacy"; if (id === "__domain") return "Industry fit"; return (byId[id] || {}).name || id; }

    function evidenceFor(ev, id, req) {
      if (id === "__ai") { let best = null; for (const k of req.ai.ids) if (ev[k] && (!best || ev[k].strength > best.strength)) best = { ...ev[k], id: k }; return best; }
      if (id === "__domain") { let best = null; for (const k of req.domains.keys()) if (ev[k] && (!best || ev[k].strength > best.strength)) best = { ...ev[k], id: k }; return best; }
      return ev[id] ? { ...ev[id], id } : null;
    }

    function score(ev, req, profile, opts = {}) {
      const targetLevel = opts.level || profile.level;
      const rows = []; const tierSum = { core: [0, 0], common: [0, 0], diff: [0, 0] };
      for (const tier of ["core", "common", "diff"]) for (const [id, w] of req.tiers[tier]) {
        const e = evidenceFor(ev, id, req); const strength = e ? e.strength : 0;
        const pc = strength < 2 ? presumedCredit(opts.standing, id, tier) : 0;
        const credit = Math.max(CREDIT[strength], pc);
        const status = strength >= 2 ? (e.transfer ? "transferable" : "evidenced") : pc ? "presumed" : strength === 1 ? "thin" : "gap";
        const depth = e ? (e.subs.size > 0 || strength === 3) : false;
        rows.push({ id: e && e.id !== id ? e.id : id, slot: id, name: nameOf(e && e.id !== id ? e.id : id), slotName: nameOf(id), tier, w, strength, credit, status, depth, subs: e ? [...e.subs] : [], via: e ? [...e.via] : [], lines: e ? e.lines.sort((a, b) => b.strength - a.strength).slice(0, 2) : [], hintLines: e && e.subLines ? e.subLines.slice(0, 2) : [], ladder: ladderFor(e && e.id !== id ? e.id : id, targetLevel, opts.ladder), signals: signalsFor(e && e.id !== id ? e.id : id), build: buildFor(e && e.id !== id ? e.id : id, opts.ladder) });
        const weight = w * lift(id, w); rows[rows.length - 1].weight = weight; // w is the share of postings (shown to the user); weight is what the score counts
        tierSum[tier][0] += weight * credit; tierSum[tier][1] += weight;
      }
      const cov = t => tierSum[t][1] ? tierSum[t][0] / tierSum[t][1] : null;
      const core = cov("core"), common = cov("common"), diff = cov("diff");
      const overall = (2 * tierSum.core[0] + tierSum.common[0]) / ((2 * tierSum.core[1] + tierSum.common[1]) || 1);
      const evidencedRows = rows.filter(r => r.status === "evidenced" || r.status === "transferable");
      const depth = evidencedRows.length ? evidencedRows.filter(r => r.depth).length / evidencedRows.length : 0;
      const breadth = diff;
      // what-if: credit the top three core/common gaps
      const gaps = rows.filter(r => r.status === "gap" && r.tier !== "diff").sort((a, b) => b.weight - a.weight || b.w - a.w);
      const top3 = gaps.slice(0, 3); const bonus = top3.reduce((a, r) => a + (r.tier === "core" ? 2 : 1) * r.weight, 0);
      const whatIf = (2 * tierSum.core[0] + tierSum.common[0] + bonus) / ((2 * tierSum.core[1] + tierSum.common[1]) || 1);
      const creds = [...req.creds].map(([id, w]) => ({ id, name: nameOf(id), w, have: !!(ev[id] && ev[id].strength >= 2), detail: ev[id] && ev[id].lines[0] ? ((ev[id].lines.find(l => l.i === -1) || ev[id].lines.slice().sort((a, b) => a.text.length - b.text.length)[0]).text.slice(0, 80)) : null }));
      const industries = [...req.domains].sort((a, b) => b[1] - a[1]).map(([id, w]) => ({ id, name: nameOf(id), w, have: !!(ev[id] && ev[id].strength >= 2), hint: !!(ev[id] && (ev[id].capped || ev[id].strength === 1)) }));
      return { overall, core, common, breadth, depth, rows, gaps, whatIf, whatIfSkills: top3.map(r => r.slotName), creds, industries, soft: req.soft.map(id => ({ id, name: nameOf(id), have: !!ev[id] })), targetLevel };
    }

    function match(text, target, opts = {}) {
      const parsed = readRoles(parseResume(text)); const ev = tag(parsed); const req = requirements(target);
      const profile = profileOf(parsed, target.job ? target.job.family : (target.jobs[0] || {}).family);
      const st = standing(parsed, profile, target, opts.level || profile.level);
      const res = score(ev, req, profile, { ...opts, standing: st });
      res.standing = st ? { family: st.family, level: st.level, years: st.years, above: st.above, employers: st.employers, presumed: res.rows.filter(r => r.status === "presumed").length } : null;
      const unmapped = parsed.lines.filter((l, i) => l.kind === "bullet" && l.text.length > 30 && !Object.values(ev).some(e => e.nLines.has(i) || (e.subLines || []).some(s => s.i === i))).map(l => l.text).slice(0, 8);
      const extras = Object.entries(ev).filter(([id, e]) => e.strength >= 2 && !CRED.has(id) && !SOFT.has(id) && !res.rows.some(r => r.id === id)).map(([id]) => ({ id, name: nameOf(id) }));
      const covered = new Set(Object.entries(ev).filter(([id, e]) => e.strength >= 2 && !SOFT.has(id) && !id.startsWith("yoe_")).map(([id]) => id));
      const subs = new Set(); for (const e of Object.values(ev)) if (e.strength >= 2) for (const s of e.subs) subs.add(s);
      return { ...res, profile, parsed: { roles: parsed.roles, degrees: [...parsed.degrees], lines: parsed.lines.length, hasSections: parsed.hasSections, placeholderDates: parsed.placeholderDates }, unmapped, extras, covered, subs, evidence: ev, ai: req.ai.ids, req: { n: req.n, label: req.label, core: [...req.tiers.core.keys()], common: [...req.tiers.common.keys()], diff: [...req.tiers.diff.keys()] } };
    }

    return { match, parseResume, readRoles, roleFamilyOf, roleOf, tag, requirements, profileOf, score, nameOf, LADDER_LABEL, VIA_LABEL, LEVEL_TO_LADDER };
  }

  // The band of fit a score falls in, from the cut points that evals/calibrate.mjs derives (bands.strong and
  // bands.in_range for every role, bands.related per group of roles). Returns "strong", "in_range", "related",
  // "different", or null when the group has no bands (the score does not yet sort resumes for its roles).
  function bandOf(score, bands, group) {
    if (!bands || (bands.no_bands && group in bands.no_bands)) return null;
    const low = typeof bands.related === "number" ? bands.related : (bands.related || {})[group];
    if (low == null) return null;
    return score >= bands.strong ? "strong" : score >= bands.in_range ? "in_range" : score >= low ? "related" : "different";
  }

  return { createMatcher, bandOf, parseResume, RESUME_PATTERNS, RESUME_DROP, SOFT, AI_GROUP, TIER, LADDER_LABEL, VIA_LABEL, LEVEL_TO_LADDER };
});
