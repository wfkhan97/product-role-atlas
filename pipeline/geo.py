"""Country of a posting from its location text, for role sets that show one country only.

`extract.geo` is the reader the product map was built with. It stays as it is so the product map does not move.
This reader starts from the same tables and fixes what evals/countries.json showed: "US - Remote" was unplaced,
a state abbreviation anywhere in the string made a posting American ("PARIS LA DÉFENSE", "DE - Munich,
Germany", "ID, Dki Jakarta"), country codes were not read ("Bristol, gb", "TW-Taichung"), and a list of sites
took the first country named. Rules, in order, for each site of a list (split on ; / |):

1. "US", "USA", "U.S." or "United States" -> United States.
2. A country named in full.
3. A US state after the city (", TX", " - TX", "TX 75201"), a state name, a site code ("VA0883-Leesburg").
4. A known city; a country code at the start or the end ("DE - ", ", cn", " - RO").
5. A region (EMEA, APAC, LATAM), else "Other / unspecified".

A posting open at any US site is a US posting, whatever other sites it lists. Other lists get a country only
when every placed site agrees. A SuccessFactors posting has no location field; its URL starts with the city
("/job/Dallas%2C-TX-..."), so the location is read from there.
"""
import re
from urllib.parse import unquote

from pipeline import extract

US = "United States"
OTHER = "Other / unspecified"
REGIONS = {"Latin America", "Europe (EMEA)", "Asia-Pacific (APAC)"}
US_RE = re.compile(r"(?<![A-Za-z])(U\.S\.A?\.?|USA|US)(?![A-Za-z])|united states", re.I)
US_RE_CS = re.compile(r"(?<![A-Za-z.])(U\.S\.A?\.?|USA|US)(?![A-Za-z])|[Uu]nited [Ss]tates")
ST = "|".join(sorted(extract.US_STATES))
# a state abbreviation counts where an address puts it: after the city, before a ZIP code or the end
STATE_RE = re.compile(rf",\s*({ST})\b|(?:\s-\s*|-|\s)({ST})(?:\s+\d{{5}}(?:-\d{{4}})?)?\s*(?=$|[,;()/]|\s-\s|-\d|\s+\d{{5}}\b)")
SITE_CODE_RE = re.compile(rf"^({ST})\d{{3,}}\b")
ZIP_RE = re.compile(r"\b[A-Z][a-z]+,\s+\d{5}\b")  # "379 Interpace Pkwy, Parsippany, 07054"
COUNTRY_NAMES = {
    "viet nam": "Vietnam", "türkiye": "Turkey", "turkiye": "Turkey", "bulgaria": "Bulgaria", "kazakhstan": "Kazakhstan",
    "qatar": "Qatar", "morocco": "Morocco", "dominican republic": "Dominican Republic", "guatemala": "Guatemala",
    "rwanda": "Rwanda", "puerto rico": "Puerto Rico", "croatia": "Croatia", "slovakia": "Slovakia", "slovenia": "Slovenia",
    "latvia": "Latvia", "iceland": "Iceland", "cyprus": "Cyprus", "malta": "Malta", "pakistan": "Pakistan",
    "bangladesh": "Bangladesh", "sri lanka": "Sri Lanka", "nepal": "Nepal", "cambodia": "Cambodia", "panama": "Panama",
    "ecuador": "Ecuador", "uruguay": "Uruguay", "paraguay": "Paraguay", "bolivia": "Bolivia", "venezuela": "Venezuela",
    "honduras": "Honduras", "el salvador": "El Salvador", "jamaica": "Jamaica", "trinidad": "Trinidad and Tobago",
    "ghana": "Ghana", "ethiopia": "Ethiopia", "tanzania": "Tanzania", "uganda": "Uganda", "senegal": "Senegal",
    "tunisia": "Tunisia", "algeria": "Algeria", "jordan": "Jordan", "lebanon": "Lebanon", "kuwait": "Kuwait",
    "bahrain": "Bahrain", "oman": "Oman", "iraq": "Iraq", "azerbaijan": "Azerbaijan", "armenia": "Armenia",
    "uzbekistan": "Uzbekistan", "mongolia": "Mongolia", "macau": "Macau", "myanmar": "Myanmar", "russia": "Russia",
    "belarus": "Belarus", "moldova": "Moldova", "bosnia": "Bosnia and Herzegovina", "north macedonia": "North Macedonia",
    "albania": "Albania", "montenegro": "Montenegro", "kosovo": "Kosovo", "scotland": "United Kingdom", "cardiff": "United Kingdom",
    "northern ireland": "United Kingdom", "great britain": "United Kingdom", "republic of korea": "South Korea",
    "the netherlands": "Netherlands", "czechia": "Czech Republic", "hong kong sar": "Hong Kong",
}
CITIES = {
    "new delhi": "India", "delhi": "India", "kolkata": "India", "ahmedabad": "India", "gurgaon": "India", "gurugram": "India",
    "buenos aires": "Argentina", "taguig": "Philippines", "makati": "Philippines", "cebu": "Philippines", "quezon": "Philippines",
    "bucharest": "Romania", "cluj": "Romania", "minato": "Japan", "osaka": "Japan", "yokohama": "Japan", "auckland": "New Zealand",
    "wellington": "New Zealand", "manawatu": "New Zealand", "frankfurt": "Germany", "cologne": "Germany", "hamburg": "Germany",
    "düsseldorf": "Germany", "dusseldorf": "Germany", "stuttgart": "Germany", "billund": "Denmark", "istanbul": "Turkey",
    "ankara": "Turkey", "sofia": "Bulgaria", "almaty": "Kazakhstan", "doha": "Qatar", "casablanca": "Morocco",
    "guadalajara": "Mexico", "monterrey": "Mexico", "mexico city": "Mexico", "ciudad de mexico": "Mexico", "tijuana": "Mexico",
    "perth": "Australia", "brisbane": "Australia", "adelaide": "Australia", "canberra": "Australia", "guangzhou": "China",
    "hangzhou": "China", "chengdu": "China", "suzhou": "China", "wuhan": "China", "nanjing": "China", "tianjin": "China",
    "xi'an": "China", "dalian": "China", "hsinchu": "Taiwan", "taichung": "Taiwan", "kaohsiung": "Taiwan",
    "edmonton": "Canada", "calgary": "Canada", "ottawa": "Canada", "mississauga": "Canada", "waterloo, on": "Canada",
    "ontario": "Canada", "alberta": "Canada", "british columbia": "Canada", "quebec": "Canada", "québec": "Canada",
    "manitoba": "Canada", "saskatchewan": "Canada", "nova scotia": "Canada", "manchester, uk": "United Kingdom",
    "edinburgh": "United Kingdom", "glasgow": "United Kingdom", "bristol": "United Kingdom", "leeds": "United Kingdom",
    "belfast": "United Kingdom", "reading, uk": "United Kingdom", "cork": "Ireland", "galway": "Ireland",
    "rotterdam": "Netherlands", "eindhoven": "Netherlands", "the hague": "Netherlands", "utrecht": "Netherlands",
    "lyon": "France", "toulouse": "France", "la défense": "France", "la defense": "France", "rome": "Italy", "turin": "Italy",
    "geneva": "Switzerland", "basel": "Switzerland", "lausanne": "Switzerland", "zug": "Switzerland", "vienna": "Austria",
    "budapest": "Hungary", "krakow": "Poland", "kraków": "Poland", "wroclaw": "Poland", "wrocław": "Poland", "gdansk": "Poland",
    "oslo": "Norway", "helsinki": "Finland", "gothenburg": "Sweden", "malmö": "Sweden", "athens": "Greece", "porto": "Portugal",
    "valencia, spain": "Spain", "bogota": "Colombia", "bogotá": "Colombia", "medellin": "Colombia", "medellín": "Colombia",
    "lima": "Peru", "santiago": "Chile", "rio de janeiro": "Brazil", "campinas": "Brazil", "curitiba": "Brazil",
    "riyadh": "Saudi Arabia", "jeddah": "Saudi Arabia", "cairo": "Egypt", "nairobi": "Kenya", "lagos": "Nigeria", "accra": "Ghana",
    "kuala lumpur": "Malaysia", "penang": "Malaysia", "batu kawan": "Malaysia", "putrajaya": "Malaysia", "ho chi minh": "Vietnam",
    "hanoi": "Vietnam", "phu quoc": "Vietnam", "karachi": "Pakistan", "lahore": "Pakistan", "dhaka": "Bangladesh",
    "colombo": "Sri Lanka", "kigali": "Rwanda", "santo domingo": "Dominican Republic", "san juan, puerto rico": "Puerto Rico",
    "tel-aviv": "Israel", "haifa": "Israel", "herzliya": "Israel", "tallinn": "Estonia", "vilnius": "Lithuania", "riga": "Latvia",
    "belgrade": "Serbia", "kyiv": "Ukraine", "zagreb": "Croatia", "bratislava": "Slovakia", "brno": "Czech Republic",
}
US_CITIES_MORE = [
    "tarrytown", "littleton", "parsippany", "schaumburg", "rockford", "leesburg", "coral gables", "katy", "lakewood ranch",
    "north orlando", "fort worth", "fort lauderdale", "baltimore", "cleveland", "buffalo", "rochester, ", "albany", "tulsa",
    "oklahoma city", "des moines", "boise", "tucson", "albuquerque", "el paso", "honolulu", "anchorage", "charleston",
    "greenville", "knoxville", "chattanooga", "lexington, ", "new orleans", "baton rouge", "little rock", "grand rapids",
    "long beach", "pasadena", "burbank", "glendale", "torrance", "carlsbad", "san ramon", "pleasanton", "walnut creek",
    "emeryville", "berkeley", "santa barbara", "thousand oaks", "woodland hills", "overland park", "bloomington",
    "cedar rapids", "fort wayne", "akron", "dayton", "toledo", "allentown", "king of prussia", "malvern", "conshohocken",
    "morristown", "florham park", "bridgewater", "whippany", "purchase, ", "white plains", "armonk", "greenwich", "norwalk",
    "new haven", "providence", "waltham", "burlington, ma", "framingham", "worcester", "bethesda", "rockville", "tysons",
    "herndon", "chantilly", "alexandria", "norfolk", "virginia beach", "winston-salem", "greensboro", "alpharetta",
    "sandy springs", "duluth, ga", "boca raton", "west palm beach", "st. petersburg", "clearwater", "irving", "richardson",
    "the woodlands", "sugar land", "fort collins", "colorado springs", "lehi", "provo", "reno", "henderson", "spokane",
    "tacoma", "kirkland", "everett", "beaverton", "hillsboro", "silicon valley", "manhattan", "midtown", "wall street",
]
ISO2 = {
    "us": US, "gb": "United Kingdom", "uk": "United Kingdom", "de": "Germany", "fr": "France", "in": "India", "cn": "China",
    "jp": "Japan", "sg": "Singapore", "au": "Australia", "ca": "Canada", "mx": "Mexico", "br": "Brazil", "es": "Spain",
    "it": "Italy", "nl": "Netherlands", "ie": "Ireland", "pl": "Poland", "ro": "Romania", "tw": "Taiwan", "kr": "South Korea",
    "my": "Malaysia", "id": "Indonesia", "ph": "Philippines", "th": "Thailand", "vn": "Vietnam", "hk": "Hong Kong",
    "ae": "United Arab Emirates", "sa": "Saudi Arabia", "il": "Israel", "ch": "Switzerland", "se": "Sweden", "be": "Belgium",
    "at": "Austria", "dk": "Denmark", "no": "Norway", "fi": "Finland", "pt": "Portugal", "cz": "Czech Republic",
    "hu": "Hungary", "tr": "Turkey", "za": "South Africa", "nz": "New Zealand", "ar": "Argentina", "co": "Colombia",
    "cl": "Chile", "pe": "Peru", "cr": "Costa Rica", "eg": "Egypt", "ng": "Nigeria", "ke": "Kenya", "bg": "Bulgaria",
    "gr": "Greece", "lu": "Luxembourg", "ma": "Morocco", "qa": "Qatar", "kz": "Kazakhstan",
}
# codes that are also US states are read as a country only in lower case (", in" India vs ", IN" Indiana) or at the start with a known foreign city after them
LEAD_CODE_RE = re.compile(r"^([A-Za-z]{2})\s*[-,:]\s*\S")
TAIL_CODE_RE = re.compile(r"(?:,\s*|\s-\s*)([A-Za-z]{2})$")
NAMES = {}
for _k, _v in extract.COUNTRIES.items():
    if len(_k) > 3 and _v not in REGIONS and _k not in ("usa", "u.s.", "united states"):
        NAMES[_k] = _v
_FULL = {v.lower(): v for v in extract.COUNTRIES.values() if v not in REGIONS and v != US}
_FULL.update(COUNTRY_NAMES)
_FULL.update({"korea": "South Korea", "czech": "Czech Republic", "saudi": "Saudi Arabia", "uae": "United Arab Emirates", "uk": "United Kingdom", "england": "United Kingdom"})
FULL_RE = re.compile(r"(?<![a-z])(" + "|".join(sorted(map(re.escape, _FULL), key=len, reverse=True)) + r")(?![a-z])", re.I)
_CITY = {k: v for k, v in NAMES.items() if k not in _FULL}
_CITY.update(CITIES)
CITY_RE = re.compile(r"(?<![a-z])(" + "|".join(sorted(map(re.escape, _CITY), key=len, reverse=True)) + r")(?![a-z])", re.I)
ISO3 = {k: v for k, v in extract.COUNTRIES.items() if len(k) == 3 and k.isalpha() and k not in ("usa", "uae")}
ISO3_RE = re.compile(r"(?:^|[\s,(-])(" + "|".join(k.upper() for k in ISO3) + r")(?=$|[\s,)-])")
REGION_RE = re.compile(r"\b(latam|emea|apac|europe|asia|north america|worldwide|global)\b", re.I)
REMOTE_RE = re.compile(r"\bremote\b|work from home|\bwfh\b|anywhere|distributed|\bvirtual\b", re.I)
SPLIT_RE = re.compile(r"\s*[;|]\s*|\s+/\s+|\s+or\s+")


def _site(s):
    """Country of one site, None when the text places nothing (bare "Remote", a building name)."""
    low = s.lower()
    if US_RE_CS.search(s) or re.search(r"\bnationwide\b", low):
        return US
    lead = LEAD_CODE_RE.search(s)
    lead_state = lead.group(1) if lead and lead.group(1) in extract.US_STATES else None
    foreign = CITY_RE.search(low)
    city_country = _CITY[foreign.group(1).lower()] if foreign else None
    m = FULL_RE.search(low)
    if m:
        named = _FULL[m.group(1).lower()]
        # "PA - Lebanon County" is Pennsylvania; "MA-Casablanca, Morocco" and "IN - Bengaluru, India" are not American
        if not (lead_state and ISO2.get(lead_state.lower()) != named):
            return named
    us_city = any(c in low for c in extract.US_CITIES) or any(c in low for c in US_CITIES_MORE)
    st = STATE_RE.search(s)
    if st and not (city_country and ISO2.get((st.group(1) or st.group(2)).lower()) == city_country):
        return US  # "Dublin, OH": the state after the city beats a city that also exists abroad; "Bangalore, IN" stays India
    if SITE_CODE_RE.search(s) or any(re.search(r"(?<![a-z])" + n + r"(?![a-z])", low) for n in extract.US_STATE_NAMES):
        return US
    lead, tail = LEAD_CODE_RE.search(s), TAIL_CODE_RE.search(s)
    for m in (tail, lead):
        if not m:
            continue
        code = m.group(1)
        c = ISO2.get(code.lower())
        if c == US:
            return US
        # an upper-case code that is also a state is a country only when a city of that country follows ("ID, Dki Jakarta")
        if c and (code.islower() or code.upper() not in extract.US_STATES or (foreign and _CITY[foreign.group(1).lower()] == c)):
            return c
    if lead_state and not (city_country and ISO2.get(lead_state.lower()) == city_country):
        return US  # "NY-Rochester-400-32015", "OH-Dublin-Cardinal Place"
    if foreign:
        return _CITY[foreign.group(1).lower()]
    m = ISO3_RE.search(s)
    if m:
        return ISO3[m.group(1).lower()]
    if us_city or ZIP_RE.search(s):
        return US
    return None


def from_url(url):
    """Location from a SuccessFactors posting URL: ".../job/Dallas%2C-TX-Senior-Consultant-TX-75201/123/"."""
    m = re.search(r"/job/([^/]+)/\d+/?$", url or "")
    if not m:
        return ""
    slug = unquote(m.group(1)).replace("&amp;", "&")
    m2 = re.match(rf"([A-Za-z.' ]+?(?:-[A-Za-z.']+){{0,3}}?),?-({ST})-", slug)
    if m2:
        return f"{m2.group(1).replace('-', ' ')}, {m2.group(2)}"
    m3 = re.search(rf"-({ST})-(\d{{5}})$", slug)
    if m3:
        return f"{m3.group(1)} {m3.group(2)}, United States"
    spaced = slug.replace("-", " ").lower()
    for rx, table in ((FULL_RE, _FULL), (CITY_RE, _CITY)):
        m4 = rx.match(spaced)
        if m4:
            return f"{m4.group(1).title()}, {table[m4.group(1)]}"
    for c in extract.US_CITIES + US_CITIES_MORE:
        if spaced.startswith(c.strip(", ") + " "):
            return c.strip(", ").title() + ", United States"
    return slug.split("-")[0]  # the first word: enough for "Gurugram-...", "London-..."; a bare first word of a US city is left unplaced


def country(location, title="", url=None, ats=None):
    """(country, remote, location as read). country is None when the posting gives no location at all."""
    loc = (location or "").strip()
    if not loc and ats == "successfactors":
        loc = from_url(url)
    remote = bool(REMOTE_RE.search(loc + " " + (title or "")))
    if not loc or re.fullmatch(r"(unavailable[,\s]*)+", loc, re.I):
        return (None if not loc else OTHER, remote, loc)
    found = [c for c in (_site(p) for p in SPLIT_RE.split(loc) if p.strip()) if c]
    if not found:
        whole = _site(loc)
        found = [whole] if whole else []
    if US in found:
        return (US, remote, loc)
    if found and all(c == found[0] for c in found):
        return (found[0], remote, loc)
    if not found:
        m = REGION_RE.search(loc)
        if m and m.group(1).lower() in extract.COUNTRIES:
            return (extract.COUNTRIES[m.group(1).lower()], remote, loc)
    return (OTHER, remote, loc)
