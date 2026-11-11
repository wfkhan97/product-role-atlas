"""pipeline/standards.py: the date rules, the outcome of one fetch and the hash that stands for a read. No network:
apply_check takes the status and the text a fetch would return."""
import copy
import datetime

from pipeline import standards

D = datetime.date
LONG = "A take-home exercise, then a panel. " * 40


def src(**kw):
    s = {"id": "x", "kind": "guide", "role_ids": ["pm"], "url": "https://example.com/x", "date_read": "2026-11-10", "access": "free"}
    s.update(kw)
    return s


def test_the_last_first_of_august_is_this_year_from_august_on_and_last_year_before():
    assert standards.last_august_first(D(2026, 11, 10)) == D(2026, 8, 1)
    assert standards.last_august_first(D(2027, 8, 1)) == D(2027, 8, 1)
    assert standards.last_august_first(D(2027, 7, 31)) == D(2026, 8, 1)


def test_a_source_is_stale_after_twelve_months_not_on_the_day():
    s = src(date_read="2026-11-10")
    assert not standards.stale(s, D(2027, 11, 10))
    assert standards.stale(s, D(2027, 11, 11))


def test_only_a_program_is_due_on_the_first_of_august():
    assert standards.program_due(src(kind="program", status="open"), D(2027, 8, 1))
    assert not standards.program_due(src(kind="program", status="open"), D(2027, 7, 31))
    assert not standards.program_due(src(kind="program", status="open", date_read="2027-08-01"), D(2027, 8, 2))
    assert not standards.program_due(src(kind="loop"), D(2027, 8, 1))


def test_a_closed_program_a_due_program_and_a_stale_guide_cannot_back_an_item_alone():
    today = D(2026, 11, 10)
    assert standards.citable(src(), today)
    assert standards.citable(src(kind="program", status="unknown"), today)
    assert not standards.citable(src(kind="program", status="closed"), today)
    assert not standards.citable(src(kind="program", status="open"), D(2027, 8, 1))
    assert not standards.citable(src(), D(2028, 1, 1))


def test_the_hash_ignores_markup_spacing_and_case():
    assert standards.content_hash("A take-home  exercise.\n") == standards.content_hash("a take home exercise")
    assert standards.content_hash("a take home exercise") != standards.content_hash("a take home case")


def test_a_page_that_is_gone_or_does_not_answer_is_unreachable():
    assert standards.classify(src(), 404, "")[0] == "unreachable"
    assert standards.classify(src(), 500, "")[0] == "unreachable"
    assert standards.classify(src(), None, "", "ConnectTimeout")[0] == "unreachable"
    assert standards.classify(src(access="paywalled"), 404, "")[0] == "unreachable"


def test_a_refusal_a_paywall_and_an_empty_shell_need_a_signed_in_read_and_are_not_failures():
    assert standards.classify(src(), 403, "")[0] == "needs_signed_in_read"
    assert standards.classify(src(), 429, "")[0] == "needs_signed_in_read"
    assert standards.classify(src(access="paywalled"), 200, LONG)[0] == "needs_signed_in_read"
    assert standards.classify(src(access="book"), 200, LONG)[0] == "needs_signed_in_read"
    assert standards.classify(src(), 200, "Loading")[0] == "needs_signed_in_read"
    assert standards.classify(src(), 200, "Just a moment... " * 20)[0] == "needs_signed_in_read"
    assert standards.classify(src(), 200, LONG)[0] == "ok"


def test_the_first_check_takes_the_hash_and_a_different_text_later_is_changed():
    s = src()
    assert standards.apply_check(s, 200, LONG, D(2026, 11, 10)) == "ok"
    assert s["read_sha256"] == standards.content_hash(LONG) and s["read_sha256_date"] == "2026-11-10"
    assert standards.apply_check(s, 200, LONG, D(2026, 12, 1)) == "ok"
    assert standards.apply_check(s, 200, LONG + "The program is closed.", D(2027, 1, 1)) == "changed"
    assert s["read_sha256"] == standards.content_hash(LONG), "a changed page keeps the hash of the read until a person re-reads it"
    assert [f for f, _ in standards.flags(s, D(2027, 1, 1))] == ["changed"]


def test_a_reread_with_a_later_date_read_takes_a_new_hash():
    s = src()
    standards.apply_check(s, 200, LONG, D(2026, 11, 10))
    new = LONG + "The program is closed."
    s["date_read"] = "2027-01-05"
    assert standards.apply_check(s, 200, new, D(2027, 1, 6)) == "ok"
    assert s["read_sha256"] == standards.content_hash(new) and s["read_sha256_date"] == "2027-01-06"


def test_a_shell_or_a_refusal_takes_no_hash():
    s = src()
    assert standards.apply_check(s, 200, "Loading", D(2026, 11, 10)) == "needs_signed_in_read"
    assert standards.apply_check(s, 403, "", D(2026, 11, 10)) == "needs_signed_in_read"
    assert "read_sha256" not in s and s["check"]["content_sha256"] is None


def test_a_paywalled_page_whose_public_part_changes_is_flagged_but_stays_a_signed_in_read():
    s = src(access="paywalled")
    standards.apply_check(s, 200, LONG, D(2026, 11, 10))
    assert standards.apply_check(s, 200, LONG + "New preview.", D(2026, 12, 1)) == "needs_signed_in_read"
    assert [f for f, _ in standards.flags(s, D(2026, 12, 1))] == ["changed"]


def test_a_sketch_measures_how_much_of_a_text_is_still_there():
    base = " ".join(f"word{i}" for i in range(600))
    assert standards.similarity(standards.sketch(base), standards.sketch(base)) == 1.0
    assert standards.similarity(standards.sketch(base), standards.sketch(base + " ten new jobs were posted today in this list")) > 0.9
    assert standards.similarity(standards.sketch(base), standards.sketch(" ".join(f"other{i}" for i in range(600)))) == 0.0
    assert len(standards.sketch(base)) == 12 * standards.SKETCH_K


def test_a_page_that_moves_between_fetches_is_compared_by_sketch_not_by_hash():
    base = " ".join(f"word{i}" for i in range(600))
    s = src()
    assert standards.apply_check(s, 200, base, D(2026, 11, 10)) == "ok"
    a, b = base + " jobs today 41", base + " jobs today 42"
    assert standards.apply_check(s, 200, a, D(2026, 12, 3), second=b) == "ok", "two fetches differ: the page moves, and nearly all of it is as read"
    assert "moves between two fetches" in s["check"]["note"] and standards.flags(s, D(2026, 12, 3)) == []
    assert standards.apply_check(s, 200, a, D(2026, 12, 3), second=a) == "changed", "two fetches agree: a real change, however small"
    other = " ".join(f"other{i}" for i in range(600))
    assert standards.apply_check(s, 200, other + " 1", D(2027, 1, 3), second=other + " 2") == "changed", "a page that moves and is mostly new"
    assert s["read_sha256"] == standards.content_hash(base)


def test_a_moving_page_read_before_sketches_existed_takes_one_and_is_not_flagged():
    base = " ".join(f"word{i}" for i in range(600))
    s = src(read_sha256=standards.content_hash(base), read_sha256_date="2026-11-10")
    assert standards.apply_check(s, 200, base + " 1", D(2026, 12, 3), second=base + " 2") == "ok"
    assert s["read_sketch"] == standards.sketch(base + " 1") and standards.flags(s, D(2026, 12, 3)) == []


def test_verify_writes_only_its_four_fields():
    s = src(why_standard="w", what_they_test=[{"dimension": "d", "summary": "s"}], notes="n")
    before = copy.deepcopy(s)
    standards.apply_check(s, 200, LONG, D(2026, 11, 10))
    assert set(s) - set(before) == set(standards.WRITTEN)
    assert {k: s[k] for k in before} == before


def test_the_report_lists_flags_and_counts_them():
    a = src(id="a", kind="program", status="open")
    b = src(id="b")
    standards.apply_check(a, 404, "", D(2027, 8, 2))
    standards.apply_check(b, 403, "", D(2027, 8, 2))
    d = {"sources": [a, b], "roles": {"pm": {"shows": [{"id": "i", "sources": ["a"]}, {"id": "j", "sources": ["b"]}]}}}
    text, n = standards.report(d, D(2027, 8, 2))
    assert n == 2, "a is unreachable and a program due; b is a signed-in read, which is not a flag"
    assert "## Unreachable (1)" in text and "## Programs not re-read since the last 1 August (1)" in text
    assert "`pm` / `i`" in text and "`pm` / `j`" not in text
    assert "## Needs a signed-in read (1; not failures)" in text


def test_the_tracked_file_has_no_quotation_and_only_known_values():
    d = standards.load()
    assert all("quote" not in s for s in d["sources"])
    assert {s["kind"] for s in d["sources"]} <= set(standards.KINDS)
    assert {s["publisher_class"] for s in d["sources"]} <= set(standards.PUBLISHER_CLASSES)
    assert all(not s["first_party"] for s in d["sources"] if s["publisher_class"] == "prep_vendor" or s["kind"] == "gap")
