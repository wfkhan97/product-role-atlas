"""Visa sponsorship as a posting fact (PLAN.md v16, step 8). Not a skill: `read(text)` gives "yes" when a posting says
the employer sponsors ("visa sponsorship is available", "will sponsor", "H-1B sponsorship"), "no" when it says it does
not ("unable to sponsor", "will not sponsor", "without sponsorship", "must be authorized to work without sponsorship"),
else None, which is most postings. The patterns are data in pipeline/sponsorship.json; the labelled examples in
evals/sponsorship.json are the spec (evals/run_pipeline.py --only sponsorship). A "no" wins over a "yes" in the same
posting: a posting that denies sponsorship in its own words and mentions it elsewhere says no."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "pipeline", "sponsorship.json")
VALUES = ("yes", "no", None)
_rx = None


def patterns():
    global _rx
    if _rx is None:
        with open(PATH) as f:
            d = json.load(f)
        _rx = {k: [re.compile(p, re.I) for p in d[k]] for k in ("no", "yes")}
    return _rx


def read(text):
    """"yes", "no" or None for a posting's text (the raw description; the cleaner may drop the legal block)."""
    if not text:
        return None
    t = re.sub(r"\s+", " ", str(text))
    rx = patterns()
    if any(p.search(t) for p in rx["no"]):
        return "no"
    if any(p.search(t) for p in rx["yes"]):
        return "yes"
    return None


def counts(jobs):
    """{"yes": n, "no": n, "silent": n} over postings that carry the field (a processed file older than the field
    counts every posting as silent)."""
    out = {"yes": 0, "no": 0, "silent": 0}
    for j in jobs:
        v = j.get("sponsorship")
        out["yes" if v == "yes" else "no" if v == "no" else "silent"] += 1
    return out
