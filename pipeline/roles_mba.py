"""Title filtering and classification for the MBA role set.

The 25 roles are the first 25 of "50 MBA Career Options" (mbapreferred.com). Product Manager (#23) and
Product Strategy Manager (#24) are the `pm` family of the product scrape (data/raw/jobs), so they are
classified here but not scraped again; technical program managers are likewise left to the product scrape.
"""
import re

from pipeline import roles

MGR = r"(manager|lead|leader|director|head|vp|vice\s+president|principal)"

# Order matters (first match wins): narrow functions before the broad manager titles.
FAMILY_PATTERNS = [
    ("ma_integration", r"\b(m\s*&\s*a|mergers?|acquisitions?|post[- ]merger)\b.*\bintegration\b|\bintegration\b.*\b(m\s*&\s*a|mergers?|acquisitions?)\b|\bintegration\s+management\s+office\b"),
    ("corp_dev", r"\bcorporate\s+development\b|\bcorp\.?\s+dev\b|\bmergers\s*(&|and)\s*acquisitions\b|\bm\s*&\s*a\b"),
    ("strategic_finance", r"\bstrategic\s+finance\b"),
    ("fpa", r"\bfp\s*&\s*a\b|\bfinancial\s+planning\s*(&|and)\s*analysis\b"),
    ("treasury", r"\btreasury\s+(senior\s+)?(manager|analyst|associate|director|lead|operations)\b|\b(manager|analyst|director|head|vp|vice\s+president|lead),?\s+(of\s+)?(corporate\s+|global\s+)?treasury\b|\b(assistant\s+)?treasurer\b"),
    ("ib_associate", r"\binvestment\s+bank(ing|er)\b"),
    ("commercial_banking_rm", r"\b(commercial|business)\s+bank(ing|er)\b.*\brelationship\s+(manager|banker)\b|\brelationship\s+(manager|banker)\b.*\b(commercial|business)\s+bank|\bcommercial\s+(relationship\s+manager|banker)\b"),
    ("corporate_banking", r"\bcorporate\s+bank(ing|er)\b"),
    ("pe_associate", r"\bprivate\s+equity\b.*\b(associate|analyst|principal|vice\s+president|vp|invest(or|ment|ing)s?)\b|\b(associate|analyst|principal|vice\s+president|vp|invest(or|ment|ing)s?)\b.*\bprivate\s+equity\b"),
    ("vc_associate", r"\bventure\s+capital\b|\bventures?\s+(associate|analyst|principal|investor|partner)\b|\b(associate|analyst|principal|investor),?\s+ventures\b"),
    ("investment_manager", r"\binvestment\s+(manager|management\s+(associate|analyst)|officer|analyst|associate|director|strategist)\b|\b(equity|equities|fixed\s+income|credit|multi[- ]asset|investment)\s+portfolio\s+manager\b|\bportfolio\s+manager\b.*\b(equit|fixed\s+income|invest|asset\s+management|wealth)"),
    ("chief_of_staff", r"\bchief\s+of\s+staff\b"),
    ("tech_strategy", r"\b(technology|tech|it|ai)\s+strateg(y|ist)\b"),
    ("product_strategy", r"\bproduct\s+strateg(y|ist)\b"),
    ("product_manager", r"\bproduct\s+(manage(r|ment)|mgmt|mgr)\b|\bproduct\s+lead\b|\bhead\s+of\s+product\b"),
    ("bizops", r"\bbusiness\s+operations\b|\bbiz\s*ops\b|\bstrategy\s*(&|and)\s*operations\b|\bstrategy\s*(&|and)\s*ops\b"),
    ("corp_strategy_analyst", r"\bstrategy\s+(senior\s+)?(analyst|associate)\b|\b(analyst|associate),?\s+(corporate\s+|business\s+)?strategy\b"),
    ("strategy_manager", rf"\bstrategy\s+(senior\s+)?{MGR}\b|\b{MGR},?\s+(of\s+)?(corporate\s+|business\s+|global\s+|enterprise\s+)?strategy\b|\b(corporate|business|enterprise)\s+strategy\b|\bstrategic\s+planning\b|\bstrategy\s*(&|and)\s*planning\b"),
    ("opex", r"\boperational\s+excellence\b|\bcontinuous\s+improvement\b|\bbusiness\s+excellence\b|\blean\s+(manager|leader|lead|six)\b|\bsix\s+sigma\b|\bprocess\s+improvement\s+(manager|lead|leader|director)\b"),
    ("transformation", rf"\btransformation\s+(office|program|senior\s+)?\s*{MGR}\b|\b{MGR},?\s+(of\s+)?(business\s+|enterprise\s+|finance\s+|operations\s+)?transformation\b|\b(business|enterprise)\s+transformation\b|\btransformation\s+office\b"),
    ("management_consultant", r"\b(management|strategy|business)\s+consult(ant|ing)\b|\bconsultant,?\s+(strategy|management)\b|\bstrategy\s+consult"),
    ("financial_manager", r"\b(finance|financial)\s+(senior\s+)?(manager|director)\b|\b(manager|director|head|vp|vice\s+president),?\s+(of\s+)?finance\b|\bfinance\s+lead\b|\bfinancial\s+controller\b"),
    ("general_manager", r"\bgeneral\s+manager\b"),
    ("program_manager", r"\bprogram(me)?\s+manage(r|ment)\b"),
    ("operations_manager", r"\boperations\s+(senior\s+)?(manager|director|lead)\b|\b(manager|director|head|vp|vice\s+president),?\s+(of\s+)?operations\b|\bops\s+manager\b"),
]
FAMILY_RE = [(f, re.compile(p, re.I)) for f, p in FAMILY_PATTERNS]

# Families whose postings live in the product scrape.
IN_PRODUCT_SCRAPE = {"product_manager", "product_strategy"}

# Titles that carry one of the words above but are a different job.
EXCLUDE = {
    "treasury": r"\btreasury\s+(management\s+)?(sales|services)\b|\bsales\b",
    "transformation": r"\bdigital\s+transformation\b",  # role #26, outside the 25
    "general_manager": r"\b(assistant|asst\.?|associate)\s+general\s+manager\b|\bin[- ]training\b|\b(restaurant|store|hotel|shop|kitchen|salon|branch|club|car\s+wash|dealership|cafe|bakery|property)\b",
    "program_manager": r"\b(technical|tech)\s+program\b|\bTPM\b",
    "operations_manager": r"\bproduct\s+(operations|ops)\b",
    "management_consultant": r"\b(sap|oracle|workday|salesforce|servicenow|implementation|software|technical|solutions?)\b",
    "investment_manager": r"\bproduct\b",
    "pe_associate": r"\b(sales|account|partner(ship)?s?|representative|counsel|tax|accounting|accountant)\b",
    "strategy_manager": r"\b(content|creative|brand|media|social|seo|communications?|design|ux|tax|talent|sourcing|category)\b",
    "financial_manager": r"\b(data\s+scien|engineer|recruit|talent|systems)",
    "corp_dev": r"\b(counsel|attorney|paralegal|tax|accounting|accountant|legal)\b",
}
EXCLUDE_RE = {f: re.compile(p, re.I) for f, p in EXCLUDE.items()}


def family(title):
    t = title or ""
    for f, rx in FAMILY_RE:
        if rx.search(t):
            if f in EXCLUDE_RE and EXCLUDE_RE[f].search(t):
                continue
            if f in IN_PRODUCT_SCRAPE and not roles.title_ok(t):
                continue
            return f
    return None


def title_ok(title):
    """Titles the MBA scrape fetches (the product families are already in data/raw/jobs)."""
    f = family(title)
    return f is not None and f not in IN_PRODUCT_SCRAPE


# Queries for search-based ATSes; title filtering happens on the results.
SEARCH_QUERIES = [
    "management consultant", "strategy manager", "corporate strategy", "strategy analyst", "strategic planning",
    "transformation", "FP&A", "financial planning analysis", "strategic finance", "treasury", "finance manager",
    "investment banking", "commercial banking relationship manager", "corporate banking", "investment manager",
    "portfolio manager", "private equity", "venture capital", "corporate development", "mergers acquisitions",
    "integration", "business operations", "strategy operations", "general manager", "chief of staff",
    "program manager", "operations manager", "operational excellence", "continuous improvement", "technology strategy",
]

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
}
