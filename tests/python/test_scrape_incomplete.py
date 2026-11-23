"""pipeline/scrape.py: an employer whose listing pages could not all be read closes nothing; a complete fetch closes
what did not come back. The adapter is a fake; no network, no database."""
import json
import sys

from pipeline import scrape
from pipeline.adapters import common


def _run(tmp_path, monkeypatch, adapter):
    (tmp_path / "data" / "raw" / "jobs").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data" / "registry.json").write_text(json.dumps([{"company": "Acme", "ats": "fake", "config": {}}]))
    path = tmp_path / "data" / "raw" / "jobs" / "acme.json"
    if not path.exists():
        old = [{"company": "Acme", "title": f"Product Manager {k}", "url": f"https://x/{k}", "external_id": k,
                "description": "", "first_seen": "2026-10-01", "last_seen": "2026-10-20"} for k in "abcdefghijkl"]
        path.write_text(json.dumps({"company": "Acme", "scraped_at": "2026-10-20T00:00:00", "jobs": old}))
    monkeypatch.setattr(scrape, "ROOT", str(tmp_path))
    monkeypatch.setitem(scrape.ADAPTERS, "fake", adapter)
    monkeypatch.setattr(sys, "argv", ["scrape", "--refresh", "--no-db", "--only", "Acme", "--workers", "1"])
    scrape.main()
    return json.loads(path.read_text())


def _jobs(keys):
    return [common.job("Acme", f"Product Manager {k}", f"https://x/{k}", "", external_id=k) for k in keys]


def test_an_unread_listing_page_closes_nothing(tmp_path, monkeypatch):
    def adapter(name, cfg, ok):
        common.listing_failed("fake: page 2 HTTP 500")
        return _jobs("abcdefgh")  # four of twelve missing: page 2 was not read
    blob = _run(tmp_path, monkeypatch, adapter)
    assert not any(j.get("closed") for j in blob["jobs"])
    assert blob["partial"].startswith("1 listing page(s) not read (fake: page 2 HTTP 500)")


def test_a_complete_fetch_closes_what_did_not_come_back(tmp_path, monkeypatch):
    blob = _run(tmp_path, monkeypatch, lambda name, cfg, ok: _jobs("abcdefgh"))
    assert sorted(j["external_id"] for j in blob["jobs"] if j.get("closed")) == list("ijkl")
    assert "partial" not in blob


def test_an_incomplete_fetch_closes_what_the_board_says_is_gone(tmp_path, monkeypatch):
    def adapter(name, cfg, ok):
        common.listing_failed("fake: stopped at the page cap")
        return _jobs("abcdefgh")
    asked = []

    def still_open(company, cfg, posting):
        asked.append(posting["external_id"])
        return {"i": False, "j": True, "k": None}.get(posting["external_id"], True)  # l raises below
    monkeypatch.setitem(scrape.CHECKS, "fake", lambda c, cfg, p: (_ for _ in ()).throw(RuntimeError("x")) if p["external_id"] == "l" else still_open(c, cfg, p))
    monkeypatch.setattr(scrape.time, "sleep", lambda s: None)
    blob = _run(tmp_path, monkeypatch, adapter)
    closed = sorted(j["external_id"] for j in blob["jobs"] if j.get("closed"))
    assert closed == ["i"]
    assert asked[:3] == ["a", "b", "c"], "three postings that came back are asked first, as controls"
    assert "4 missing postings checked one by one: 1 still open, 1 gone, 2 unknown" in blob["partial"]


def test_a_check_that_calls_a_returned_posting_gone_is_not_trusted(tmp_path, monkeypatch):
    def adapter(name, cfg, ok):
        common.listing_failed("fake: stopped at the page cap")
        return _jobs("abcdefgh")
    monkeypatch.setitem(scrape.CHECKS, "fake", lambda c, cfg, p: False)  # a blocked check: everything looks gone
    monkeypatch.setattr(scrape.time, "sleep", lambda s: None)
    blob = _run(tmp_path, monkeypatch, adapter)
    assert not any(j.get("closed") for j in blob["jobs"])
    assert "the check called a posting that came back gone" in blob["partial"]


def test_a_board_that_returned_few_is_asked_one_by_one(tmp_path, monkeypatch):
    monkeypatch.setitem(scrape.CHECKS, "fake", lambda c, cfg, p: p["external_id"] != "l")  # l is gone
    monkeypatch.setattr(scrape.time, "sleep", lambda s: None)
    blob = _run(tmp_path, monkeypatch, lambda name, cfg, ok: _jobs("ab"))  # 2 of 12 back: under 30%
    assert sorted(j["external_id"] for j in blob["jobs"] if j.get("closed")) == ["l"]
    assert "2 postings came back of 12 open" in blob["partial"] and "1 gone" in blob["partial"]


def test_a_board_that_returned_few_without_a_check_still_closes_nothing(tmp_path, monkeypatch):
    blob = _run(tmp_path, monkeypatch, lambda name, cfg, ok: _jobs("ab"))
    assert not any(j.get("closed") for j in blob["jobs"]) and "came back; nothing was closed" in blob["partial"]


def test_nothing_is_checked_when_nothing_came_back(tmp_path, monkeypatch):
    monkeypatch.setitem(scrape.CHECKS, "fake", lambda c, cfg, p: False)
    blob = _run(tmp_path, monkeypatch, lambda name, cfg, ok: [])
    assert not any(j.get("closed") for j in blob["jobs"]) and "no open posting came back to test the check on" in blob["partial"]


def test_recheck_closed_reopens_what_the_board_still_shows(tmp_path, monkeypatch):
    (tmp_path / "data" / "raw" / "jobs").mkdir(parents=True)
    old = [{"company": "Acme", "title": f"Product Manager {k}", "url": f"https://x/{k}", "external_id": k, "description": "",
            "first_seen": "2026-10-01", "last_seen": "2026-10-20"} for k in "abcdefgh"]
    old += [{"company": "Acme", "title": "Product Manager y", "url": "https://x/y", "external_id": "y", "description": "",
             "first_seen": "2026-10-01", "last_seen": "2026-10-10", "closed": "2026-10-18"},
            {"company": "Acme", "title": "Product Manager z", "url": "https://x/z", "external_id": "z", "description": "",
             "first_seen": "2026-09-01", "last_seen": "2026-09-10", "closed": "2026-09-12"}]
    (tmp_path / "data" / "raw" / "jobs" / "acme.json").write_text(json.dumps({"company": "Acme", "scraped_at": "2026-10-20T00:00:00", "jobs": old}))

    def adapter(name, cfg, ok):
        common.listing_failed("fake: stopped at the page cap")
        return _jobs("abcdefgh")
    monkeypatch.setitem(scrape.CHECKS, "fake", lambda c, cfg, p: True)
    monkeypatch.setattr(scrape.time, "sleep", lambda s: None)
    monkeypatch.setattr(sys, "argv", ["scrape", "--refresh", "--no-db", "--only", "Acme", "--workers", "1", "--recheck-closed", "2026-10-01"])
    (tmp_path / "data" / "registry.json").write_text(json.dumps([{"company": "Acme", "ats": "fake", "config": {}}]))
    monkeypatch.setattr(scrape, "ROOT", str(tmp_path))
    monkeypatch.setitem(scrape.ADAPTERS, "fake", adapter)
    scrape.main()
    by = {j["external_id"]: j for j in json.loads((tmp_path / "data" / "raw" / "jobs" / "acme.json").read_text())["jobs"]}
    assert "closed" not in by["y"], "closed since the date and still shown: reopened"
    assert by["z"]["closed"] == "2026-09-12", "closed before the date: not asked"
    assert len(by) == 10


def test_shards_split_a_family_into_disjoint_parts_that_cover_it():
    entries = [{"company": c} for c in "abcdefg"]
    parts = [scrape.shard(entries, f"{k}/3") for k in (1, 2, 3)]
    assert [e["company"] for p in parts for e in p] and sorted(e["company"] for p in parts for e in p) == list("abcdefg")
    assert [e["company"] for e in parts[0]] == ["a", "d", "g"]
    import pytest
    with pytest.raises(ValueError):
        scrape.shard(entries, "4/3")


def test_a_posting_returned_as_stored_is_seen_today_and_keeps_the_day_its_text_was_read(tmp_path, monkeypatch):
    path = tmp_path / "data" / "raw" / "jobs" / "acme.json"
    path.parent.mkdir(parents=True)
    old = [{"company": "Acme", "title": f"Product Manager {k}", "url": f"https://x/{k}", "external_id": k,
            "description": f"text {k}", "first_seen": "2026-10-01", "last_seen": scrape.time.strftime("%Y-%m-%d")} for k in "ab"]
    old[1]["title"] = "Product Manager, retitled since"
    path.write_text(json.dumps({"company": "Acme", "scraped_at": "2026-10-20T00:00:00", "jobs": old}))
    asked = []

    def adapter(name, cfg, ok):
        out = []
        for k in "abc":
            o = common.held(cfg).take(f"Product Manager {k}", external_id=k)
            asked.append(k) if o is None else None
            out.append(o or common.job("Acme", f"Product Manager {k}", f"https://x/{k}", f"read {k}", external_id=k))
        return out
    today = scrape.time.strftime("%Y-%m-%d")
    monkeypatch.setattr(scrape, "text_due", lambda key, read, today, days: False)
    jobs = {j["external_id"]: j for j in _run(tmp_path, monkeypatch, adapter)["jobs"]}
    assert asked == ["b", "c"], "a is held; b was retitled on the board and c is new"
    assert jobs["a"]["description"] == "text a" and jobs["a"]["last_seen"] == today and jobs["a"]["first_seen"] == "2026-10-01"
    assert jobs["b"]["description"] == "read b" and jobs["b"]["title"] == "Product Manager b" and jobs["b"]["text_seen"] == today
    assert jobs["c"]["text_seen"] == today and not any(j.get("closed") for j in jobs.values())
    asked.clear()
    monkeypatch.setattr(sys, "argv", ["scrape", "--refresh", "--no-db", "--only", "Acme", "--workers", "1", "--reread-days", "0"])
    scrape.main()
    assert asked == ["a", "b", "c"], "--reread-days 0 reads every text"
