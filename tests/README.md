# Tests

Fast checks of single functions: stated inputs, stated outputs. No server, no network, no new dependencies. Both
suites run in about a second and in CI on every pull request (`.github/workflows/ci.yml`, with the eval runners after
them).

```sh
node --test 'tests/web/*.test.mjs'         # the browser side (web/*.js), node's built-in runner; quote the glob
.venv/bin/python -m pytest tests/python    # the pipeline; pytest comes from requirements-dev.txt
```

`tests/python/conftest.py` puts the repository root on `sys.path`, so `pytest tests/python` works from any
directory. `tests/web/_load.mjs` holds the paths and a node `Atlas` over `web/data/`.

## Rules

- A test is added for every bug fixed, and it fails before the fix.
- A rule the code breaks but that is not fixed in the same change is a `todo` test (node: `test(name, { todo:
  "finding: ..." }, fn)`) or `pytest.mark.xfail(strict=True, reason="finding: ...")`: it fails the suite the day the
  finding is fixed without the mark being removed. The matcher (`web/match.js`) changes only with its eval baseline
  (`CLAUDE.md`), so its findings wait this way.
- Each test names the behaviour it protects in plain words. Small inline fixtures state the case; real data files
  from `web/data/` only where the rule is about the data. No number copied from today's output without saying why it
  is right.
- Tests never reach the network: `requests.post` and the adapters' session are monkeypatched; secrets are sentinels
  and the logging tests assert no sentinel reaches a log line.
- Scratch tests written while debugging go under `data/experiments/scratch/<topic>/`, not here.
- Tests check one function; evals (`evals/README.md`) run the whole pipeline or matcher on real data against
  baselines. A data refresh moves eval numbers; it must not move a test.

## The Python tests

| File | Covers |
|---|---|
| `test_extract.py` | The cleaner, `norm`, `years_required`, context fixes against the real taxonomy. |
| `test_geo.py` | Both country readers. |
| `test_roles.py`, `test_roles_mba.py`, `test_roles_tech.py` | Pointed titles per role set (the labelled sets are the evals). |
| `test_taxonomy.py` | `tax.validate`: kinds, evidence entries, field entries; the sets never read each other's wording. |
| `test_sponsorship.py` | The visa-sponsorship reader. |
| `test_scrape_merge.py`, `test_scrape_incomplete.py`, `test_scrape_sampling.py` | The backlog rules of `CLAUDE.md`, an incomplete fetch, the tech set's sampling. |
| `test_adapters_common.py` | `strip_html`, the retry loop with a fake session. |
| `test_processed.py` | The gzip switch. |
| `test_build_graph.py` | Share arithmetic. |
| `test_depth_gen.py` | The model call with `requests.post` replaced; the key never reaches a log line. |
| `test_log.py`, `test_runs.py` | Masking; the run recorder's row. |
| `test_backlog.py`, `test_store.py` | The round trip of a raw file; the `atlas-store` rules on a dict bucket. |
| `test_funnel.py` | The funnel's pure parts: drop-off, calls to action, returns, visible time, feedback counts. |
| `test_map_publish.py` | The map publish against a fake client. |

## The web tests

Browser scripts load in node the way the evals load them: each exports itself when `module` exists;
`skillmap.js` needs the stub `window` in its test.

| File | Covers |
|---|---|
| `routes.test.mjs`, `door.test.mjs`, `doors.test.mjs`, `intake.test.mjs`, `launcher.test.mjs`, `pick.test.mjs`, `role_filters.test.mjs`, `network.test.mjs`, `jobs.test.mjs`, `field_chart.test.mjs`, `skillmap.test.mjs` | The pure parts of the screens. |
| `atlas.test.mjs`, `match.test.mjs`, `evidence_text.test.mjs`, `infer.test.mjs` | The data layer, the matcher, the sentences, the model read's merge and the function's validation. |
| `copy.test.mjs`, `assets.test.mjs` | Every string against the writing rule; every script `index.html` names exists. |
| `catalog_files.test.mjs`, `classes.test.mjs` | The two public catalog files and their hashes; the class picker's functions. |
| `capture.test.mjs`, `feedback.test.mjs`, `state.test.mjs`, `journey_ctas.test.mjs` | Capture's rows and the heartbeat; the feedback rule and row; the saved state's requests; the hearts and "Get your tree". |
| `map_gate.test.mjs`, `map.test.mjs`, `tree.test.mjs`, `apprentice.test.mjs` | The sign-in and the route table; `MapModel`; the tree function; the generator's pure part on the tracked example and six broken copies (no test spawns a script). |
| `gameshell.test.mjs`, `know-the-role.test.mjs`, `guess-the-role.test.mjs`, `spot-the-real-ask.test.mjs`, `skill-path.test.mjs`, `wheres-the-demand.test.mjs` | The shell and each game's logic. |
