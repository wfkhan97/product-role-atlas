"""pipeline/log.py RunRecorder and pipeline/runs.py: one row per run, with the summary line's counts and the tallies;
nothing in it is content, and a failed insert never raises."""
import datetime
import io
import logging
import sys
import types

from pipeline import log, runs


def test_counts_of_reads_the_scrape_and_extract_summary_lines():
    c = log.counts_of("scrape done in 812.3s: 40 employers fetched (2 failed), postings fetched 1200, kept 1150 (900 open), new 50, "
                      "reopened 3, closed 10, folded 2; 300 requests, 1 answered 429, 4 retried after a network error")
    assert c["employers"] == 40 and c["failed"] == 2 and c["postings fetched"] == 1200 and c["kept"] == 1150
    assert c["open"] == 900 and c["new"] == 50 and c["closed"] == 10 and c["requests"] == 300
    assert "in" not in c and 812 not in c.values(), "the elapsed time is not a count"
    c = log.counts_of("extract --roles mba done in 20m: 56741 postings read from 1200 files, 56000 tagged, 300 exact reposts (same company, title and text) dropped -> data/x")
    assert c["postings"] == 56741 and c["files"] == 1200 and c["tagged"] == 56000 and c["exact"] == 300
    assert log.counts_of("ladders: {'bank': 12}") == {}


def _main_named(monkeypatch, name):
    main = types.ModuleType("__main__")
    main.__spec__ = types.SimpleNamespace(name=name)
    monkeypatch.setitem(sys.modules, "__main__", main)


def test_the_row_carries_the_tallies_the_best_counts_and_the_names(monkeypatch, tmp_path):
    _main_named(monkeypatch, "pipeline.scrape")
    monkeypatch.setenv("PIPELINE_JOB", "refresh-mba")
    monkeypatch.setenv("RUNNER_NAME", "GitHub Actions 7")
    rows = []
    log.setup(level="INFO", stream=io.StringIO(), runs=False)
    rec = log.RunRecorder(log_path=str(tmp_path / "logs" / "run.log"), insert=rows.append)
    monkeypatch.setattr(log, "ROOT", str(tmp_path))
    rec.log_path = "logs/run.log"
    logging.getLogger("pipeline").addHandler(rec)
    logger = log.get("pipeline.scrape")
    logger.info("scrape --roles mba: 1200 employers in the registry, 40 to fetch, 1160 cached or skipped")
    logger.warning("Acme: partial fetch, 3 of 20 open postings came back")
    logger.info("scrape done in 12.0s: 40 employers fetched (1 failed), postings fetched 1200, kept 1150 (900 open), new 50, reopened 3, closed 10, folded 2; 300 requests, 0 answered 429, 0 retried after a network error")
    logger.error("failed employers: Acme")
    logger.info("[db] acme: 20 postings saved")
    row = rec.finish()
    assert rows == [row]
    assert (row["repo"], row["job"], row["stage"], row["host"]) == ("product-role-atlas", "refresh-mba", "scrape", "GitHub Actions 7")
    assert (row["warnings"], row["errors"], row["ok"]) == (1, 1, False)
    assert row["counts"]["kept"] == 1150 and row["counts"]["new"] == 50, "the line with the most counts wins, not the last one"
    assert row["log_path"] == "logs/run.log"
    assert isinstance(row["started_at"], datetime.datetime) and row["finished_at"] >= row["started_at"]
    assert rec.finish() is None, "written once"
    sys.excepthook = rec._hook


def test_a_clean_run_is_ok_and_the_job_defaults_to_the_stage(monkeypatch):
    _main_named(monkeypatch, "pipeline.build_graph")
    monkeypatch.delenv("PIPELINE_JOB", raising=False)
    monkeypatch.delenv("RUNNER_NAME", raising=False)
    rows = []
    rec = log.RunRecorder(insert=rows.append)
    log.setup(level="INFO", stream=io.StringIO(), runs=False)
    logging.getLogger("pipeline").addHandler(rec)
    log.get("pipeline.build_graph").info("graph_mba in 3.2s: 56741 postings (United States), 1200 companies, 278 skills, 4000 edges")
    row = log.finish()
    assert row["ok"] is True and row["job"] == "build_graph" and row["counts"] == {"postings": 56741, "companies": 1200, "skills": 278, "edges": 4000}
    assert row["host"] and row["log_path"] is None
    sys.excepthook = rec._hook


def test_an_uncaught_exception_marks_the_run_failed(monkeypatch):
    _main_named(monkeypatch, "pipeline.extract")
    rec = log.RunRecorder(insert=lambda row: None)
    try:
        seen = []
        rec._hook = lambda *a: seen.append(a)
        rec._uncaught(RuntimeError, RuntimeError("boom"), None)
        assert seen, "the exception is handed on to the previous hook"
        assert rec.row()["ok"] is False
    finally:
        sys.excepthook = sys.__excepthook__


def test_a_failed_insert_is_one_masked_line_on_stderr(monkeypatch, capsys):
    _main_named(monkeypatch, "pipeline.scrape")
    log.hide("sb_secret_abcdefghijkl")

    def insert(row):
        raise ConnectionError("could not connect with key sb_secret_abcdefghijkl")

    rec = log.RunRecorder(insert=insert)
    try:
        assert rec.finish() is not None
    finally:
        sys.excepthook = rec._hook
    err = capsys.readouterr().err
    assert "[runs] not recorded (ConnectionError" in err and "sb_secret_abcdefghijkl" not in err


def test_setup_installs_the_recorder_only_with_the_database_and_not_when_off(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://x")
    monkeypatch.setenv("PIPELINE_RUNS", "off")
    root = log.setup(level="INFO", stream=io.StringIO())
    assert not any(isinstance(h, log.RunRecorder) for h in root.handlers)
    monkeypatch.delenv("PIPELINE_RUNS")
    root = log.setup(level="INFO", stream=io.StringIO())
    rec = [h for h in root.handlers if isinstance(h, log.RunRecorder)]
    assert len(rec) == 1
    rec[0].written = True  # never insert from a test
    sys.excepthook = rec[0]._hook
    monkeypatch.delenv("SUPABASE_DB_URL")
    root = log.setup(level="INFO", stream=io.StringIO())
    assert not any(isinstance(h, log.RunRecorder) for h in root.handlers)


def test_runs_prints_an_aligned_table():
    t0 = datetime.datetime(2026, 10, 26, 7, 17, tzinfo=datetime.timezone.utc)
    rows = [(7, "product-role-atlas", "refresh-mba", "scrape", "GitHub Actions 3", t0, t0 + datetime.timedelta(minutes=95), True,
             {"kept": 1150, "new": 50}, 2, 0, "logs/run_2026-10-26.log"),
            (6, "gradbuddy-research", "rescrape-sp27", "rescrape", "GitHub Actions 1", t0, t0 + datetime.timedelta(minutes=4), False, {}, 0, 1, None)]
    out = runs.lines(rows)
    assert out[0].startswith("id  started           min  repo")
    assert "refresh-mba" in out[1] and "95" in out[1] and "ok" in out[1] and "kept=1150 new=50" in out[1]
    assert "FAIL" in out[2] and len({len(l) for l in out}) <= 3
