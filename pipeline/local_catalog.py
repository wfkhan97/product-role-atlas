"""A local copy of the Spring 2027 catalog for the test switch (web/config.js, CATALOG_OPEN): the rows the catalog
database holds, built by the course catalog's own loader in its dry-run mode, written to web/data/local/catalog.json
(gitignored; this machine only). The picker reads it when CATALOG_OPEN is on and the database returns nothing, which is
the state before the anon-read policy (pipeline/sql/2026-10-28_open_read.sql) is applied. Nothing is uploaded.

  python3 pipeline/local_catalog.py [path to SP27_cornell_tech]      # default: ../GradBuddy Project/discovery&research/course_catalog/SP27_cornell_tech
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "GradBuddy Project", "discovery&research", "course_catalog", "SP27_cornell_tech")
loader = os.path.join(SRC, "db", "load_to_supabase.py")
if not os.path.exists(loader): sys.exit(f"no loader at {loader}")
# run the loader's build step as it runs under --dry-run, and keep its table rows instead of its exit
class Done(Exception): pass
sys.argv = [loader, "--dry-run"]; sys.exit = lambda *a: (_ for _ in ()).throw(Done())
ns = {"__file__": loader, "__name__": "__main__"}
try: exec(compile(open(loader).read(), loader, "exec"), ns)
except Done: pass
T = ns["T"]
# only the columns the page selects (web/catalog.js CLASS_COLS and PROF_COLS); research_note_md and syllabi never leave the loader
CLASS = "code,subject,catalog_nbr,title,career,description,outcomes,prereq,credits,grading_basis,location_scope,eligibility_category,enrollment_limited_to,also_in_ithaca,roster_url,roster_syllabus_read,sp27_instructor_matches_syllabus,grading_summary,roster_syllabus_md,last_scraped".split(",")
PROF = "slug,name,identity,title,affiliation,expertise,official_profile_url,personal_site_url,scholar_url,linkedin_url,profile_md".split(",")
pick = lambda rows, cols: [{k: r.get(k) for k in cols} for r in rows]
out = {
    "note": "A local copy of the catalog database for CATALOG_OPEN (pipeline/local_catalog.py); gitignored; never uploaded.",
    "classes": sorted(pick(T["classes"], CLASS), key=lambda r: r["code"]),
    "crosslists": pick(T["class_crosslists"], ["code", "other_code"]),
    "sections": sorted(pick(T["sections"], "class_nbr,class_code,component,section,location,instruction_mode,topic,open_status,start_dt,end_dt,session,credits,notes".split(",")), key=lambda r: r["class_nbr"]),
    "meetings": [{"id": i + 1, **{k: m.get(k) for k in ["class_nbr", "pattern", "time_start", "time_end", "facility"]}} for i, m in enumerate(T["meetings"])],
    "instructors": pick(T["class_instructors"], ["class_code", "instructor_name", "professor_slug", "term"]),
    "priors": pick(T["prior_offerings"], ["class_code", "term", "title", "instructors", "locations", "sections"]),
    "rosterDate": max((r["scraped_on"] for r in T["rescrape_log"]), default=None),
    "professors": pick(T["professors"], PROF),
}
dst = os.path.join(ROOT, "web", "data", "local", "catalog.json")
json.dump(out, open(dst, "w"), ensure_ascii=False)
print("wrote", os.path.relpath(dst, ROOT), {k: len(v) for k, v in out.items() if isinstance(v, list)}, "roster", out["rosterDate"])
