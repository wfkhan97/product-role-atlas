"""pipeline/backlog.py: the key agrees with the scrape, and a file survives the trip to rows and back byte for byte."""
import json

from pipeline import backlog, scrape


def test_key_matches_the_scrape():
    for j in ({"external_id": "R123", "url": "https://x/a?token=1"}, {"url": "https://x/b"}, {"external_id": "", "url": "https://x/c"}):
        assert backlog.key_of(j) == scrape.posting_key(j)


def _file():
    return {"company": "Acme", "scraped_at": "2026-10-18T01:02:03", "jobs": [
        {"company": "Acme", "title": "Analyst", "url": "https://x/1", "location": "NYC", "posted": "2026-09-01", "external_id": "1",
         "description": "Line one.\n\nLine two with 'quotes' and unicode — dash.", "extra": {"team": "Ops"}, "group": "mba_employer",
         "investor": None, "ats": "greenhouse", "first_seen": "2026-10-01", "last_seen": "2026-10-18", "category": "Consulting and advisory"},
        {"company": "Acme", "title": "Manager", "url": "https://x/2", "location": "", "posted": None, "external_id": "2",
         "description": "", "extra": {}, "group": "mba_employer", "investor": None, "ats": "greenhouse",
         "first_seen": "2026-09-01", "last_seen": "2026-10-01", "closed": "2026-10-18"},
    ], "partial": "3 of 20 open postings came back; nothing was closed", "batches": [1, 2, 3]}


def test_round_trip_is_byte_identical(tmp_path):
    blob = _file()
    raw = json.dumps(blob)  # how pipeline.scrape writes the file
    rows = backlog.rows_of(blob, "mba", "acme")
    role_set, slug, company, scraped_at, meta, jobs_pos, n_jobs = backlog.file_row(blob, "mba", "acme")
    assert (company, scraped_at, jobs_pos, n_jobs) == ("Acme", "2026-10-18T01:02:03", 2, 2)
    assert [r[2] for r in rows] == ["1", "2"]            # keyed by requisition id
    assert rows[0][16] is None and rows[1][16] == "2026-10-18"   # closed
    assert json.loads(rows[0][18])["description"] is None  # the description sits in its own column
    jobs = []
    for r in rows:
        j = json.loads(r[18])
        j["description"] = r[17]
        jobs.append(j)
    assert json.dumps(backlog.rebuild(json.loads(meta), jobs_pos, jobs)) == raw


def test_dates_that_are_not_dates_become_null():
    assert backlog.date_or_none("2026-10-18") == "2026-10-18"
    assert backlog.date_or_none("2026-10-18T10:00:00") is None
    assert backlog.date_or_none(None) is None




def _fake_psycopg(monkeypatch, failures, message):
    """psycopg.connect refuses `failures` times with `message`, then connects; time.sleep records instead of waiting."""
    import psycopg
    calls, sleeps = [], []

    def connect(url, connect_timeout):
        calls.append(url)
        if len(calls) <= failures:
            raise psycopg.OperationalError(message)
        return "conn"

    monkeypatch.setattr(psycopg, "connect", connect)
    monkeypatch.setattr(backlog.time, "sleep", sleeps.append)
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://pooler")
    monkeypatch.setattr(backlog, "load_env", lambda: None)
    return calls, sleeps


def test_connect_waits_for_a_free_pooler_slot(monkeypatch):
    full = "FATAL:  (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15"
    calls, sleeps = _fake_psycopg(monkeypatch, 3, full)
    assert backlog.connect() == "conn"
    assert len(calls) == 4 and len(sleeps) == 3


def test_connect_raises_other_errors_at_once(monkeypatch):
    import psycopg
    import pytest
    calls, sleeps = _fake_psycopg(monkeypatch, 5, "password authentication failed")
    with pytest.raises(psycopg.OperationalError):
        backlog.connect()
    assert len(calls) == 1 and not sleeps


def test_connect_gives_up_when_the_wait_runs_out(monkeypatch):
    import psycopg
    import pytest
    calls, sleeps = _fake_psycopg(monkeypatch, 99, "max clients reached")
    with pytest.raises(psycopg.OperationalError):
        backlog.connect(wait=0)
    assert len(calls) == 1


def test_push_file_safely_says_whether_it_saved(monkeypatch, tmp_path):
    def refuse(path, role_set):
        raise RuntimeError("pooler")
    monkeypatch.setattr(backlog, "push_file", refuse)
    saved, note = backlog.push_file_safely(str(tmp_path / "acme.json"), "mba")
    assert not saved and "not saved" in note
    monkeypatch.setattr(backlog, "push_file", lambda path, role_set: ("acme", 3, ""))
    assert backlog.push_file_safely(str(tmp_path / "acme.json"), "mba") == (True, "[db] acme: 3 postings saved")
