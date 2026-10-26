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

Every run writes one row. When SUPABASE_DB_URL is set (and PIPELINE_RUNS is not "off"), `setup` also installs a
RunRecorder: it tallies the WARNING and ERROR lines, keeps the counts of the stage's summary line (the INFO line
with the most "<number> <word>" and "<word> <number>" pairs, keyed by those words) and, when the process ends,
inserts one row in the `runs` table (pipeline/sql/002_runs.sql): repo, job (PIPELINE_JOB, else the stage), stage
(the module run with -m), host (RUNNER_NAME on GitHub Actions, else the host name), started and finished, ok (no
ERROR line, no uncaught exception), counts, warnings, errors and the log file's path. Nothing in a row is content.
A failed insert is one line on stderr, never an exception; `python -m pipeline.runs` reads the rows back.
"""
import atexit
import datetime
import json
import logging
import os
import re
import socket
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


def setup(level=None, logfile=None, stream=None, runs=None):
    """Configure the "pipeline" logger: stderr (or `stream`), plus `logfile` when given.

    level: a name or number; default PIPELINE_LOG_LEVEL, else INFO. logfile: default PIPELINE_LOG, else none.
    runs: record the run in the `runs` table; default when SUPABASE_DB_URL is set and PIPELINE_RUNS is not "off".
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
    if runs is None:
        runs = bool(os.environ.get("SUPABASE_DB_URL")) and os.environ.get("PIPELINE_RUNS", "").lower() != "off"
    if runs:
        root.addHandler(RunRecorder(log_path=logfile))
    return root


# --- one row per run -------------------------------------------------------------------------------------------

REPO = "product-role-atlas"
_NUM_WORD = re.compile(r"(?<![\w.])(\d+)(?![\d.])\s+([a-z][a-z_]*)")
_WORD_NUM = re.compile(r"\b([a-z][a-z_]*(?: [a-z][a-z_]*){0,2})\s+(?<![\w.])(\d+)(?![\d.])")


def counts_of(message):
    """The numbers of a summary line keyed by their words: "fetched 12, kept 10 (3 open), 2 employers failed" gives
    {"fetched": 12, "kept": 10, "open": 3, "employers": 2}. Elapsed times ("3.2s") and decimals are not counts."""
    out = {}
    for n, word in _NUM_WORD.findall(message):
        out.setdefault(word, int(n))
    for phrase, n in _WORD_NUM.findall(message):
        if phrase.split()[-1] not in ("in", "of", "from", "and", "to", "by", "with"):
            out[phrase] = int(n)
    return out


def stage_name():
    """The module run with -m (pipeline.scrape -> scrape), else the script's name."""
    return get("__main__").name.split(".")[-1]


def host_name():
    return os.environ.get("RUNNER_NAME") or socket.gethostname()


def insert_run(row):
    """One row into public.runs over SUPABASE_DB_URL (psycopg, as pipeline.backlog)."""
    import psycopg
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], connect_timeout=30) as conn:
        conn.execute("insert into public.runs (repo, job, stage, host, started_at, finished_at, ok, counts, warnings, errors, log_path) "
                     "values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)",
                     (row["repo"], row["job"], row["stage"], row["host"], row["started_at"], row["finished_at"], row["ok"],
                      json.dumps(row["counts"]), row["warnings"], row["errors"], row["log_path"]))


class RunRecorder(logging.Handler):
    """Tallies a run and writes its row when the process ends (atexit), or when `finish` is called."""

    def __init__(self, log_path=None, insert=None, repo=REPO):
        super().__init__(level=logging.INFO)
        self.insert = insert or insert_run
        self.repo = repo
        self.log_path = os.path.relpath(os.path.abspath(log_path), ROOT) if log_path else None
        self.started_at = datetime.datetime.now(datetime.timezone.utc)
        self.warnings = self.errors = 0
        self.counts, self.failed, self.written = {}, False, False
        self._hook = sys.excepthook
        sys.excepthook = self._uncaught
        atexit.register(self.finish)

    def _uncaught(self, *args):
        self.failed = True
        self._hook(*args)

    def emit(self, record):
        if record.levelno >= logging.ERROR:
            self.errors += 1
        elif record.levelno >= logging.WARNING:
            self.warnings += 1
        elif record.levelno == logging.INFO:
            counts = counts_of(record.getMessage())
            if len(counts) >= len(self.counts):
                self.counts = counts

    def row(self, ok=None):
        stage = stage_name()
        return {"repo": self.repo, "job": os.environ.get("PIPELINE_JOB") or stage, "stage": stage, "host": host_name(),
                "started_at": self.started_at, "finished_at": datetime.datetime.now(datetime.timezone.utc),
                "ok": (self.errors == 0 and not self.failed) if ok is None else bool(ok),
                "counts": self.counts, "warnings": self.warnings, "errors": self.errors, "log_path": self.log_path}

    def finish(self, ok=None):
        """Write the row once. Never raises: a run that cannot be recorded still ends as it would have."""
        if self.written:
            return None
        self.written = True
        row = self.row(ok)
        try:
            self.insert(row)
        except Exception as e:
            sys.stderr.write(f"[runs] not recorded ({type(e).__name__}: {redact(str(e))[:200]})\n")
        return row


def finish(ok=None):
    """End the run now (the row is otherwise written when the process exits)."""
    for h in logging.getLogger("pipeline").handlers:
        if isinstance(h, RunRecorder):
            return h.finish(ok)
    return None


class Timer:
    """Elapsed seconds since it was made: `t = Timer(); ...; logger.info("done in %s", t)`."""

    def __init__(self):
        self.t0 = time.time()

    @property
    def seconds(self):
        return time.time() - self.t0

    def __str__(self):
        return f"{self.seconds:.1f}s"
