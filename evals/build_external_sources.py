"""Build evals/external_sources.json from the search results in data/experiments/resume_sources_*.json.

    python3 evals/build_external_sources.py /path/to/data/experiments

Each entry gets an id and a `fetch` rule:
  script  - a sample published by a university, business school or professional body: fetch_external.mjs may fetch it
  manual  - a resume site: its terms limit use to personal or internal use, or forbid automated retrieval, or could
            not be read. Download by hand if wanted and save under the id in evals/resumes/external/
  page    - a web page whose text is the resume: open it and paste the text
  ask     - a university sample that is not confirmed as an invented person: the owner decides before any fetch
  no      - left out, with the reason
"""
import glob
import json
import os
import re
import sys

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
OPEN = {"university", "business school", "professional body", "government"}
# published as samples, but the file is, or may be, a real person's resume
LEFT_OUT = {
    "ubalt.edu": "an anonymised real student's resume, by the publisher's own description",
    "AlumniResumes": "in an alumni-resumes folder; may be adapted from a real alumnus",
    "pub.umn.edu": "real employers and an abbreviated name; may be an anonymised real resume",
    "kickresume.com/en/help-center/portfolio-manager-resume-sample": "the page says a real person who got hired contributed it",
}

# published as samples, but nothing on the page says the person is invented: the owner decides before any fetch
ASK = {
    "grad-business.media.uconn.edu": "the page calls it a sample; it does not say the person is invented",
    "sites/598/2025/07/Management-Sample-Resume": "the page calls it a sample; it does not say the person is invented",
    "zarbcar-mba-business-analytics-resume": "the page calls it a sample; it does not say the person is invented",
    "zarbcar-mba-marketing-resume.pdf": "the page calls it a sample; it does not say the person is invented",
    "zarbcar-mba-finance-resume": "found by its file name beside the other samples, with no listing page",
    "sites/232/2026/01/MBA-Sample": "the page calls it a sample; it does not say the person is invented",
    "management.buffalo.edu/content/dam/mgt/Career-Resources": "the page calls it a sample; it does not say the person is invented",
    "sandiego.edu/careers/documents/torero-career-guide": "the file was not opened to confirm a placeholder name",
}

rows = []
for p in sorted(glob.glob(os.path.join(SRC, "resume_sources_*.json"))):
    rows += json.load(open(p))
out, seen, n = [], set(), {}
for r in rows:
    key = (r["url"], r["role"])
    if key in seen:
        continue
    seen.add(key)
    slug = re.sub(r"[^a-z0-9]+", "", r["source"].lower().split(",")[0].split("(")[0])[:14]
    base = f"{r['role']}_{slug}"
    n[base] = n.get(base, 0) + 1
    reason = next((why for k, why in LEFT_OUT.items() if k in r["url"]), None)
    ask = None if reason else next((why for k, why in ASK.items() if k in r["url"]), None)
    if reason:
        fetch = "no"
    elif ask:
        fetch, reason = "ask", ask
    elif r["file_type"] == "html":
        fetch = "page"
    elif r["source_kind"] in OPEN:
        fetch = "script"
    else:
        fetch = "manual"
    out.append({"id": f"{base}_{n[base]}", "role": r["role"], "title": r["title_on_resume"], "url": r["url"], "file_type": r["file_type"],
                "source": r["source"], "source_kind": r["source_kind"], "fictional": r["fictional"], "seniority": r.get("seniority", "unknown"),
                "fetch": fetch, **({"left_out": reason} if reason else {}), "terms": r.get("terms", ""), "layout_note": r.get("layout", "")})
out.sort(key=lambda e: (e["role"], e["id"]))
with open(os.path.join(HERE, "external_sources.json"), "w") as f:
    f.write(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
by = {}
for e in out:
    by[e["fetch"]] = by.get(e["fetch"], 0) + 1
print(len(out), "entries;", by)
