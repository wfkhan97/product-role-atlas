"""Title filtering and classification for product-related roles."""
import re

# Titles we keep. Order matters for family detection (first match wins).
# product_engineer (2026-10-30): the AI-forward builder role between product and engineering ("Associate Product
# Engineer" at Book of the Month, "AI Product Engineer", "Forward Deployed Engineer"): owns a feature from spec to
# measurement and ships it with AI coding tools. It is read before pm, or "Associate Product Engineer" is an APM.
# The same words name a manufacturing job ("Product Engineer" at a semiconductor plant): HARDWARE_RE drops the titles
# that say so, and software_build() reads the posting text at extraction for the bare ones.
FAMILY_PATTERNS = [
    ("product_engineer", r"\b(ai|applied\s+ai|full[- ]stack|software|founding|forward[- ]deployed)?\s*product\s+engineer\b|\bforward[- ]deployed\s+(software\s+|ai\s+|solutions?\s+|product\s+)?engineer\b"),
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
    r"\b(production|produce|product\s+(design|designer|support|specialist|engineering|developer|development\s+engineer|applications?\s+engineer|security|safety|quality|stewardship|compliance|counsel|trainer|photograph|assembler|technician|tester|test|sales|sourcing|supply|planner|planning|merchandis|flow|repair|content|writer|copy|solutions?\s+engineer|solutions?\s+architect|consultant|coordinator|administrator|assistant|launch\s+engineer|cost|regulatory|labeling|information|data\s+engineer|complaint|surveillance|lifecycle\s+engineer|realization|integrity|certification|validation|verification|assurance|line\s+manager|scientist\s*-\s*r&d|chemist|formulation))\b"
    r"|\bproduct\s+manager\s*-?\s*(manufactur|plant|retail|store|grocery|bakery|dairy|meat|deli|pharmacy)"
    r"|\b(manufacturing|dairy|bakery|chemical|cosmetic|nutrition|food|beverage|agricultur|crop)\s+product\b"
    r"|\bresearch\s+and\s+development\b.*\bproduct\b",
    re.I,
)
# Strong "keep" that overrides the exclude list when both hit (e.g. "Product Manager, Product Security Platform")
NONPRODUCT_RE = re.compile(r"\b(people\s+partner|hr\b|human\s+resources|recruit|talent|finance|accounting|legal|counsel|payroll|facilities|real\s+estate|communications?\s+(manager|lead|director)|public\s+relations|events?\s+(manager|lead)|executive\s+assistant|administrative|office\s+manager|workplace)", re.I)
FOOD_RE = re.compile(r"\b(dairy|bakery|deli|meat|seafood|produce|grocery|beverage|snack|cosmetic|fragrance|apparel|footwear|private\s+label|own\s+brand|store\s+brand)\b", re.I)
# A product engineer title that names a hardware or manufacturing discipline is not the software builder role.
# "Product Engineer, Payments" passes; "Product Test Engineer", "Mechanical Product Engineer", "Product Engineer -
# Wafer Fab" do not. The bare title is settled by the posting text (software_build) at extraction.
HARDWARE_RE = re.compile(
    r"\b(mechanical|electrical|electronics?|hardware|manufacturing|process|test|quality|applications?|packaging|materials?|"
    r"semiconductor|wafer|fab|yield|rf|optical|optics|photonics|chemical|civil|structural|field|support|security|safety|reliability|"
    r"validation|verification|npi|automotive|aerospace|industrial|plastics?|textiles?|apparel|footwear|thermal|analog|asic|fpga|"
    r"systems?|sustaining|device|component|battery|cell|motor|pump|valve|sensor|silicon|die|cad|tooling|molding|casting|welding)\b",
    re.I,
)
# The posting text of a bare "Product Engineer": the software builder names a stack, a repository or an AI coding
# tool; the manufacturing job names drawings, tolerances and the plant. Hardware words that outnumber software words
# settle it; a text with neither keeps the title's reading.
SOFTWARE_TEXT_RE = re.compile(
    r"\b(react|typescript|javascript|node\.?js|next\.?js|python|django|rails|ruby|go(lang)?|kotlin|swift|sql|postgres(ql)?|graphql|rest\s+api|apis?|"
    r"front[- ]?end|back[- ]?end|full[- ]?stack|web\s+app|github|git\b|ci/cd|deploy(ed|ment|s)?|a/b\s+test|experiments?|feature\s+flags?|"
    r"llms?|claude|gpt|copilot|cursor|ai\s+(coding|tools?|agents?|assisted)|prompt|agentic|agents?\s+workflows?|vibe\s+cod\w+)\b",
    re.I,
)
HARDWARE_TEXT_RE = re.compile(
    r"\b(cad|solidworks|creo|catia|gd&t|tolerances?|bill\s+of\s+materials|bom|injection\s+mold\w*|machining|cnc|pcbs?|schematics?|"
    r"wafers?|yield|fab\b|die\b|semiconductor|silicon|mechanical\s+engineering|manufacturing\s+(process|line|floor|engineer)|"
    r"shop\s+floor|plant\b|tooling|fixtures?|fea\b|thermal|datasheets?|specifications?\s+sheets?|iso\s*9001|six\s+sigma|dfm|dfx|"
    r"prototyp\w+\s+(parts|hardware)|supplier\s+quality|root\s+cause|8d\b|fmea|ppap)\b",
    re.I,
)


def software_build(text):
    """True when a posting text reads as a software builder's, False as a hardware or manufacturing engineer's,
    None when it says neither (the title's reading stands). Used at extraction for product_engineer titles."""
    if not text:
        return None
    soft = len(SOFTWARE_TEXT_RE.findall(text))
    hard = len(HARDWARE_TEXT_RE.findall(text))
    if soft == 0 and hard == 0:
        return None
    return soft >= hard


KEEP_RE = re.compile(r"\b(product\s+manager|product\s+management|product\s+(mgmt|mgt|mgr)|program\s+manager|product\s+marketing\s+manager|product\s+owner|head\s+of\s+product|director,?\s+product\s+management|vp,?\s+product\s+management|chief\s+product\s+officer)\b", re.I)


def family(title, text=None):
    """The product family of a title, or None. With the posting text, a product_engineer title whose text reads as
    a hardware or manufacturing job is None (title_ok already drops the titles that say so themselves)."""
    for f, rx in FAMILY_RE:
        if rx.search(title or ""):
            if f == "product_engineer" and text is not None and software_build(text) is False:
                return None
            return f
    return None


def title_ok(title):
    t = title or ""
    f = family(t)
    if not f:
        return False
    if f == "product_engineer" and HARDWARE_RE.search(t):
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
    ("ai_ml", r"\b(ai|ml|machine\s+learning|llms?|gen[- ]?ai|generative|agents?|agentic|copilot|intelligence|applied\s+ai|foundation\s+models?|forward[- ]deployed)\b"),
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
    "product_engineer": "Product Engineer",
}
LEVEL_LABELS = {
    "associate": "Associate / APM", "mid": "Product Manager", "senior": "Senior", "staff": "Staff / Principal / Lead",
    "group": "Group", "director": "Director", "vp": "VP / Head of Product", "cpo": "Chief Product Officer",
}
