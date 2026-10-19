"""pipeline/log.py: one logger per module, one setup per run, secrets masked."""
import logging
import os

from pipeline import log


def test_get_puts_every_module_under_the_pipeline_logger():
    assert log.get("pipeline.scrape").name == "pipeline.scrape"
    assert log.get("scrape").name == "pipeline.scrape"
    assert log.get("pipeline.adapters.common").name == "pipeline.adapters.common"
    assert log.get("pipeline.scrape").parent is logging.getLogger("pipeline"), "setup configures the one parent"


def test_get_names_the_module_run_with_python_dash_m(monkeypatch):
    import sys
    import types
    main = types.ModuleType("__main__")
    main.__spec__ = types.SimpleNamespace(name="pipeline.scrape")
    monkeypatch.setitem(sys.modules, "__main__", main)
    assert log.get("__main__").name == "pipeline.scrape"
    main.__spec__ = None
    monkeypatch.setattr(sys, "argv", ["/repo/evals/run_pipeline.py"])
    assert log.get("__main__").name == "pipeline.run_pipeline", "a script run by path is named after its file"


def test_setup_writes_the_short_format_to_the_stream_at_the_level_asked(pipeline_log):
    logger = log.get("pipeline.test_log")
    logger.debug("a debug line")
    logger.info("tagged %d postings in %s", 12, "3.0s")
    lines = pipeline_log.getvalue().splitlines()
    assert len(lines) == 2
    assert lines[1].endswith("INFO    pipeline.test_log: tagged 12 postings in 3.0s")


def test_setup_at_info_drops_debug_lines(tmp_path):
    import io
    buf = io.StringIO()
    log.setup(level="INFO", stream=buf)
    log.get("pipeline.test_log").debug("hidden")
    log.get("pipeline.test_log").warning("shown")
    assert buf.getvalue().count("\n") == 1 and "shown" in buf.getvalue()


def test_setup_also_writes_a_file_when_a_path_is_given(tmp_path):
    import io
    path = str(tmp_path / "logs" / "run.log")
    log.setup(level="INFO", logfile=path, stream=io.StringIO())
    log.get("pipeline.test_log").warning("partial fetch")
    with open(path) as f:
        text = f.read()
    assert "WARNING pipeline.test_log: partial fetch" in text, "the file carries the date and the same line"


def test_setup_reads_the_path_from_the_environment_as_run_all_sh_sets_it(tmp_path, monkeypatch):
    import io
    path = str(tmp_path / "run.log")
    monkeypatch.setenv("PIPELINE_LOG", path)
    log.setup(stream=io.StringIO())
    log.get("pipeline.test_log").info("stage done")
    assert "stage done" in open(path).read()


def test_setup_called_twice_does_not_double_the_lines(tmp_path):
    import io
    a, b = io.StringIO(), io.StringIO()
    log.setup(stream=a)
    log.setup(stream=b)
    log.get("pipeline.test_log").info("once")
    assert a.getvalue() == "" and b.getvalue().count("once") == 1


def test_timer_prints_elapsed_seconds():
    t = log.Timer()
    t.t0 -= 2.25
    assert str(t) == "2.2s" or str(t) == "2.3s"
    assert t.seconds >= 2.25


def test_secrets_from_env_reads_key_like_variables_of_the_environment_and_the_env_file(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("# keys\nOPENROUTER_API_KEY='sk-or-FILEVALUE1234'\nOPENAI_API_KEY=sk-FILEVALUE5678\nPORT=8000\nEMPTY_TOKEN=\n")
    monkeypatch.setenv("SOME_API_KEY", "env-value-abcdef")
    monkeypatch.setenv("HOME_DIR", "not-a-secret")
    found = log.secrets_from_env(str(env))
    assert {"sk-or-FILEVALUE1234", "sk-FILEVALUE5678", "env-value-abcdef"} <= found
    assert "8000" not in found and "not-a-secret" not in found and "" not in found


def test_registered_secrets_are_masked_in_messages_and_tracebacks(pipeline_log):
    log.hide("sk-or-v1-MASKME-0123456789")
    log.hide("short")   # too short to be a key; masking it would eat ordinary words
    logger = log.get("pipeline.test_log")
    logger.warning("header was Bearer sk-or-v1-MASKME-0123456789 on a short line")
    try:
        raise RuntimeError("Authorization: Bearer sk-or-v1-MASKME-0123456789")
    except RuntimeError:
        logger.error("request failed", exc_info=True)
    text = pipeline_log.getvalue()
    assert "sk-or-v1-MASKME-0123456789" not in text
    assert "Bearer *** on a short line" in text
    assert "RuntimeError: Authorization: Bearer ***" in text


def test_setup_registers_the_env_files_secrets(tmp_path, monkeypatch):
    import io
    env = tmp_path / ".env"
    env.write_text("OPENROUTER_API_KEY=sk-or-SETUPVALUE-98765\n")
    monkeypatch.setattr(log, "ENV_PATH", str(env))
    buf = io.StringIO()
    log.setup(stream=buf)
    log.get("pipeline.test_log").info("key sk-or-SETUPVALUE-98765 sent")
    assert buf.getvalue().strip().endswith("key *** sent")
