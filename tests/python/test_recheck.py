"""pipeline/recheck.py: a closed posting the board still shows is reopened; nothing is deleted; a check that calls a
posting seen open gone changes nothing."""
from pipeline import recheck


def _blob():
    return {"jobs": [
        {"external_id": "a", "url": "u/a", "last_seen": "2026-10-28"},
        {"external_id": "b", "url": "u/b", "last_seen": "2026-10-18", "closed": "2026-10-25"},
        {"external_id": "c", "url": "u/c", "last_seen": "2026-10-10", "closed": "2026-10-13"},
        {"external_id": "d", "url": "u/d", "last_seen": "2026-09-01", "closed": "2026-09-05"},
    ]}


def test_reopens_what_the_board_shows_and_keeps_every_row(monkeypatch):
    monkeypatch.setattr(recheck.time, "sleep", lambda s: None)
    blob = _blob()
    said = recheck.recheck(lambda c, cfg, p: p["external_id"] in ("a", "b", "d"), "X", {}, blob, "2026-10-29", "2026-10-01")
    by = {j["external_id"]: j for j in blob["jobs"]}
    assert said == {"reopened": 1, "gone": 1}
    assert "closed" not in by["b"] and by["b"]["last_seen"] == "2026-10-29"
    assert by["c"]["closed"] == "2026-10-13", "gone: as it was"
    assert by["d"]["closed"] == "2026-09-05", "closed before --since: not asked"
    assert len(blob["jobs"]) == 4


def test_an_untrusted_check_changes_nothing(monkeypatch):
    monkeypatch.setattr(recheck.time, "sleep", lambda s: None)
    blob = _blob()
    assert recheck.recheck(lambda c, cfg, p: False, "X", {}, blob, "2026-10-29", "2026-10-01") is None
    assert blob == _blob()
