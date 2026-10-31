"""The Spring 2027 catalog as two files, built by the course catalog's own loader in its dry-run mode (PLAN.md v19,
step B3: the picker reads a public file, and sign-in goes away). Nothing is uploaded and nothing is fetched.

  web/data/catalog/cornell_tech.json   public, committed: the rows the picker reads. Never holds roster_syllabus_md
                                       (the prior-term syllabus digest, matcher input only) or research_note_md.
  web/data/local/catalog_full.json     gitignored, this machine only: the same rows plus roster_syllabus_md per class,
                                       the input of pipeline/catalog_tags.mjs (the per-code skill tags).

  .venv/bin/python -m pipeline.catalog_export [path to SP27_cornell_tech]
      default: ../GradBuddy Project/discovery&research/course_catalog/SP27_cornell_tech, else the same under the home folder
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
# the research folder beside the repository; a worktree sits deeper, so the home folder is the second place looked
RESEARCH = ("GradBuddy Project", "discovery&research", "course_catalog", "SP27_cornell_tech")
CANDIDATES = [os.path.join(ROOT, "..", *RESEARCH), os.path.join(os.path.expanduser("~"), *RESEARCH)]
DEFAULT_SRC = next((p for p in CANDIDATES if os.path.isdir(p)), CANDIDATES[0])
PUBLIC = os.path.join(ROOT, "web", "data", "catalog", "cornell_tech.json")
FULL = os.path.join(ROOT, "web", "data", "local", "catalog_full.json")
CAMPUS, TERM = "cornell_tech", "SP27"
MAX_PUBLIC_BYTES = 2_000_000

# the columns the picker selects (web/catalog.js CLASS_COLS and PROF_COLS), without the two that never leave the loader
HIDDEN = ("roster_syllabus_md", "research_note_md")
CLASS = "code,subject,catalog_nbr,title,career,description,outcomes,prereq,credits,grading_basis,location_scope,eligibility_category,enrollment_limited_to,also_in_ithaca,roster_url,roster_syllabus_read,sp27_instructor_matches_syllabus,grading_summary,last_scraped".split(",")
PROF = "slug,name,identity,title,affiliation,expertise,official_profile_url,personal_site_url,scholar_url,linkedin_url,profile_md".split(",")
SECTION = "class_nbr,class_code,component,section,location,instruction_mode,topic,open_status,start_dt,end_dt,session,credits,notes".split(",")
MEETING = ["class_nbr", "pattern", "time_start", "time_end", "facility"]
INSTRUCTOR = ["class_code", "instructor_name", "professor_slug", "term"]
PRIOR = ["class_code", "term", "title", "instructors", "locations", "sections"]


class Done(Exception):
    pass


def load_tables(src):
    """Run the loader's build step as it runs under --dry-run and return its table rows instead of its exit."""
    loader = os.path.join(src, "db", "load_to_supabase.py")
    if not os.path.exists(loader):
        sys.exit(f"no loader at {loader}")
    argv, exit_ = sys.argv, sys.exit
    sys.argv = [loader, "--dry-run"]
    sys.exit = lambda *a: (_ for _ in ()).throw(Done())
    ns = {"__file__": loader, "__name__": "__main__"}
    try:
        exec(compile(open(loader).read(), loader, "exec"), ns)
    except Done:
        pass
    finally:
        sys.argv, sys.exit = argv, exit_
    return ns["T"]


def pick(rows, cols):
    return [{k: r.get(k) for k in cols} for r in rows]


def build(T):
    """The public shape; the full file adds roster_syllabus_md to each class."""
    return {
        "_note": "The Spring 2027 Cornell Tech catalog as the class picker reads it (pipeline/catalog_export.py). Public: no syllabus digest, no research note.",
        "campus": CAMPUS,
        "term": TERM,
        "generated": datetime.date.today().isoformat(),
        "rosterDate": max((r["scraped_on"] for r in T["rescrape_log"]), default=None),
        "classes": sorted(pick(T["classes"], CLASS), key=lambda r: r["code"]),
        "crosslists": sorted(pick(T["class_crosslists"], ["code", "other_code"]), key=lambda r: (r["code"], r["other_code"])),
        "sections": sorted(pick(T["sections"], SECTION), key=lambda r: r["class_nbr"]),
        "meetings": [{"id": i + 1, **{k: m.get(k) for k in MEETING}} for i, m in enumerate(T["meetings"])],
        "instructors": sorted(pick(T["class_instructors"], INSTRUCTOR), key=lambda r: (r["class_code"], r["instructor_name"])),
        "priors": sorted(pick(T["prior_offerings"], PRIOR), key=lambda r: (r["class_code"], r["term"])),
        "professors": sorted(pick(T["professors"], PROF), key=lambda r: r["slug"]),
    }


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    T = load_tables(src)
    public = build(T)
    for c in public["classes"]:
        assert not any(k in c for k in HIDDEN), f"{c['code']} carries a hidden column"
    digest = {c["code"]: c.get("roster_syllabus_md") for c in T["classes"]}
    full = dict(public, _note="The public catalog plus roster_syllabus_md per class, for pipeline/catalog_tags.mjs. Gitignored; this machine only.",
                classes=[dict(c, roster_syllabus_md=digest[c["code"]]) for c in public["classes"]])

    os.makedirs(os.path.dirname(PUBLIC), exist_ok=True); os.makedirs(os.path.dirname(FULL), exist_ok=True)
    text = json.dumps(public, ensure_ascii=False, separators=(",", ":"))
    assert "roster_syllabus_md" not in text and "research_note" not in text, "a hidden column reached the public text"
    size = len(text.encode("utf-8"))
    assert size < MAX_PUBLIC_BYTES, f"public file is {size} bytes, over {MAX_PUBLIC_BYTES}"
    with open(PUBLIC, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    with open(FULL, "w", encoding="utf-8") as f:
        json.dump(full, f, ensure_ascii=False, separators=(",", ":"))
    counts = {k: len(v) for k, v in public.items() if isinstance(v, list)}
    print("wrote", os.path.relpath(PUBLIC, ROOT), f"{size} bytes", counts, "roster", public["rosterDate"])
    print("wrote", os.path.relpath(FULL, ROOT), "with roster_syllabus_md for", sum(1 for v in digest.values() if v), "classes")


if __name__ == "__main__":
    main()
