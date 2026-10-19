"""Title filtering and classification for the MBA role set.

The roles are the "50 MBA Career Options" of mbapreferred.com, scraped in two batches (1-25, then 26-50).
Product Manager (#23) and Product Strategy Manager (#24) are the `pm` family of the product scrape
(data/raw/jobs) and Product Marketing Manager (#31) its `pmm` family, so they are classified here but not
scraped again; technical program managers are likewise left to the product scrape.
"""
import json
import os
import re

from pipeline import roles

MGR = r"(manager|lead|leader|director|head|vp|vice\s+president|principal)"

# Order matters (first match wins): narrow functions before the broad manager titles.
FAMILY_PATTERNS = [
    ("ldp", r"\bleadership\s+development\s+(program|associate|intern\w*|analyst|rotation\w*)|\b[A-Z]{0,2}LDP\b|\brotational\s+(leadership\s+|development\s+|management\s+)?(program|associate|analyst)\b|\bmanagement\s+(development|trainee|associate)\s+program\b|\bgeneral\s+management\s+(development\s+)?program\b"),
    ("ib_associate", r"\binvestment\s+bank(ing|er)\b|\binvestment\s*(&|and)\s*corporate\s+banking\b"),
    ("ma_integration", r"\b(m\s*&\s*a|mergers?|acquisitions?|post[- ]merger)\b.*\bintegration\b|\bintegration\b.*\b(m\s*&\s*a|mergers?|acquisitions?)\b|\bintegration\s+management\s+office\b"),
    ("corp_dev", r"\bcorporate\s+development\b|\bcorp\.?\s+dev\b|\bmergers\s*(&|and)\s*acquisitions\b|\bm\s*&\s*a\b"),
    ("strategic_finance", r"\bstrategic\s+finance\b"),
    ("fpa", r"\bfp\s*&\s*a\b|\bfinancial\s+planning\s*(&|and)\s*analysis\b"),
    ("treasury", r"\btreasury\s+(senior\s+)?(manager|analyst|associate|director|lead|operations)\b|\b(manager|analyst|director|head|vp|vice\s+president|lead),?\s+(of\s+)?(corporate\s+|global\s+)?treasury\b|\b(assistant\s+)?treasurer\b"),
    ("commercial_banking_rm", r"\b(commercial|business|middle\s+market)\s+banking\s+(\w+\s+){0,3}(analyst|associate)\b|\b(commercial|business|middle\s+market)\s+(bank(ing|er)\b)?.*\brelationship\s+(manager|banker)\b|\brelationship\s+(manager|banker)\b.*\b(commercial|business|middle\s+market)\b|\bcommercial\s+(banker|lender|loan\s+officer)\b"),
    ("corporate_banking", r"\bcorporate\s+bank(ing|er)\b"),
    ("re_acquisitions", r"\breal\s+estate\b.*\bacquisitions?\b|\bacquisitions?\b.*\b(real\s+estate|multifamily|industrial|properties)\b|\breal\s+estate\s+(investments?|private\s+equity)\s+(senior\s+)?(analyst|associate)\b|\bland\s+acquisitions?\b"),
    ("re_development", r"\breal\s+estate\s+development\b|\bdevelopment\s+(manager|director|associate|analyst)\b.*\b(real\s+estate|multifamily|residential|industrial|mixed[- ]use)\b|\b(real\s+estate|multifamily|residential|industrial|mixed[- ]use)\b.*\bdevelopment\s+(manager|director|associate|analyst)\b|\bland\s+development\s+(manager|director)\b"),
    ("re_asset_manager", r"\breal\s+estate\b.*\basset\s+manage(r|ment)\b|\basset\s+manage(r|ment)\b.*\b(real\s+estate|multifamily|propert(y|ies)|retail|office|industrial)\b|\breal\s+estate\s+portfolio\s+manager\b"),
    ("pe_associate", r"\bprivate\s+equity\b.*\b(associate|analyst|principal|vice\s+president|vp|invest(or|ment|ing)s?)\b|\b(associate|analyst|principal|vice\s+president|vp|invest(or|ment|ing)s?)\b.*\bprivate\s+equity\b"),
    ("vc_associate", r"\bventure\s+capital\b|\bventures?\s+(associate|analyst|principal|investor|partner)\b|\b(associate|analyst|principal|investor),?\s+ventures\b"),
    ("investment_manager", r"\binvestment\s+(manager|management\s+(associate|analyst)|officer|analyst|associate|director|strategist)\b|\b(equity|equities|fixed\s+income|credit|multi[- ]asset|investment)\s+portfolio\s+manager\b|\bportfolio\s+manager\b.*\b(equit|fixed\s+income|invest|asset\s+management|wealth)"),
    ("chief_of_staff", r"\bchief\s+of\s+staff\b"),
    ("tech_strategy", r"\b(technology|tech|it|ai)\s+strateg(y|ist)\b"),
    ("product_strategy", r"\bproduct\s+strateg(y|ist)\b"),
    ("product_manager", r"\bproduct\s+(manage(r|ment)|mgmt|mgr)\b|\bproduct\s+lead\b|\bhead\s+of\s+product\b"),
    ("bizops", r"\bbusiness\s+operations\b|\bbiz\s*ops\b|\bstrategy\s*(&|and)\s*operations\b|\bstrategy\s*(&|and)\s*ops\b"),
    # "Associate Strategy Manager" is a manager grade, and "Strategic Planning Analyst" is the analyst role
    ("corp_strategy_analyst", r"\bstrategy\s+(senior\s+)?(analyst|associate)\b|\b(analyst|associate),?\s+(corporate\s+|business\s+)?strategy\b(?!\s+(senior\s+)?(manager|lead|leader|director))|\bstrategic\s+planning\s+(senior\s+)?(analyst|associate)\b|\b(analyst|associate),?\s+strategic\s+planning\b"),
    ("strategy_manager", rf"\bstrategy\s+(senior\s+)?{MGR}\b|\b{MGR},?\s+(of\s+)?(corporate\s+|business\s+|global\s+|enterprise\s+)?strategy\b|\b(corporate|business|enterprise)\s+strategy\b|\bstrategic\s+planning\b|\bstrategy\s*(&|and)\s*planning\b"),
    ("digital_transformation", r"\bdigital\s+transformation\b"),
    ("opex", r"\boperational\s+excellence\b|\bcontinuous\s+improvement\b|\bbusiness\s+excellence\b|\blean\s+(manager|leader|lead|six)\b|\bsix\s+sigma\b|\bprocess\s+improvement\s+(manager|lead|leader|director)\b"),
    ("transformation", rf"\btransformation\s+(analyst|associate)\b|\btransformation\s+(office|program|senior\s+)?\s*{MGR}\b|\b{MGR},?\s+(of\s+)?(business\s+|enterprise\s+|finance\s+|operations\s+)?transformation\b|\b(business|enterprise)\s+transformation\b|\btransformation\s+office\b"),
    ("management_consultant", r"\b(management|strategy|business)\s+consult(ant|ing)\b|\bconsultant,?\s+(strategy|management)\b|\bstrategy\s+consult"),
    ("financial_manager", r"\b(financial|finance)\s+(analyst|associate)\b|\b(finance|financial)\s+(senior\s+)?(manager|director)\b|\b(manager|director|head|vp|vice\s+president),?\s+(of\s+)?finance\b|\bfinance\s+lead\b|\bfinancial\s+controller\b"),
    ("general_manager", r"\bgeneral\s+manager\b"),
    ("program_manager", r"\bprogram(me)?\s+manage(r|ment)\b|\bprogram\s+(analyst|associate)\b"),
    ("pmm", r"\bproduct\s+marketing\b"),
    # "Sales Manager, Brand Partnerships" sells partnerships to brands: the team name after the comma is not the role
    ("brand_manager", rf"\bbrand\s+(senior\s+)?(manage(r|ment)|director|lead)\b|\b{MGR},?\s+(of\s+)?brand\b(?!\s+partnerships?\b)|\bassociate\s+brand\b"),
    ("growth_manager", rf"\bgrowth\s+(associate|analyst)\b|\bgrowth\s+(marketing\s+|strategy\s+|operations\s+)?(manager|lead|director)\b|\b{MGR},?\s+(of\s+)?growth\b|\bgrowth\s+(marketing|strategy)\b"),
    ("customer_success", r"\bcustomer\s+success\b|\bclient\s+success\b"),
    ("partnerships", rf"\bpartnerships?\s+(associate|analyst)\b|\b(strategic\s+)?partnerships?\s+(senior\s+)?(manager|director|lead)\b|\b{MGR},?\s+(of\s+)?(strategic\s+|global\s+|business\s+)?partnerships\b|\bstrategic\s+(partnerships?|alliances?)\b|\balliances?\s+(manager|director|lead)\b|\bpartner\s+manager\b|^\W*(strategic\s+)?partnerships\b"),
    ("bizdev", r"\bbusiness\s+development\b|\bbiz\s*dev\b"),
    ("business_analytics", rf"\banalytics\s+(senior\s+)?{MGR}\b|\b{MGR},?\s+(of\s+)?(business\s+|data\s+|commercial\s+|marketing\s+|customer\s+|advanced\s+)?analytics\b|\bbusiness\s+analytics\b"),
    ("business_intelligence", r"\bbusiness\s+intelligence\b|\bBI\s+(manager|lead|director|analyst)\b"),
    ("strategic_sourcing", r"\b(strategic|global|indirect|direct)\s+sourcing\b|\bsourcing\s+(senior\s+)?(manager|director|lead|analyst|associate|specialist)\b"),
    ("category_manager", r"\bcategory\s+analyst\b|\bcategory\s+(senior\s+)?(manage(r|ment)|director|lead)\b"),
    ("procurement", rf"\bprocurement\s+(senior\s+)?(analyst|associate|specialist)\b|\b(analyst|associate|specialist),?\s+procurement\b|\bprocurement\b.*\b{MGR}\b|\b{MGR}\b.*\bprocurement\b|\bpurchasing\s+(manager|director)\b"),
    ("supply_chain", rf"\bsupply\s+chain\s+(senior\s+)?(analyst|associate|specialist)\b|\b(analyst|associate|specialist),?\s+supply\s+chain\b|\bsupply\s+chain\b.*\b{MGR}\b|\b{MGR}\b.*\bsupply\s+chain\b"),
    ("comp_benefits", r"\bcompensation\b|\btotal\s+rewards\b|\bbenefits\s+(senior\s+)?(manager|director|analyst|lead|partner)\b"),
    ("org_dev", r"\borgani[sz]ation(al)?\s+(development|effectiveness|design)\b|\b(talent|leadership)\s+development\b|\blearning\s*(&|and)\s*(organi[sz]ation(al)?\s+)?development\b|\bchange\s+management\s+(manager|lead|director)\b"),
    ("hr_manager", rf"\b(hr|human\s+resources?)\s+(senior\s+)?(analyst|associate|specialist)\b|\b(hr|human\s+resources?|people)\s+(senior\s+)?(manager|director|business\s+partner|generalist|lead|operations)\b|\b{MGR},?\s+(of\s+)?(hr|human\s+resources|people)\b|\bHRBP\b|\bpeople\s+partner\b"),
    ("enterprise_risk", rf"\b(enterprise|operational|business)\s+risk\s+(analyst|associate)\b|^\W*(senior\s+|sr\.?\s+)?risk\s+(analyst|associate)\b|\benterprise\s+risk\b|\b(operational|business)\s+risk\s+(senior\s+)?(manager|director|lead|officer)\b|\brisk\s+manage(r|ment)\s*(manager|director|lead|officer)?\b|\b{MGR},?\s+(of\s+)?(enterprise\s+)?risk\b"),
    ("compliance", rf"\bcompliance\s+(senior\s+)?(manager|director|officer|lead|analyst|associate|specialist)\b|\b{MGR},?\s+(of\s+)?(regulatory\s+|corporate\s+)?compliance\b"),
    ("governance", rf"\bgovernance\s+(senior\s+)?(manager|director|lead|officer|analyst|associate)\b|\b{MGR},?\s+(of\s+)?(corporate\s+|data\s+|it\s+|ai\s+)?governance\b|\bcorporate\s+governance\b|\bGRC\b"),
    ("sales_manager", rf"\bsales\s+(senior\s+)?(manager|director|leader)\b|\b{MGR},?\s+(of\s+)?sales\b"),
    ("marketing_manager", rf"\bmarketing\s+(associate|analyst|specialist)\b|\bmarketing\s+(senior\s+)?(manager|director|lead)\b|\b{MGR},?\s+(of\s+)?marketing\b"),
    ("operations_manager", r"\boperations\s+(analyst|supervisor)\b|\boperations\s+(senior\s+)?(manager|director|lead)\b|\b(manager|director|head|vp|vice\s+president),?\s+(of\s+)?operations\b|\bops\s+manager\b"),
]
FAMILY_RE = [(f, re.compile(p, re.I)) for f, p in FAMILY_PATTERNS]
# An MBA hire with no function named ("MBA Summer Associate", "MBA Internship") is a programme associate. When the
# title names a function ("Brand Management Intern, MBA"), it is that role at entry level, so this runs last.
LAST_RESORT = ("ldp", r"\bmba\b.*\b(program|associate|intern\w*|rotation\w*|graduate)\b|\bintern(ship)?\b.*\bmba\b")
LAST_RESORT_RE = re.compile(LAST_RESORT[1], re.I)

# Families whose postings live in the product scrape, and the product family each must belong to.
IN_PRODUCT_SCRAPE = {"product_manager": "pm", "product_strategy": "pm", "pmm": "pmm"}

# Titles that carry one of the words above but are a different job.
EXCLUDE = {
    "treasury": r"\btreasury\s+(management\s+)?(sales|services)\b|\bsales\b|\bproduct\s+owner\b",
    "transformation": r"\bdigital\s+transformation\b",  # role #26, outside the 25
    "general_manager": r"\b(assistant|asst\.?|associate)\s+general\s+manager\b|\bin[- ]training\b|\b(restaurant|store|hotel|resort|inn|suites|ritz[- ]carlton|shop|kitchen|salon|branch|club|car\s+wash|dealership|cafe|bakery|property)\b",
    "program_manager": r"\b(technical|tech)\s+program\b|\bTPM\b",
    "operations_manager": r"\bproduct\s+(operations|ops)\b|\b(sales|revenue|marketing|trading|fund|investment)\s+operations\s+(analyst|supervisor)\b",
    "management_consultant": r"\b(sap|oracle|workday|salesforce|servicenow|implementation|software|technical|solutions?)\b",
    "investment_manager": r"\bproduct\b",
    "ib_associate": r"\b(assistant|recruit\w*|counsel|compliance|audit\w*)\b",   # technology staff: TECH_STAFF_RE
    "corporate_banking": r"\b(assistant|recruit\w*|counsel|compliance|audit\w*)\b",
    "vc_associate": r"\b(fund\s+(admin\w*|accounting)|accounting|accountant|partnerships?|business\s+development|counsel|tax)\b",
    "supply_chain": r"\b(engineer\w*|architect|developer|co-?op|intern\w*)\b",
    "pe_associate": r"\b(fund\s+(admin\w*|accounting)|gtm|sales|account|partner(ship)?s?|representative|counsel|tax|accounting|accountant)\b",
    "strategy_manager": r"\b(content|creative|brand|media|social|seo|communications?|design|ux|tax|talent|sourcing|category)\b",
    "financial_manager": r"\b(data\s+scien|engineer|recruit|talent|systems)",
    "opex": r"\b(engineer\w*|coordinator|technician|intern\w*|co-?op|praktik\w*|werkstudent\w*|specialist|operator)\b",
    "tech_strategy": r"\b(engineer|architect|developer)\b",
    "bizdev": r"\b(representative|rep|bdr|sdr)\b",
    "business_analytics": r"\bproduct\s+analytics\b|\bengineer\w*\b",
    "business_intelligence": r"\b(engineer\w*|developer)\b",
    "strategic_sourcing": r"\b(talent|recruit\w*|candidate)\b",
    "comp_benefits": r"\bworkers'?\s+comp|\b(claims?|adjuster|sales\s+compensation)\b",
    "org_dev": r"\bprogram\s+(associate|analyst|participant)\b",
    "hr_manager": r"\bpeople\s+(analytics|data)\b|\bpeople\s+operations\b.*\banalyst\b|\banalyst\b.*\bpeople\s+operations\b",
    "enterprise_risk": r"\b(engineer\w*|insurance\s+sales|data\s+analyst|technical\s+program|claims?)\b",
    "sales_manager": r"\b(assistant|store|retail\s+sales|associate|representative|cashier|engineer\w*)\b|\bsales\s+(enablement|operations|ops|compensation)\b",
    "growth_manager": r"\bengineer\w*\b",
    "governance": r"\b(engineer\w*|product\s+owner|developer)\b",
    "re_acquisitions": r"\b(talent|banking|counsel|attorney)\b",
    # "Hardware Development Manager, Amazon Industrial Robotics": the thing developed is named before the word, and
    # "industrial" is a product line, not a property type
    "re_development": r"\b(hardware|software|firmware|product|business|learning|talent|organi[sz]ation\w*|leadership|web|application|game|engineering|platform|robotics|career|sales|fund|donor|workforce|economic|professional|curriculum|content|market|client|customer|partner|channel|franchise|people|process|technology|systems?|drug|clinical|device|packaging|formulation|chip|silicon|asic|mechanical|electrical|training|design|r&d|employee|programme?|player|agency|pipeline|account|dealer|vendor|supplier|network|audience|revenue|skills?|staff|community|brand|category|concept|recipe|menu|food|beverage|material|test|tool|model|algorithm|ml|ai)\s+development\b",
    "customer_success": r"\bengineer\w*\b",
    "corp_dev": r"\b(communications|counsel|attorney|paralegal|tax|accounting|accountant|legal|architect|engineer\w*)\b",
}
EXCLUDE_RE = {f: re.compile(p, re.I) for f, p in EXCLUDE.items()}


# Banks and investors of the Fortune list are not on the employer list (data/raw/mba_employers.json), so they had
# no category: the bank title rules and searches never ran for them (Goldman Sachs had one US analyst posting).
# A universal bank is "Investment banking": its commercial and corporate banking titles are named outright.
FORTUNE_CATEGORIES = {
    **{c: "Investment banking" for c in ("JPMorgan Chase", "Bank of America", "Citigroup", "Goldman Sachs Group", "Wells Fargo",
                                         "Morgan Stanley", "Jefferies Financial Group", "Raymond James Financial")},
    **{c: "Commercial and corporate banking" for c in ("U.S. Bancorp", "PNC Financial Services Group", "Truist Financial", "First Citizens BancShares",
                                                       "M&T Bank", "Fifth Third Bancorp", "Citizens Financial Group", "KeyCorp", "Regions Financial")},
    **{c: "Private equity" for c in ("Apollo Global Management", "KKR", "Blackstone")},
    **{c: "Asset management" for c in ("BlackRock", "State Street", "Northern Trust", "Bank of New York (BNY)", "Franklin Resources", "Charles Schwab")},
}

# At a firm whose business is the role, titles drop the role's name: a consulting firm posts "Senior
# Consultant", a bank "Associate, Healthcare M&A", a fund "Associate, Growth Equity". These rules apply only to
# employers of that category (data/raw/mba_employers.json): category -> (family, title pattern, searches to add).
RANK = r"(analyst|associate|vice\s+president|vp|principal|director|intern(ship)?)"
# what a campus or programme title puts before the grade: "2028 US Analyst Program", "Full-Time Analyst 2027"
CAMPUS = r"(?:(?:20\d\d|summer|full[- ]time|campus|us|u\.s\.|global|incoming)\W+)*"
CAMPUS_WORD = r"(20\d\d|summer|full[- ]time|campus|program(me)?|intern(ship)?)"
# a student title at a bank or an asset manager with no desk named: "Summer Analyst", "Full-Time Analyst 2027"
CAMPUS_RANK = rf"^\W*(?=.*\b{CAMPUS_WORD}\b){CAMPUS}(analyst|associate)(\s+(program(me)?|intern(ship)?|class))?\b"
RANK_C = r"(analyst|associate|manager|vice\s+president|vp|principal|director|partner|intern(ship)?)"  # a consulting practice also has manager and partner grades
_CONSULTING = ("management_consultant", rf"\bconsult(ant|ing)\b|\bengagement\s+manager\b|\b(strategy|advisory|deals|transactions?|turnaround|restructuring|due\s+diligence)\b.*\b{RANK_C}\b|\b{RANK_C}\b.*\b(strategy|advisory|deals|transactions?|turnaround|restructuring|due\s+diligence)\b",
               ["consultant", "senior consultant", "engagement manager", "strategy associate", "business analyst", "summer", "intern"])
# strategy houses use bare ranks ("Associate", "Business Analyst", "Associate Consultant - Chicago")
_STRATEGY_HOUSE = (_CONSULTING[0], _CONSULTING[1] + rf"|\b(summer|lateral)\s+(\w+\s+)?(business\s+)?(analyst|associate)\b|\b(analyst|associate)\s+intern\b|\bassociate\s+\(entry\s+level\)|^\W*{CAMPUS}(senior\s+|research\s+)?(associate|business\s+analyst|analyst|principal|partner|project\s+leader|case\s+team\s+leader)\b",
                   _CONSULTING[2] + ["associate", "business analyst", "analyst"])
EMPLOYER_RULES = {
    "Strategy consulting": _STRATEGY_HOUSE,
    "Consulting and advisory": _CONSULTING,
    "Big Four and accounting": _CONSULTING,
    "Investment banking": ("ib_associate", rf"\b{RANK}\b.*\b(m\s*&\s*a|mergers|advisory|restructuring|capital\s+markets|coverage|leveraged\s+finance|sponsors?|banking|ecm|dcm|generalist)\b|\b(m\s*&\s*a|mergers|advisory|restructuring|capital\s+markets|coverage|leveraged\s+finance|sponsors?|banking|ecm|dcm)\b.*\b{RANK}\b|{CAMPUS_RANK}",
                           ["summer analyst", "summer associate", "analyst program", "investment banking analyst", "investment banking associate", "M&A", "restructuring", "capital markets"]),
    "Private equity": ("pe_associate", rf"\b{RANK}\b.*\b(invest\w*|buyouts?|private\s+equity|growth|credit|infrastructure|real\s+assets|deal|secondaries|portfolio\s+operations|value\s+creation)\b|\b(invest\w*|buyouts?|private\s+equity|growth\s+equity|secondaries|value\s+creation)\b.*\b{RANK}\b|\binvestment\s+professional\b|^\W*{CAMPUS}(senior\s+)?(associate|analyst|vice\s+president|principal)\b",
                       ["associate", "analyst", "investment", "vice president", "value creation"]),
    "Venture capital": ("vc_associate", rf"\b(investor|investing|investment)\b|^\W*{CAMPUS}(senior\s+)?(associate|analyst|principal)\b|\b(deal|investment)\s+partner\b",
                        ["investor", "associate", "analyst", "principal", "investment"]),
    "Commercial and corporate banking": ("commercial_banking_rm", r"\bcredit\s+analyst\b|\b(commercial|business|corporate)\s+bank\w*\b.*\b(analyst|associate)\b|\b(analyst|associate)\b.*\b(commercial|business)\s+bank\w*\b",
                                         ["credit analyst", "commercial banking analyst", "relationship manager"]),
    "Asset management": ("investment_manager", rf"\bportfolio\s+manager\b|\binvestment\s+(analyst|associate|strategist|specialist|professional|research)\b|\b(research|equity|credit|fixed\s+income|quantitative)\s+(research\s+)?(analyst|associate)\b|\b(analyst|associate|vice\s+president)\b.*\b(private\s+(credit|equity|markets)|invest\w*|equit(y|ies)|fixed\s+income|multi[- ]asset|real\s+estate|portfolio\s+management|research)\b|\b(sector|research)\s+analyst\b" + "|" + CAMPUS_RANK,
                         ["summer analyst", "summer associate", "portfolio manager", "research analyst", "investment analyst", "investment associate"]),
}
# a real-estate firm posts "Acquisitions Associate", "Development Manager", "Asset Manager" without saying "real estate"
REAL_ESTATE_RULES = [
    ("re_acquisitions", r"\bacquisitions?\b|\binvestments?\s+(senior\s+)?(analyst|associate|manager|director)\b|\b(analyst|associate),?\s+investments?\b"),
    ("re_development", r"\bdevelopment\s+(senior\s+)?(manager|director|associate|analyst|lead)\b|\b(manager|director|vice\s+president|vp|associate|analyst),?\s+(of\s+)?development\b"),
    ("re_asset_manager", r"\basset\s+manage(r|ment)\b|\bportfolio\s+manage(r|ment)\b"),
]
EMPLOYER_QUERIES = {c: q for c, (_, _, q) in EMPLOYER_RULES.items()}
EMPLOYER_QUERIES["Real estate"] = ["acquisitions", "development manager", "asset manager", "investments", "portfolio manager"]
EMPLOYER_QUERIES["Consumer goods"] = ["associate brand manager", "brand", "MBA intern"]
EMPLOYER_RE = {c: [(f, re.compile(p, re.I))] for c, (f, p, _) in EMPLOYER_RULES.items()}
EMPLOYER_RE["Real estate"] = [(f, re.compile(p, re.I)) for f, p in REAL_ESTATE_RULES]
REAL_ESTATE_EXCLUDE_RE = re.compile(r"\b(business|software|hardware|firmware|learning|talent|fund|donor|web|application|product|organi[sz]ation\w*|leadership|career|sales)\s+(development|acquisitions?)\b", re.I)
EMPLOYER_EXCLUDE_RE = re.compile(r"\b(alumni|assistant|counsel|attorney|paralegal|recruit\w*|talent|engineer\w*|developer|accountant|tax|audit\w*|payroll|receptionist|compliance|legal|marketing|events?|design\w*|sap|oracle|workday|salesforce|servicenow|implementation|software|cyber\w*|cloud|sales|data\s+(governance|operations|management|engineer\w*|analyst|scien\w*)|operations|ops|onboarding|communications|procurement|client|investor\s+(relations|services|communications)|product\s+(specialist|management)|fund\s+(admin\w*|accounting)|accounting|financial\s+(advisory|planning)|fp\s*&\s*a|IR|application|reporting|technical|technology|it|people|human|hr|treasury|controller|facilities|administrat\w*|security|epic|billing)\b", re.I)
JUNK_RE = re.compile(r"\bdo\s+not\s+apply\b|\btest\s+req", re.I)
CONSULTING_CATEGORIES = {"Strategy consulting", "Consulting and advisory", "Big Four and accounting"}
BANK_CATEGORIES = {"Investment banking", "Commercial and corporate banking", "Private equity", "Venture capital", "Asset management"}
# employer rules that outrank the general patterns ("M&A Associate" at a bank is banking, not corporate development)
EMPLOYER_FIRST = {"Investment banking", "Private equity", "Venture capital", "Asset management", "Real estate",
                  "Strategy consulting", "Consulting and advisory", "Big Four and accounting"}
# ... except for a title that names one of these functions outright ("Associate, Corporate Banking" at an investment
# bank, "Analyst, Financial Planning & Analysis" at a fund)
NAMED_FIRST = {"ldp", "fpa", "strategic_finance", "corporate_banking", "commercial_banking_rm", "chief_of_staff"}
# A consultant's title may name the client's function ("Operations Senior Consultant"); only the jobs that are not
# management consulting are left out.
CONSULTANT_RE = re.compile(r"\bconsult(ant|ing)\b", re.I)
CONSULTANT_EXCLUDE_RE = re.compile(r"\b(sap|oracle|workday|salesforce|servicenow|implementation|software|technical|tech|technology|cyber\w*|cloud|tax|audit\w*|payroll|benefits|application|recruit\w*|talent|engineer\w*|developer|assistant|counsel|legal|epic|billing|data|marketing|communications|events?)\b", re.I)
# Banks in the Fortune list have no employer category; "Analyst, Technology M&A" there is a banker, not corporate development.
BANKS = roles.BANK_TITLE_COMPANIES


HOUSE_RANK_RE = re.compile(rf"^\W*{CAMPUS}(senior\s+)?(associate|business\s+analyst|analyst|consultant|principal|partner|project\s+leader|case\s+team\s+leader)\b", re.I)
HOUSE_STAFF_RE = re.compile(r"\b(alumni|recruit\w*|talent|marketing|events?|people|human|hr|legal|counsel|finance|financial\s+planning|accounting|payroll|facilities|administrat\w*|assistant|it|security|engineer\w*|developer|data\s+(engineer\w*|scien\w*)|software|research\s+operations|knowledge)\b", re.I)
# A banker or investor who covers the technology sector has "technology" in the title. So have the firm's
# technology staff. With a deal word and no staff word, the sector word is taken out before the exclusions run.
CAMPUS_RANK_RE = re.compile(CAMPUS_RANK, re.I)
BIG_STRICT = {"Investment banking", "Private equity", "Asset management"}  # not the regional commercial banks
DEAL_RE = re.compile(r"\b(m\s*&\s*a|mergers|investment\s+bank\w*|coverage|capital\s+markets|leveraged\s+finance|restructuring|advisory|sponsors?|private\s+equity|buyouts?|growth\s+equity|invest(or|ment|ing)s?)\b", re.I)
TECH_STAFF_RE = re.compile(r"\b(engineer\w*|developer|architect|technology\s+(analyst|associate|division|officer|risk|operations|summer|intern\w*)|bank(ing)?\s+technology|information\s+technology|IT)\b", re.I)
SECTOR_RE = re.compile(r"\b(technology|tech|software|cloud|data)\b", re.I)


def _sector_free(t):
    return SECTOR_RE.sub(" ", t) if DEAL_RE.search(t) and not TECH_STAFF_RE.search(t) else t


def _employer_family(t, category):
    if category in CONSULTING_CATEGORIES and CONSULTANT_RE.search(t):
        return None if CONSULTANT_EXCLUDE_RE.search(t) else "management_consultant"
    if category in BANK_CATEGORIES:
        t = _sector_free(t)
    # At a strategy house a grade at the start of the title is a consultant, and what follows names the practice
    # ("Senior Business Analyst, Communications, Media & Technology"). Only the firm's own staff functions rule it out.
    if category == "Strategy consulting" and HOUSE_RANK_RE.search(t):
        return None if HOUSE_STAFF_RE.search(t) else "management_consultant"
    if EMPLOYER_EXCLUDE_RE.search(t) or (category == "Real estate" and REAL_ESTATE_EXCLUDE_RE.search(t)):
        return None
    for f, rx in EMPLOYER_RE.get(category, []):
        if rx.search(t):
            return f
    return None


def _general_family(t):
    for f, rx in FAMILY_RE:
        if rx.search(t):
            if f in EXCLUDE_RE and EXCLUDE_RE[f].search(t):
                continue
            if f in ("ib_associate", "corporate_banking") and TECH_STAFF_RE.search(t):
                continue
            if f in IN_PRODUCT_SCRAPE and not (roles.title_ok(t) and roles.family(t) == IN_PRODUCT_SCRAPE[f]):
                continue
            return f
    return None


def family(title, category=None, company=None):
    t = title or ""
    if JUNK_RE.search(t):
        return None
    # "Kearney Senior Business Analyst, ...": the firm's own name before the grade is not part of the title
    if company and t.lower().startswith(company.split()[0].lower() + " ") and len(company.split()[0]) >= 4:
        t = t[len(company.split()[0]) + 1:]
    g = _general_family(t)
    # A Fortune bank or investor has every kind of job, and its division names carry the words the employer
    # rules look for ("Global Banking & Markets, Operations, Analyst"). There the general rules go first and the
    # employer rule needs a deal word or a campus title.
    big = company in FORTUNE_CATEGORIES and category in BIG_STRICT
    if category in EMPLOYER_FIRST and g not in NAMED_FIRST and not big:
        f = _employer_family(t, category)
        if f:
            # "2027 Summer Analyst - Risk Management": a campus title that names another function is that function's
            return g if g and CAMPUS_RANK_RE.search(t) and not DEAL_RE.search(t) else f
    if g == "corp_dev" and (big or (company and company.lower() in BANKS)) and category in (None, "Investment banking") and not re.search(r"\bcorp(orate)?\.?\s+dev", t, re.I):
        return "ib_associate"
    if g:
        return g
    f = _employer_family(t, category)
    if f and big and not (DEAL_RE.search(t) or CAMPUS_RANK_RE.search(t)):
        f = None
    return f or (LAST_RESORT[0] if LAST_RESORT_RE.search(t) else None)


def title_ok(title, category=None, batch=None):
    """Titles the MBA scrape fetches (the product families are already in data/raw/jobs); batch narrows to one batch."""
    f = family(title, category)
    return f is not None and f not in IN_PRODUCT_SCRAPE and (batch is None or BATCH[f] == batch)


def queries(category=None, batch=None):
    base = SEARCH_QUERIES if batch is None else BATCH_QUERIES[batch]
    return base + EMPLOYER_QUERIES.get(category, [])


# Queries for search-based ATSes; title filtering happens on the results.
SEARCH_QUERIES = [
    "management consultant", "strategy manager", "corporate strategy", "strategy analyst", "strategic planning",
    "transformation", "FP&A", "financial planning analysis", "strategic finance", "treasury", "finance manager",
    "investment banking", "commercial banking relationship manager", "corporate banking", "investment manager",
    "portfolio manager", "private equity", "venture capital", "corporate development", "mergers acquisitions",
    "integration", "business operations", "strategy operations", "general manager", "chief of staff",
    "program manager", "operations manager", "operational excellence", "continuous improvement", "technology strategy",
]
SEARCH_QUERIES_2 = [
    "digital transformation", "business analytics", "analytics manager", "business intelligence", "marketing manager",
    "brand manager", "growth", "sales manager", "business development", "partnerships", "alliances", "customer success",
    "supply chain manager", "procurement", "sourcing", "category manager", "human resources", "HR business partner",
    "people partner", "organizational development", "talent development", "compensation", "total rewards", "benefits",
    "enterprise risk", "risk manager", "compliance manager", "governance", "real estate", "asset manager",
    "leadership development program", "rotational program", "MBA",
]
# batch 3: campus titles and the analyst grades that are a manager role's entry level
SEARCH_QUERIES_3 = [
    "MBA intern", "MBA internship", "summer associate", "financial analyst", "supply chain analyst", "procurement analyst",
    "sourcing analyst", "category analyst", "compliance analyst", "risk analyst", "governance analyst", "operations analyst",
    "operations supervisor", "marketing associate", "marketing analyst", "marketing specialist", "HR analyst", "HR specialist",
    "program analyst", "partnerships associate", "business development associate", "customer success associate",
    "transformation analyst", "commercial banking analyst", "credit analyst",
]
BATCH_QUERIES = {1: SEARCH_QUERIES, 2: SEARCH_QUERIES_2, 3: SEARCH_QUERIES_3}
SEARCH_QUERIES = SEARCH_QUERIES + SEARCH_QUERIES_2 + SEARCH_QUERIES_3

# In the order of the source list.
FAMILY_LABELS = {
    "management_consultant": "Management Consultant", "strategy_manager": "Strategy Manager",
    "corp_strategy_analyst": "Corporate Strategy Analyst or Associate", "transformation": "Transformation Manager",
    "fpa": "FP&A Manager", "strategic_finance": "Strategic Finance Manager", "treasury": "Treasury Manager",
    "financial_manager": "Financial Manager", "ib_associate": "Investment Banking Associate",
    "commercial_banking_rm": "Commercial Banking Relationship Manager", "corporate_banking": "Corporate Banking Associate",
    "investment_manager": "Investment Manager", "pe_associate": "Private Equity Associate",
    "vc_associate": "Venture Capital Associate", "corp_dev": "Corporate Development Manager",
    "ma_integration": "M&A Integration Manager", "bizops": "Business Operations Manager",
    "general_manager": "General Manager", "chief_of_staff": "Chief of Staff", "program_manager": "Program Manager",
    "operations_manager": "Operations Manager", "opex": "Operational Excellence Manager",
    "product_manager": "Product Manager", "product_strategy": "Product Strategy Manager",
    "tech_strategy": "Technology Strategy Manager",
    "digital_transformation": "Digital Transformation Manager", "business_analytics": "Business Analytics Manager",
    "business_intelligence": "Business Intelligence Manager", "marketing_manager": "Marketing Manager",
    "brand_manager": "Brand Manager", "pmm": "Product Marketing Manager", "growth_manager": "Growth Manager",
    "sales_manager": "Sales Manager", "bizdev": "Business Development Manager",
    "partnerships": "Strategic Partnerships Manager", "customer_success": "Customer Success Leader",
    "supply_chain": "Supply Chain Manager", "procurement": "Procurement Manager",
    "strategic_sourcing": "Strategic Sourcing Manager", "category_manager": "Category Manager",
    "hr_manager": "Human Resources Manager", "org_dev": "Organizational Development Manager",
    "comp_benefits": "Compensation and Benefits Manager", "enterprise_risk": "Enterprise Risk Manager",
    "compliance": "Compliance Manager", "governance": "Governance Manager",
    "re_acquisitions": "Real Estate Acquisitions Associate", "re_development": "Real Estate Development Manager",
    "re_asset_manager": "Asset Manager", "ldp": "Leadership Development Program Associate",
}
# scrape batch of each family: the first 25 roles of the list, then the rest
BATCH = {f: 1 if i < 25 else 2 for i, f in enumerate(FAMILY_LABELS)}
# Roles people come to from another job: they have no analyst or associate grade of their own. An entry-level
# title with their words is another job (a sales associate is not a junior sales manager).
NO_ENTRY_LEVEL = {"sales_manager", "general_manager", "chief_of_staff"}


# ---- Levels -------------------------------------------------------------------------------------------------
# One scale of eight keys for every posting, so levels can be compared and the matcher needs one order. What a
# key is called depends on the ladder the employer uses: a bank "Vice President" and a consulting "Manager" both
# sit at "senior". LADDERS holds the names; the *_GRADES lists read a title on each ladder (first match wins).
LEVEL_ORDER = roles.LEVEL_ORDER
GRADE_CATEGORIES = BANK_CATEGORIES
BANK_INDUSTRIES = {"Commercial Banks", "Securities"}  # Fortune's industry label, for banks that have no employer category
CONSULTING_GRADES = [
    ("associate", r"\bintern(ship)?s?\b|\bsummer\b"),
    ("vp", r"(?<!associate\s)\bpartner\b|\bmanaging\s+director\b|\bsenior\s+partner\b"),
    ("director", r"\bprincipal\b(?!\s+invest)|\bassociate\s+partner\b|\bdirector\b"),
    ("staff", r"\b(engagement\s+manager|project\s+leader|senior\s+manager|case\s+team\s+leader)\b"),
    ("senior", r"\b(manager|(senior|sr\.?)\s+consultant|(senior|sr\.?)\s+associate|consultant\s+ii+)\b"),
    ("associate", r"\b(business\s+analyst|analyst|associate\s+consultant)\b"),
    ("mid", r"\b(consultant|associate)\b"),
]
BANK_GRADES = [
    ("cpo", r"\bchief\b(?!\s+of\s+staff)"),
    ("associate", r"\bintern(ship)?s?\b|\bsummer\s+(analyst|associate)\b"),
    ("vp", r"\bmanaging\s+director\b|\b(general|managing)\s+partner\b|(?<!business\s)(?<!people\s)\bpartner\b(?!\s+(manager|sales|success|marketing))"),
    ("director", r"\bexecutive\s+director\b|\bdirector\b|\bsenior\s+vice\s+president\b|\bSVP\b|\bprincipal\b(?!\s+(associate|invest))"),
    ("mid", r"\b(assistant|associate)\s+vice\s+president\b|\bAVP\b"),
    ("senior", r"\bvice\s+president\b|\bVP\b|\b(senior|sr\.?)\s+associate\b"),
    ("mid", r"\bassociate\b"),
    ("associate", r"\banalyst\b"),
    ("senior", r"\b(senior|sr\.?)\b"),
]
# Corporate titles. A word that lowers a grade is read first ("Associate Director", "Assistant Brand Manager").
CORPORATE_GRADES = [
    ("cpo", r"\bchief\b"),
    ("associate", r"\bintern(ship)?s?\b|\bco-?op\b|\btrainee\b|\bapprentice\b|\brotational\b"),
    ("director", r"\bassistant\s+treasurer\b"),
    ("group", r"\bassociate\s+director\b|\bgroup\s+(product\s+|program\s+|brand\s+|marketing\s+)?manager\b"),
    ("director", r"\b(assistant|associate)\s+vice\s+president\b|\bAVP\b"),
    ("vp", r"\b(vp|vice\s+president|svp|evp|head\s+of|managing\s+director)\b|\bhead,"),
    ("director", r"\bdirector\b"),
    ("associate", r"\b(assistant|associate|junior|jr\.?)\s+(\w+\s+){0,2}(manager|mgr)\b"),
    ("staff", r"\b(staff|principal|lead|distinguished|fellow)\b"),
    ("mid", r"\b(senior|sr\.?)\s+(\S+\s+){0,3}(analyst|associate|specialist|coordinator)\b(?!.*\b(manager|mgr)\b)|\b(analyst|associate|specialist),?\s+(senior|sr\.?)\b"),
    ("senior", r"\b(senior|sr\.?|experienced|ii|iii|iv)\b"),
    ("associate", r"^(?!.*\b(manager|mgr)\b).*\b(analyst|associate|assistant|specialist|supervisor|junior|jr\.?|entry|graduate|rotational|coordinator|early\s+career|new\s+grad)\b|\bI$"),
]
CONSULTING_RE = [(l, re.compile(p, re.I)) for l, p in CONSULTING_GRADES]
BANK_RE = [(l, re.compile(p, re.I)) for l, p in BANK_GRADES]
CORPORATE_RE = [(l, re.compile(p, re.I)) for l, p in CORPORATE_GRADES]
# "Chief of Staff to the Head of Sales" is one job at one grade: the office it serves is not its level
COS_RE = re.compile(r"\b(deputy\s+)?chief\s+of\s+staff\b(\s*(,|to|-|–|for)\s+.*)?$", re.I)
# "MBA Investment Director Program": the grade word names the programme, not the participant's grade
MBA_RE = re.compile(r"\bMBA\b", re.I)
PROGRAM_GRADE_RE = re.compile(r"\b(director|manager|lead|leader)\s+(development\s+)?program(me)?\b", re.I)

# The name of each level on each ladder. Corporate names are the default (LEVEL_LABELS).
LADDERS = {
    "corporate": {"label": "Corporate", "levels": {
        "associate": "Analyst / associate", "mid": "Manager", "senior": "Senior manager", "staff": "Lead / principal",
        "group": "Group manager / associate director", "director": "Director", "vp": "VP / head of function", "cpo": "Chief officer"}},
    "bank": {"label": "Banks and investment firms", "levels": {
        "associate": "Analyst", "mid": "Associate", "senior": "Vice President", "director": "Director / Principal",
        "vp": "Managing Director / Partner", "cpo": "Chief officer"}},
    "consulting": {"label": "Consulting firms", "levels": {
        "associate": "Analyst / Business Analyst", "mid": "Consultant / Associate", "senior": "Senior Consultant / Manager",
        "staff": "Engagement Manager / Senior Manager", "director": "Principal / Associate Partner", "vp": "Partner"}},
}
LEVEL_LABELS = LADDERS["corporate"]["levels"]


def ladder(title, company=None, category=None, industry=None, fam=None):
    """Which grade names the employer uses for this job: "bank", "consulting" or "corporate"."""
    if category in BANK_CATEGORIES or industry in BANK_INDUSTRIES or (company and company.lower() in BANKS):
        return "bank"
    if category in CONSULTING_CATEGORIES and (fam or family(title, category, company)) == "management_consultant":
        return "consulting"
    return "corporate"


def level(title, company=None, category=None, industry=None, fam=None):
    t = title or ""
    fam = fam or family(t, category, company)
    which = ladder(t, company, category, industry, fam)
    if fam == "ldp" and not re.search(r"\b(director|manager|lead|head|vp|vice\s+president)\b", t, re.I):
        return "associate"  # a programme participant, whatever the programme is called
    t = COS_RE.sub("CoS", t)
    if MBA_RE.search(t):
        t = PROGRAM_GRADE_RE.sub("program", t)
    for l, rx in {"bank": BANK_RE, "consulting": CONSULTING_RE, "corporate": CORPORATE_RE}[which]:
        if rx.search(t):
            return l
    return "mid"


# ---- Entry mark ---------------------------------------------------------------------------------------------
# Who enters at a posting: an MBA graduate ("mba"), a bachelor's or non-MBA master's graduate ("pre_mba"), or
# neither (None: an experienced-hire job, or no evidence). It is a second fact beside the level, not a level:
# an MBA joins McKinsey as Associate (mid), Deloitte as Senior Consultant (senior) and a bank as Associate (mid),
# and "Associate" is the undergraduate grade at BCG. The table of firm titles, the category defaults and the
# words read in titles and texts are data: pipeline/entry_mba.json, with the source of every row.
ENTRY = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "entry_mba.json")))
ENTRY_VALUES = tuple(ENTRY["values"])
ENTRY_SOURCES = tuple(ENTRY["sources"])
_rx = lambda p: re.compile(p, re.I)
_ENTRY_FIRMS = {f["firm"].lower(): [(_rx(t["pattern"]), t, t.get("families", f.get("families", ["management_consultant"]))) for t in f["titles"]] for f in ENTRY["firms"]}
_ENTRY_CATS = {c["category"]: (set(c["families"]), [(_rx(t["pattern"]), _rx(t["not"]) if t.get("not") else None, t) for t in c["titles"]], c.get("max_yoe")) for c in ENTRY["categories"]}
_ET = {k: _rx(v) for k, v in ENTRY["title"].items() if k not in ("note", "no_mark_levels")}
_EX = {k: _rx(v) for k, v in ENTRY["text"].items() if k in ("student", "mba", "mba_not", "undergrad", "weak", "weak_not")}


def _strip_firm(t, company):
    first = company.split()[0] if company else ""
    return t[len(first) + 1:] if len(first) >= 4 and t.lower().startswith(first.lower() + " ") else t


def _text_audience(text):
    """"mba" or "pre_mba" when a line of the text says who the posting is written for, else None."""
    found = None
    for m in _EX["student"].finditer(text):
        a, b = text.rfind("\n", 0, m.start()) + 1, text.find("\n", m.end())
        line = text[max(a, m.start() - 200):min(b if b >= 0 else len(text), m.end() + 200)]
        if _EX["mba"].search(line):
            if _EX["mba_not"].search(line):
                continue
            if not _EX["undergrad"].search(line):
                return "mba"
        found = "pre_mba"
    return found


def entry(title, company=None, category=None, industry=None, fam=None, lvl=None, text=None, yoe=None):
    """(entry, intern, source) of a posting: entry is "mba", "pre_mba" or None; intern is True for an internship,
    a co-op or a summer programme; source is the kind of evidence that decided ("firm", "title", "text", "category").

    Order: a job about students or for PhD graduates only is not marked; the firm's own titles; a title that names
    the audience (MBA, undergraduate); a line of the text that says who the posting is for; the default of the
    employer's category for the grade; "Summer Associate"; a text that asks for no experience; campus words.
    "title" and "text" mean the posting is written for that audience. "firm" and "category" mean the title is the
    grade at which that audience joins; such a posting may also be open to experienced hires.
    """
    t0 = title or ""
    fam = fam or family(t0, category, company)
    lvl = lvl or level(t0, company, category, industry, fam)
    t = _strip_firm(t0, company)
    intern = bool(_ET["intern"].search(t))
    says_mba = bool(_ET["mba"].search(t)) and not _ET["mba_not"].search(t)
    if _ET["not_for_them"].search(t) or (_ET["phd"].search(t) and not says_mba):
        return None, intern, None
    for rx, row, fams in _ENTRY_FIRMS.get((company or "").lower(), ()):
        if (fams is None or fam in fams) and rx.search(t):
            return row["entry"], row.get("intern", intern), "firm"
    if _ET["pre"].search(t) and not _ET["campus_not"].search(t):
        return "pre_mba", intern, "title"
    if says_mba:
        return "mba", intern, "title"
    if lvl in ENTRY["title"]["no_mark_levels"]:
        return None, intern, None
    if text and (intern or lvl in ENTRY["text"]["student_levels"]):
        who = _text_audience(text)
        if who:
            return who, intern, "text"
    fams, rows, max_yoe = _ENTRY_CATS.get(category, ((), (), None))
    if fam in fams and not (max_yoe is not None and yoe is not None and yoe > max_yoe):
        for rx, no, row in rows:
            if rx.search(t) and not (no and no.search(t)) and row.get("level", lvl) == lvl:
                return row["entry"], row.get("intern", intern), "category"
    if _ET["summer_associate"].search(t):
        return "mba", True, "title"
    if text and lvl in ENTRY["text"]["weak_levels"] and not _EX["weak_not"].search(t) and _EX["weak"].search(text):
        return "pre_mba", intern, "text"
    if (intern or _ET["campus"].search(t) or fam == "ldp") and not _ET["campus_not"].search(t):
        return "pre_mba", intern, "title"
    return None, intern, None


# ---- Groups, and roles that count for another role -------------------------------------------------------------
# Groups are labels for the interface: every role has its own graph file, so regrouping costs nothing.
GROUPS = {
    "consulting_strategy": ("Consulting & strategy", ["management_consultant", "strategy_manager", "corp_strategy_analyst", "transformation", "digital_transformation", "tech_strategy", "chief_of_staff", "bizops"]),
    "finance": ("Finance", ["fpa", "strategic_finance", "treasury", "financial_manager", "corp_dev", "ma_integration"]),
    "banking_investing": ("Banking & investing", ["ib_associate", "commercial_banking_rm", "corporate_banking", "investment_manager", "pe_associate", "vc_associate", "re_acquisitions", "re_development", "re_asset_manager"]),
    "operations": ("Operations & general management", ["general_manager", "program_manager", "operations_manager", "opex", "ldp"]),
    "product": ("Product", ["product_manager", "product_strategy"]),
    "marketing": ("Marketing", ["marketing_manager", "brand_manager", "pmm", "growth_manager"]),
    "sales": ("Sales & partnerships", ["sales_manager", "bizdev", "partnerships", "customer_success"]),
    "supply_chain": ("Supply chain & procurement", ["supply_chain", "procurement", "strategic_sourcing", "category_manager"]),
    "people": ("People", ["hr_manager", "org_dev", "comp_benefits"]),
    "risk": ("Risk & compliance", ["enterprise_risk", "compliance", "governance"]),
    "analytics": ("Analytics", ["business_analytics", "business_intelligence"]),
}
GROUP_OF = {f: g for g, (_, fs) in GROUPS.items() for f in fs}
assert set(GROUP_OF) == set(FAMILY_LABELS), set(FAMILY_LABELS) ^ set(GROUP_OF)

# COVERS[a] = roles whose work role a contains: a person who held a is read as having held those too (as a
# product manager is for product owner in web/match.js, where the table is keyed the other way round).
# Confirmed on 2026-10-12: each pair is the same function with the covered role narrower or the junior grade.
COVERS = {
    "strategy_manager": ["corp_strategy_analyst"],
    "strategic_finance": ["fpa"],
    "financial_manager": ["fpa"],
    "product_manager": ["product_strategy"],
    "procurement": ["strategic_sourcing"],
    "transformation": ["digital_transformation"],
    "business_analytics": ["business_intelligence"],
}


def export():
    """The title rules as data, for code that cannot import this module (the resume reader in the browser).

    Every pattern is a regular expression that JavaScript compiles unchanged with the "i" flag; evals/roles_mba.mjs
    is a reference reader of this structure and evals/run_pipeline.py checks that it agrees with family() and
    level() on every title we hold.
    """
    covered_by = {}
    for a, bs in COVERS.items():
        for b in bs:
            covered_by.setdefault(b, []).append(a)
    return {
        "about": "Title rules of the MBA role set, written by pipeline/roles_mba.py (do not edit by hand). "
                 "Patterns are JavaScript regular expressions; use the 'i' flag. How to read a title: see 'how'.",
        "how": [
            "1. A title that matches 'junk' has no role. When the title starts with the first word of the employer's name (four letters or more) and a space, that word is removed first.",
            "2. general = the first entry of 'families' with a match in 'patterns' and none in 'exclude'. ib_associate and corporate_banking are also skipped "
            "when the title matches 'tech_staff'. An entry with 'product_gate' also needs the product rules to hold: product.family(title) equals the gate, and product.title_ok(title).",
            "3. big = the employer is in 'big_employers'. When the employer's category is in 'employer_first', general is not in 'named_first' and not big: "
            "use the employer rule (step 5) if it gives a role; but when general is not empty and the title matches 'campus_rank' and not 'deal', the role is general.",
            "4. When general is corp_dev, the employer is big or in 'banks', its category is none or Investment banking, and the title does not say corporate "
            "development ('corp_dev_named'): the role is ib_associate. Otherwise, when general is not empty, the role is general.",
            "5. Employer rule (the fallback when general is empty): at a consulting category, a title matching 'consultant' is management_consultant unless it "
            "matches 'consultant_exclude'. At a Strategy consulting firm, a title matching 'house_rank' is management_consultant unless it matches 'house_staff'. At a 'bank_categories' employer, when the title matches 'deal' and not 'tech_staff', take the 'sector' words out first. "
            "Then no role when the title matches 'employer_exclude' (or 'real_estate_exclude' at a real-estate firm); else the first rule of "
            "'employer_rules'[category] that matches. For a big employer the result counts only when the title matches 'deal' or 'campus_rank'.",
            "6. Still no role: 'last_resort'.family when the title matches its pattern.",
            "7. Level: pick the ladder ('ladders'.*.applies), replace a chief-of-staff phrase ('chief_of_staff') with 'CoS', then the first grade whose pattern matches; none: 'mid'. "
            "An ldp title with no manager word ('ldp_staff') is 'associate'. In a title that matches 'mba_word', a match of 'program_grade' is replaced by 'program' before the grades are read.",
            "8. Entry mark (who enters at this title: 'mba', 'pre_mba' or none; with intern true or false and the source of the evidence): see 'entry'.about and its notes. "
            "Order: no mark when the title matches entry.title.not_for_them, or entry.title.phd without an MBA word; the firm's row in entry.firms (company name, role in the row's families, default management_consultant; "
            "the title without the firm's first word); entry.title.pre, then entry.title.mba; no mark on entry.title.no_mark_levels; a student line of the text (entry.text); "
            "the row of entry.categories for the employer's category, role and level; entry.title.summer_associate; a weak line of the text; campus words, an internship or the ldp role.",
        ],
        "flags": "i",
        "groups": [{"id": g, "label": label, "families": fs} for g, (label, fs) in GROUPS.items()],
        "families": [{"id": f, "label": FAMILY_LABELS[f], "group": GROUP_OF[f], "patterns": [p], "exclude": [EXCLUDE[f]] if f in EXCLUDE else [],
                      "covers": COVERS.get(f, []), "covered_by": covered_by.get(f, []),
                      **({"product_gate": IN_PRODUCT_SCRAPE[f]} if f in IN_PRODUCT_SCRAPE else {})} for f, p in FAMILY_PATTERNS],
        "covers_status": "confirmed",
        "junk": JUNK_RE.pattern,
        "last_resort": {"family": LAST_RESORT[0], "pattern": LAST_RESORT[1]},
        "big_employers": sorted(c for c, k in FORTUNE_CATEGORIES.items() if k in BIG_STRICT), "deal": DEAL_RE.pattern, "campus_rank": CAMPUS_RANK,
        "house_rank": HOUSE_RANK_RE.pattern, "house_staff": HOUSE_STAFF_RE.pattern,
        "tech_staff": TECH_STAFF_RE.pattern, "sector": SECTOR_RE.pattern, "bank_categories": sorted(BANK_CATEGORIES),
        "no_entry_level": sorted(NO_ENTRY_LEVEL),
        "employer_first": sorted(EMPLOYER_FIRST), "named_first": sorted(NAMED_FIRST), "banks": sorted(BANKS),
        "consulting_categories": sorted(CONSULTING_CATEGORIES),
        "consultant": CONSULTANT_RE.pattern, "consultant_exclude": CONSULTANT_EXCLUDE_RE.pattern,
        "employer_exclude": EMPLOYER_EXCLUDE_RE.pattern, "real_estate_exclude": REAL_ESTATE_EXCLUDE_RE.pattern,
        "employer_rules": {c: [{"family": f, "pattern": rx.pattern} for f, rx in rules] for c, rules in EMPLOYER_RE.items()},
        "corp_dev_named": r"\bcorp(orate)?\.?\s+dev",
        "product": {"families": [{"id": f, "pattern": p} for f, p in roles.FAMILY_PATTERNS], "exclude": roles.EXCLUDE_RE.pattern,
                    "keep": roles.KEEP_RE.pattern, "nonproduct": roles.NONPRODUCT_RE.pattern, "food": roles.FOOD_RE.pattern,
                    "product_manage": r"\bproduct\s+manage"},
        "levels": LEVEL_ORDER, "level_labels": LEVEL_LABELS,
        "mba_word": MBA_RE.pattern, "program_grade": PROGRAM_GRADE_RE.pattern,
        "entry": ENTRY,
        "chief_of_staff": COS_RE.pattern, "ldp_staff": r"\b(director|manager|lead|head|vp|vice\s+president)\b",
        "ladders": {
            "bank": {**LADDERS["bank"], "applies": {"categories": sorted(BANK_CATEGORIES), "industries": sorted(BANK_INDUSTRIES), "companies": sorted(BANKS)},
                     "grades": [{"level": l, "pattern": p} for l, p in BANK_GRADES]},
            "consulting": {**LADDERS["consulting"], "applies": {"categories": sorted(CONSULTING_CATEGORIES), "families": ["management_consultant"]},
                           "grades": [{"level": l, "pattern": p} for l, p in CONSULTING_GRADES]},
            "corporate": {**LADDERS["corporate"], "applies": "every other posting",
                          "grades": [{"level": l, "pattern": p} for l, p in CORPORATE_GRADES]},
        },
    }
