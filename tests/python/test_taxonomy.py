"""pipeline/tax.py: the stratified taxonomy. The real files are the fixture, because the rules are about them: every
skill has a kind, every skill says how a resume shows it, and the field entries name real fields and real carriers."""
import pytest

from pipeline import roles_mba, tax

T = tax.load()
E = tax.load_evidence()
F = tax.load_fields()
GROUPS = {"consulting_strategy", "finance", "banking_investing", "operations", "product", "marketing", "sales", "supply_chain", "people", "risk", "analytics"}


def test_every_skill_has_a_known_kind():
    assert all(s.get("kind") in tax.KINDS for s in T["skills"])
    assert set(tax.KINDS) == {"method", "practice", "behaviour", "technical", "knowledge", "tool", "credential"}


def test_every_kind_names_a_form_a_resume_can_take():
    assert all(k["form"] in tax.FORMS for k in tax.KINDS.values())


def test_the_three_files_validate_against_each_other():
    assert tax.validate(tax=T, evidence=E, fields=F, groups=GROUPS) == []


def test_a_behaviour_is_shown_through_other_skills_never_named():
    for s in T["skills"]:
        if s["kind"] == "behaviour":
            assert E[s["id"]]["form"] == "through"
            assert len(E[s["id"]]["shown_by"]) >= 3


def test_tools_and_credentials_are_named_and_mean_the_same_everywhere():
    for s in T["skills"]:
        if s["kind"] in ("tool", "credential"):
            assert E[s["id"]]["form"] == "named"
            assert s["id"] not in F


def test_a_field_entry_carries_a_measurable_resume_line():
    for sid, per in F.items():
        for g, entry in per.items():
            # a key is a field, or a role override "role:<id>" for one of the 50 roles (PLAN.md v16, step 6)
            assert g in GROUPS or (g.startswith(tax.ROLE_KEY) and g[len(tax.ROLE_KEY):] in roles_mba.FAMILY_LABELS), (sid, g)
            assert any(ch.isdigit() for ch in entry["line"]), (sid, g)
            assert 2 <= len(entry["shown_by"]) <= 6


def test_a_role_override_sits_beside_a_field_entry_and_is_read_first():
    overrides = [(sid, g) for sid, per in F.items() for g in per if g.startswith(tax.ROLE_KEY)]
    assert overrides, "the four measured roles have overrides"
    for sid, g in overrides:
        role = g[len(tax.ROLE_KEY):]
        assert role in roles_mba.FAMILY_LABELS
        assert roles_mba.GROUP_OF[role] in F[sid], (sid, g, "an override stands in for the role's field entry, which must exist")
    assert tax.field_keys("ma_integration", "finance") == ["role:ma_integration", "finance"]
    assert tax.validate(groups=set(GROUPS) | {"product"}, roles=set(roles_mba.FAMILY_LABELS)) == []
    assert any("is not a role" in p for p in tax.validate(groups=set(GROUPS) | {"product"}, roles={"fpa"})), "an unknown role is a problem"


def test_the_role_set_view_keeps_the_kind():
    for roleset in ("product", "mba"):
        part = tax.for_roles(roleset, T)
        assert all(s.get("kind") in tax.KINDS for s in part["skills"])


def test_validate_reports_each_broken_rule():
    tax_bad = {"clusters": {}, "skills": [{"id": "a", "name": "A", "cluster": "x", "kind": "method"}, {"id": "b", "name": "B", "cluster": "x", "kind": "nope"}, {"id": "t", "name": "T", "cluster": "tools", "kind": "tool"}]}
    ev = {"a": {"form": "artefact", "artefacts": [], "counterparts": [], "measures": [], "verbs": [], "shown_by": ["a", "zzz", "t"]},
          "t": {"form": "artefact", "artefacts": [], "counterparts": [], "measures": [], "verbs": [], "shown_by": []}}
    fields = {"a": {"mars": {"reads_as": "x", "shown_by": ["a"], "line": "no number here"}}, "t": {"finance": {"reads_as": "x", "shown_by": ["a", "a"], "line": "1"}}}
    problems = "\n".join(tax.validate(tax=tax_bad, evidence=ev, fields=fields, groups=GROUPS))
    for needle in ("kind 'nope'", "b: no entry", "names itself", "names zzz", "names t, a tool", "a tool is shown by naming", "mars is not a field", "line has no number", "two to six", "t is a tool"):
        assert needle in problems, needle


def test_the_stratification_files_do_not_shadow_the_depth_entries():
    """Every loader of pipeline/depth/*.json merges the folder by skill id. evidence.json and fields.json are keyed the
    same way, so they must live outside it: the first build put them inside and 70 product definitions went blank."""
    import os
    from pipeline import build_graph
    assert os.path.dirname(tax.EVIDENCE_PATH) == os.path.dirname(tax.PATH)
    assert os.path.dirname(tax.FIELDS_PATH) == os.path.dirname(tax.PATH)
    blank = [sid for sid, d in build_graph.DEPTH.items() if not d.get("what")]
    assert blank == [], blank
