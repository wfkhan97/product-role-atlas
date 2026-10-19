"""Logging for the pipeline: one logger per module, one setup per run.

    from pipeline import log
    logger = log.get(__name__)          # in a module
    log.setup()                         # once, in a __main__; reads PIPELINE_LOG and PIPELINE_LOG_LEVEL

Lines go to stderr in a short format and, when a path is given (argument or the PIPELINE_LOG variable, which
run_all.sh sets to logs/run_<date>.log), to that file as well. Levels mean what they say: INFO per stage with
counts and elapsed seconds, WARNING for a skipped record or a partial fetch, ERROR with the exception for a failed
employer. Nothing is written to stdout, so the evals that read a stage's stdout see what they saw before.

Secrets never reach a log line. `hide(value)` registers a value to mask; `setup` registers the values of the
*_API_KEY, *_TOKEN and *_SECRET variables of the environment and of `.env`. The formatter replaces each one with
"***" in every line it writes, so even an exception text that quotes a request header is masked.

Worker processes (pipeline.extract runs a multiprocessing pool, spawned on macOS) do not log: the parent counts
the results it gets back from `imap` and logs them. A child that needs to report something returns it.
"""
import logging
import os
import re
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, ".env")
FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
DATEFMT = "%H:%M:%S"
SECRET_NAMES = re.compile(r"(_API_KEY|_TOKEN|_SECRET)$")
_SECRETS = set()


def get(name):
    """The logger of a pipeline module: `log.get(__name__)` gives "pipeline.scrape" for pipeline/scrape.py, also when
    it runs as `python -m pipeline.scrape` (then __name__ is "__main__" and the module's spec has the name)."""
    if name == "__main__":
        spec = getattr(sys.modules.get("__main__"), "__spec__", None)
        name = spec.name if spec and spec.name else os.path.splitext(os.path.basename(sys.argv[0] or "main"))[0]
    return logging.getLogger(name if name.startswith("pipeline") else f"pipeline.{name}")


def hide(value):
    """Register a secret: it is masked in every log line written after this."""
    if value and len(str(value)) >= 8:
        _SECRETS.add(str(value))


def redact(text):
    for s in _SECRETS:
        text = text.replace(s, "***")
    return text


def secrets_from_env(path=None):
    """The values of the secret-looking variables of the environment and of the .env file (ENV_PATH)."""
    path = path or ENV_PATH
    found = {v for k, v in os.environ.items() if SECRET_NAMES.search(k) and v}
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    if SECRET_NAMES.search(k.strip()):
                        v = v.strip().strip("\"'")
                        if v:
                            found.add(v)
    return found


class Formatter(logging.Formatter):
    """The short format, with every registered secret masked in the written line (message and traceback)."""

    def format(self, record):
        return redact(super().format(record))


def setup(level=None, logfile=None, stream=None):
    """Configure the "pipeline" logger: stderr (or `stream`), plus `logfile` when given.

    level: a name or number; default PIPELINE_LOG_LEVEL, else INFO. logfile: default PIPELINE_LOG, else none.
    Calling it again replaces the handlers, so a test can point the output at a buffer.
    """
    root = logging.getLogger("pipeline")
    root.setLevel(level or os.environ.get("PIPELINE_LOG_LEVEL") or logging.INFO)
    for h in list(root.handlers):
        root.removeHandler(h)
        h.close()
    for v in secrets_from_env():
        hide(v)
    h = logging.StreamHandler(stream or sys.stderr)
    h.setFormatter(Formatter(FORMAT, DATEFMT))
    root.addHandler(h)
    logfile = logfile or os.environ.get("PIPELINE_LOG")
    if logfile:
        os.makedirs(os.path.dirname(os.path.abspath(logfile)), exist_ok=True)
        fh = logging.FileHandler(logfile, encoding="utf-8")
        fh.setFormatter(Formatter("%(asctime)s " + FORMAT.split(" ", 1)[1], "%Y-%m-%d %H:%M:%S"))
        root.addHandler(fh)
    return root


class Timer:
    """Elapsed seconds since it was made: `t = Timer(); ...; logger.info("done in %s", t)`."""

    def __init__(self):
        self.t0 = time.time()

    @property
    def seconds(self):
        return time.time() - self.t0

    def __str__(self):
        return f"{self.seconds:.1f}s"
