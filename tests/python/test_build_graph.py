"""pipeline/build_graph.py: the share arithmetic under every number of the graph files."""
import math

import pytest

from pipeline import build_graph as B

J = lambda *skills: {"skills": {s: 1 for s in skills}}


def test_share_is_the_fraction_of_postings_that_carry_the_skill():
    jobs = [J("excel", "sql"), J("excel"), J(), J("sql")]
    assert B.share(jobs, "skills", "excel") == 0.5
    assert B.share(jobs, "skills", "python") == 0.0


def test_share_of_no_postings_is_zero_not_a_division_error():
    assert B.share([], "skills", "excel") == 0.0


def test_wshare_weighs_each_posting():
    pairs = [(J("excel"), 3.0), (J(), 1.0)]
    assert B.wshare(pairs, "excel") == 0.75
    assert B.wshare([], "excel") == 0.0
    assert B.wshare([(J("excel"), 0.0)], "excel") == 0.0, "weights that add up to nothing give no share"


def test_share_and_wshare_stay_within_zero_and_one():
    jobs = [J("a"), J("a"), J("b")]
    pairs = [(j, w) for j, w in zip(jobs, (0.2, 0.5, 2.0))]
    for sid in ("a", "b", "c"):
        assert 0.0 <= B.share(jobs, "skills", sid) <= 1.0
        assert 0.0 <= B.wshare(pairs, sid) <= 1.0


def test_log_ratio_is_antisymmetric_and_zero_for_equal_shares():
    assert B.log_ratio(0.3, 0.3) == 0.0
    assert B.log_ratio(0.0, 0.0) == 0.0, "two zero shares: the floor keeps the logarithm finite"
    assert B.log_ratio(0.3, 0.1) == pytest.approx(-B.log_ratio(0.1, 0.3))
    assert B.log_ratio(1.0, 0.0) == pytest.approx(math.log(1.02 / 0.02)), "the floor bounds a share that is nowhere"


def test_log_ratio_grows_with_the_first_share():
    assert B.log_ratio(0.1, 0.2) < B.log_ratio(0.2, 0.2) < B.log_ratio(0.4, 0.2)


def test_normalise_maps_the_median_to_zero_and_the_ends_to_plus_and_minus_one():
    assert B.normalise([1, 2, 3, 4, 5]) == [-1.0, -0.5, 0.0, 0.5, 1.0]
    assert B.normalise([2, 2, 2]) == [0.0, 0.0, 0.0], "equal values: no spread, no division by zero"


# ---- field_flavour: the postings' side of a field entry

def _pairs(*rows):
    """(skills, subs, weight) rows -> (posting, weight) pairs as build_graph reads them."""
    return [({"skills": {s: 1 for s in skills}, "sub": list(subs)}, w) for skills, subs, w in rows]


def test_field_flavour_ranks_carriers_by_share_times_lift_and_keeps_only_carrier_kinds(monkeypatch):
    monkeypatch.setattr(B, "KIND", {"t": "behaviour", "a": "method", "b": "practice", "c": "method", "x": "tool", "y": "credential"})
    # in the field, a is on every posting that asks for t and b on half; everywhere, a is as common (no lift), b is rare (lift)
    field = _pairs((("t", "a", "b", "x", "y"), ("s1",), 1.0), (("t", "a", "x"), ("s1", "s2"), 1.0))
    base = _pairs((("t", "a"), (), 1.0), (("t", "a"), (), 1.0), (("t", "a"), (), 1.0), (("t", "a", "b"), (), 1.0))
    out = B.field_flavour("t", field, base, ["s1", "s2"])
    ids = [w["id"] for w in out["with"]]
    assert "t" not in ids, "a skill does not carry itself"
    assert "x" not in ids and "y" not in ids, "tools and credentials are named, they carry nothing"
    assert "c" not in ids, "a skill on no posting of the field is not a carrier"
    assert ids == ["b", "a"], "b has share 0.5 with lift, a has share 1.0 and no lift: lift wins"
    assert out["with"][1]["share"] == 1.0 and out["with"][0]["share"] == 0.5
    assert out["n"] == 2
    assert out["subs"] == [{"id": "s1", "share": 1.0}, {"id": "s2", "share": 0.5}]


def test_field_flavour_needs_a_share_of_thirty_percent_and_weighs_postings(monkeypatch):
    monkeypatch.setattr(B, "KIND", {"t": "behaviour", "a": "method", "b": "method"})
    # a is on one of four postings of the field (25%); b on one, but that posting weighs three
    field = _pairs((("t", "a"), (), 1.0), (("t", "b"), (), 3.0), (("t",), (), 1.0), (("t",), (), 1.0))
    base = field
    out = B.field_flavour("t", field, base, [])
    assert [w["id"] for w in out["with"]] == ["b"]
    assert out["with"][0]["share"] == 0.5, "3 of 6 units of weight"


def test_field_flavour_with_no_postings_is_empty_not_a_division_error(monkeypatch):
    monkeypatch.setattr(B, "KIND", {"t": "behaviour", "a": "method"})
    assert B.field_flavour("t", [], [], ["s1"]) == {"n": 0, "with": [], "subs": []}
