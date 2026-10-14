"""The processed posting files (data/processed/jobs<_roles>.json), read and written through one door.

A file above GZIP_ABOVE bytes of JSON is stored as `.json.gz` (git keeps it, GitHub refuses a file over 100 MB:
the MBA file passed that with the sub-skill tags). `load` reads whichever of the two exists; `dump` writes the one
the size calls for and removes the other, so a checkout never holds both.
"""
import gzip
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "data", "processed")
GZIP_ABOVE = 50_000_000


def name(roleset):
    return "jobs.json" if roleset == "product" else f"jobs_{roleset}.json"


def path(roleset):
    """The path that exists for this role set (the plain file, else the gzipped one), or the plain path when neither does."""
    plain = os.path.join(DIR, name(roleset))
    return plain if os.path.exists(plain) or not os.path.exists(plain + ".gz") else plain + ".gz"


def load(roleset):
    p = path(roleset)
    if p.endswith(".gz"):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(p) as f:
        return json.load(f)


def dump(roleset, jobs):
    """Writes the file and returns its path."""
    plain = os.path.join(DIR, name(roleset))
    text = json.dumps(jobs)
    big = len(text) > GZIP_ABOVE
    out = plain + ".gz" if big else plain
    other = plain if big else plain + ".gz"
    os.makedirs(DIR, exist_ok=True)
    if big:
        with gzip.open(out, "wt", encoding="utf-8", compresslevel=6) as f:
            f.write(text)
    else:
        with open(out, "w") as f:
            f.write(text)
    if os.path.exists(other):
        os.remove(other)
    return out
