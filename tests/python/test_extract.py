"""pipeline/extract.py: the cleaner, the apostrophe normaliser, the years-of-experience reader and the tagger.

The tagging tests load the real pipeline/taxonomy.json (through extract.skills_for), because the rule under test is
a pattern of that file: the four context fixes of PR #49, one regression test each.
"""
import pytest

from pipeline import extract as E

MBA = E.skills_for("mba")  # the MBA role set's part of pipeline/taxonomy.json; the degree and context skills are shared


def tags(text):
    """What the pipeline tags: the text is normalised first (extract.tag_posting does the same)."""
    return set(E.tag(E.norm(text), MBA))


# ---------- clean ----------
EEO = "We are an equal opportunity employer and do not discriminate on the basis of race or religion."
BENEFITS = "We offer a competitive benefits package including 401(k), dental and vision coverage for all staff."
ABOUT_GENERIC = "We are a leading global provider of widgets with 10,000 employees in forty countries."
ABOUT_FOUNDED = "Founded in 1998, the firm advises clients from offices in twelve cities on three continents."
ABOUT_NAMED = "Acme provides software to banks across the world and keeps growing every year."
ASK = "You will build financial models and present them to the CFO every month."


def test_clean_drops_boilerplate_lines_and_keeps_the_asks():
    out = E.clean("\n".join([ASK, EEO, BENEFITS, "Requirements:"]), None)
    assert out == ASK + "\nRequirements:"


def test_clean_drops_the_employer_describing_itself_only_when_the_company_is_known():
    assert E.clean(ABOUT_GENERIC, None) == "", "the generic self-description pattern needs no company name"
    assert E.clean(ABOUT_FOUNDED, None) == ""
    assert E.clean(ABOUT_NAMED, "Acme Corp") == "", "the first word of the registry name is enough"
    assert E.clean("Acme Corp is a leading provider of widgets to the banks of forty countries.", "Acme Corp") == ""
    assert E.clean(ABOUT_NAMED, None) == ABOUT_NAMED, "with no company name a line that only names one is kept"


def test_clean_keeps_short_lines_whatever_they_say():
    assert E.clean("401(k) match\nAbout us", None) == "401(k) match\nAbout us", "a heading of 40 characters or less is not a boilerplate paragraph"


def test_clean_is_idempotent():
    text = "\n".join([ASK, EEO, ABOUT_NAMED, "Lead the monthly close with the controller and the FP&A team across three regions."])
    once = E.clean(text, "Acme Corp")
    assert E.clean(once, "Acme Corp") == once


def test_clean_of_nothing_is_an_empty_string():
    assert E.clean("", None) == ""
    assert E.clean(None, "Acme Corp") == ""


def test_clean_splits_a_long_line_into_sentences_only_when_asked():
    sentence = "You own the annual budget and the quarterly forecast for three business units in the region."
    long_line = " ".join([sentence] * 8 + [EEO])
    assert len(long_line) > E.LONG_LINE
    assert E.clean(long_line, None) == "", "the product set: one boilerplate phrase removes the whole one-line posting"
    kept = E.clean(long_line, None, split_long=True).split("\n")
    assert kept == [sentence] * 8, "the MBA set: cut into sentences first, so only the boilerplate sentence goes"


def test_clean_reads_curly_apostrophes_in_boilerplate():
    line = "We’re an equal opportunity employer and don’t discriminate on the basis of race or religion."
    assert E.clean(line, None) == "", "the boilerplate pattern is spelt with a straight apostrophe; the line is normalised for matching"


# ---------- norm and the degree patterns ----------
def test_norm_turns_typographic_apostrophes_into_straight_ones_at_the_same_length():
    assert E.norm("Master’s ‘quoted’ ʼ") == "Master's 'quoted' '"
    assert len(E.norm("Master’s degree")) == len("Master’s degree"), "offsets hold, so an evidence sentence still matches its posting"


def test_curly_masters_is_a_masters_not_a_bachelors():
    assert tags("Master’s degree in Computer Science") & {"masters_mba", "bachelors"} == {"masters_mba"}
    assert tags("Master's degree in Computer Science") & {"masters_mba", "bachelors"} == {"masters_mba"}


def test_bachelors_with_either_apostrophe_is_a_bachelors():
    assert "bachelors" in tags("Bachelor's degree required")
    assert "bachelors" in tags("Bachelor’s degree required")


def test_ms_office_is_not_a_masters_degree():
    assert "masters_mba" not in tags("Proficient in MS Office and MS Excel")
    assert "masters_mba" in tags("MS degree in Economics")


# ---------- years_required ----------
@pytest.mark.parametrize("text, years", [
    ("3+ years of experience", 3),
    ("minimum of 5 yrs in finance", 5),
    ("3 to 5 years", 3),
    ("3-5 years", 3),
    ("2 – 4 yrs", 2),
    ("10+ years", 10),
    ("ten years", 10),
    ("Five+ years", 5),
    ("Requires 7 years in finance and 2 years leading teams", 2),
    ("No experience asked here", None),
    ("30 years of history", None),
    ("", None),
])
def test_years_required_is_the_smallest_explicit_ask_between_1_and_25(text, years):
    assert E.years_required(text) == years


def test_years_required_reads_a_range_in_words_like_a_range_in_digits():
    assert E.years_required("three to five years") == 3
    assert E.years_required("Two - four yrs") == 2
    assert E.years_required("ten+ years") == 10


# ---------- the tagger: the four context fixes of PR #49 ----------
def test_tag_counts_hits_per_skill():
    assert E.tag("MBA or master's degree; MBA preferred", MBA)["masters_mba"] == 3


def test_apis_is_not_tagged_on_merger_integration():
    assert "apis" not in tags("M&A, integration, separation")
    assert "apis" not in tags("integration of acquired companies")
    assert "apis" in tags("REST API integrations")


def test_genai_is_not_tagged_on_an_enrolled_agent():
    assert "genai_llm" not in tags("Enrolled Agent (EA) license")
    assert "genai_llm" in tags("LLM agents")


def test_ownership_is_not_tagged_on_entrepreneurs_as_people():
    assert "ownership" not in tags("relationships with entrepreneurs, investors")
    assert "ownership" in tags("entrepreneurial mindset")


# ---------- postings: one requisition in two raw files ----------
DESC = ("You will own the roadmap for the network switching product line and work with engineering, sales and "
        "operations. You will build the business case for each release, present it to leadership and track the "
        "results. Five years of program management experience in hardware, an MBA preferred, strong SQL and Excel.")


def test_postings_keeps_the_row_seen_last_when_two_raw_files_hold_one_requisition(tmp_path, monkeypatch):
    """Supermicro retitled requisition 1383975400. The product cache, scraped on 10-09 and read as it is, still says
    Product Manager; the MBA backlog saw Sr. Program Manager on 10-18. One posting, the one seen last."""
    import json
    from pipeline import scrape
    for folder, title, scraped, seen in (("jobs", "Product Manager", "2026-10-09T18:34:51", None),
                                         ("jobs_mba", "Sr. Program Manager - Network Switching", "2026-10-18T22:00:09", "2026-10-18")):
        d = tmp_path / "data" / "raw" / folder
        d.mkdir(parents=True)
        job = {"title": title, "url": f"https://jobs.example.com/job/{title.replace(' ', '-')}/1383975400/", "external_id": "1383975400",
               "location": "San Jose, California", "description": DESC, "first_seen": seen, "last_seen": seen}
        (d / "acme.json").write_text(json.dumps({"company": "Acme", "scraped_at": scraped, "jobs": [job]}))
    monkeypatch.setattr(E, "ROOT", str(tmp_path))
    monkeypatch.setattr(scrape, "load_registry", lambda roles_name="product": [{"company": "Acme", "ats": "successfactors", "group": "fortune250"}])
    rows = list(E.postings("mba"))
    assert [(j["title"], j.get("last_seen")) for _, _, j, _, _ in rows] == [("Sr. Program Manager - Network Switching", "2026-10-18")]


def test_a_cached_text_tags_the_same_as_a_fresh_one(tmp_path):
    """E.TextCache: a posting tagged from its cache entry gives the same row and evidence as one tagged fresh,
    and a cache file with another fingerprint is not read."""
    import json as _json
    cleaned = ("You will own the roadmap and run A/B tests with SQL. Build financial models in Excel and present to the "
               "board. 5+ years of product management experience required. Stakeholder management across teams.")
    j = {"title": "Senior Product Manager", "description": cleaned, "url": "https://x/1", "external_id": "1",
         "location": "New York, NY", "first_seen": "2026-10-01", "last_seen": "2026-10-28"}
    r = {"group": "g", "industry": "Software"}
    fresh = E.tag_posting(("mba", "Acme", r, j, "product", cleaned, None))
    assert fresh[3] is not None and fresh[3]["marks"], "a fresh tag returns its text_tags for the cache"
    cached = E.tag_posting(("mba", "Acme", r, j, "product", cleaned, _json.loads(_json.dumps(fresh[3]))))
    assert cached[:3] == fresh[:3] and cached[3] is None
    c = E.TextCache("mba", path=str(tmp_path / "c.json.gz"))
    c.entries["k"] = fresh[3]
    c.save(["k"])
    assert E.TextCache("mba", path=str(tmp_path / "c.json.gz")).entries == {"k": fresh[3]}
    c.fingerprint = "another"
    c.save(["k"])
    assert E.TextCache("mba", path=str(tmp_path / "c.json.gz")).entries == {}


def test_the_text_cache_survives_a_change_made_for_another_role_set(tmp_path, monkeypatch):
    """The fingerprint reads the role set's own part of the taxonomy: a skill added for the tech set, or a tech wording of a
    shared skill, leaves the MBA cache valid; a skill the MBA set reads does not."""
    path = str(tmp_path / "c.json.gz")
    before = E.TextCache("mba", path=path).fingerprint
    tech_only = {"id": "zz_tech", "name": "x", "cluster": "engineering", "kind": "technical", "patterns": ["zzz"], "only": ["tech"]}
    worded = [dict(s, patterns_for={**s.get("patterns_for", {}), "tech": ["zzz"]}) if s["id"] == "sql" else s for s in E.TAX["skills"]]
    monkeypatch.setattr(E, "TAX", {**E.TAX, "skills": worded + [tech_only]})
    assert E.TextCache("mba", path=path).fingerprint == before
    monkeypatch.setattr(E, "TAX", {**E.TAX, "skills": worded + [dict(tech_only, only=["mba"])]})
    assert E.TextCache("mba", path=path).fingerprint != before
