"""Tag every scraped posting with taxonomy skills, family, level, specialisations, years of experience.

usage: python -m pipeline.extract [--roles product|mba|tech]  ->  data/processed/jobs.json (jobs_mba.json, jobs_tech.json)
"""
import glob
import hashlib
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import log, roles, roles_mba, roles_tech, sponsorship
from pipeline.roles import specializations

logger = log.get(__name__)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from pipeline import tax
TAX = tax.load()
SKILL_RE = [(s["id"], re.compile("|".join(f"(?:{p})" for p in s["patterns"]), re.I)) for s in TAX["skills"]]
SKILL_RX = dict(SKILL_RE)
# A skill with "only": [role sets] is tagged for those sets alone; the rest of the vocabulary is shared.
SKILL_ONLY = {s["id"]: s["only"] for s in TAX["skills"] if s.get("only")}


_SKILLS_FOR = {}


def skills_for(roleset):
    if roleset not in _SKILLS_FOR:
        # the role set's part of the taxonomy, with its own wording of a shared skill where it has one ("patterns_for")
        _SKILLS_FOR[roleset] = [(s["id"], re.compile("|".join(f"(?:{p})" for p in s["patterns"]), re.I)) for s in tax.for_roles(roleset, TAX)["skills"]]
    return _SKILLS_FOR[roleset]


# role set -> where its postings are cached, how a title is classified, and where the output goes
ROLE_SETS = {
    "product": {"raw": ["jobs"], "suffix": "", "geo": lambda j, title: geo(j.get("location", ""), title) + (j.get("location", ""),),
                # a product_engineer title is settled by its text: a manufacturing "Product Engineer" is dropped (roles.software_build)
                "family": lambda title, j: roles.family(title, j.get("description")) if roles.title_ok(title) else None,
                "level": lambda title, company, j: roles.level(title, company)},
    # the three product roles of the MBA list live in the product cache; every other family in jobs_mba
    # Only US postings of this set are shown, so its country reader is the stricter one (pipeline/geo.py) and its
    # evidence sentences come from US postings.
    # The raw files are a backlog (pipeline/scrape.py). This set keeps closed postings for KEEP_CLOSED_DAYS: they are
    # not listed as open, and they count in shares and evidence. The product set drops them until its interface
    # can hide them.
    "mba": {"raw": ["jobs_mba", "jobs"], "suffix": "_mba", "evidence_country": "United States", "split_long": True, "backlog": True,
            "geo": lambda j, title: _geo().country(j.get("location", ""), title, j.get("url"), j.get("ats")),
            "family": lambda title, j: roles_mba.family(title, j.get("category"), j.get("company")),
            "level": lambda title, company, j: roles_mba.level(title, company, j.get("category"), j.get("industry"), j.get("family")),
            "ladder": lambda title, company, j: roles_mba.ladder(title, company, j.get("category"), j.get("industry"), j.get("family")),
            # who enters at the posting (roles_mba.entry): read from the title, the employer and the cleaned text
            "entry": lambda title, company, j, lvl, text, yoe: roles_mba.entry(title, company, j.get("category"), j.get("industry"), j.get("family"), lvl, text, yoe)},
    # engineering, design and legal (PLAN.md "A third role set"): a sampled backlog of its own, US only like the MBA set
    "tech": {"raw": ["jobs_tech"], "suffix": "_tech", "evidence_country": "United States", "split_long": True, "backlog": True,
             "geo": lambda j, title: _geo().country(j.get("location", ""), title, j.get("url"), j.get("ats")),
             "family": lambda title, j: roles_tech.family(title, j.get("company"), j.get("industry")),
             "level": lambda title, company, j: roles_tech.level(title, company, j.get("industry"), j.get("family")),
             "ladder": lambda title, company, j: roles_tech.ladder(title, company, j.get("industry"), j.get("family")),
             "entry": lambda title, company, j, lvl, text, yoe: roles_tech.entry(title, company, j.get("industry"), j.get("family"), lvl, text),
             "specs": roles_tech.specializations},
}


def _geo():
    from pipeline import geo as g  # imported late: pipeline.geo reads this module's tables
    return g


DEPTH = {}
for _p in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
    if not _p.endswith("_roles.json"):   # per-role credential steps, not a skill
        DEPTH.update(json.load(open(_p)))
# sub-skill id -> (parent skill, regex)
SUB_RE = {}
for sid, d in DEPTH.items():
    for sub in d.get("subskills", []):
        SUB_RE[sub["id"]] = (sid, re.compile("|".join(f"(?:{p})" for p in sub["patterns"]), re.I))

US_STATES = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split())
US_STATE_NAMES = ["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york","north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island","south carolina","south dakota","tennessee","texas","utah","vermont","virginia","washington","west virginia","wisconsin","wyoming"]
US_CITIES = ["sf office", "sf bay", "bay area", "culver city", "remote - us", "us remote", "remote (us", "remote, us", "nyc", "san francisco","new york","seattle","austin","boston","chicago","los angeles","mountain view","sunnyvale","palo alto","menlo park","redmond","bellevue","cupertino","san jose","denver","atlanta","dallas","houston","miami","washington","arlington","mclean","reston","philadelphia","pittsburgh","phoenix","portland","minneapolis","detroit","charlotte","nashville","salt lake","santa clara","irvine","san diego","oakland","brooklyn","jersey city","plano","columbus","cincinnati","st. louis","kansas city","raleigh","durham","tampa","orlando","las vegas","costa mesa","el segundo","santa monica","boulder","madison","indianapolis","richmond","hartford","stamford","princeton","new brunswick","basking ridge","bentonville","deerfield","northbrook","woonsocket","minnetonka","eden prairie","st. paul","omaha","milwaukee","louisville","memphis","birmingham","jacksonville","san antonio","sacramento","fremont","foster city","south san francisco","burlingame","san mateo","redwood city","newark","wilmington","dearborn","warren","peoria","moline","round rock","frisco","mesa","tempe","chandler","scottsdale","aurora","englewood","dublin, oh","ann arbor"]
COUNTRIES = {"usa": "United States", "gbr": "United Kingdom", "ita": "Italy", "vnm": "Vietnam", "sgp": "Singapore", "ind": "India", "can": "Canada", "deu": "Germany", "fra": "France", "irl": "Ireland", "aus": "Australia", "jpn": "Japan", "bra": "Brazil", "mex": "Mexico", "nld": "Netherlands", "isr": "Israel", "pol": "Poland", "esp": "Spain", "swe": "Sweden", "che": "Switzerland", "chn": "China", "twn": "Taiwan", "kor": "South Korea", "phl": "Philippines", "are": "United Arab Emirates", "zaf": "South Africa", "hkg": "Hong Kong", "cze": "Czech Republic", "prt": "Portugal", "bel": "Belgium", "dnk": "Denmark", "aut": "Austria", "hun": "Hungary", "rou": "Romania", "cri": "Costa Rica", "arg": "Argentina", "col": "Colombia", "chl": "Chile", "nzl": "New Zealand", "mys": "Malaysia", "idn": "Indonesia", "tha": "Thailand", "tur": "Turkey", "lux": "Luxembourg", "nor": "Norway", "fin": "Finland", "grc": "Greece", "per": "Peru", "egy": "Egypt", "ken": "Kenya", "nga": "Nigeria", "sau": "Saudi Arabia", "latam": "Latin America", "emea": "Europe (EMEA)", "apac": "Asia-Pacific (APAC)", "united states": "United States", "usa": "United States", "u.s.": "United States", "united kingdom": "United Kingdom", "uk": "United Kingdom", "london": "United Kingdom", "england": "United Kingdom", "india": "India", "bengaluru": "India", "bangalore": "India", "hyderabad": "India", "pune": "India", "mumbai": "India", "gurugram": "India", "gurgaon": "India", "chennai": "India", "noida": "India", "canada": "Canada", "toronto": "Canada", "vancouver": "Canada", "montreal": "Canada", "germany": "Germany", "berlin": "Germany", "munich": "Germany", "ireland": "Ireland", "dublin": "Ireland", "singapore": "Singapore", "australia": "Australia", "sydney": "Australia", "melbourne": "Australia", "japan": "Japan", "tokyo": "Japan", "brazil": "Brazil", "sao paulo": "Brazil", "são paulo": "Brazil", "mexico": "Mexico", "france": "France", "paris": "France", "netherlands": "Netherlands", "amsterdam": "Netherlands", "israel": "Israel", "tel aviv": "Israel", "poland": "Poland", "warsaw": "Poland", "spain": "Spain", "madrid": "Spain", "barcelona": "Spain", "sweden": "Sweden", "stockholm": "Sweden", "switzerland": "Switzerland", "zurich": "Switzerland", "china": "China", "shanghai": "China", "beijing": "China", "shenzhen": "China", "taiwan": "Taiwan", "taipei": "Taiwan", "korea": "South Korea", "seoul": "South Korea", "philippines": "Philippines", "manila": "Philippines", "costa rica": "Costa Rica", "argentina": "Argentina", "colombia": "Colombia", "chile": "Chile", "italy": "Italy", "milan": "Italy", "portugal": "Portugal", "lisbon": "Portugal", "belgium": "Belgium", "brussels": "Belgium", "denmark": "Denmark", "copenhagen": "Denmark", "finland": "Finland", "norway": "Norway", "austria": "Austria", "czech": "Czech Republic", "prague": "Czech Republic", "hungary": "Hungary", "romania": "Romania", "uae": "United Arab Emirates", "dubai": "United Arab Emirates", "abu dhabi": "United Arab Emirates", "saudi": "Saudi Arabia", "south africa": "South Africa", "cape town": "South Africa", "johannesburg": "South Africa", "egypt": "Egypt", "nigeria": "Nigeria", "kenya": "Kenya", "new zealand": "New Zealand", "hong kong": "Hong Kong", "malaysia": "Malaysia", "indonesia": "Indonesia", "jakarta": "Indonesia", "thailand": "Thailand", "bangkok": "Thailand", "vietnam": "Vietnam", "turkey": "Turkey", "luxembourg": "Luxembourg", "estonia": "Estonia", "lithuania": "Lithuania", "serbia": "Serbia", "ukraine": "Ukraine", "greece": "Greece", "peru": "Peru"}


def geo(location, title=""):
    """(country, remote) from a free-text location."""
    loc = (location or "").strip()
    low = loc.lower() + " " + title.lower()
    remote = bool(re.search(r"\bremote\b|work from home|\bwfh\b|anywhere|distributed", low))
    if not loc:
        return (None, remote)
    l = loc.lower()
    for k, v in COUNTRIES.items():
        if re.search(r"\b" + re.escape(k) + r"\b", l):
            if v == "United States":
                return ("United States", remote)
            # a US state abbreviation in the same string beats a foreign city name collision (e.g. "Dublin, OH")
            if any(re.search(r"\b" + st + r"\b", loc) for st in US_STATES) and v != "United Kingdom":
                return ("United States", remote)
            return (v, remote)
    if any(re.search(r"\b" + st + r"\b", loc) for st in US_STATES) or any(n in l for n in US_STATE_NAMES) or any(c in l for c in US_CITIES):
        return ("United States", remote)
    return ("Other / unspecified", remote)


SENT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
LEVEL_GROUP = {"associate": "early", "mid": "early", "senior": "senior", "staff": "staff", "group": "lead", "director": "lead", "vp": "lead", "cpo": "lead"}


def sentences(text):
    for sent in SENT_RE.split(text):
        sent = sent.strip(" -•·*\t")
        if 50 <= len(sent) <= 260 and not BOILER_RE.search(sent):
            yield sent

YOE_RE = re.compile(r"\b(\d{1,2})\s*(?:\+|or more|plus)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years|yrs)\b", re.I)
WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12, "fifteen": 15}
# a range in words gives its first number, like a range in digits: "three to five years" is 3
YOE_WORD_RE = re.compile(r"\b(" + "|".join(WORD_NUM) + r")\s*(?:\+|or more|plus)?\s*(?:(?:-|–|to)\s*(?:" + "|".join(WORD_NUM) + r")\s*)?\+?\s*(?:years|yrs)\b", re.I)
BOILER_RE = re.compile(
    r"equal (opportunity|employment)|\bEEO\b|discriminat|accommodation|veteran status|sexual orientation|gender identity|"
    r"national origin|protected (characteristic|class|veteran)|background check|e-?verify|drug[- ]free|affirmative action|"
    r"visa sponsorship|work authorization|\b401\(?k\)?|dental|vision (insurance|coverage|plan)|paid time off|\bPTO\b|parental leave|"
    r"\bstock (options|units|purchase)|\bRSUs?\b|base (salary|pay) range|salary range|pay range|compensation (range|package|and benefits)|"
    r"total rewards|wellness|tuition|commuter|life insurance|disability (insurance|benefits)|employee assistance|"
    r"\bbenefits? (package|program|include|offered)|we offer (a )?competitive|bonus (program|eligib)|relocation|"
    r"\bapply (now|today)|privacy (notice|policy|statement)|recruitment (agency|agencies|fraud)|scam|"
    r"about (amazon|google|microsoft|the company|us\b)|our (mission|values|culture) is|join (us|our team) (and|to)|"
    r"reasonable accommodation|criminal (histor|record|background)|fair chance|ordinance|\bADA\b|pregnancy|"
    r"inclusive (culture|environment|workplace)|diversity,? (equity|and inclusion)|\bDEI\b|underrepresented|"
    r"ninety[- ]day|probation|export control|\bITAR\b|clearance",
    re.I,
)


# The employer describing itself ("X is a leading global investment firm ...") says what the company does,
# not what the role asks for.
ABOUT_RE = re.compile(
    r"^\W*(we are|we're|as) (a|an|the|one of the) (\w+ )?(leading|global|premier|world'?s?|largest|top|fastest|trusted|independent)\b|"
    r"^\W*(founded|established|headquartered) in\b|^\W*with (over|more than|approximately) [\d$,.]+ ?\w* (in assets|employees|offices|clients|customers)",
    re.I,
)
SELF_VERB = r"(is (?!seeking|looking|hiring|searching|recruiting|currently|an equal|committed|proud)|was founded|has been|provides|offers|serves|operates|delivers|helps|manages|advises)"
ENTITY = r"(,? (group|inc\.?|llc|l\.?p\.?|& co\.?|and company|company|corporation|corp\.?|partners|capital|management|financial|holdings|bank|\([A-Z]+: ?[A-Z.]+\)))*"


# Boards send the typographic apostrophe (’) as often as the straight one; the patterns spell the straight one
# ("master'?s", "bank's products"). Text is normalised for matching only: the cleaned text, the evidence sentences
# and the corpus keep the posting's own characters, so a quoted sentence still matches its posting word for word.
APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "ʼ": "'"})


def norm(text):
    """The text as the patterns read it: typographic apostrophes as straight ones (same length, so offsets hold)."""
    return text.translate(APOSTROPHES)


def clean(desc, company=None, split_long=False):
    """Drop boilerplate lines (EEO statements, benefits, legal, the employer's own description) so they don't inflate skill counts.

    Some boards send a posting as one line with no breaks. Any boilerplate phrase then removes the whole posting.
    With split_long, a line over LONG_LINE characters is cut into sentences first. The product set keeps the old
    behaviour until its baselines are rerun (98 of its postings are affected).
    """
    about = None
    if company:
        # the name as the posting writes it: the registry name, or its first word ("Houlihan Lokey", "Carlyle")
        first = re.escape(company.split()[0])
        about = re.compile(rf"^\W*(about )?(the )?({re.escape(company)}|{first}){ENTITY},? {SELF_VERB}", re.I)
    out = []
    lines = (desc or "").split("\n")
    if split_long:
        lines = [part for line in lines for part in (SENT_RE.split(line) if len(line) > LONG_LINE else [line])]
    for line in lines:
        test = norm(line)
        if len(line) > 40 and (BOILER_RE.search(test) or ABOUT_RE.search(test) or (about and about.search(test))):
            continue
        out.append(line)
    return "\n".join(out)


LONG_LINE = 600
KEEP_CLOSED_DAYS = 365  # a closed posting counts in the statistics for this long after it was last seen
SECTION_RE = re.compile(r"(basic|minimum|required|preferred|desired|nice[- ]to[- ]have|bonus|qualifications|requirements|what you('ll| will) bring|about you|who you are|you have|you are)", re.I)


def years_required(text):
    """Smallest explicit years-of-experience ask in the text (None if absent)."""
    vals = []
    for m in YOE_RE.finditer(text):
        n = int(m.group(1))
        if 1 <= n <= 25:
            vals.append(n)
    for m in YOE_WORD_RE.finditer(text):
        vals.append(WORD_NUM[m.group(1).lower()])
    return min(vals) if vals else None


def tag(text, skills=SKILL_RE):
    found = {}
    for sid, rx in skills:
        hits = rx.findall(text)
        if hits:
            found[sid] = len(hits)
    return found


STAGE_RE = re.compile(r"\b(?:series|serie)\s+([A-G])\b(?!\s*(?:of|number|\d))", re.I)
SEED_RE = re.compile(r"\b(seed|pre-?seed)[- ]?(stage|round|funded|funding)\b", re.I)


def stage_mentions(text):
    letters = [m.group(1).upper() for m in STAGE_RE.finditer(text)]
    if letters:
        return "Series " + max(letters)
    if SEED_RE.search(text):
        return "Seed"
    return None


def pick_evidence(cands, k=4):
    """Diverse examples: at most one per company, prefer mid-length sentences with a verb-ish start."""
    seen, out = set(), []
    cands = sorted(cands, key=lambda c: (-c.get("_score", 1), abs(len(c["text"]) - 150)))
    for c in cands:
        key = c["company"]
        if key in seen or c["text"].lower() in {o["text"].lower() for o in out}:
            continue
        seen.add(key)
        out.append({k: v for k, v in c.items() if k != "_score"})
        if len(out) >= k:
            break
    return out


def postings(roleset):
    """Every posting of a role set that extraction keeps: (company, registry row, raw job, family, cleaned text).

    Drops titles outside the set, descriptions too short to tag, and exact reposts (same company, title and
    cleaned text: the same role reposted per city counts once). Sets postings()["dropped"] to the repost count.
    """
    from pipeline.scrape import load_registry
    import datetime
    cfg = ROLE_SETS[roleset]
    reg = {r["company"]: r for r in load_registry(roleset)}
    oldest = (datetime.date.today() - datetime.timedelta(days=KEEP_CLOSED_DAYS)).isoformat()
    seen = set()
    postings.dropped = postings.read = postings.files = 0
    files = [(n, path) for n, folder in enumerate(cfg["raw"]) for path in sorted(glob.glob(os.path.join(ROOT, "data", "raw", folder, "*.json")))]
    # An employer that retitles a requisition gives it a new URL: the backlog then holds it twice under one id, and
    # when the employer is in both scrapes, the product file (read as it was scraped) can hold the old title of a
    # requisition the backlog holds under the new one. The one seen last is the posting; on a tie, the row from the
    # folder listed first (the backlog). (The product set has no backlog and is read as it is.)
    latest = {}
    if cfg.get("backlog"):
        for n, path in files:
            blob = json.load(open(path))
            was = (blob.get("scraped_at") or "")[:10]
            for i, j in enumerate(blob["jobs"]):
                k = (blob["company"], j.get("external_id") or j.get("url"))
                rank = (j.get("last_seen") or was, -n)
                if k not in latest or rank >= latest[k][0]:
                    latest[k] = (rank, path, i)
    for n, path in files:
        folder = cfg["raw"][n]
        blob = json.load(open(path))
        company = blob["company"]
        r = reg.get(company)
        if r is None or r.get("ats") in (None, "unsupported"):
            logger.debug("%s: skipped, not in the registry or no adapter", os.path.basename(path))
            continue  # company dropped from the registry
        postings.files += 1
        postings.read += len(blob["jobs"])
        rows = blob["jobs"]
        if cfg.get("backlog"):
            rows = [j for i, j in enumerate(rows) if latest[(company, j.get("external_id") or j.get("url"))][1:] == (path, i)]
        for j in rows:
            if j.get("closed") and (not cfg.get("backlog") or (j.get("last_seen") or "") < oldest):
                continue
            # the employer's category comes from the registry: postings scraped before it had one carry none
            if r.get("category") and j.get("category") != r["category"]:
                j = dict(j, category=r["category"])
            was = (blob.get("scraped_at") or "")[:10]  # a file not refreshed since the backlog began
            j = dict(j, company=company, first_seen=j.get("first_seen") or was, last_seen=j.get("last_seen") or was)
            fam = cfg["family"](j["title"], j)
            if fam is None:
                continue
            if roleset == "mba" and (folder == "jobs") != (fam in roles_mba.IN_PRODUCT_SCRAPE):
                continue
            desc = j.get("description") or ""
            if len(desc) < 300:
                continue
            cleaned = clean(desc, company, cfg.get("split_long", False))
            key = (company, j["title"].strip().lower(), hashlib.md5(cleaned.strip().encode()).hexdigest())
            # the same URL under a second company name is the same posting (a board shared by two registry entries)
            if key in seen or (j.get("url") and j["url"] in seen):
                postings.dropped += 1
                continue
            seen.add(key)
            seen.add(j.get("url"))
            yield company, r, j, fam, cleaned


def _own_skills(roleset):
    """The role set's skills that are read off the text: every one but the years buckets, which years_required decides."""
    return [(sid, rx) for sid, rx in skills_for(roleset) if not sid.startswith("yoe_")]


def text_parts(roleset, title, cleaned, old=None, redo=((), ())):
    """What a posting's title and cleaned text say, one skill at a time (the costly part of tagging: the skill
    patterns): {"k": {skill: [matches in the text, [[sentence index, matches], ...]]}, "yoe": the years asked,
    "subs": [sub-skills]}. A skill's part depends on its own patterns and the text, on nothing else, so pipeline.extract
    keeps it in a cache keyed by the text (TextCache); with `old`, the text's parts under older patterns, only the
    skills and sub-skills named in `redo` are read again."""
    text = norm(title + "\n" + cleaned)
    redo_skills, redo_subs = redo
    k, sents = {}, None
    for sid, rx in _own_skills(roleset):
        if old is not None and sid not in redo_skills:
            if sid in old["k"]:
                k[sid] = old["k"][sid]
            continue
        n = len(rx.findall(text))
        if n:
            if sents is None:
                sents = [norm(sent) for sent in sentences(cleaned)]
            k[sid] = [n, [[i, m] for i, sent in enumerate(sents) for m in [len(SKILL_RX[sid].findall(sent))] if m]]
    kept = () if old is None else set(old["subs"])
    subs = sorted(sub for sub, (parent, rx) in SUB_RE.items()
                  if parent in k and (rx.search(text) if old is None or sub in redo_subs else sub in kept))
    return {"k": k, "yoe": years_required(cleaned) if old is None else old["yoe"], "subs": subs}


def assemble(roleset, part):
    """A text_parts result as tagging reads it: the skill hits in the taxonomy's order, the years asked and its bucket
    (the one bucket consistent with the explicit ask, last), the sub-skills, and (sentence index, skill, matches) for
    each evidence sentence. A skill the role set no longer has is left out."""
    k, yoe = part["k"], part["yoe"]
    order = [sid for sid, _ in _own_skills(roleset) if sid in k]
    hits = [[sid, k[sid][0]] for sid in order]
    if yoe is not None:
        hits.append(["yoe_2" if yoe <= 2 else "yoe_3" if yoe <= 4 else "yoe_5" if yoe <= 6 else "yoe_8" if yoe <= 9 else "yoe_10", 1])
    rank = {sid: n for n, sid in enumerate(order)}
    marks = sorted(([i, sid, m] for sid in order for i, m in k[sid][1]), key=lambda x: (x[0], rank[x[1]]))
    return {"hits": hits, "yoe": yoe, "subs": [sub for sub in part["subs"] if sub in SUB_RE], "marks": marks}


def text_tags(roleset, title, cleaned):
    """The skill hits in order, the years asked, the sub-skills and the evidence marks of one posting's text."""
    return assemble(roleset, text_parts(roleset, title, cleaned))


def _joined(patterns):
    return "|".join(f"(?:{p})" for p in patterns)


def _short(*parts):
    return hashlib.sha256("\0".join(parts).encode()).hexdigest()[:16]


def pattern_hashes(roleset):
    """({skill: hash}, {sub-skill: hash}) of the patterns text_parts reads for a role set. A skill is read with the role
    set's own wording for its hits and with the shared wording for its evidence sentences; a sub-skill is read only
    where its parent hit, so its hash carries the parent's."""
    shared = {s["id"]: _joined(s["patterns"]) for s in TAX["skills"]}
    skills = {s["id"]: _short(_joined(s["patterns"]), shared[s["id"]])
              for s in tax.for_roles(roleset, TAX)["skills"] if not s["id"].startswith("yoe_")}
    subs = {sub: _short(parent, rx.pattern, skills.get(parent, "")) for sub, (parent, rx) in SUB_RE.items()}
    return skills, subs


# the patterns TextCache follows one by one (pattern_hashes), left out of the hash of the code
_PER_PATTERN = ("TAX", "SKILL_RE", "SKILL_RX", "SUB_RE", "DEPTH", "_SKILLS_FOR")


def code_hash(start="text_parts"):
    """A hash of the code text_parts runs: its source and that of every function of this module it reaches, with the
    patterns and tables those read (the sentence splitter, the years patterns, the boilerplate test). An edit anywhere
    else in this module, to the title rules or to the cleaner leaves it as it was: the cleaned text is part of a
    cache entry's key, and nothing else of the posting is read here."""
    import inspect
    g, found, todo = globals(), {}, [start]

    def names(code):
        yield from code.co_names
        for c in code.co_consts:
            if hasattr(c, "co_names"):
                yield from names(c)

    while todo:
        name = todo.pop()
        v = g.get(name)
        if name in found or name in _PER_PATTERN or v is None or inspect.ismodule(v) or inspect.isclass(v):
            continue
        if inspect.isfunction(v):
            if v.__globals__ is not g:   # another module's function: the title rules, the log
                continue
            found[name] = inspect.getsource(v)
            todo.extend(names(v.__code__))
        elif isinstance(v, re.Pattern):
            found[name] = f"{v.pattern}\0{v.flags}"
        elif isinstance(v, (dict, list, tuple, set, frozenset, str, int, float)):
            found[name] = repr(sorted(v.items()) if isinstance(v, dict) else sorted(v) if isinstance(v, (set, frozenset)) else v)
    return hashlib.sha256(json.dumps(sorted(found.items())).encode()).hexdigest()


class TextCache:
    """text_parts results kept between runs in data/experiments/ (the caches store: pipeline.store push caches), keyed
    by a hash of the role set, the title and the cleaned text. A weekly refresh changes a few thousand texts of
    ~100,000, so a hosted runner (two cores) tags in minutes what takes ten hours without it.

    The file says what its entries were read with: a hash of the code (code_hash) and, per generation of entries, a
    hash of each skill's and sub-skill's patterns (pattern_hashes). Another code hash starts the cache empty. Another
    pattern hash keeps the entries and names the skills to read again (`redo`): a taxonomy change that touches ten
    skills reads ten patterns per text, not three hundred. So a stale part is never used, and a change costs what it
    changed. `save()` during a run keeps the entries not reached yet under their own generation, so a job that is
    stopped half way leaves the next one the texts it tagged."""

    def __init__(self, roleset, path=None):
        self.path = path or os.path.join(ROOT, "data", "experiments", f"extract_cache_{roleset}.json.gz")
        self.code = _short(roleset, code_hash())
        # the role set's own view of the taxonomy, not the whole file: a skill added for another set, or another set's
        # wording of a shared skill, leaves this set's cache as it is; of the depth files only the sub-skills are read
        self.skills, self.subs = pattern_hashes(roleset)
        self.fingerprint = _short(self.code, json.dumps([self.skills, self.subs], sort_keys=True))
        self.entries = {}   # key -> parts
        self.behind = {}    # key -> index in self.gens, for an entry read with older patterns
        self.gens = []      # the older generations met in the file: {"skills": hashes, "subs": hashes}
        self.redo = []      # per older generation: (skills, sub-skills) to read again
        self.hits = self.updated = self.misses = 0
        try:
            import gzip
            with gzip.open(self.path, "rt") as f:
                blob = json.load(f)
            if blob.get("code") != self.code:
                return
            for gen in blob["gens"]:
                redo = (frozenset(s for s, h in self.skills.items() if gen["skills"].get(s) != h),
                        frozenset(s for s, h in self.subs.items() if gen["subs"].get(s) != h))
                self.entries.update(gen["entries"])
                if redo[0] or redo[1]:
                    self.gens.append({"skills": gen["skills"], "subs": gen["subs"]})
                    self.redo.append(redo)
                    self.behind.update(dict.fromkeys(gen["entries"], len(self.gens) - 1))
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            self.entries, self.behind, self.gens, self.redo = {}, {}, [], []

    @staticmethod
    def key(roleset, title, cleaned):
        return hashlib.sha256(f"{roleset}\0{title}\0{cleaned}".encode()).hexdigest()[:32]

    def get(self, key):
        """(parts, index of the generation they are behind by or None) for a text, or None."""
        part = self.entries.get(key)
        return None if part is None else (part, self.behind.get(key))

    def put(self, key, part):
        """A text's parts as read with today's patterns."""
        self.entries[key] = part
        self.behind.pop(key, None)

    def save(self, used=None):
        """Write the entries this run used (an entry no posting asked for is dropped, so the file does not grow), or
        every entry when the run is still going."""
        import gzip
        entries, behind = dict(self.entries), dict(self.behind)   # a worker thread may be reading them
        keep = entries if used is None else {k: entries[k] for k in used if k in entries}
        gens = [{"skills": self.skills, "subs": self.subs, "entries": {k: v for k, v in keep.items() if k not in behind}}]
        for n, gen in enumerate(self.gens):
            old = {k: v for k, v in keep.items() if behind.get(k) == n}
            if old:
                gens.append(dict(gen, entries=old))
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with gzip.open(self.path + ".tmp", "wt", compresslevel=6) as f:
            json.dump({"code": self.code, "gens": gens}, f, separators=(",", ":"))
        os.replace(self.path + ".tmp", self.path)


CHECKPOINT_S = 600   # the text cache is written this often during a run (TextCache.save)
_REDO = []           # TextCache.redo, as the worker processes see it


def _worker(redo):
    global _REDO
    _REDO = redo


def tag_posting(item):
    """One posting -> (job row, evidence sentences, funding stage it mentions, text_parts result or None). Runs in
    worker processes; `cached` is TextCache.get for the posting's text: None, or its parts and the generation they
    are behind by. The parts come back when they were read or brought up to date here, for the cache."""
    roleset, company, r, j, fam, cleaned, cached = item
    cfg = ROLE_SETS[roleset]
    title = j["title"]
    desc = j.get("description") or ""
    if cached is None:
        parts = text_parts(roleset, title, cleaned)
    elif cached[1] is None:
        parts = cached[0]
    else:
        parts = text_parts(roleset, title, cleaned, cached[0], _REDO[cached[1]])
    part = assemble(roleset, parts)
    hits, yoe, subs = dict(part["hits"]), part["yoe"], part["subs"]
    ctx = dict(j, company=company, industry=r.get("industry"), family=fam)
    lvl = cfg["level"](title, company, ctx)
    country, remote, location = cfg["geo"](j, title)
    found = []
    sents = list(sentences(cleaned)) if part["marks"] else []
    for i, sid, n in part["marks"]:
        found.append((sid, {"text": sents[i], "company": company, "title": title, "url": j.get("url"), "level": lvl, "_score": n}))
    job = {
        "id": f"{company}::{j.get('external_id') or j.get('url')}",
        "company": company,
        "group": r["group"],
        "investor": r.get("investor"),
        "sector": r.get("sector"),
        "industry": r.get("industry"),
        "rank": r.get("rank"),
        "ats": j.get("ats"),
        "title": title,
        "family": fam,
        "level": lvl,
        "specs": cfg.get("specs", specializations)(title),
        "location": location,
        "country": country,
        "remote": remote,
        "url": j.get("url"),
        "posted": j.get("posted"),
        "yoe": yoe,
        # visa sponsorship as a posting fact (PLAN.md v16, step 8): "yes", "no" or None, read from the raw description
        "sponsorship": sponsorship.read(desc),
        "skills": hits,
        "sub": subs,
        "snippet": re.sub(r"\s+", " ", desc)[:400],
        "desc_chars": len(desc),
        **({"category": j["category"]} if j.get("category") else {}),
        **({"ladder": cfg["ladder"](title, company, ctx)} if "ladder" in cfg else {}),
        **(dict(zip(("entry", "intern", "entry_src"), cfg["entry"](title, company, ctx, lvl, norm(cleaned), yoe))) if "entry" in cfg else {}),
        **({"open": not j.get("closed"), "first_seen": j.get("first_seen"), "last_seen": j.get("last_seen")} if cfg.get("backlog") else {}),
    }
    return job, found, stage_mentions(desc), (None if cached is not None and cached[1] is None else parts)


def main():
    import argparse
    import multiprocessing
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", choices=sorted(ROLE_SETS), default="product")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--no-cache", action="store_true", help="tag every text again and leave the text cache as it is")
    args = ap.parse_args()
    cfg = ROLE_SETS[args.roles]
    skills = skills_for(args.roles)
    jobs = []
    evidence = {}
    company_stage = {}
    t = log.Timer()
    logger.info("extract --roles %s: %d skills, %d workers", args.roles, len(skills), args.workers)
    cache = None if args.no_cache else TextCache(args.roles)
    if cache is not None:
        logger.info("text cache: %d texts kept, %d of them to bring up to date (%s)", len(cache.entries), len(cache.behind),
                    "; ".join(f"{len(a)} skills, {len(b)} sub-skills" for a, b in cache.redo) or "no pattern changed")
    keys, known = [], []

    def items():
        for company, r, j, fam, cleaned in postings(args.roles):
            cached = None
            if cache is not None:
                k = TextCache.key(args.roles, j["title"], cleaned)
                cached = cache.get(k)
                keys.append(k)
                known.append(cached is not None)
            yield args.roles, company, r, j, fam, cleaned, cached

    # results come back in posting order, so the output does not depend on the number of workers or on the cache. The
    # workers do not log (pipeline/log.py): the parent counts what comes back.
    saved, unsaved = time.monotonic(), 0
    with multiprocessing.Pool(args.workers, initializer=_worker, initargs=(cache.redo if cache is not None else [],)) as pool:
        for n, (job, found, st, part) in enumerate(pool.imap(tag_posting, items(), chunksize=40)):
            if cache is not None:
                if part is None:
                    cache.hits += 1
                else:
                    if known[n]:
                        cache.updated += 1
                    else:
                        cache.misses += 1
                    cache.put(keys[n], part)
                    unsaved += 1
                if unsaved and time.monotonic() - saved > CHECKPOINT_S:
                    # a job stopped before the end (the runner's time limit) leaves what it tagged to the next one
                    cache.save()
                    logger.info("text cache written at %d postings (%d tagged, %d brought up to date so far)", n + 1, cache.misses, cache.updated)
                    saved, unsaved = time.monotonic(), 0
            if st:
                cur = company_stage.get(job["company"])
                company_stage[job["company"]] = max(cur, st) if cur else st
            for sid, ev in found if job["country"] == cfg.get("evidence_country", job["country"]) else ():
                evidence.setdefault(sid, {}).setdefault(LEVEL_GROUP[ev["level"]], []).append(ev)
            jobs.append(job)
            if len(jobs) % 5000 == 0:
                logger.info("%d postings tagged, %s", len(jobs), t)
    if cache is not None:
        cache.save(keys)
        logger.info("text cache: %d reused, %d brought up to date, %d tagged -> %s", cache.hits, cache.updated, cache.misses, os.path.relpath(cache.path, ROOT))
    os.makedirs(os.path.join(ROOT, "data", "processed"), exist_ok=True)
    sfx = cfg["suffix"]
    from pipeline import processed   # imported late: pipeline.processed is small, extract is imported by many
    out = processed.dump(args.roles, jobs)
    with open(os.path.join(ROOT, "data", "processed", f"company_stage{sfx}.json"), "w") as f:
        json.dump(company_stage, f, indent=1)
    picked = {sid: {grp: pick_evidence(c) for grp, c in groups.items()} for sid, groups in evidence.items()}
    with open(os.path.join(ROOT, "data", "processed", f"evidence{sfx}.json"), "w") as f:
        json.dump(picked, f)
    import collections
    subcnt = collections.Counter(k for j in jobs for k in j["sub"])
    cnt = collections.Counter(k for j in jobs for k in j["skills"])
    logger.info("extract --roles %s done in %s: %d postings read from %d files, %d tagged, %d exact reposts (same company, title and text) dropped -> %s",
                args.roles, t, postings.read, postings.files, len(jobs), postings.dropped, os.path.relpath(out, ROOT))
    logger.info("by family: %s", collections.Counter(j["family"] for j in jobs).most_common())
    logger.info("by level: %s", collections.Counter(j["level"] for j in jobs).most_common())
    logger.info("by group: %s", collections.Counter(j["group"] for j in jobs).most_common())
    logger.info("top skills: %s", [(k, round(v / len(jobs), 2)) for k, v in cnt.most_common(25)])
    logger.info("avg skills/job: %.2f", sum(len(j["skills"]) for j in jobs) / max(1, len(jobs)))
    never = [sid for sid, _ in skills if cnt[sid] == 0]
    if never:
        logger.warning("skills never matched: %s", never)
    never_sub = [k for k in SUB_RE if subcnt[k] == 0]
    if never_sub:
        logger.warning("sub-skills never matched: %s", never_sub)


if __name__ == "__main__":
    log.setup()
    main()
