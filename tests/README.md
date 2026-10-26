# Tests

Fast checks of single functions: stated inputs, stated outputs. No server, no network, no new dependencies.

Scratch tests written while debugging go under `data/experiments/scratch/<topic>/`, not here; a test that stays is one a future change could break.

```sh
node --test 'tests/web/*.test.mjs'         # the browser side (web/*.js), node's built-in runner
.venv/bin/python -m pytest tests/python    # the pipeline (pipeline/*.py); pytest comes from requirements-dev.txt
```

Quote the glob: node 26 reads a directory argument (`node --test tests/web/`) as a file and fails. Both suites run in
under a second each. `tests/python/conftest.py` puts the repository root on `sys.path`, so `pytest tests/python` works
from any directory; `pip install -r requirements-dev.txt` once into the venv. Both run in CI on every pull request
(`.github/workflows/ci.yml`), with the two eval runners after them.

## What the Python tests cover

One file per module: `test_extract.py` (the cleaner, `norm`, `years_required`, the four context fixes of PR #49 as
regression tests against the real `pipeline/taxonomy.json`), `test_geo.py` (both country readers), `test_roles_mba.py`
(a handful of pointed titles; the labelled set is `evals/titles_mba.json`), `test_scrape_merge.py` (the backlog
rules of `CLAUDE.md`), `test_adapters_common.py` (`strip_html`, the retry loop with a fake session), `test_processed.py`
(the gzip switch, with the threshold monkeypatched), `test_build_graph.py` (share arithmetic), `test_depth_gen.py`
(the model call with `requests.post` replaced), `test_log.py`, `test_backlog.py` (the round trip of a raw file) and
`test_store.py` (the `atlas-store` rules on a dict bucket: hash skip, no delete, a newer local file kept, bootstrap order) and
`test_runs.py` (the run recorder: the summary line's counts, the tallies, a failed insert as one masked stderr line).

The logging test (`test_depth_gen.py::test_the_api_key_never_reaches_a_log_line`, `test_log.py`): the API key is set
to a sentinel, `requests.post` raises an exception that quotes the request headers, and the captured log must not
contain the sentinel. `pipeline/log.py` masks every registered secret (the `.env` keys at setup, `log.hide(value)`)
in the lines it writes, and the request code never puts headers in a message. Tests never make a network request:
`requests.post` and the adapters' session method are monkeypatched.

A finding that is not fixed in the same change is `pytest.mark.xfail(strict=True, reason="finding: ...")`, the
counterpart of node's `todo`: it fails the suite the day the finding is fixed without the mark being removed.

## Tests and evals

- `tests/`: one function at a time, with small inline fixtures that state the case ("a score equal to a cut point is
  in the band that starts there"). Real data files from `web/data/` only where the rule is about the data (every link of
  the board joins two skills). A test does not assert a number copied from today's output unless it says why the number
  is right.
- `evals/`: the whole pipeline or matcher on real data, against labelled baselines (`evals/README.md`). A data refresh
  moves eval numbers; it must not move a test.

## Rules

- A test is added for every bug fixed, and it fails before the fix.
- A rule the code breaks but that is not fixed in the same change is a `todo` test whose message states the finding
  (node: `test(name, { todo: "finding: ..." }, fn)`). The matcher (`web/match.js`) changes only with its eval baseline
  (`CLAUDE.md`), so its findings wait as `todo` tests.
- Each test names the behaviour it protects in plain words.
- Browser scripts are loaded in node the way the evals load them: `match.js`, `atlas.js`, `app.js` (`parseRoute`) and
  the games export themselves when `module` exists; `skillmap.js` needs the stub `window` in `tests/web/skillmap.test.mjs`.
  `tests/web/_load.mjs` holds the paths and a node `Atlas` over `web/data/`.
