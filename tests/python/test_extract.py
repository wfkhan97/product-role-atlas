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
