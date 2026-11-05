"""The tech role set's title rules (pipeline/roles_tech.py): the borders with the other sets, the ladders and the
entry mark. The full labelled set is evals/titles_tech.json (evals/run_pipeline.py --roles tech); these pin the
decisions PLAN.md states, so a change that moves one fails here with its reason."""
import json
import re

import pytest

from pipeline import roles, roles_mba, roles_tech as R


@pytest.mark.parametrize("title, role", [
    # the product set keeps its titles, including product_engineer, and product titles that name no tech job
    ("Forward Deployed Engineer", None), ("AI Product Engineer", None), ("Technical Program Manager, Security", None),
    ("Product Manager, Machine Learning Platform", None),
    # ... but a product word in an engineering, design or legal title does not take it
    ("Product Security Engineer", "security_engineer"), ("Product Designer", "product_designer"), ("Product Counsel", "counsel"),
    # the MBA set keeps data scientists and analysts, solutions and sales engineers, governance and compliance managers
    ("Data Scientist, Machine Learning", None), ("Solutions Engineer", None), ("Sales Engineer, Enterprise", None),
    ("Head of AI Governance", None), ("GRC Analyst", None), ("Compliance Manager", None), ("Market Research Manager", None),
    # ... and the engineering side of those words is ours
    ("GRC Engineer", "security_engineer"), ("Security GRC Analyst", "security_engineer"), ("AI Governance Engineer", "security_engineer"),
    ("Machine Learning Scientist", "ml_engineer"), ("Applied Scientist II", "ml_engineer"), ("Business Intelligence Engineer", "data_engineer"),
    # narrow before broad
    ("Software Engineer, Machine Learning", "ml_engineer"), ("Software Engineer, Security", "security_engineer"),
    ("Analytics Engineer", "data_engineer"), ("Site Reliability Engineer", "software_engineer"), ("Firmware Engineer", "software_engineer"),
    ("Engineering Manager", "software_engineer"), ("Member of Technical Staff", "software_engineer"),
    # hardware, IT and jobs about the people
    ("Mechanical Engineer", None), ("ASIC Design Engineer", None), ("Network Engineer", None), ("Design Engineer", None),
    ("Technical Recruiter, Engineering", None), ("Developer Advocate", None), ("Physical Security Manager", None),
    ("Graphic Designer", None), ("Paralegal", None), ("Guidance Counselor", None),
])
def test_family(title, role):
    assert R.family(title) == role


@pytest.mark.parametrize("title, company, level, ladder", [
    ("Software Engineer I", None, "associate", "engineering"), ("Software Engineer II", None, "mid", "engineering"),
    ("SDE III", "Amazon", "senior", "engineering"), ("Staff Software Engineer", None, "staff", "engineering"),
    ("Principal Software Engineer", None, "group", "engineering"), ("Engineering Manager", None, "group", "engineering"),
    ("Director of Engineering", None, "director", "engineering"), ("CTO", None, "cpo", "engineering"),
    ("Member of Technical Staff", "OpenAI", "mid", "engineering"),
    ("Vice President, Software Engineer", "Goldman Sachs Group", "senior", "bank"),
    ("Analyst, Software Engineering", "Goldman Sachs Group", "associate", "bank"),
    ("Security Analyst", "Bank of America", "mid", "engineering"),   # the job, not the bank grade
    ("Senior Corporate Counsel", None, "senior", "legal"), ("Assistant General Counsel", None, "staff", "legal"),
    ("Associate General Counsel", None, "director", "legal"), ("Deputy General Counsel", None, "vp", "legal"),
    ("General Counsel", None, "cpo", "legal"),
])
def test_level_and_ladder(title, company, level, ladder):
    f = R.family(title, company)
    assert (R.level(title, company, None, f), R.ladder(title, company, None, f)) == (level, ladder)


@pytest.mark.parametrize("title, mark", [
    ("Software Engineer, New Grad", ("grad", False)), ("Software Engineering Intern, Summer 2027", ("grad", True)),
    ("Software Engineer I", (None, False)), ("Campus Recruiter, Engineering", (None, False)),
])
def test_entry(title, mark):
    assert R.entry(title)[:2] == mark


def test_entry_from_text_on_associate_titles_only():
    text = "You are currently pursuing a Master's degree in Computer Science, graduating in 2027."
    assert R.entry("Associate Software Engineer", text=text) == ("grad", False, "text")
    assert R.entry("Senior Software Engineer", text=text) == (None, False, None)


def test_groups_and_labels_cover_every_role():
    assert set(R.GROUP_OF) == set(R.FAMILY_LABELS) == {f for f, _ in R.FAMILY_PATTERNS}
    assert R.LEVEL_ORDER == roles.LEVEL_ORDER


def test_no_role_id_collides_with_another_set():
    # the web index namespaces product families; the tech set's ids must not shadow an MBA role either
    assert not set(R.FAMILY_LABELS) & set(roles_mba.FAMILY_LABELS)


def test_export_is_plain_data_the_browser_can_compile():
    ex = R.export()
    json.dumps(ex)
    pats = [p for f in ex["families"] for p in f["patterns"] + f["exclude"]]
    pats += [g["pattern"] for l in ex["ladders"].values() for g in l["grades"]]
    pats += [ex[k] for k in ("not_the_job", "customer_facing", "hardware", "software_word", "eng_word", "mts")]
    for p in pats:
        assert "(?i" not in p and "(?P<" not in p, p   # JavaScript cannot read inline flags or named groups this way
        re.compile(p)


@pytest.mark.parametrize("title, role", [
    # Workday titles at Fortune employers (PR 2's count-only probe of 30 boards, 2026-11-05): the false positives it found
    ("Systems Engineering Manager (Metrology Product Development)", None), ("Senior IT Project Manager Cybersecurity", None),
    ("Corporate Security Senior Manager - Americas", None), ("Regional Security Specialist, Global Security", None),
    ("Designer - Women's Tek Gear", None), ("Associate Technical Designer", None),
    ("Commercial Crew Command and Data Handling Engineer, Senior Level", None),
    # ... and what they must not take with them
    ("Security Engineer, Corporate Security", "security_engineer"), ("Senior Systems Software Engineer (C++)", "software_engineer"),
    ("Engineering Team Lead, Site Reliability Engineering (Digital Banking)", "software_engineer"),
    ("Senior Counsel, Legal - Labor & Employment (Attorney)", "counsel"), ("Business Intelligence Engineer", "data_engineer"),
])
def test_workday_titles(title, role):
    assert R.family(title) == role
