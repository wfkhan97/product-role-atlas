"""Title filtering and classification for product-related roles."""
import re

# Titles we keep. Order matters for family detection (first match wins).
FAMILY_PATTERNS = [
    ("tpm", r"\b(technical|tech)\s+program\s+(manager|management|lead|director)\b|\bTPM\b"),
    ("pmm", r"\bproduct\s+marketing\b"),
    ("product_ops", r"\bproduct\s+(operations|ops)\b"),
    ("product_analyst", r"\bproduct\s+(data\s+)?(analyst|analytics|scientist|science)\b|\banalyst,?\s+product\b"),
    ("product_owner", r"\bproduct\s+owner\b"),
    ("pm", r"\bproduct\s+(manage(r|ment)|mgmt|mgt|mgr)\b|\bprod(uct)?\.?\s+(mgr|mgmt|mgt)\b|\bproduct\s+lead\b|\b(head|director|vp|vice\s+president|svp|evp|chief)\b(\s+of)?,?\s+(global\s+|technical\s+|group\s+|senior\s+|digital\s+|platform\s+|consumer\s+|enterprise\s+|ai\s+)*products?\b|\bchief\s+product\s+officer\b|\bAPM\b|\bassociate\s+product\b|\bgroup\s+product\b|\bproduct\s+director\b|\bprincipal\s+product\b|\bproduct\s+strateg(y|ist)\b|\bproduct,?\s+(senior\s+)?(manager|director|lead)\b|\bproduct\s+(line\s+)?manage(r|ment)\b"),
]
FAMILY_RE = [(f, re.compile(p, re.I)) for f, p in FAMILY_PATTERNS]

# Exclude non-product roles that happen to contain "product" (manufacturing, retail etc.)
EXCLUDE_RE = re.compile(
    r"\b(production|produce|product\s+(design|designer|support|specialist|engineer|engineering|developer|development\s+engineer|security|safety|quality|stewardship|compliance|counsel|trainer|photograph|assembler|technician|tester|test|sales|sourcing|supply|planner|planning|merchandis|flow|repair|content|writer|copy|solutions?\s+engineer|solutions?\s+architect|consultant|coordinator|administrator|assistant|launch\s+engineer|cost|regulatory|labeling|information|data\s+engineer|complaint|surveillance|lifecycle\s+engineer|realization|integrity|certification|validation|verification|assurance|line\s+manager|scientist\s*-\s*r&d|chemist|formulation))\b"
    r"|\bproduct\s+manager\s*-?\s*(manufactur|plant|retail|store|grocery|bakery|dairy|meat|deli|pharmacy)"
    r"|\b(manufacturing|dairy|bakery|chemical|cosmetic|nutrition|food|beverage|agricultur|crop)\s+product\b"
    r"|\bresearch\s+and\s+development\b.*\bproduct\b",
    re.I,
)
# Strong "keep" that overrides the exclude list when both hit (e.g. "Product Manager, Product Security Platform")
NONPRODUCT_RE = re.compile(r"\b(people\s+partner|hr\b|human\s+resources|recruit|talent|finance|accounting|legal|counsel|payroll|facilities|real\s+estate|communications?\s+(manager|lead|director)|public\s+relations|events?\s+(manager|lead)|executive\s+assistant|administrative|office\s+manager|workplace)", re.I)
FOOD_RE = re.compile(r"\b(dairy|bakery|deli|meat|seafood|produce|grocery|beverage|snack|cosmetic|fragrance|apparel|footwear|private\s+label|own\s+brand|store\s+brand)\b", re.I)
KEEP_RE = re.compile(r"\b(product\s+manager|product\s+management|product\s+(mgmt|mgt|mgr)|program\s+manager|product\s+marketing\s+manager|product\s+owner|head\s+of\s+product|director,?\s+product\s+management|vp,?\s+product\s+management|chief\s+product\s+officer)\b", re.I)


def family(title):
    for f, rx in FAMILY_RE:
        if rx.search(title):
            return f
    return None


def title_ok(title):
    t = title or ""
    f = family(t)
    if not f:
        return False
    if FOOD_RE.search(t):
        return False
    if EXCLUDE_RE.search(t) and not KEEP_RE.search(t):
        return False
    if NONPRODUCT_RE.search(t) and not re.search(r"\bproduct\s+manage", t, re.I):
        return False
    # TPM only if it is a *technical* program manager (plain program managers are out of scope)
    return True


LEVEL_PATTERNS = [
    ("cpo", r"\bchief\s+product\b"),
    ("vp", r"\b(vp|vice\s+president|svp|evp|head\s+of)\b"),
    ("director", r"\bdirector\b"),
    ("group", r"\bgroup\s+(product|technical|program)\b|\bgroup\s+manager\b|\bGPM\b"),
    ("staff", r"\b(staff|principal|lead|distinguished|fellow)\b"),
    ("senior", r"\b(senior|sr\.?|experienced|ii|iii|iv|v|2|3|4)\b"),
    ("associate", r"\b(associate|apm|junior|jr\.?|entry|rotational|new\s+grad|graduate|intern|early\s+career|i|1)\b"),
]
LEVEL_RE = [(l, re.compile(p, re.I)) for l, p in LEVEL_PATTERNS]
LEVEL_ORDER = ["associate", "mid", "senior", "staff", "group", "director", "vp", "cpo"]


# Banks use corporate titles: "Vice President" is a mid/senior IC grade, not an executive.
BANK_TITLE_COMPANIES = {"jpmorgan chase", "goldman sachs group", "morgan stanley", "citigroup", "bank of america", "wells fargo", "stonex group"}
BANK_GRADES = [
    ("vp", r"\bmanaging director\b"),
    ("director", r"\bexecutive director\b|\bdirector\b"),
    ("senior", r"\bvice president\b|\bVP\b|\bsenior associate\b"),
    ("mid", r"\bassociate\b"),
    ("associate", r"\banalyst\b"),
]
BANK_RE = [(l, re.compile(p, re.I)) for l, p in BANK_GRADES]


def level(title, company=None):
    t = title or ""
    if company and company.lower() in BANK_TITLE_COMPANIES:
        for l, rx in BANK_RE:
            if rx.search(t):
                return l
    # "Senior Director" -> director, "Lead Product Manager" -> staff, "Product Manager II" -> senior
    for l, rx in LEVEL_RE:
        if rx.search(t):
            if l == "staff" and re.search(r"\b(senior|sr\.?)\s+(staff|principal)\b", t, re.I):
                return "staff"
            return l
    return "mid"


SPECIALIZATIONS = [
    ("growth", r"\bgrowth\b|\bacquisition\b|\bretention\b|\bmonetization\b|\bactivation\b"),
    ("platform", r"\bplatform\b|\bapi\b|\binfrastructure\b|\bdeveloper\b|\binternal\s+tools\b"),
    ("ai_ml", r"\b(ai|ml|machine\s+learning|llm|genai|generative|agent|agentic|copilot|intelligence)\b"),
    ("data", r"\bdata\b|\banalytics\b|\bmeasurement\b|\bexperimentation\b"),
    ("payments_fintech", r"\bpayment|fintech|lending|credit|banking|wallet|treasury|fraud|risk\b|\btrading\b|\bwealth\b"),
    ("consumer", r"\bconsumer\b|\bmobile\b|\bapp\b|\bmember\b|\bshopper\b|\bcustomer\s+experience\b|\bmarketplace\b"),
    ("enterprise_b2b", r"\benterprise\b|\bb2b\b|\bsaas\b|\bcommercial\b|\bpartner\b|\bseller\b|\bmerchant\b"),
    ("hardware_devices", r"\bhardware\b|\bdevice\b|\bsilicon\b|\bchip\b|\bfirmware\b|\bembedded\b|\brobot\b|\bvehicle\b|\bautonom\b"),
    ("health", r"\bhealth\b|\bclinical\b|\bpharma|medic|patient|care\b|\bbenefit"),
    ("security_identity", r"\bsecurity\b|\bidentity\b|\bprivacy\b|\btrust\b|\bsafety\b|\bcompliance\b"),
    ("ads_marketing", r"\bads?\b|\badvertis|\bmarketing\s+tech|\bcampaign\b|\bmedia\b"),
    ("supply_chain_ops", r"\bsupply\s+chain\b|\blogistics\b|\bfulfil|\bdelivery\b|\btransportation\b|\bwarehouse\b|\boperations\b"),
    ("commerce", r"\bcommerce\b|\bcheckout\b|\bcatalog\b|\bstore\b|\bretail\b|\bshopping\b"),
]
SPEC_RE = [(s, re.compile(p, re.I)) for s, p in SPECIALIZATIONS]


def specializations(title):
    return [s for s, rx in SPEC_RE if rx.search(title or "")]


FAMILY_LABELS = {
    "pm": "Product Manager", "tpm": "Technical Program Manager", "pmm": "Product Marketing Manager",
    "product_ops": "Product Operations", "product_analyst": "Product Analyst", "product_owner": "Product Owner",
}
LEVEL_LABELS = {
    "associate": "Associate / APM", "mid": "Product Manager", "senior": "Senior", "staff": "Staff / Principal / Lead",
    "group": "Group", "director": "Director", "vp": "VP / Head of Product", "cpo": "Chief Product Officer",
}
