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
