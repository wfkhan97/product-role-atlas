"""pipeline/roles.py: the title rules of the product role set. The six families of 2026-10-11 and the product_engineer
family of 2026-10-30 (PLAN.md, "AI-forward roles in the scrape"). Pointed titles; evals/baseline.md covers the matcher."""
import pytest

from pipeline import roles as R


def read(title):
    return (R.family(title), R.level(title)) if R.title_ok(title) else (None, None)


# ---------- the product_engineer family: the AI-forward builder between product and engineering ----------
@pytest.mark.parametrize("title, level", [
    ("Associate Product Engineer", "associate"),   # Book of the Month, 2026: front end, automations, agent workflows, owns the feature
    ("Product Engineer", "mid"),
    ("AI Product Engineer", "mid"),
    ("Applied AI Product Engineer", "mid"),
    ("Senior Product Engineer, Payments", "senior"),
    ("Founding Product Engineer", "mid"),
    ("Full-Stack Product Engineer", "mid"),
    ("Forward Deployed Engineer", "mid"),
    ("Forward Deployed Software Engineer", "mid"),
    ("Staff Forward Deployed AI Engineer", "staff"),
])
def test_product_engineer_titles_are_the_family(title, level):
    assert read(title) == ("product_engineer", level)


def test_associate_product_engineer_is_not_an_associate_product_manager():
    assert R.family("Associate Product Engineer") == "product_engineer", "read before pm, or 'associate product' makes it an APM"


@pytest.mark.parametrize("title", [
    "Product Test Engineer", "Mechanical Product Engineer", "Product Engineer - Wafer Fab", "Product Engineer (Systems)",
    "Product Quality Engineer", "Senior Product Engineer, Battery Cell", "Product Applications Engineer",
    "Product Engineering Manager", "Product Development Engineer", "Product Security Engineer", "Product Support Engineer",
])
def test_hardware_and_other_product_engineers_are_not_the_family(title):
    assert not R.title_ok(title), title


def test_a_bare_product_engineer_is_settled_by_the_posting_text():
    soft = "You will build React components and back-end automations and ship them with Claude Code; you own experiments end to end."
    hard = "Own GD&T tolerances, the BOM and injection molding; CAD in SolidWorks; root cause and FMEA on the manufacturing line."
    assert R.software_build(soft) is True and R.software_build(hard) is False and R.software_build("A great team.") is None
    assert R.family("Product Engineer", soft) == "product_engineer"
    assert R.family("Product Engineer", hard) is None, "a manufacturing product engineer is dropped at extraction"
    assert R.family("Product Engineer", "A great team.") == "product_engineer", "a text that says neither keeps the title's reading"
    assert R.family("Product Engineer") == "product_engineer", "no text (the scrape): the title's reading"


# ---------- AI product titles already in the pm family, pinned ----------
@pytest.mark.parametrize("title, family, level", [
    ("AI Product Manager", "pm", "mid"), ("Senior Product Manager, AI", "pm", "senior"), ("Agent Product Manager", "pm", "mid"),
    ("AI Agent Product Manager", "pm", "mid"), ("AI Product Lead", "pm", "staff"), ("Forward Deployed Product Manager", "pm", "mid"),
    ("AI Product Owner", "product_owner", "mid"), ("Technical Program Manager, AI Infrastructure", "tpm", "mid"),
])
def test_ai_product_titles_keep_their_family(title, family, level):
    assert read(title) == (family, level)


def test_ai_ml_specialisation_reads_the_2026_words():
    for t in ("Product Manager, Applied AI", "Senior PM, GenAI", "Product Manager - Gen AI", "Forward Deployed Engineer", "Product Manager, Agents", "Staff Product Manager, Foundation Models"):
        assert "ai_ml" in R.specializations(t), t
    assert "ai_ml" not in R.specializations("Product Manager, Payments")


# ---------- a noise title the graph held on 2026-10-30; the technical product marketer at a software firm stays ----------
def test_applications_engineers_are_not_product_roles_and_product_marketing_engineers_are():
    assert not R.title_ok("Associate Product Applications Engineer")
    assert R.family("Product Marketing Engineer") == "pmm", "ClickHouse, Snowflake and Temporal post technical PMMs under this title"


def test_every_family_has_a_label():
    assert {f for f, _ in R.FAMILY_PATTERNS} == set(R.FAMILY_LABELS)
