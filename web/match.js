/* Product Role Atlas — resume matcher.
   Pure logic, no DOM. Loaded as a classic script in the browser (window.Matcher) and required from
   node by evals/run.mjs. app.js renders the result; evals/ checks it against sample resumes.

   Pipeline: parseResume(text) -> lines with section / role context
             tag(parsed)        -> per-skill evidence {strength, lines, subs, via}
             requirements(...)  -> core / common / differentiator tiers, one industry slot, one AI slot
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
    cloud: [],
    big_tech_experience: ["global scale", "enterprise[- ]scale", "large[- ]scale (systems|products|platforms|organizations|programs)"],
    pm_experience: ["shipping (software )?products"],
  };

  // Resume-language patterns, per skill. `via` marks vocabulary from another discipline: a hit is
  // real evidence but shows as "transferable" with a suggested rewrite, since the resume does not yet
  // say it the way product postings do.
  const RESUME_PATTERNS = {
    cross_functional: [
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
    exec_communication: ["present(ed|ing|ations?) .{0,40}(executive|leadership|founders|board|c-?suite|panel|clients|senior)", "(quarterly|monthly) (business )?reviews?", "executive (summary|readout|update)", { p: "(published|presented) .{0,30}(papers?|at [A-Z]{2,}|conference|workshop)", via: "research" }, { p: "(pitched|pitch(ed)? to) .{0,30}(panel|judges|investors|founders)", via: "founder" }],
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
    product_lifecycle: ["end[- ]to[- ]end", "shipped \\d+\\+? (features|products|releases)", "from (idea|concept|discovery|zero|0) to (launch|ship|scale|one|1)", "(owned|drove|led) .{0,40}(from|through) (discovery|concept|launch)", "0[- ]to[- ]1|zero[- ]to[- ]one", "full (product )?lifecycle"],
    launch: ["launch(ed|es|ing)?\\b", "released?\\b", "shipped\\b", "go[- ]live", "rolled? out", { p: "deployed .{0,30}(to|with) \\d+ (users|participants|customers)", via: "research" }, { p: "shipped (behind|under) (a )?feature flag", via: "engineering" }],
    gtm: ["go[- ]to[- ]market", "\\bGTM\\b", "launch (plan|strategy|messaging|campaign)", { p: "(campaign|channel) (strategy|planning|launch)", via: "marketing" }, { p: "market entry", via: "consulting" }],
    positioning_messaging: ["positioning", "messaging", "value prop(osition)?", { p: "brand (voice|guidelines|campaign|strategy)|copywriting|content strategy", via: "marketing" }],
    pricing_packaging: ["pricing", "packaging", "(pricing|plan) tiers?", "monetization", { p: "unit economics|willingness[- ]to[- ]pay|price (elasticity|sensitivity)", via: "finance" }],
    market_research: ["market (research|analysis|sizing|landscape|entry|opportunity|trends)", "competit(ive|or)s? (analys[ie]s|landscape|research|benchmark|intelligence|positioning)?", "\\bTAM\\b|\\bSAM\\b|\\bSOM\\b", "industry (analysis|trends|research)"],
    business_case: ["business case", "(built|wrote|made) .{0,20}(the )?case for", "recommendation(s)? .{0,30}(to|for) (leadership|executives|clients|founders|the board|a panel)", "\\bROI\\b", { p: "(strategic|client) recommendations?|final (deck|report|presentation)", via: "consulting" }, { p: "pitch(ed)? .{0,30}(panel|judges|investors)", via: "founder" }],
    financial_analysis: ["financial (model|analysis|projections|forecast)", "unit economics", "\\bP&L\\b", "budget(s|ing|ed)?\\b", "forecast(s|ing|ed)?", "\\bLTV\\b|\\bCAC\\b|payback"],
    growth_loops: ["(signup|sign-up|onboarding|activation|checkout) funnel", "funnel", "(conversion|activation|retention|engagement) (rate|lift|improvement)?", "(increas|improv|lift|grew|boost)\\w* .{0,30}(conversion|activation|retention|engagement|adoption|sign-?ups|MAU|DAU)", "growth (loop|experiment|strategy)", "\\b(MAU|DAU|WAU)\\b", { p: "(acquisition|email|lifecycle) (campaign|marketing)|open rates?|click-?through", via: "marketing" }],
    customer_success: ["onboarding", "customer success", "retention", "churn", "\\bCSMs?\\b", "customer (support|service) (team|tickets)"],
    partnerships: ["partnerships?\\b", "(partner|channel) (program|ecosystem)", "integration partners?", { p: "(agency|vendor|academic|industry) partners", via: "marketing" }],
    customer_facing_exec: ["customer[- ]facing", "(met|meeting|meetings) with customers", "customer (advisory|council|visits)", "(sales|customer) (calls|demos)", "demo(ed|s)? .{0,20}(to|for) (customers|prospects)"],
    cross_functional_alias: [],
    agile_scrum: ["\\bagile\\b", "\\bscrum\\b", "sprints?\\b", "stand-?ups?", "kanban", "retrospectives?|retros\\b", "backlog (grooming|refinement)", "story points"],
    program_mgmt: ["program management", "project management", "(project|program) plans?", "timelines?", "milestones?", "work-?streams?", "(coordinated|managed) .{0,30}(timeline|schedule|delivery|dependencies)", "\\bPMP\\b", "critical path", "\\bRAID\\b"],
    risk_mgmt: ["risks? (register|mitigation|assessment|management)", "mitigat", "contingenc", "\\bIRB\\b"],
    process_improvement: ["process (improvement|redesign|optimization|mapping)", "streamlin", "automat(ed|ing|ion)", "reduc(ed|ing) .{0,30}(time|cost|cycle|manual|errors)", "\\bSOPs?\\b", "operational (efficiency|excellence)", "\\blean\\b|six sigma"],
    quality_testing: ["\\bQA\\b", "(acceptance|regression|user acceptance) test", "\\bUAT\\b", "bug (bash|triage)", "test (plans?|cases)"],
    vendor_mgmt: ["vendors?\\b", "suppliers?\\b", "\\bRFPs?\\b", "\\bSOWs?\\b", "\\bSLAs?\\b", "(managed|negotiated) .{0,30}(contract|agency|vendor)"],
    people_management: ["direct reports", "\\d+ direct reports?", "(managed|led|mentored|coached) (a team of )?\\d+ (engineers|PMs|product managers|analysts|designers|interns)[^.]{0,40}direct report", "managed (a )?team of \\d+ (PMs|product managers|people|reports|analysts|associates)", "hired (and|,) (managed|coached|developed|onboarded|mentored)", "(mentored|coached|managed) \\d+ (PMs|product managers|APMs|analysts|engineers|designers)", "(hiring|performance) (manager|reviews)", "(managed|led) \\d+ (PMs|product managers|direct reports)"],
    technical_fluency: ["technical (background|depth|fluency|trade-?offs|discussions|design)", "computer science", "engineering (degree|background)", "(partnered|worked) with engineer(s|ing) on .{0,30}(technical|architecture|trade)", { p: "(software|engineering|developer) intern(ship)?|software engineer|full[- ]stack|built (a |the )?(prototype|backend|front-?end|pipeline|app|API)|implemented (a )?feature", via: "engineering" }, { p: "(Python|Java|JavaScript|TypeScript|React|Golang|C\\+\\+|Flask|Django|Node\\.js)\\b", via: "engineering" }],
    apis: ["\\bAPIs?\\b", "\\bREST(ful)?\\b", "\\bGraphQL\\b", "endpoints?", "\\bSDKs?\\b", "integrations?\\b", "webhooks?"],
    system_architecture: ["system design", "distributed systems", "microservices", "scalab(le|ility)", "\\bbackend\\b|\\bback-end\\b", "(service|data|platform) architecture", { p: "design docs?|(designed|built) .{0,30}(backend|service|pipeline|system)", via: "engineering" }],
    data_modeling: ["data (model|modeling|modelling|pipeline|warehouse|schema)", "\\bETL\\b|\\bELT\\b", "schema"],
    sql: ["\\bSQL\\b", "\\bBigQuery\\b|\\bSnowflake\\b|\\bRedshift\\b|\\bPostgres(QL)?\\b", "(wrote|ran|built) .{0,20}queries"],
    python_r: ["\\bPython\\b", "\\bpandas\\b", "\\bR\\b (and|,|/)|\\bin R\\b|\\(R\\)", "\\bJupyter\\b", "\\bnotebooks?\\b"],
    cloud: ["\\bAWS\\b|\\bGCP\\b|\\bAzure\\b|\\bcloud\\b", "kubernetes|\\bk8s\\b|docker"],
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
    office_tools: ["\\bExcel\\b", "\\bPowerPoint\\b", "Google (Sheets|Slides|Docs)"],
    crm_tools: ["\\bSalesforce\\b|\\bHubSpot\\b|\\bZendesk\\b|\\bIntercom\\b"],
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
    consulting_banking: ["consult(ing|ant)", "\\bMBB\\b|McKinsey|\\bBain\\b|\\bBCG\\b|Deloitte|Accenture|\\bEY\\b|\\bKPMG\\b|\\bPwC\\b", "investment bank(ing)?|Goldman|Morgan Stanley|JPMorgan"],
  };
  // A credential is read from the structure of the resume (titles, dates, degrees), not from these
  // patterns alone. These only run on role / summary / education lines.
  const STRUCTURAL = new Set(["pm_experience", "startup_experience", "big_tech_experience", "consulting_banking", "bachelors", "masters_mba", "phd", "cs_engineering_degree", "security_clearance", "domain_expertise", "yoe_2", "yoe_3", "yoe_5", "yoe_8", "yoe_10"]);
  const VIA_LABEL = { research: "academic research", consulting: "consulting / analyst work", engineering: "engineering", marketing: "marketing", finance: "finance / operations", founder: "founder / venture work", coursework: "coursework" };

  const OUTCOME = /\d+ ?%|\$\s?\d|\b\d+(\.\d+)?\s?(x|k|m|b|mm)\b|\b\d{2,}\+?\s?(users|customers|participants|clients|engineers|people|accounts|students|enterprise|interviews|studies|features|releases|papers)\b|\b(increas|reduc|improv|grew|lift|boost|cut|saved|doubled|tripled|drove|accelerat|won|adopted|published)\w*\b/i;
  const DATE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+|\d{1,2}[\/.])?(19|20)\d{2}\s*(–|-|—|to|through)\s*(((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+|\d{1,2}[\/.])?(19|20)\d{2}|present|current|now|today)|\b(summer|fall|spring|winter)\s+(19|20)\d{2}\b|\((19|20)\d{2}\)|\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b|\b\d{1,2}\/\s?\d{2}\s*(–|-|—|to|through)\s*(\d{1,2}\/\s?\d{2}\b|present|current|now|today)/i;
  const SECTION = [
    [/^(professional |work |relevant |research |industry )?(experience|employment|history|positions?|career)\b/i, "experience"],
    [/^(research experience|research)\b/i, "experience"],
    [/^(leadership|volunteer|community|campus|extra[- ]?curricular)\b.*\b(experience|activities|involvement|service)$/i, "projects"],
    // "Business experience", "Related experience", "Other employment": a short line that ends with the word
    [/^([A-Za-z&]+ ){1,3}(experience|employment)$/i, "experience"],
    [/^(education|academic)/i, "education"],
    [/^(relevant )?(coursework|courses)/i, "coursework"],
    [/^(academic |class |course )?(projects?|capstone|selected projects|side projects|hackathons?|portfolio|leadership( & activities)?|activities|extra[- ]?curricular|volunteer|organi[sz]ations|affiliations|memberships|involvement)/i, "projects"],
    [/^(technical |core |key )?(skills|tools|technologies|competencies|certifications?|proficienc(y|ies))\b/i, "skills"],
    [/^(summary|profile|objective|about( me)?|overview|highlights)/i, "summary"],
    [/^(publications?|awards?|honou?rs|interests|languages|references)/i, "other"],
  ];
  const PM_TITLE = /\b(product (manager|management|owner|lead|director|marketing manager)|\bAPM\b|\bTPM\b|technical program manager|\bPM\b|head of product|chief product|\bCPO\b|\bVP,? product)/i;
  const INTERN = /\bintern(ship)?\b|\bco-?op\b|\bfellow(ship)?\b/i;
  const TITLE_LEVEL = [[/\b(chief|cpo|vp|vice president|head of|director|group product|principal|staff|lead)\b/i, "lead"], [/\b(senior|sr\.?)\b/i, "senior"], [/\b(associate|junior|jr\.?|apm|intern|assistant)\b/i, "associate"]];
  const DEGREE = [[/\b(ph\.?d|doctor(ate|al))\b/i, "phd"], [/\b(mba|m\.?s\.?c?|m\.?eng|m\.?a\.?|master'?s?|ms in)\b/i, "masters_mba"], [/\b(b\.?s\.?c?|b\.?a\.?|b\.?eng|bachelor'?s?|bsc|ba in|bs in)\b/i, "bachelors"]];
  const CS_DEGREE = /computer science|\bCS\b|software|electrical|computer engineering|\bEE\b|\bECE\b|engineering|mathematics|\bstatistics\b|physics|data science/i;
  const COURSE_LINE = /^[A-Z]{2,5}\s?\d{3}[A-Z]?\b|^[A-Z][a-z]+ \d{3}\b/;

  // "9/17 to present": month and a two-digit year
  const shortDates = text => [...text.matchAll(/\b(\d{1,2})\/\s?(\d{2})(?![\d\/])/g)].map(x => { const yy = +x[2], y = yy <= (new Date().getFullYear() % 100) + 1 ? 2000 + yy : 1900 + yy; return y + (Math.min(12, Math.max(1, +x[1])) - 1) / 12; });
  function yearsBetween(text) {
    const now0 = new Date(); const sd = /(19|20)\d{2}/.test(text) ? [] : shortDates(text);
    if (sd.length) { const end = sd.length > 1 ? sd[sd.length - 1] + 1 / 12 : /present|current|now|today/i.test(text) ? now0.getFullYear() + now0.getMonth() / 12 : null; if (end !== null) return Math.max(0.25, Math.min(40, end - sd[0])); }
    const m = text.match(/(19|20)\d{2}/g); if (!m) return null;
    const now = new Date();
    // month/year dates (05/2022 – 02/2024) give the span to the month
    const my = [...text.matchAll(/\b(\d{1,2})[\/.]((?:19|20)\d{2})\b/g)].map(x => +x[2] + (Math.min(12, Math.max(1, +x[1])) - 1) / 12);
    if (my.length) { const end = my.length > 1 ? my[my.length - 1] + 1 / 12 : /present|current|now|today/i.test(text) ? now.getFullYear() + now.getMonth() / 12 : null; if (end !== null) return Math.max(0.25, Math.min(40, end - my[0])); } const start = +m[0]; const end = /present|current|now|today/i.test(text) ? now.getFullYear() + now.getMonth() / 12 : +m[m.length - 1];
    if (/\b(summer|fall|spring|winter)\b/i.test(text) && m.length === 1) return 0.25;
    if (m.length === 1 && !/present|current|now|today/i.test(text)) return 0.5;
    return Math.max(0.25, Math.min(40, end - start));
  }

  // first and last year of a dated line, "present" read as now
  function spanOf(text) {
    const m = text.match(/(19|20)\d{2}/g) || shortDates(text).map(Math.floor); if (!m.length) return null;
    const now = new Date().getFullYear() + 1;
    return [+m[0], /present|current|now|today/i.test(text) ? now : +m[m.length - 1]];
  }

  function rx(list) { return list.length ? new RegExp(list.map(p => "(?:" + p + ")").join("|"), "i") : null; }

  function parseResume(text) {
    // PDF text often spaces out hyphens ("purpose - built", "self - learning"); join them so words match again
    const raw = text.replace(/\r/g, "").replace(/([A-Za-z]) - ([a-z])/g, "$1-$2").split(/\n|(?=\s[•▪●‣◦■\uf0b7\uf0a7\uf0d8]\s)|(?<=[a-z]{4}\.)\s{2,}(?=[A-Z])/);
    const BULLET = /^\s*([•▪●‣◦■\uf0b7\uf0a7\uf0d8\-–—*·]\s+|o\s{2,})/; const usesBullets = raw.filter(r => BULLET.test(r)).length >= 3;
    // an employer on its own line above its roles: "AMERICAN EXPRESS   New York, NY"
    const EMPLOYER_LINE = /^[A-Z][A-Z0-9&.'’\-]+( [A-Z0-9&.'’\-]+)*(\s{2,}|\s*[|,]|$)/;
    const lines = []; let section = null; let role = -1; const roles = []; const degrees = new Set(); let csDegree = false; let employer = null;
    // a heading carries no year: "Project Engineer 2004-2007" is a job, not the Projects section
    const headerLike = s => s.length < 60 && !/[.;:]$/.test(s) && !/(19|20)\d{2}/.test(s) && (s === s.toUpperCase() || SECTION.some(([r]) => r.test(s)));
    for (let r of raw) {
      const hadBullet = BULLET.test(r);
      // keep the line as written to see wide gaps; match on single spaces (a PDF may put three between every word)
      const r0 = r.replace(/^\s*o\s{2,}/, "").replace(/^[\s•▪●‣◦■\uf0b7\uf0a7\uf0d8\-–—*·]+/, "").trim();
      r = r0.replace(/[ \t\u00a0]{2,}/g, " "); if (!r) continue;
      const h = r.replace(/\s*:$/, ""); // "EDUCATION:" is a heading too
      if (headerLike(h)) { const hit = SECTION.find(([re]) => re.test(h)); if (hit) { section = hit[1]; employer = null; lines.push({ text: r, kind: "heading", section }); continue; } }
      const sec = section || (COURSE_LINE.test(r) ? "coursework" : "body");
      const isCourse = sec === "coursework" || (!section && COURSE_LINE.test(r));
      const hasDate = DATE.test(r);
      // a long bullet that mentions a date range ("sales from 2004-present") is not a job line
      if ((sec === "experience" || sec === "body" || sec === "projects") && hasDate && r.length < 160 && !/^[a-z]/.test(r) && !(hadBullet && r.length >= 90)) {
        // the title ends where the dates start ("Associate Product Manager 2007-Present") or at a separator
        const dm = r.search(DATE); const head = dm > 0 ? r.slice(0, dm) : dm === 0 ? r.replace(DATE, "") : r;
        const title = head.split(/,| at | \| | — | – |\(/)[0].trim() || head.trim();
        const isPM = PM_TITLE.test(title) || PM_TITLE.test(r.split(/\(|\d{4}/)[0]);
        const lvl = (TITLE_LEVEL.find(([re]) => re.test(title)) || [, isPM ? "mid" : null])[1];
        const family = isPM ? (TITLE_FAMILY.find(([, re]) => re.test(title)) || ["pm"])[0] : null;
        roles.push({ title, text: r, years: yearsBetween(r), isPM, family, isIntern: INTERN.test(r), level: lvl, section: sec, line: lines.length, employerLine: employer, capsLead: EMPLOYER_LINE.test(r0), span: spanOf(r) });
        role = roles.length - 1; lines.push({ text: r, kind: "role", section: sec, role }); continue;
      }
      if ((sec === "experience" || sec === "body") && !hadBullet && !hasDate && r.length < 80 && EMPLOYER_LINE.test(r0)) { employer = r; lines.push({ text: r, kind: "employer", section: sec, role: -1 }); continue; }
      // a wrapped bullet: in a resume that marks bullets, an unmarked line after a bullet continues it
      const last = lines[lines.length - 1];
      if (usesBullets && !hadBullet && !hasDate && last && last.kind === "bullet" && last.section === sec && (sec === "experience" || sec === "body" || sec === "projects") && !/[.!?]$/.test(last.text)) { last.text += " " + r; continue; }
      if (sec === "education" || /\b(university|college|school|institute)\b/i.test(r) && DEGREE.some(([re]) => re.test(r))) {
        for (const [re, id] of DEGREE) if (re.test(r)) { degrees.add(id); if (CS_DEGREE.test(r)) csDegree = true; }
      }
      lines.push({ text: r, kind: isCourse ? "course" : sec === "skills" ? "skill" : sec === "summary" ? "summary" : sec === "education" ? "education" : "bullet", section: sec, role: sec === "experience" || sec === "body" ? role : -1 });
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
    if (drop.size) {
      const remap = {}; let n = 0; roles.forEach((_, i) => { remap[i] = drop.has(i) ? -1 : n++; });
      for (const l of lines) { if (l.kind === "role" && drop.has(l.role)) { l.kind = "employer"; l.role = -1; } else if (l.role >= 0) l.role = remap[l.role]; }
      for (let i = roles.length - 1; i >= 0; i--) if (drop.has(i)) roles.splice(i, 1);
    }
    if (csDegree) degrees.add("cs_engineering_degree");
    const work = roles.filter(r => !/teaching assistant|\bTA\b|tutor/i.test(r.title));
    // years of work: projects, clubs and activities are dated too, but they are not jobs
    const totalYears = work.filter(r => !r.isIntern && r.section !== "projects").reduce((a, r) => a + (r.years || 0), 0);
    const pmYears = work.filter(r => r.isPM && !r.isIntern).reduce((a, r) => a + (r.years || 0), 0);
    const pmIntern = work.some(r => r.isPM && r.isIntern);
    const isStudent = lines.some(l => (l.kind === "education" || l.kind === "summary" || l.kind === "bullet") && /\b(expected|candidate|anticipated|class of 20\d\d|graduating)\b/i.test(l.text));
    return { lines, roles, degrees, totalYears, pmYears, pmIntern, isStudent, hasSections: lines.some(l => l.kind === "heading") };
  }

  function createMatcher({ taxonomy, subskills, graph }) {
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
      if (l.kind === "course") return 2; // a course is something done, not just a word
      if (l.kind === "skill") return TOOLISH.has(id) ? 2 : 1; // nobody writes a bullet about Jira
      if (l.kind === "summary" || l.kind === "education" || l.kind === "heading" || l.kind === "employer") return 1;
      return OUTCOME.test(l.text) ? 3 : 2;
    }

    function tag(parsed) {
      const ev = {}; const add = (id, l, i, strength, via) => {
        const e = ev[id] ||= { strength: 0, lines: [], subs: new Set(), via: new Set(), direct: false, nLines: new Set() };
        e.lines.push({ i, text: l.text, strength, via: via || null, kind: l.kind, role: l.role });
        e.nLines.add(i); if (via) e.via.add(via); else e.direct = true;
        e.strength = Math.max(e.strength, strength);
      };
      parsed.lines.forEach((l, i) => {
        if (l.kind === "heading") return;
        for (const c of compiled) {
          const base = lineStrength(l, c.id);
          const structural = STRUCTURAL.has(c.id);
          if (structural && !(DEGREE_IDS.has(c.id) ? l.kind === "education" : (l.kind === "role" || l.kind === "summary" || l.kind === "employer"))) continue;
          if (c.direct && c.direct.test(l.text)) add(c.id, l, i, structural ? 2 : base);
          else for (const v of c.via) if (v.rx.test(l.text)) { add(c.id, l, i, base, v.via); break; }
        }
        for (const s of subRx) if (s.rx && s.rx.test(l.text)) { const e = ev[s.parent] ||= { strength: 0, lines: [], subs: new Set(), via: new Set(), direct: false, nLines: new Set() }; e.subs.add(s.id); e.subLines = e.subLines || []; e.subLines.push({ i, text: l.text, sub: s.name }); }
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
        if (DOMAIN.has(id)) { const strong = e.lines.some(l => l.kind === "role" || l.kind === "summary") || e.nLines.size >= 2; if (!strong) { e.strength = 0; e.capped = true; } }
        if (!e.direct && e.via.size) e.transfer = true;
      }
      return ev;
    }

    function shares(jobs) { const n = jobs.length || 1, cnt = {}; for (const j of jobs) for (const k of j.skills) cnt[k] = (cnt[k] || 0) + 1; return { n: jobs.length, share: id => (cnt[id] || 0) / n }; }

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

    function profileOf(parsed) {
      const years = parsed.totalYears, pm = parsed.pmYears;
      const titleLevel = parsed.roles.filter(r => r.isPM && !r.isIntern).map(r => r.level).reduce((a, l) => ({ lead: 4, senior: 3, mid: 2, associate: 1 }[l] > ({ lead: 4, senior: 3, mid: 2, associate: 1 }[a] || 0) ? l : a), null);
      let persona, level;
      if (pm > 0) { persona = "experienced_in_role"; level = pm >= 9 ? "lead" : pm >= 5 ? "senior" : pm >= 2 ? "mid" : "associate"; const tl = titleLevel; const ord = ["associate", "mid", "senior", "lead"]; if (tl && ord.indexOf(tl) > ord.indexOf(level)) level = tl; }
      else if (years >= 3 && !parsed.pmIntern) { persona = "pivoter"; level = years >= 8 ? "mid" : "associate"; } // a PM internship means the early-career path, not a pivot
      else { persona = "new_to_role"; level = "associate"; }
      const backgrounds = []; const bg = (re, id) => { if (parsed.roles.some(r => re.test(r.text)) || (id === "research" && parsed.degrees.has("phd"))) backgrounds.push(id); };
      bg(/research|phd|postdoc|lab\b|scientist|fellow/i, "research"); bg(/engineer|developer|\bswe\b|programmer/i, "engineering"); bg(/consult|analyst|strateg|advisory/i, "consulting"); bg(/design/i, "design"); bg(/marketing|brand|growth|content|communications/i, "marketing"); bg(/finance|financial|operations|supply|accounting|banking/i, "finance"); bg(/founder|co-?founder|founded/i, "founder");
      return { persona, level, years, pmYears: pm, pmIntern: parsed.pmIntern, backgrounds, titleLevel, roles: parsed.roles.length };
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
      const counts = [family, ...(COVERS[family] || [])];
      const held = parsed.roles.filter(r => counts.includes(r.family) && !r.isIntern && !/teaching assistant|\bTA\b|tutor/i.test(r.title));
      const years = held.reduce((a, r) => a + (r.years || 0), 0);
      if (!family || !held.length || years < PRESUMED.minYears) return null;
      const byYears = years >= 9 ? "lead" : years >= 5 ? "senior" : years >= 2 ? "mid" : "associate";
      const byTitle = held.map(r => r.level).filter(Boolean).sort((a, b) => LEVEL_ORDER.indexOf(b) - LEVEL_ORDER.indexOf(a))[0];
      const level = byTitle && LEVEL_ORDER.indexOf(byTitle) > LEVEL_ORDER.indexOf(byYears) ? byTitle : byYears;
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

    function ladderFor(id, level) { const s = gSkill[id]; const l = s && s.ladder; return l ? l[level] || null : null; }
    function signalsFor(id) { const s = gSkill[id]; return (s && s.signals) || []; }
    function buildFor(id) { const s = gSkill[id]; return (s && s.build) || []; }
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
        rows.push({ id: e && e.id !== id ? e.id : id, slot: id, name: nameOf(e && e.id !== id ? e.id : id), slotName: nameOf(id), tier, w, strength, credit, status, depth, subs: e ? [...e.subs] : [], via: e ? [...e.via] : [], lines: e ? e.lines.sort((a, b) => b.strength - a.strength).slice(0, 2) : [], hintLines: e && e.subLines ? e.subLines.slice(0, 2) : [], ladder: ladderFor(e && e.id !== id ? e.id : id, targetLevel), signals: signalsFor(e && e.id !== id ? e.id : id), build: buildFor(e && e.id !== id ? e.id : id) });
        tierSum[tier][0] += w * credit; tierSum[tier][1] += w;
      }
      const cov = t => tierSum[t][1] ? tierSum[t][0] / tierSum[t][1] : null;
      const core = cov("core"), common = cov("common"), diff = cov("diff");
      const overall = (2 * tierSum.core[0] + tierSum.common[0]) / ((2 * tierSum.core[1] + tierSum.common[1]) || 1);
      const evidencedRows = rows.filter(r => r.status === "evidenced" || r.status === "transferable");
      const depth = evidencedRows.length ? evidencedRows.filter(r => r.depth).length / evidencedRows.length : 0;
      const breadth = diff;
      // what-if: credit the top three core/common gaps
      const gaps = rows.filter(r => r.status === "gap" && r.tier !== "diff").sort((a, b) => b.w - a.w);
      const top3 = gaps.slice(0, 3); const bonus = top3.reduce((a, r) => a + (r.tier === "core" ? 2 : 1) * r.w, 0);
      const whatIf = (2 * tierSum.core[0] + tierSum.common[0] + bonus) / ((2 * tierSum.core[1] + tierSum.common[1]) || 1);
      const creds = [...req.creds].map(([id, w]) => ({ id, name: nameOf(id), w, have: !!(ev[id] && ev[id].strength >= 2), detail: ev[id] && ev[id].lines[0] ? ((ev[id].lines.find(l => l.i === -1) || ev[id].lines.slice().sort((a, b) => a.text.length - b.text.length)[0]).text.slice(0, 80)) : null }));
      const industries = [...req.domains].sort((a, b) => b[1] - a[1]).map(([id, w]) => ({ id, name: nameOf(id), w, have: !!(ev[id] && ev[id].strength >= 2), hint: !!(ev[id] && (ev[id].capped || ev[id].strength === 1)) }));
      return { overall, core, common, breadth, depth, rows, gaps, whatIf, whatIfSkills: top3.map(r => r.slotName), creds, industries, soft: req.soft.map(id => ({ id, name: nameOf(id), have: !!ev[id] })), targetLevel };
    }

    function match(text, target, opts = {}) {
      const parsed = parseResume(text); const ev = tag(parsed); const profile = profileOf(parsed); const req = requirements(target);
      const st = standing(parsed, profile, target, opts.level || profile.level);
      const res = score(ev, req, profile, { ...opts, standing: st });
      res.standing = st ? { family: st.family, level: st.level, years: st.years, above: st.above, employers: st.employers, presumed: res.rows.filter(r => r.status === "presumed").length } : null;
      const unmapped = parsed.lines.filter((l, i) => l.kind === "bullet" && l.text.length > 30 && !Object.values(ev).some(e => e.nLines.has(i) || (e.subLines || []).some(s => s.i === i))).map(l => l.text).slice(0, 8);
      const extras = Object.entries(ev).filter(([id, e]) => e.strength >= 2 && !CRED.has(id) && !SOFT.has(id) && !res.rows.some(r => r.id === id)).map(([id]) => ({ id, name: nameOf(id) }));
      const covered = new Set(Object.entries(ev).filter(([id, e]) => e.strength >= 2 && !SOFT.has(id) && !id.startsWith("yoe_")).map(([id]) => id));
      const subs = new Set(); for (const e of Object.values(ev)) if (e.strength >= 2) for (const s of e.subs) subs.add(s);
      return { ...res, profile, parsed: { roles: parsed.roles, degrees: [...parsed.degrees], lines: parsed.lines.length, hasSections: parsed.hasSections }, unmapped, extras, covered, subs, evidence: ev, ai: req.ai.ids, req: { n: req.n, label: req.label, core: [...req.tiers.core.keys()], common: [...req.tiers.common.keys()], diff: [...req.tiers.diff.keys()] } };
    }

    return { match, parseResume, tag, requirements, profileOf, score, nameOf, LADDER_LABEL, VIA_LABEL, LEVEL_TO_LADDER };
  }

  return { createMatcher, parseResume, RESUME_PATTERNS, RESUME_DROP, SOFT, AI_GROUP, TIER, LADDER_LABEL, VIA_LABEL, LEVEL_TO_LADDER };
});
