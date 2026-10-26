"""pytest finds the tests here; `pipeline` must resolve from the repository root, whatever the working directory."""
import logging
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def reset_pipeline_log(monkeypatch):
    """Whatever a test did with pipeline.log.setup, the next test starts with no handlers on the pipeline logger.
    No test records a run: PIPELINE_RUNS=off keeps setup from installing the RunRecorder on a machine with .env."""
    monkeypatch.setenv("PIPELINE_RUNS", "off")
    yield
    root = logging.getLogger("pipeline")
    for h in list(root.handlers):
        root.removeHandler(h)
        h.close()
    root.setLevel(logging.NOTSET)


@pytest.fixture
def pipeline_log():
    """A buffer that receives what pipeline/log.py writes at DEBUG and above."""
    import io
    from pipeline import log
    buf = io.StringIO()
    log.setup(level=logging.DEBUG, stream=buf)
    return buf
