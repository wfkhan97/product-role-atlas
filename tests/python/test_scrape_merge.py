"""pipeline.scrape.merge: a raw posting file is a backlog (CLAUDE.md): a refresh never replaces it and never deletes
from it. evals/run_pipeline.py --only backlog runs the same rules on the same function; these state them one at a time."""

from pipeline.scrape import merge

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


def test_a_changed_description_updates_and_nothing_else_about_the_posting_moves():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a", description="old text", title="Old title", first_seen="2026-10-01")]}
    jobs, _ = merge(old, [job("a", description="new text", title="New title")], ENTRY, "2026-10-17")
    a = by_url(jobs)["a"]
    assert a["description"] == "new text"
    assert (a["title"], a["first_seen"], a["last_seen"]) == ("Old title", "2026-10-01", "2026-10-17")


def test_an_empty_fetched_description_does_not_blank_the_stored_one():
    old = {"scraped_at": "2026-10-10T09:00:00", "jobs": [job("a", description="old text")]}
    jobs, _ = merge(old, [job("a", description="")], ENTRY, "2026-10-17")
    assert by_url(jobs)["a"]["description"] == "old text"
