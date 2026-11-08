"""The flag bits of a Find jobs row (pipeline.jobs_open.flags_of): one bit per set, and each set's entry marks."""
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
