"""Shared helper: pull the JobPosting JSON-LD block out of a job page."""
import json
import re

LD_RE = re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', re.S)


def job_posting(html):
    for m in LD_RE.finditer(html):
        raw = m.group(1).strip()
        try:
            d = json.loads(raw)
        except ValueError:
            try:
                d = json.loads(raw.replace("\n", " "))
            except ValueError:
                continue
        for c in (d if isinstance(d, list) else [d]):
            if isinstance(c, dict) and c.get("@type") == "JobPosting":
                return c
            if isinstance(c, dict) and isinstance(c.get("@graph"), list):
                for g in c["@graph"]:
                    if isinstance(g, dict) and g.get("@type") == "JobPosting":
                        return g
    return None


def location(p):
    loc = p.get("jobLocation") or {}
    if isinstance(loc, list):
        loc = loc[0] if loc else {}
    addr = loc.get("address", {}) if isinstance(loc, dict) else {}
    if not isinstance(addr, dict):
        return ""
    return ", ".join(x for x in [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")] if isinstance(x, str) and x)
