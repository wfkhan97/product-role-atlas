"""pipeline.scrape.merge: a raw posting file is a backlog (CLAUDE.md): a refresh never replaces it and never deletes
from it. A posting is its requisition id (external_id), or its URL on a board that gives none.
evals/run_pipeline.py --only backlog runs the same rules on the same function; these state them one at a time."""
from pipeline.scrape import merge, posting_key

ENTRY = {"company": "X", "ats": "greenhouse", "group": "g", "investor": None, "category": "Investment banking"}


def job(url, **more):
    return {"title": "t", "url": url, "description": "d", **more}


def by_url(jobs):
    return {j["url"]: j for j in jobs}


def test_a_new_company_gets_every_posting_as_open_with_todays_dates_and_the_entrys_fields():
    jobs, note = merge(None, [job("a"), job("b")], ENTRY, "2026-10-17")
    assert note is None
    assert [j["url"] for j in jobs] == ["a", "b"]
    for j in jobs:
        assert (j["first_seen"], j["last_seen"], j.get("closed")) == ("2026-10-17", "2026-10-17", None)
        assert (j["group"], j["ats"], j["category"]) == ("g", "greenhouse", "Investment banking")


def test_a_posting_missing_from_the_fetch_stays_with_the_date_it_was_first_missed():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a"), job("b")]}
    jobs, note = merge(old, [job("a")], ENTRY, "2026-10-17")
    by = by_url(jobs)
    assert set(by) == {"a", "b"}, "nothing is deleted"
    assert by["b"]["closed"] == "2026-10-17" and by["b"]["last_seen"] == "2026-10-10"
    assert "closed" not in by["a"] and by["a"]["last_seen"] == "2026-10-17"
    assert note is None


def test_a_file_from_before_the_backlog_dates_its_postings_from_the_day_it_was_scraped():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a")]}
    jobs, _ = merge(old, [job("a")], ENTRY, "2026-10-17")
    assert jobs[0]["first_seen"] == "2026-10-10"


def test_a_posting_that_comes_back_is_open_again_and_the_other_closed_dates_do_not_move():
    old = {"scraped_at": "2026-10-17T09:00:00", "jobs": [job("a", first_seen="2026-10-10", last_seen="2026-10-10", closed="2026-10-17"),
                                                         job("c", first_seen="2026-10-10", last_seen="2026-10-10", closed="2026-10-17")]}
    jobs, _ = merge(old, [job("a")], ENTRY, "2026-10-24")
    by = by_url(jobs)
    assert "closed" not in by["a"] and by["a"]["last_seen"] == "2026-10-24"
    assert by["c"]["closed"] == "2026-10-17"


def test_a_partial_fetch_of_one_batch_closes_nothing():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a"), job("b")]}
    jobs, note = merge(old, [job("z")], ENTRY, "2026-10-17", full=False)
    assert set(by_url(jobs)) == {"a", "b", "z"}
    assert not any(j.get("closed") for j in jobs)
    assert note is None


def test_a_fetch_that_returns_under_30_percent_of_ten_or_more_open_postings_closes_nothing_and_says_so():
    many = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job(str(i)) for i in range(20)]}
    jobs, note = merge(many, [job("0"), job("1")], ENTRY, "2026-10-17")
    assert note == "2 of 20 open postings came back; nothing was closed"
    assert not any(j.get("closed") for j in jobs)
    few = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job(str(i)) for i in range(5)]}
    jobs, note = merge(few, [job("0")], ENTRY, "2026-10-17")
    assert note is None and sum(1 for j in jobs if j.get("closed")) == 4, "under ten open postings the rule does not apply"


def test_ids_never_duplicate_and_fall_back_to_the_external_id():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a"), {"title": "t", "url": None, "external_id": "77"}]}
    jobs, _ = merge(old, [job("a"), job("a"), {"title": "t", "url": None, "external_id": "77"}, job("b")], ENTRY, "2026-10-17")
    keys = [j.get("url") or j.get("external_id") for j in jobs]
    assert keys == ["a", "77", "b"], "old postings first in their order, new ones appended, each key once"


def test_the_employers_category_is_written_on_old_and_new_postings():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a", category="old")]}
    jobs, _ = merge(old, [job("a"), job("b")], ENTRY, "2026-10-17")
    assert [j["category"] for j in jobs] == ["Investment banking", "Investment banking"]
    jobs, _ = merge(None, [job("a")], {k: v for k, v in ENTRY.items() if k != "category"}, "2026-10-17")
    assert "category" not in jobs[0], "an entry with no category writes none"


def test_the_old_file_is_not_changed_in_place_beyond_its_postings():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a")], "partial": "x"}
    merge(old, [], ENTRY, "2026-10-17")
    assert old["partial"] == "x" and old["scraped_at"] == "2026-10-10T09:00:00"


def test_a_posting_that_comes_back_takes_the_boards_current_title_and_text_and_keeps_its_dates():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a", description="old text", title="Product Manager", first_seen="2026-10-03", last_seen="2026-10-10", group="g")]}
    jobs, _ = merge(old, [job("a", description="new text", title="Sr. Program Manager")], ENTRY, "2026-10-17")
    assert len(jobs) == 1
    assert (jobs[0]["description"], jobs[0]["title"]) == ("new text", "Sr. Program Manager"), "a board that rewrites a posting is read again"
    assert (jobs[0]["first_seen"], jobs[0]["last_seen"], jobs[0]["group"]) == ("2026-10-03", "2026-10-17", "g"), "the dates and the entry's fields are the backlog's"


def test_an_empty_fetched_description_does_not_blank_the_stored_one():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a", description="old text")]}
    jobs, _ = merge(old, [job("a", description="")], ENTRY, "2026-10-17")
    assert by_url(jobs)["a"]["description"] == "old text"


def req(url, eid, **more):
    return job(url, external_id=eid, **more)


def test_a_posting_is_its_requisition_id_so_a_new_url_for_the_same_id_is_the_same_row():
    # Bank of America puts a per-session token in every job URL: every refresh showed the same requisitions under
    # new URLs, added them again and closed nothing (0 of 308 "came back" on 2026-10-18)
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [req("a-token1", "1"), req("b-token1", "2")]}
    jobs, note = merge(old, [req("a-token2", "1")], ENTRY, "2026-10-17")
    assert [posting_key(j) for j in jobs] == ["1", "2"], "no second row for a requisition under a new URL"
    a, b = jobs
    assert (a["url"], a["first_seen"], a["last_seen"], a.get("closed")) == ("a-token2", "2026-10-10", "2026-10-17", None), "the row carries the current URL and its first date"
    assert (b["last_seen"], b["closed"]) == ("2026-10-10", "2026-10-17"), "the one that did not come back is closed"
    assert note is None


def test_the_partial_fetch_rule_counts_requisitions_not_rows():
    # ten requisitions held twice each, nine come back: 9 of 10, not 9 of 20
    rows = [req(f"{i}-t1", str(i), first_seen="2026-10-03", last_seen="2026-10-03") for i in range(10)]
    rows += [req(f"{i}-t2", str(i), first_seen="2026-10-10", last_seen="2026-10-10") for i in range(10)]
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": rows}
    jobs, note = merge(old, [req(f"{i}-t3", str(i)) for i in range(9)], ENTRY, "2026-10-17")
    assert note is None and len(jobs) == 10
    assert sum(1 for j in jobs if j.get("closed") == "2026-10-17") == 1


def test_two_rows_of_one_requisition_fold_into_the_one_seen_last_with_the_earliest_first_seen():
    # files written before the key was the id hold a retitled or re-addressed requisition twice
    stale = req("a-old", "1", title="Finance Manager", first_seen="2026-10-03", last_seen="2026-10-10", closed="2026-10-13")
    fresh = req("a-new", "1", title="Finance Transformation Lead", first_seen="2026-10-13", last_seen="2026-10-13")
    other = req("c", "3", first_seen="2026-10-10", last_seen="2026-10-13")
    for order in ([stale, fresh, other], [fresh, stale, other]):
        old = {"scraped_at": "2026-10-13T09:00:00", "jobs": [dict(j) for j in order]}
        jobs, _ = merge(old, [], ENTRY, "2026-10-17", full=False)
        assert [posting_key(j) for j in jobs] == ["1", "3"], "one row per requisition, in the order of first appearance"
        a = jobs[0]
        assert (a["url"], a["title"]) == ("a-new", "Finance Transformation Lead"), "the row seen last is the posting"
        assert (a["first_seen"], a["last_seen"], a.get("closed")) == ("2026-10-03", "2026-10-13", None), "the dates span both rows; it is open because the later row is"


def test_rows_that_are_both_closed_fold_to_the_later_closed_date():
    old = {"scraped_at": "2026-10-13T09:00:00", "jobs": [req("a-old", "1", first_seen="2026-10-03", last_seen="2026-10-03", closed="2026-10-10"),
                                                         req("a-new", "1", first_seen="2026-10-10", last_seen="2026-10-10", closed="2026-10-13")]}
    jobs, _ = merge(old, [], ENTRY, "2026-10-17", full=False)
    assert len(jobs) == 1 and (jobs[0]["first_seen"], jobs[0]["last_seen"], jobs[0]["closed"]) == ("2026-10-03", "2026-10-10", "2026-10-13")


def test_a_board_that_gives_no_ids_keys_by_url():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a"), job("b")]}
    jobs, _ = merge(old, [job("a"), job("c")], ENTRY, "2026-10-17")
    assert [posting_key(j) for j in jobs] == ["a", "b", "c"]
    assert by_url(jobs)["b"]["closed"] == "2026-10-17" and "closed" not in by_url(jobs)["c"]


def test_a_second_requisition_with_its_own_id_is_its_own_row_whatever_its_url():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [req("a", "1")]}
    jobs, _ = merge(old, [req("a", "1"), req("a", "2")], ENTRY, "2026-10-17")
    assert [posting_key(j) for j in jobs] == ["1", "2"]
