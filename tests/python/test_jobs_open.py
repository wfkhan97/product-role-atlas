"""The flag bits of a Find jobs row (pipeline.jobs_open.flags_of): one bit per set, each set's entry marks, and the
title's own new-graduate mark with the start year it names (grad_title, start_of)."""
import pytest

from pipeline import jobs_open as J

F = J.FLAGS


def test_the_tech_set_has_its_own_bit_and_never_the_mba_bit():
    f = J.flags_of("tech", {})
    assert f == F["tech"]
    assert not f & F["mba"]


def test_a_tech_posting_for_new_graduates_carries_the_grad_bit():
    assert J.flags_of("tech", {"entry": "grad", "intern": True}) == F["tech"] | F["entry_grad"] | F["intern"]


def test_the_grad_mark_is_the_tech_sets_alone_and_the_mba_marks_are_the_mba_sets():
    assert J.flags_of("mba", {"entry": "grad"}) == F["mba"]
    assert J.flags_of("tech", {"entry": "mba"}) == F["tech"]
    assert J.flags_of("product", {"entry": "pre_mba"}) == 0
    assert J.flags_of("mba", {"entry": "pre_mba"}) == F["mba"] | F["entry_pre_mba"]


def test_the_shared_bits_read_the_same_on_a_tech_posting():
    j = {"remote": True, "sponsorship": "no"}
    assert J.flags_of("tech", j, clearance=True) == F["tech"] | F["remote"] | F["sponsor_no"] | F["clearance"]


def test_the_bits_are_distinct_powers_of_two():
    bits = list(F.values())
    assert len(set(bits)) == len(bits)
    assert all(b > 0 and b & (b - 1) == 0 for b in bits)


# the title shapes the mark reads, one per form of GRAD_TITLE, from real postings
@pytest.mark.parametrize("title", [
    "Associate Product Manager, New Grad (2027 Start)",
    "Software Engineer, Backend New Graduate",
    "New Grads: Analyst",
    "Associate Finance Analyst, University Graduate",
    "Customer Success, University Hire",
    "Associate Software Engineer (College Grad 2027)",
    "Financial Analyst I (Early Career)",
    "Early-Career Product Designer",
    "Analyst - Campus Hire",
    "Business Analyst, Campus Program",
    "Associate Brand Manager - Campus Recruiting",
    "Senior Consultant - Life Sciences Advisory, Health Segment - Campus 2027",
    "Banking Associate Graduate Program 2027 San Francisco",
    "UK Corporate Banking Graduate Programme 2027 Birmingham",
    "Graduate Scheme - Finance",
    "Graduate Hire, Operations",
    "Graduate Trainee - Supply Chain",
    "Field Applications Engineer (Graduate Rotational Program)",
    "Brex Rotational Program",
    "Investment Banking Analyst, Class of 2027",
    "2027 MBA University Graduate – Product Manager",
    "Venture Banking Credit Analyst (Summer 2027 Start)",
    "IT Project & Product Manager (2027 Grads)",
    "(2027 Bachelor's/Master's graduates) Economics Consulting Analyst/Associate",
    "Forward Deployed Engineer - New Grad (2027)",
])
def test_a_title_for_new_graduates_carries_the_mark_in_every_set(title):
    assert J.grad_title(title)
    for set_ in ("product", "mba", "tech"):
        assert J.flags_of(set_, {"title": title}) & F["grad_title"]


# "campus" and "university" alone name a place or a product, and a year alone says nothing of a start
@pytest.mark.parametrize("title", [
    "Director of Product and Solutions Marketing, Campus and Branch",
    "Staff Inbound Product Manager - ServiceNow University",
    "Senior Consultant, Strategic Relationship Management - Deloitte University",
    "Product Manager Technical (PMT) - 2027",
    "Graduate Student Researcher",
    "Product Manager, Acquisitions - May 2026",
    "Senior Product Manager, Graduate Admissions",
])
def test_a_title_that_only_names_a_campus_a_university_or_a_year_has_no_mark(title):
    assert not J.grad_title(title)
    assert not J.flags_of("product", {"title": title}) & F["grad_title"]


# a title can name graduates and still be an internship or a recruiter's job
@pytest.mark.parametrize("title", [
    "2027 MBA Intern – Product Manager",
    "Summer 2027: MBA Product Marketing Intern, Payments",
    "Head of Early Career Recruiting",
    "University Recruiter (Early Career)",
    "Sr Director, Program Management - Early Career & Rotational Programming",
])
def test_an_internship_or_a_recruiters_title_has_no_mark(title):
    assert not J.grad_title(title)


def test_the_intern_flag_wins_over_the_title():
    j = {"title": "Software Engineer - New Grad (2027 Start)", "intern": True}
    f = J.flags_of("tech", j)
    assert f & F["intern"] and not f & F["grad_title"]
    assert J.start_of(j["title"], f) is None


@pytest.mark.parametrize("title, year", [
    ("Associate Product Manager, New Grad (2027 Start)", 2027),
    ("2027 MBA University Graduate – Product Manager", 2027),
    ("Forward Deployed Engineer - New Grad (2027)", 2027),
    ("Software Engineer, New Grad 2026", 2026),
    ("Software Engineer (Agent Platform) - New Grad - 2026-2027", 2026),
    ("Investment Banking Analyst, Class of 2028", 2028),
    ("Software Engineer - New Grad", None),
    ("Rotational Development Program", None),
])
def test_the_start_is_the_first_year_of_2026_to_2029_in_a_graduate_title(title, year):
    assert J.start_of(title, J.flags_of("product", {"title": title})) == year


def test_a_year_on_a_title_without_the_mark_is_no_start():
    title = "Product Manager Technical (PMT) - 2027"
    assert J.start_of(title, J.flags_of("product", {"title": title})) is None
    assert J.start_of("Investment Banking Analyst, Class of 2025", F["grad_title"]) is None
