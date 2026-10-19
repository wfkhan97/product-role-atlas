# Tests

Fast checks of single functions: stated inputs, stated outputs. No server, no network, no new dependencies.

```sh
node --test 'tests/web/*.test.mjs'         # the browser side (web/*.js), node's built-in runner
pytest tests/python/                       # the pipeline (pipeline/*.py)
```

Quote the glob: node 26 reads a directory argument (`node --test tests/web/`) as a file and fails. The web suite runs
in well under 10 seconds.

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
