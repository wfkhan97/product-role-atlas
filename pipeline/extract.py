"""Tag every scraped posting with taxonomy skills, family, level, specialisations, years of experience.

usage: python -m pipeline.extract [--roles product|mba]  ->  data/processed/jobs.json (jobs_mba.json for mba)
"""
import glob
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import roles, roles_mba
from pipeline.roles import specializations

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
                "family": lambda title, j: roles.family(title) if roles.title_ok(title) else None,
                "level": lambda title, company, j: roles.level(title, company)},
    # the three product roles of the MBA list live in the product cache; every other family in jobs_mba
    # Only US postings of this set are shown, so its country reader is the stricter one (pipeline/geo.py) and its
    # evidence sentences come from US postings.
    "mba": {"raw": ["jobs_mba", "jobs"], "suffix": "_mba", "evidence_country": "United States", "split_long": True,
            "geo": lambda j, title: _geo().country(j.get("location", ""), title, j.get("url"), j.get("ats")),
            "family": lambda title, j: roles_mba.family(title, j.get("category"), j.get("company")),
            "level": lambda title, company, j: roles_mba.level(title, company, j.get("category"), j.get("industry"), j.get("family")),
            "ladder": lambda title, company, j: roles_mba.ladder(title, company, j.get("category"), j.get("industry"), j.get("family"))},
}


def _geo():
    from pipeline import geo as g  # imported late: pipeline.geo reads this module's tables
    return g


DEPTH = {}
for _p in glob.glob(os.path.join(ROOT, "pipeline", "depth", "*.json")):
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
YOE_WORD_RE = re.compile(r"\b(" + "|".join(WORD_NUM) + r")\s*(?:\+|or more|plus)?\s*(?:years|yrs)\b", re.I)
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
    lines = desc.split("\n")
    if split_long:
        lines = [part for line in lines for part in (SENT_RE.split(line) if len(line) > LONG_LINE else [line])]
    for line in lines:
        if len(line) > 40 and (BOILER_RE.search(line) or ABOUT_RE.search(line) or (about and about.search(line))):
            continue
        out.append(line)
    return "\n".join(out)


LONG_LINE = 600
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
    cfg = ROLE_SETS[roleset]
    reg = {r["company"]: r for r in load_registry(roleset)}
    seen = set()
    postings.dropped = 0
    for folder in cfg["raw"]:
        for path in sorted(glob.glob(os.path.join(ROOT, "data", "raw", folder, "*.json"))):
            blob = json.load(open(path))
            company = blob["company"]
            r = reg.get(company)
            if r is None or r.get("ats") in (None, "unsupported"):
                continue  # company dropped from the registry
            for j in blob["jobs"]:
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


def tag_posting(item):
    """One posting -> (job row, evidence sentences, funding stage it mentions). Runs in worker processes."""
    roleset, company, r, j, fam, cleaned = item
    cfg = ROLE_SETS[roleset]
    title = j["title"]
    desc = j.get("description") or ""
    text = title + "\n" + cleaned
    hits = tag(text, skills_for(roleset))
    # drop years-of-experience buckets that aren't consistent with the explicit ask, keep only the one matching
    yoe = years_required(cleaned)
    for k in list(hits):
        if k.startswith("yoe_"):
            del hits[k]
    if yoe is not None:
        bucket = "yoe_2" if yoe <= 2 else "yoe_3" if yoe <= 4 else "yoe_5" if yoe <= 6 else "yoe_8" if yoe <= 9 else "yoe_10"
        hits[bucket] = 1
    subs = sorted(sub for sub, (parent, rx) in SUB_RE.items() if parent in hits and rx.search(text))
    ctx = dict(j, company=company, industry=r.get("industry"), family=fam)
    lvl = cfg["level"](title, company, ctx)
    country, remote, location = cfg["geo"](j, title)
    found = []
    for sent in sentences(cleaned):
        for sid in hits:
            if sid.startswith("yoe_"):
                continue
            m = SKILL_RX[sid].findall(sent)
            if m:
                found.append((sid, {"text": sent, "company": company, "title": title, "url": j.get("url"), "level": lvl, "_score": len(m)}))
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
        "specs": specializations(title),
        "location": location,
        "country": country,
        "remote": remote,
        "url": j.get("url"),
        "posted": j.get("posted"),
        "yoe": yoe,
        "skills": hits,
        "sub": subs,
        "snippet": re.sub(r"\s+", " ", desc)[:400],
        "desc_chars": len(desc),
        **({"category": j["category"]} if j.get("category") else {}),
        **({"ladder": cfg["ladder"](title, company, ctx)} if "ladder" in cfg else {}),
    }
    return job, found, stage_mentions(desc)


def main():
    import argparse
    import multiprocessing
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", choices=sorted(ROLE_SETS), default="product")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = ap.parse_args()
    cfg = ROLE_SETS[args.roles]
    skills = skills_for(args.roles)
    jobs = []
    evidence = {}
    company_stage = {}
    items = ((args.roles, company, r, j, fam, cleaned) for company, r, j, fam, cleaned in postings(args.roles))
    # results come back in posting order, so the output does not depend on the number of workers
    with multiprocessing.Pool(args.workers) as pool:
        for job, found, st in pool.imap(tag_posting, items, chunksize=40):
            if st:
                cur = company_stage.get(job["company"])
                company_stage[job["company"]] = max(cur, st) if cur else st
            for sid, ev in found if job["country"] == cfg.get("evidence_country", job["country"]) else ():
                evidence.setdefault(sid, {}).setdefault(LEVEL_GROUP[ev["level"]], []).append(ev)
            jobs.append(job)
    os.makedirs(os.path.join(ROOT, "data", "processed"), exist_ok=True)
    sfx = cfg["suffix"]
    with open(os.path.join(ROOT, "data", "processed", f"jobs{sfx}.json"), "w") as f:
        json.dump(jobs, f)
    with open(os.path.join(ROOT, "data", "processed", f"company_stage{sfx}.json"), "w") as f:
        json.dump(company_stage, f, indent=1)
    picked = {sid: {grp: pick_evidence(c) for grp, c in groups.items()} for sid, groups in evidence.items()}
    with open(os.path.join(ROOT, "data", "processed", f"evidence{sfx}.json"), "w") as f:
        json.dump(picked, f)
    import collections as _c
    subcnt = _c.Counter(k for j in jobs for k in j["sub"])
    print("subskills never matched:", [k for k in SUB_RE if subcnt[k] == 0])
    import collections
    print(len(jobs), "postings tagged;", postings.dropped, "exact reposts (same company, title and text) dropped")
    print("by family:", collections.Counter(j["family"] for j in jobs).most_common())
    print("by level:", collections.Counter(j["level"] for j in jobs).most_common())
    print("by group:", collections.Counter(j["group"] for j in jobs).most_common())
    cnt = collections.Counter(k for j in jobs for k in j["skills"])
    print("top skills:", [(k, round(v / len(jobs), 2)) for k, v in cnt.most_common(25)])
    print("never matched:", [sid for sid, _ in skills if cnt[sid] == 0])
    print("avg skills/job:", sum(len(j["skills"]) for j in jobs) / max(1, len(jobs)))


if __name__ == "__main__":
    main()
