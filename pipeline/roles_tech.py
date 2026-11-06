"""Title filtering and classification for the tech role set: engineering, design and legal (PLAN.md, "A third role set").

Seven roles in five fields, US postings only. Cornell Tech's technical graduates (MEng CS and ECE, Connective Media,
Health Tech, Urban Tech, Design Technology) and its LLM graduates take these jobs; the product and MBA sets do not
hold them. Each set reads every title on its own, so a posting can sit in two sets, as product `pm` and MBA
`product_manager` already do. The borders with the other sets are written into the rules and pinned by
evals/titles_tech.json:

- the product set keeps Product Engineer and Forward Deployed Engineer, and every product title that names no
  engineering, design, research or legal job (`product_gate`): "Technical Program Manager, Security" stays a TPM;
- the MBA set keeps data scientists and analysts, solutions, sales and support engineers, market research, public
  policy, and the GRC, compliance and AI governance managers (its `governance` rule drops every "engineer").
"""
import json
import os
import re

from pipeline import roles, roles_mba

HERE = os.path.dirname(os.path.abspath(__file__))
FLAGS = re.I

# Words every role refuses: jobs about these people (recruiting them, teaching them, selling to them), not the jobs.
NOT_THE_JOB = (r"\brecruit\w*|\bsourc(er|ers|ing)\b|\btalent\b|\binstructor\b|\bteacher\b|\btutor\b|\bprofessor\b|\blecturer\b|"
               r"\bcurriculum\b|\bbootcamp\b|\bcoach\b|\btechnical\s+writer\b|\bwriter\b|\beditor\b|\bdo\s+not\s+apply\b|\btest\s+req")
# Jobs that sell or support the product: the MBA set's solutions engineer and the support roles, not engineering.
CUSTOMER_FACING = (r"\b(sales|pre-?sales|solutions?|customer|support|field|implementation|onboarding|professional\s+services|"
                   r"partner|technical\s+account|account|success|deployment\s+strategist)\s+(\w+\s+){0,1}(engineer\w*|architect|developer|consultant|specialist|manager)\b|"
                   r"\baccount\s+(executive|manager)\b|\bforward[- ]deployed\b|\bdeployed\s+engineer\b|\bdeveloper\s+(advocate|relations|evangelist|marketing|experience\s+advocate)\b|\bdevrel\b|"
                   r"\btechnical\s+support\b|\bhelp\s*desk\b|\bservice\s+desk\b|\bdesktop\s+support\b")
# Engineering disciplines that build physical things. "Firmware" and "embedded software" are software and stay.
HARDWARE = (r"\b(mechanical|electrical|electronics?|civil|structural|chemical|process|manufacturing|industrial|hvac|piping|mep|"
            r"rf|analog|mixed[- ]signal|asic|fpga|rtl|silicon|chip|soc\s+design|physical\s+design|pcb|layout|circuit|power\s+electronics|"
            r"optical|photonics|materials?|packaging|thermal|electromechanical|mechatronics?|motors?|battery|aerospace|propulsion|avionics|automotive\s+hardware|plc|controls|"
            r"instrumentation|substation|transmission|construction|project\s+engineer|field\s+service|maintenance|(?<!site\s)reliability\s+engineer|"
            r"quality\s+engineer|test\s+engineer|validation\s+engineer|verification\s+engineer|hardware|design\s+verification|dft|"
            r"product\s+design\s+engineer|npi|production\s+(supervisor|technician|planner|operator)|facilities|biomedical|clinical|environmental|geotechnical|surveyor|drafter)\b")

# ---- Roles -------------------------------------------------------------------------------------------------------
# Order matters (first match wins): narrow roles before broad ones. Counsel first (its words name no other role);
# research before design ("Design Researcher"); security, ML and data before software ("Software Engineer, Machine
# Learning" is an ML engineer; "Software Engineer, Security" a security engineer).
FAMILY_PATTERNS = [
    ("counsel", r"\bcounsel\b|\battorney\b|\blawyer\b|\bhead\s+of\s+legal\b|\b(director|senior\s+director|vp|vice\s+president|svp|lead),?\s+(of\s+)?legal\b|"
                r"\blegal\s+(director|lead)\b|\bchief\s+legal\s+officer\b|\bCLO\b|\blegal\s+(intern\w*|fellow\w*)\b|\blaw\s+clerk\b"),
    ("ux_researcher", r"\b(ux|user|design|product|experience|qualitative|mixed[- ]methods?|quantitative\s+(ux|user))\s+(experience\s+)?research(er|ers)?\b|"
                      r"\b(ux|user|design)\s+research\s+(operations|ops)\b|\bresearch\s*ops\b|\bresearch\s+operations\b|\b(head|director|manager|lead),?\s+(of\s+)?(ux|user|design)\s+research\b"),
    ("product_designer", r"\b(product|ux|ui|ux\s*/\s*ui|ui\s*/\s*ux|ux\s*-\s*ui|interaction|experience|user\s+experience|user\s+interface|visual|digital|web|mobile|app|"
                         r"content|service|conversation(al)?|ai|systems?|platform|growth|design\s+systems)\s+designer\b|"
                         r"\bdesign\s+technologist\b|\bdesign\s+systems?\s+(lead|manager)\b|\b(product|ux|ui|interaction|experience)\s+design\s+(intern\w*|co-?op)\b|\bdesign\s+(manager|director|lead)\b|\b(product|ux|experience)\s+design\s+(manager|director|lead)\b|"
                         r"\b(head|director|vp|vice\s+president|svp),?\s+(of\s+)?(product\s+|ux\s+|user\s+experience\s+|experience\s+)?design\b|"
                         r"\bchief\s+design\s+officer\b"),
    ("security_engineer", r"\b(security|cyber\s*security|cyber|infosec|information\s+security|appsec|application\s+security|product\s+security|cloud\s+security|"
                          r"network\s+security|infrastructure\s+security|offensive\s+security|defensive\s+security|detection|threat|incident\s+response|"
                          r"vulnerability|identity\s*(and|&)\s*access|iam|privacy|soc|dfir|malware|red\s+team|blue\s+team|purple\s+team)\s+"
                          r"(\w+\s+){0,2}(engineer\w*|analyst|architect|researcher|specialist|consultant|tester|hunter|responder|operator|developer|manager|lead|director)\b|"
                          r"\b(penetration|pen)\s+tester\b|\bpentester\b|\bred\s+team(er)?\b|\bethical\s+hacker\b|"
                          r"\b(grc|governance,?\s+risk\s*(and|&)\s*compliance)\s+engineer\w*\b|(?=.*\b(security|cyber|it)\b).*\b(grc|governance,?\s+risk\s*(and|&)\s*compliance)\s+(analyst|specialist|lead)\b|"
                          r"\bsecurity\s+(grc|compliance|risk|assurance|governance)\s+(\w+\s+)?(analyst|engineer|specialist|manager|lead)\b|"
                          r"\bai\s+(governance|safety|assurance|security|red\s+team(ing)?|risk)\s+(engineer\w*|analyst|specialist)\b|"
                          r"\b(engineer\w*|analyst|architect|researcher|developer)(\s+(i|ii|iii|iv|v|\d))?\s*[,\-–]?\s+(\w+\s+){0,2}(security|cybersecurity|appsec|detection(\s+and\s+response)?|"
                          r"threat\s+(intelligence|detection)|incident\s+response|privacy|trust\s*(and|&)\s*safety\s+engineering)\b|"
                          r"\b(head|director|vp|vice\s+president|manager|senior\s+manager),?\s+(of\s+)?(information\s+|cyber\s*|product\s+|application\s+|cloud\s+|"
                          r"infrastructure\s+|enterprise\s+|corporate\s+|offensive\s+)?security\b|\bsecurity\s+(engineering|operations)\s+(manager|lead|director)\b|"
                          r"\bCISO\b|\bchief\s+(information\s+)?security\s+officer\b"),
    ("ml_engineer", r"\b(machine\s+learning|ml|ai|a\.i\.|artificial\s+intelligence|applied\s+ai|llm|llms|gen\s*ai|generative\s+ai|deep\s+learning|computer\s+vision|"
                    r"nlp|natural\s+language|perception|ml\s*ops|mlops|ai\s*/\s*ml|ml\s*/\s*ai|ai\s*&\s*ml|ml\s+infrastructure|inference|model\s+training|"
                    r"evals?|recommend(ation|er)s?\s+systems?|ranking|search\s+relevance|speech|robot\s+learning|reinforcement\s+learning)\b"
                    r"(\s+\w+){0,4}?\s+(engineer\w*|developer|scientist|architect|researcher|(team|tech)\s+lead)\b|"
                    r"(?<!data\s)\b(engineer\w*|developer|scientist|architect|researcher)\b(\s*[,\-–(/]?\s*\w+){0,3}?\s*[,\-–(/]\s*(\w+\s+){0,2}(machine\s+learning|ml|ai|applied\s+ai|llms?|gen\s*ai|"
                    r"generative\s+ai|deep\s+learning|computer\s+vision|nlp|perception|inference|model\s+training|mlops|reinforcement\s+learning|robot\s+learning)\b"
                    r"(?!\s+(gateway|developer|dev|tools|security|governance))|"
                    r"\bresearch\s+engineer\b|\bapplied\s+(research\s+)?scientist\b|\bmachine\s+learning\s+scientist\b|\bmlops\b|\bprompt\s+engineer\b|\b(ai|ml|machine\s+learning)\s+residen(t|cy)\b|\b(machine\s+learning|ml|ai)\s+(research\s+)?intern\w*"),
    ("data_engineer", r"\b(data|big\s+data|etl|elt|data\s+platform|data\s+infrastructure|data\s+warehouse|data\s+pipeline|data\s+integration|analytics|bi|"
                      r"business\s+intelligence|data\s+&\s+analytics|data\s+and\s+analytics)\s+(\w+\s+){0,1}(engineer|engineering|developer|architect)\b|"
                      r"\b(engineer|developer|architect)\b\s*[,\-–(]\s*(\w+\s+){0,2}(data\s+(platform|infrastructure|pipelines?|warehouse|engineering)|big\s+data|etl)\b|"
                      r"\b(head|director|vp|vice\s+president|manager),?\s+(of\s+)?data\s+engineering\b"),
    ("software_engineer", r"\b(software|sw|back[- ]?end|front[- ]?end|full[- ]?stack|web|mobile|ios|android|platform|infrastructure|infra|cloud|devops|dev\s*ops|"
                          r"site\s+reliability|production|embedded(\s+software)?|firmware|application|game(play)?|graphics|engine|kernel|compiler|distributed\s+systems|"
                          r"systems\s+software|database|storage|test\s+automation|qa\s+automation|build|drivers?|release|developer\s+productivity|"
                          r"developer\s+experience|tools|tooling|ui|frontend\s+platform|api|integrations?|blockchain|smart\s+contracts?|protocol|"
                          r"devsecops|cloud\s+infrastructure|network\s+software|simulation|robotics\s+software|autonomy|ai\s+platform)\s+"
                          r"(\w+\s+){0,1}(engineer\w*|developer)\b|"
                          r"\b(sde|swe|sdet|sre)\b|\bsoftware\s+(development\s+)?engineer|\bsoftware\s+developer\b|\bmember\s+of\s+(the\s+)?technical\s+staff\b|\bMTS\b|"
                          r"\bengineering\s+manager\b|\b(engineering|software)\s+residen(t|cy)\b|\b(manager|director|senior\s+director|head|vp|vice\s+president|svp),?\s+(of\s+)?(software\s+|platform\s+|infrastructure\s+|"
                          r"product\s+|backend\s+|frontend\s+|mobile\s+|web\s+)?engineering\b|\bCTO\b|\bchief\s+technology\s+officer\b|"
                          r"\b(java|python|\.net|c#|react|react\s+native|node(\.js)?|golang|go|ruby|rails|php|c\+\+|rust|scala|kotlin|swift|typescript|javascript|"
                          r"salesforce|unity|unreal)\s+(\w+\s+){0,1}(engineer|developer)\b|\bprogrammer\b|\bfounding\s+engineer\b"),
]
FAMILY_RE = [(f, re.compile(p, FLAGS)) for f, p in FAMILY_PATTERNS]

# ---- Bare titles -------------------------------------------------------------------------------------------------
# A title that names the job and nothing more ("Senior Engineer", "Engineer II, Substations", "Designer") is the role at
# an employer that makes software, and often not elsewhere: a utility's engineer builds substations, a hotel's keeps
# the building, a retailer's designer dresses the store (the fresh sample of 2026-11-06, PLAN.md). The employer's
# industry decides: unknown (a résumé, an employer with no industry on file), a software industry or a startup's
# portfolio tags, and the bare title is the role; any other industry, and a bare "Engineer" counts only when the rest
# of the title names software work, a bare "Designer" only when it names digital product design. A bare "Developer"
# is software everywhere.
BARE = {
    "software_engineer": r"^\W*((senior|sr\.?|staff|principal|lead|junior|jr\.?|distinguished|founding)\s*/?\s*)*(engineer|developer)(\s+(i|ii|iii|iv|v|\d))?\s*([,\-–(:|]|$)",
    "product_designer": r"\bdesigner\b",
}
BARE_RE = {f: re.compile(p, FLAGS) for f, p in BARE.items()}
SOFTWARE_INDUSTRIES = {"Computer Software", "Internet Services and Retailing", "Information Technology Services", "Financial Data Services"}
# the investor-portfolio tags the registry gives startups (several joined by ";"); a startup is a software employer
# unless a tag names a sector that builds physical things or medicines (defence hardware, biotech)
PORTFOLIO_TAGS = {"American Dynamism", "Bio + Health", "Consumer", "Crypto", "Cultural Leadership Fund", "Enterprise", "Fintech", "Growth",
                  "Infra", "Seed"}
PORTFOLIO_NOT_SOFTWARE = {"American Dynamism", "Bio + Health"}
BARE_HINT = {
    "software_engineer": r"\b(software|firmware|embedded|devops|dev\s*ops|devsecops|sre|cloud|platforms?|api|apis|web|mobile|"
                         r"front[- ]?end|back[- ]?end|full[- ]?stack|java|python|\.net|c#|c\+\+|aws|azure|gcp|kubernetes|sap|erp|salesforce|servicenow|"
                         r"oracle|data|database|identity|iam|access\s+management|cyber\s*security|digital|booking\s+engine|ai|ml|site\s+reliability|"
                         r"test\s+automation|e-?trading|trading|management\s+systems?|tech|technology)\b",
    "product_designer": r"\b(ux|ui|user\s+experience|product\s+design|digital|web|app|apps|interaction|design\s+systems?|software|cloud|platform)\b",
}
BARE_HINT_RE = {f: re.compile(p, FLAGS) for f, p in BARE_HINT.items()}


def software_employer(industry):
    """True when a bare title is the role at this employer: industry unknown, a software industry, or startup tags."""
    if not industry:
        return True
    tags = [t.strip() for t in str(industry).split(";")]
    return industry in SOFTWARE_INDUSTRIES or (all(t in PORTFOLIO_TAGS for t in tags) and not any(t in PORTFOLIO_NOT_SOFTWARE for t in tags))


def bare_match(f, title, industry=None):
    """The bare form of role f, with the employer's say: a bare Developer always; else a software employer, or a hint."""
    rx = BARE_RE.get(f)
    if not rx or not rx.search(title):
        return False
    if f == "software_engineer" and not re.search(r"\bengineer\b", title, FLAGS):
        return True   # a bare Developer
    return software_employer(industry) or bool(BARE_HINT_RE[f].search(title))

EXCLUDE = {
    "counsel": r"\bparalegal\b|\blegal\s+(assistant|secretary|operations|ops|analyst|specialist|coordinator|administrator)\b|\bcounsel(l)?or\b|"
               r"\bpatent\s+(agent|engineer)\b|\blegal\s+engineer\w*|\bclaims?\s+adjuster\b|\bimmigration\s+(specialist|coordinator)\b",
    "ux_researcher": r"\bgeneral\s+manager\b|\b(scientist|engineer\w*|market|marketing|clinical|shift|supervisor|field|reinforcement|code|data|annotation|labeling|consumer\s+insights|equity|investment|credit|policy|operations\s+(analyst|associate)|"
                     r"assistant|associate\s+director\s+of\s+research|biolog\w*|chemis\w*|lab)\b",
    "product_designer": r"\b(graphic|interior|fashion|industrial|mechanical|packaging|instructional|learning|landscape|lighting|sound|audio|game|level|narrative|"
                        r"architectural|architecture|civil|electrical|hardware|pcb|circuit|asic|chip|layout|physical|rf|analog|structural|piping|hvac|mep|"
                        r"kitchen|floral|textile|jewelry|footwear|apparel|print|production|set|costume|curriculum|presentation|cad|mold|tool(ing)?|"
                        r"verification|brand|marketing|communications?|creative|illustrat\w*|motion|video|social|merchandis\w*|retail|store|"
                        r"exhibit|event|signage|environmental|construction|engineer\w*|technician|drafter|draftsperson|garment|knit|trim|color|deal|"
                        r"technical\s+designer|gear|(wo)?men'?s|kids|girls|boys|data\s+hall|data\s+cent(er|re)|substation|eyewear|visualization)\b",
    "security_engineer": r"\b(physical|guard|officer|loss\s+prevention|protective|protection\s+agent|executive\s+protection|facilit\w*|patrol|armed|"
                         r"trust\s*(&|and)\s*safety\s+(analyst|specialist|associate|operations)|content\s+moderat\w*|fraud|aml|kyc|financial\s+crime|"
                         r"product\s+manag\w*|product\s+marketing|program\s+manag\w*|data\s+scien\w*|security\s+clearance|national\s+security|programs?\s+development|supply\s+chain\s+security\s+manager|project\s+manag\w*|"
                         r"site\s+security|(corporate|global|regional)\s+security\s+(\w+\s+)?(manager|specialist|director|lead|analyst)|regional\s+security)\b",
    "ml_engineer": r"\bai\s+(developer\s+tools|gateway)\b|\bnetwork\s+(site\s+reliability\s+)?engineer\b|\bdata\s+scien\w*|\b(analyst|analytics)\b|\bai\s+(transformation|enablement|adoption|strateg\w*)\b|\bsoftware\s+engineer\s+in\s+test\b",
    "data_engineer": r"\bdata\s+(center|centre|entry|handling|exploitation)\b|\bdatacenter\b|\bdata\s+scien\w*|\banalyst\b",
    "software_engineer": r"\b(qa|quality\s+assurance)\s+(engineer|analyst|tester)\b(?!.*automation)|\bmanual\s+(qa|test\w*)\b|\bnetwork\s+engineer\b|"
                         r"\bsystems\s+engineer(ing)?\b|\bapplications?\s+engineer\b|\bchief\s+of\s+staff\b|\boffice\s+of\s+the\b|\bengineering\s+(operations|ops|program|excellence)\b|\bbusiness\s+developer\b|\breal\s+estate\b|\bpower\s+platform\b|"
                         r"\b(it|desktop|end\s+user)\s+(support|engineer|technician)\b|\bcontent\s+developer\b|\bcourse\s+developer\b|\b(land|project|property|community|economic|"
                         r"product|market|business|fund|donor|leadership|organizational|talent)\s+developer\b",
}
EXCLUDE_RE = {f: re.compile(p, FLAGS) for f, p in EXCLUDE.items()}
NOT_THE_JOB_RE = re.compile(NOT_THE_JOB, FLAGS)
CUSTOMER_FACING_RE = re.compile(CUSTOMER_FACING, FLAGS)
HARDWARE_RE = re.compile(HARDWARE, FLAGS)
# Roles a customer-facing or hardware word does not take out: counsel ("Commercial Counsel, Sales"), design, research.
ENGINEERING = {"security_engineer", "ml_engineer", "data_engineer", "software_engineer"}
# A product title that names one of these jobs is ours, unless the product set reads it as product_engineer.
ENG_WORD_RE = re.compile(r"\b(engineer\w*|developer|designer|researcher|counsel|attorney|scientist|architect|programmer)\b", FLAGS)


def product_gate(title):
    """True when the product set holds this title: a product family other than product_engineer, with no word of an
    engineering, design, research or legal job in it, or any product_engineer title (Forward Deployed Engineer)."""
    t = title or ""
    if not roles.title_ok(t):
        return False
    return roles.family(t) == "product_engineer" or not ENG_WORD_RE.search(t)


def family(title, company=None, industry=None):
    """The tech role of a title, or None. industry: the employer's (decides a bare title, see BARE); None for a résumé."""
    t = title or ""
    if NOT_THE_JOB_RE.search(t) or product_gate(t):
        return None
    for f, rx in FAMILY_RE:
        if not rx.search(t) and not bare_match(f, t, industry):
            continue
        if f in EXCLUDE_RE and EXCLUDE_RE[f].search(t):
            continue
        if f in ENGINEERING and (CUSTOMER_FACING_RE.search(t) or HARDWARE_RE.search(t) and not re.search(r"\b(software|firmware|embedded)\b", t, FLAGS)):
            continue
        return f
    return None


def title_ok(title, company=None, industry=None):
    return family(title, company, industry) is not None


FAMILY_LABELS = {
    "software_engineer": "Software Engineer", "ml_engineer": "ML / AI Engineer", "data_engineer": "Data Engineer",
    "security_engineer": "Security Engineer", "product_designer": "Product / UX Designer", "ux_researcher": "UX Researcher",
    "counsel": "In-house Counsel",
}
GROUPS = {
    "software": ("Software engineering", ["software_engineer"]),
    "data_ai": ("Data & AI engineering", ["ml_engineer", "data_engineer"]),
    "security": ("Security", ["security_engineer"]),
    "design": ("Design & research", ["product_designer", "ux_researcher"]),
    "legal": ("Legal", ["counsel"]),
}
GROUP_OF = {f: g for g, (_, fs) in GROUPS.items() for f in fs}
assert set(GROUP_OF) == set(FAMILY_LABELS), set(FAMILY_LABELS) ^ set(GROUP_OF)
assert [f for f, _ in FAMILY_PATTERNS] and set(f for f, _ in FAMILY_PATTERNS) == set(FAMILY_LABELS)
COVERS = {}

# Searches for the boards that answer a query (Workday, SuccessFactors, Oracle, Phenom): exact titles, because their
# search is loose ("product designer" returns 1,659 hits at a waste-management company). PLAN.md, the flood rules.
SEARCH_QUERIES = ["software engineer", "software developer", "machine learning engineer", "AI engineer", "data engineer",
                  "analytics engineer", "security engineer", "security analyst", "product designer", "UX designer",
                  "UX researcher", "counsel"]

# ---- Levels --------------------------------------------------------------------------------------------------------
# One scale of eight keys (roles.LEVEL_ORDER), three ladders of names. Engineering, design and research share one
# ladder: associate = new grad, I, junior; mid = II; senior = Senior, III, IV; staff = Staff, Lead, V; group =
# Principal, Distinguished, and the managers of engineers, designers or researchers; director; vp = VP, Head of; cpo =
# CTO, CISO, chief design officer. A numbered grade is read where it follows the job ("Engineer II", "SDE 3"); a bare
# "2" elsewhere is not a grade. Banks put a corporate grade on engineers ("Vice President, Software Engineer"): at a
# bank the bank grades are read first (roles_mba.BANKS, and Fortune's bank industries).
LEVEL_ORDER = roles.LEVEL_ORDER
JOB = r"(engineer|developer|designer|researcher|analyst|scientist|architect|sde|swe|sdet|sre|counsel|attorney|programmer|technologist|tester)"
ENGINEERING_GRADES = [
    ("cpo", r"\b(chief\s+(technology|information\s+security|security|design|technical|ai|data)\s+officer|cto|ciso)\b"),
    ("associate", r"\bintern(ship)?s?\b|\bco-?op\b|\bnew\s+grad(uate)?s?\b|\buniversity\s+(grad(uate)?|hire)s?\b|\bearly[- ]career\b|\bentry[- ]level\b|"
                  r"\bgraduate\s+(program|engineer|developer|designer|scheme)\b|\bapprentice(ship)?\b|\bresiden(t|cy)\b|\bjunior\b|\bjr\.?\b|"
                  r"\bassociate\s+(software|engineer|developer|designer|product\s+designer|ux|data|security|ml|machine|researcher|ai|platform|site)\b|"
                  r"\b20(2[6-9])\s+(start|grad\w*)\b"),
    # a range of grades is read at its lower end ("Senior / Staff", "Engineer II-III")
    ("senior", r"\b(senior|sr\.?)\s*/\s*(staff|principal|lead)\b"),
    ("mid", JOB + r"\s*(ii|2)\s*[-/]\s*(iii|3)\b"),
    ("vp", r"\b(vp|vice\s+president|svp|evp|head\s+of|managing\s+director)\b|\bhead,"),
    ("director", r"\b(director|senior\s+director|sr\.?\s+director)\b(?!\s+of\s+(first|1st))"),
    ("group", r"\bassociate\s+director\b|\b(principal|distinguished|fellow)\b|\b(engineering|design|research|security|data|ml|software|development|product\s+design|ux)\s+(engineering\s+)?manager\b|"
              r"\bmanager,?\s+(of\s+)?(\w+\s+){0,2}(engineering|design|research|security|data\s+engineering)\b|\bmanager\b"),
    ("staff", r"\b(staff|lead|tech\s+lead|tl)\b|" + JOB + r"\s*[-,]?\s*(v|5)\b"),
    ("senior", r"\b(senior|sr\.?|experienced)\b|" + JOB + r"\s*[-,]?\s*(iii|iv|3|4)\b|\b(l5|e5|ic4|ic5)\b"),
    # a grade at the very end of the title is the grade, wherever the job word sits ("Software Development Engineer in Test I")
    ("associate", JOB + r"\s*[-,]?\s*(i|1)\b(?!\s*[-/]\s*(ii|2))|\b(l3|e3|ic1|ic2)\b|\s(i|1)\s*$"),
    ("mid", JOB + r"\s*[-,]?\s*(ii|2)\b|\b(l4|e4|ic3)\b|\s(ii|2)\s*$"),
]
# Legal titles: Counsel is the working grade; the general counsel's office climbs by assistant, associate and deputy.
LEGAL_GRADES = [
    ("associate", r"\bintern(ship)?s?\b|\blaw\s+clerk\b|\bfellow(ship)?\b|\bjunior\b|\bassociate\s+(counsel|attorney)\b|\b(counsel|attorney)\s*[-,]?\s*(i|1)\b"),
    ("vp", r"\bdeputy\s+general\s+counsel\b|\bhead\s+of\s+legal\b|\b(vp|vice\s+president|svp|evp),?\s+(\w+\s+)?(legal|counsel)\b|\bhead\s+of\b"),
    ("director", r"\bassociate\s+general\s+counsel\b|\bAGC\b|\b(director|senior\s+director)\b"),
    ("staff", r"\bassistant\s+general\s+counsel\b|\b(lead|managing|principal|staff)\s+(\w+\s+)?(counsel|attorney)\b|\bsenior\s+managing\s+counsel\b"),
    ("cpo", r"\bgeneral\s+counsel\b|\bchief\s+legal\s+officer\b|\bCLO\b"),
    ("senior", r"\b(senior|sr\.?)\b|\b(counsel|attorney)\s*[-,]?\s*(ii|iii|2|3)\b"),
]
BANK_GRADES = [
    ("associate", r"\bintern(ship)?s?\b|\bsummer\s+(analyst|associate)\b"),
    ("director", r"\bmanaging\s+director\b"),
    ("staff", r"\bexecutive\s+director\b|\b(senior\s+vice\s+president|SVP)\b"),
    ("mid", r"\b(assistant|associate)\s+vice\s+president\b|\bAVP\b"),
    ("senior", r"\bvice\s+president\b|\bVP\b"),
    # "Associate" and "Analyst" are a bank grade only beside the job, set off by a comma or a dash ("Associate, Software
    # Engineering"), or as a programme ("Technology Analyst Program"): a "Security Analyst" is the job
    ("mid", r"^\W*associate\s*[,\-–]|[,\-–]\s*associate\W*$"),
    ("associate", r"^\W*analyst\s*[,\-–]|[,\-–]\s*analyst\W*$|\b(technology\s+)?analyst\s+program(me)?\b"),
]
ENGINEERING_RE = [(l, re.compile(p, FLAGS)) for l, p in ENGINEERING_GRADES]
LEGAL_RE = [(l, re.compile(p, FLAGS)) for l, p in LEGAL_GRADES]
BANK_RE = [(l, re.compile(p, FLAGS)) for l, p in BANK_GRADES]
LADDERS = {
    "engineering": {"label": "Engineering, design and research", "levels": {
        "associate": "New grad / I", "mid": "II", "senior": "Senior", "staff": "Staff / Lead", "group": "Principal / Manager",
        "director": "Director", "vp": "VP / Head of", "cpo": "Chief officer (CTO, CISO)"}},
    "legal": {"label": "Legal", "levels": {
        "associate": "Associate counsel", "mid": "Counsel", "senior": "Senior counsel", "staff": "Lead counsel / Assistant GC",
        "director": "Director / Associate GC", "vp": "Deputy GC / Head of legal", "cpo": "General counsel"}},
    "bank": {"label": "Banks", "levels": {
        "associate": "Analyst", "mid": "Associate / AVP", "senior": "Vice President", "staff": "Executive Director / SVP",
        "director": "Managing Director"}},
}
LEVEL_LABELS = LADDERS["engineering"]["levels"]
BANK_INDUSTRIES = roles_mba.BANK_INDUSTRIES
BANKS = {c.lower() for c in roles_mba.BANKS}


BANK_SETOFF_RE = re.compile(
    r"^\W*(vice\s+president|vp|avp|assistant\s+vice\s+president|executive\s+director|associate)\s*[,\-–]|"
    r"[,\-–]\s*(vice\s+president|vp|avp|assistant\s+vice\s+president|executive\s+director|associate|analyst)\W*$", FLAGS)


def ladder(title, company=None, industry=None, fam=None):
    """Which grade names the title uses: "legal" for counsel, "bank" at a bank when a bank grade is in the title,
    else "engineering"."""
    fam = fam or family(title, company, industry)
    if fam == "counsel":
        return "legal"
    if (industry in BANK_INDUSTRIES or (company or "").lower() in BANKS) and any(rx.search(title or "") for _, rx in BANK_RE):
        return "bank"
    if BANK_SETOFF_RE.search(title or "") and not re.search(r"\b(head|director|manager)\b", title or "", FLAGS):
        return "bank"
    return "engineering"


MTS_RE = re.compile(r"\bmember\s+of\s+(the\s+)?technical\s+staff\b|\bMTS\b", FLAGS)


def level(title, company=None, industry=None, fam=None):
    t = MTS_RE.sub("MTS", title or "")  # "Member of Technical Staff" is a job name, not the Staff grade
    which = ladder(title, company, industry, fam)
    for l, rx in {"legal": LEGAL_RE, "bank": BANK_RE, "engineering": ENGINEERING_RE}[which]:
        if rx.search(t):
            return l
    return "mid"


SPECIALIZATIONS = [
    ("frontend", r"\bfront[- ]?end\b|\bui\s+engineer\b|\bweb\b|\breact\b"),
    ("backend", r"\bback[- ]?end\b|\bapi\b|\bservices?\b|\bdistributed\b"),
    ("fullstack", r"\bfull[- ]?stack\b"),
    ("mobile", r"\bmobile\b|\bios\b|\bandroid\b|\breact\s+native\b"),
    ("infrastructure", r"\binfra(structure)?\b|\bplatform\b|\bcloud\b|\bdevops\b|\bsite\s+reliability\b|\bsre\b|\bproduction\s+engineer\b|\bkubernetes\b"),
    ("embedded", r"\bembedded\b|\bfirmware\b|\brobotics\b|\bautonomy\b"),
    ("test", r"\bsdet\b|\btest\s+automation\b|\bqa\s+automation\b|\bin\s+test\b"),
    ("llm", r"\bllms?\b|\bgen\s*ai\b|\bgenerative\b|\bagents?\b|\bagentic\b|\bapplied\s+ai\b"),
    ("research", r"\bresearch\b|\bscientist\b"),
]
SPEC_RE = [(s, re.compile(p, FLAGS)) for s, p in SPECIALIZATIONS]


def specializations(title):
    return [s for s, rx in SPEC_RE if rx.search(title or "")]


# ---- Entry mark ------------------------------------------------------------------------------------------------------
# Who enters at a posting: a new graduate (bachelor's, master's or PhD: "grad") or no one in particular (None). The words
# are data (pipeline/entry_tech.json); a firm row (the title at which an employer hires its graduates) enters only with
# its source, as in entry_mba.json.
ENTRY = json.load(open(os.path.join(HERE, "entry_tech.json")))
ENTRY_VALUES = tuple(ENTRY["values"])
ENTRY_SOURCES = tuple(ENTRY["sources"])
_rx = lambda p: re.compile(p, FLAGS)
_ET = {k: _rx(v) for k, v in ENTRY["title"].items() if k != "note"}
_EX = {k: _rx(v) for k, v in ENTRY["text"].items() if k not in ("note", "levels")}
_FIRMS = {f["firm"].lower(): [(_rx(t["pattern"]), t) for t in f["titles"]] for f in ENTRY["firms"]}


def entry(title, company=None, industry=None, fam=None, lvl=None, text=None):
    """(entry, intern, source): entry is "grad" or None; intern is True for an internship or a co-op; source is "firm",
    "title" or "text". Order: the firm's row; a title that names students or new graduates (an internship is one);
    on an associate-level title, a line of the text that says who the posting is for."""
    t = title or ""
    fam = fam or family(t, company, industry)
    lvl = lvl or level(t, company, industry, fam)
    intern = bool(_ET["intern"].search(t))
    if _ET["not_for_them"].search(t):
        return None, intern, None
    for rx, row in _FIRMS.get((company or "").lower(), ()):
        if rx.search(t):
            return "grad", row.get("intern", intern), "firm"
    if intern or _ET["grad"].search(t):
        return "grad", intern, "title"
    if text and lvl in ENTRY["text"]["levels"] and _EX["student"].search(text) and not _EX["not_student"].search(text):
        return "grad", intern, "text"
    return None, intern, None


# ---- Export -----------------------------------------------------------------------------------------------------------
def export():
    """The title rules as data, for code that cannot import this module (the resume reader in the browser).
    evals/roles_tech.mjs is a reference reader; evals/run_pipeline.py --roles tech checks it agrees with this module."""
    grades = lambda g: [{"level": l, "pattern": p} for l, p in g]
    return {
        "about": "Title rules of the tech role set (engineering, design, legal), written by pipeline/roles_tech.py (do not edit by hand). "
                 "Patterns are JavaScript regular expressions; use the 'i' flag. How to read a title: see 'how'.",
        "how": [
            "1. No role when the title matches 'not_the_job', or when the product set holds it: product.title_ok(title) and (product.family(title) is "
            "'product_engineer' or the title does not match 'eng_word').",
            "2. The role is the first entry of 'families' whose 'patterns' match, or whose 'bare' pattern matches with the employer's say (see "
            "'bare_titles'), and whose 'exclude' does not; an entry with 'engineering' true is also skipped when the title matches 'customer_facing', "
            "or matches 'hardware' and not 'software_word'.",
            "3. Ladder: 'legal' for counsel; 'bank' when the employer is in 'banks' or its industry in 'bank_industries' and a bank grade matches, or when the title "
            "matches 'bank_setoff' and not 'bank_setoff_not'; else 'engineering'.",
            "4. Level: the first grade of the ladder whose pattern matches; none: 'mid'.",
            "5. Entry mark: no mark when the title matches entry.title.not_for_them; the employer's row in entry.firms; 'grad' when the title matches "
            "entry.title.intern or entry.title.grad; on a level in entry.text.levels, 'grad' when the text matches entry.text.student and not entry.text.not_student.",
        ],
        "flags": "i",
        "groups": [{"id": g, "label": label, "families": fs} for g, (label, fs) in GROUPS.items()],
        "families": [{"id": f, "label": FAMILY_LABELS[f], "group": GROUP_OF[f], "patterns": [p], "bare": [BARE[f]] if f in BARE else [], "exclude": [EXCLUDE[f]] if f in EXCLUDE else [],
                      "engineering": f in ENGINEERING, "covers": COVERS.get(f, []),
                      "covered_by": sorted(g for g, fs in COVERS.items() if f in fs)} for f, p in FAMILY_PATTERNS],
        "bare_titles": {"about": "A 'bare' pattern counts when the employer's industry is unknown (a résumé), in 'software_industries', or made only of "
                                 "'portfolio_tags' (joined by ';') with none in 'portfolio_not_software'; at any other employer, when the title matches the role's 'hint', or, for "
                                 "software_engineer, when it does not match 'engineer_word' (a bare Developer).",
                        "software_industries": sorted(SOFTWARE_INDUSTRIES), "portfolio_tags": sorted(PORTFOLIO_TAGS), "portfolio_not_software": sorted(PORTFOLIO_NOT_SOFTWARE), "hint": BARE_HINT,
                        "engineer_word": r"\bengineer\b"},
        "not_the_job": NOT_THE_JOB, "customer_facing": CUSTOMER_FACING, "hardware": HARDWARE, "software_word": r"\b(software|firmware|embedded)\b",
        "eng_word": ENG_WORD_RE.pattern, "mts": MTS_RE.pattern, "bank_setoff": BANK_SETOFF_RE.pattern, "bank_setoff_not": r"\b(head|director|manager)\b",
        "product": {"families": [{"id": f, "pattern": p} for f, p in roles.FAMILY_PATTERNS], "exclude": roles.EXCLUDE_RE.pattern,
                    "keep": roles.KEEP_RE.pattern, "nonproduct": roles.NONPRODUCT_RE.pattern, "food": roles.FOOD_RE.pattern,
                    "product_manage": r"\bproduct\s+manage", "hardware": roles.HARDWARE_RE.pattern, "hardware_families": ["product_engineer"]},
        "levels": LEVEL_ORDER,
        "banks": sorted(BANKS), "bank_industries": sorted(BANK_INDUSTRIES),
        "ladders": {k: {**v, "grades": grades({"engineering": ENGINEERING_GRADES, "legal": LEGAL_GRADES, "bank": BANK_GRADES}[k])} for k, v in LADDERS.items()},
        "specializations": [{"id": s, "pattern": p} for s, p in SPECIALIZATIONS],
        "entry": ENTRY,
        "search_queries": SEARCH_QUERIES,
    }


def write_export(path=os.path.join(os.path.dirname(HERE), "web", "data", "roles_tech.json")):
    """web/data/roles_tech.json, the rules alone. `pipeline.build_graph --roles tech` writes the same file with the counts and
    employers it knows added; this writes it where no graph build has run."""
    with open(path, "w") as f:
        f.write(json.dumps(export(), indent=1, ensure_ascii=False) + "\n")
    return path


def write_taxonomy(data=os.path.join(os.path.dirname(HERE), "web", "data")):
    """web/data/taxonomy_tech.json and subskills_tech.json: the set's part of the taxonomy and its sub-skills, which depend on
    pipeline/taxonomy.json and pipeline/depth/ alone (the graph build writes the same two files). Committed, so the
    matcher evals of the set (evals/run_tech.mjs) run in a checkout that holds no tech postings."""
    import glob
    from pipeline import tax
    T = tax.for_roles("tech")
    tax.dump(T, os.path.join(data, "taxonomy_tech.json"))
    known, depth = {s["id"] for s in T["skills"]}, {}
    for p in glob.glob(os.path.join(HERE, "depth", "*.json")):
        if not p.endswith("_roles.json"):
            depth.update(json.load(open(p)))
    subs = {sid: [{"id": x["id"], "name": x["name"], "patterns": x["patterns"]} for x in d.get("subskills", [])] for sid, d in depth.items() if sid in known}
    with open(os.path.join(data, "subskills_tech.json"), "w") as f:
        json.dump(subs, f)


if __name__ == "__main__":
    print("wrote", os.path.relpath(write_export()))
    write_taxonomy()
    print("wrote web/data/taxonomy_tech.json, web/data/subskills_tech.json")
