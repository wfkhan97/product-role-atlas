# Tests

Fast checks of single functions: stated inputs, stated outputs. No server, no network, no new dependencies. Both
suites run in a few seconds and in CI on every pull request (`.github/workflows/ci.yml`, with the eval runners after
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
| `test_build_graph.py` | Share arithmetic; the posting-date reader. |
| `test_jobs_open.py` | The flag bits of a Find jobs row: one per set, the tech set's new-graduate mark, the title's graduate mark (each title form, the titles it must not mark) and the start year. |
| `test_depth_gen.py` | The model call with `requests.post` replaced; the key never reaches a log line. |
| `test_log.py`, `test_runs.py` | Masking; the run recorder's row. |
| `test_backlog.py`, `test_store.py` | The round trip of a raw file; the `atlas-store` rules on a dict bucket. |
| `test_funnel.py` | The funnel's pure parts: drop-off, calls to action, the guide's tips by screen, returns, visible time, feedback counts. |
| `test_map_publish.py` | The map publish against a fake client. |

## The web tests

Browser scripts load in node the way the evals load them: each exports itself when `module` exists;
`skillmap.js` needs the stub `window` in its test.

| File | Covers |
|---|---|
| `routes.test.mjs`, `door.test.mjs`, `doors.test.mjs`, `intake.test.mjs`, `launcher.test.mjs`, `pick.test.mjs`, `role_filters.test.mjs`, `network.test.mjs`, `jobs.test.mjs`, `field_chart.test.mjs`, `skillmap.test.mjs` | The pure parts of the screens. |
| `atlas.test.mjs`, `match.test.mjs`, `evidence_text.test.mjs`, `infer.test.mjs` | The data layer, the matcher, the sentences, the model read's merge and the function's validation. |
| `tokens.test.mjs` | Every drawn token pair in `web/tokens/colors.css` (and the `style.css` overrides) holds 4.5:1 in both themes, `--input` 3:1; the light blocks agree. |
| `keyboard.test.mjs`, `resume_return.test.mjs`, `fit_course.test.mjs` | The pure parts of the usability fixes: the drop zone's, the heart's and the view buttons' names; the résumé step's way back (`You.back`, `resumeHref`, `after`); the rail's and the fit screen's counts (`FitCounts`), the course screen's count (`CourseCore`), the first game card, the skill card's role count. |
| `guide.test.mjs` | The guide: the step table against the copy and the routes, the steps a state gets, the due rule, the seen-state with bad values, the cta ids, the run, the card's place; the script order, the flag shipped off, the one hook in `app.js`. |
| `copy.test.mjs`, `assets.test.mjs` | Every string against the writing rule; every script `index.html` names exists. |
| `catalog_files.test.mjs`, `classes.test.mjs` | The two public catalog files and their hashes; the class picker's functions. |
| `capture.test.mjs`, `feedback.test.mjs`, `state.test.mjs`, `journey_ctas.test.mjs` | Capture's rows and the heartbeat; the feedback rule and row; the saved state's requests; the hearts and "Get your tree". |
| `map_gate.test.mjs`, `map.test.mjs`, `tree.test.mjs`, `apprentice.test.mjs` | The sign-in and the route table; `MapModel`; the tree function; the generator's pure part on the tracked example and six broken copies (no test spawns a script). |
| `gameshell.test.mjs`, `know-the-role.test.mjs`, `guess-the-role.test.mjs`, `spot-the-real-ask.test.mjs`, `skill-path.test.mjs`, `wheres-the-demand.test.mjs` | The shell and each game's logic. |

## The UI harness

Playwright (a library that drives a real browser) checks the site as a visitor sees it. It lives in `tests/ui/` and
is not in CI: it needs a browser.

```sh
npm install && npx playwright install chromium   # once
npm test                                         # the web tests above, the same command CI runs
npm run test:ui                                  # the UI specs, as a phone (390×844) and as a desktop (1280×800)
node tests/ui/serve.mjs                          # the server alone: http://localhost:8787, PORT overrides
```

`serve.mjs` serves `web/` as Vercel does: the static files, `web/api/tree.js` at `/api/tree` and `web/api/infer.js`
at `/api/infer`. It reads `.env` first. Without `ANTHROPIC_API_KEY`, `POST /api/infer` answers 503 and the site reads
the patterns alone. Without `CATALOG_SERVICE_ROLE_KEY`, `GET /api/tree` says `key: false` and the tree form says the
build did not go through. `npm run test:ui` starts the server itself, or uses one already on the port.

| File | What it holds |
|---|---|
| `playwright.config.mjs` | The server, the two viewports, the output in `test-results/` (gitignored). |
| `fixtures.mjs` | `test` with the `visitor` fixture; `gotoHash`, `waitForScreen`, `axe`. |
| `smoke.spec.mjs` | Every state reaches home (a fresh visitor: the door), with no unexpected console error; the two health lines. |
| `door.spec.mjs` | The door's chrome passes the door as Skip does; the Tally door's own Skip; Find classes in the top bar right after the return; the step count. |
| `classes.spec.mjs` | Find classes and the campus gate: the rail's classes link, the line on home after a bounce, the lead and the dates, a résumé read with no role, focus across redraws, the detail panel, the gap names, the role list, the band tag's contrast, a professor from the Faculty tab. |
| `phone.spec.mjs` | At 390×844 only: no route scrolls sideways; the rail and the Filters drawer inside the screen; the prep card and the first posting within one screen; the top bar in two rows; the skill map's labels; the game board; About you's summary fits. |
| `keyboard.spec.mjs` | Real key presses: "choose a file" on every drop zone, the posting panel's focus and Esc, the launcher's tiles, Networking's tabs, the feedback sheet's Tab; axe's link, name and contrast rules in both themes. |
| `resume.spec.mjs` | "Add your résumé" on Find jobs and Networking comes back to the same address; the question counts; the AI reader's line; Start over asks first. |
| `fit.spec.mjs` | The course screen's level and count; class links only for a campus address; the rail's count against the fit screen's; the links to the course screen and the game; the intake boxes; one count per thing across screens. |
| `jobs.spec.mjs` | Every card's facts line names a field; the Filters link shows on a phone only. |
| `network.spec.mjs` | The Role box with no match; "Who to look for" from the listed employers; entry-level links for a recruiter; the level rows' names; skill names mid-sentence. |
| `chrome.spec.mjs` | The feedback box's email (empty, one press to use the address on file, checked on Send); the sign-in's invite line, rate-limit line and `next`; About's counts and one draw; the top bar's links, the theme button, the breadcrumbs. |
| `guide.spec.mjs` | The guide with the flag forced on in the page (never in `config.js`): every screen's tips in the state the step table names, the phone sheet, Esc and focus, the cta rows caught. |

The `visitor` fixture gives a page in one state:

- `fresh()`: nothing stored. The page is on the door.
- `campus()`: the door passed with a `@cornell.edu` address. Find classes opens.
- `general()`: the door passed with a `@gmail.com` address. Three verbs.
- `signedIn()`: the session from `tests/ui/.session.json`. Without the file, the test skips.

The door is passed as the site passes it after the Tally form: the return `#/home?email=…&where=`. Home keeps the
answer in `door.email`, `door.where` and `door.seen` (localStorage). The fixture stubs every POST to the Supabase REST
API, so no funnel row, waitlist row or feedback row leaves the machine. Reads, sign-in and the third-party scripts
(Tally, cdnjs) go through. `axe(page, name)` runs the WCAG 2.1 A and AA rules and returns the violations; it never
fails a test. The count goes in the test's annotations.

No `.session.json` has been captured yet, so the signed-in tests skip. The one try (2026-11-06) ended in
`otp_expired`: Outlook's Safe Links opened the magic link first, and the code shares the link's token.

`serve.mjs` reads the shell's environment and `.env`. Where either holds `CATALOG_SERVICE_ROLE_KEY`, a signed-in tree
build on the local server writes to the production `maps` bucket: never submit the tree form locally.

To capture `.session.json` once (it holds a live token: the file is gitignored, never commit or paste it):

1. Run `node tests/ui/serve.mjs` and open `http://localhost:8787/#/signin` in a real browser.
2. Type the invited address and send the link. Open the link in the same browser.
3. The link lands on the site that Supabase allows as a redirect. When that is the live site and not localhost,
   copy the session from there: it is the same project.
4. In the browser console, run `copy(localStorage["maps.session"])`. Paste it into `tests/ui/.session.json`.

The session ends after about an hour. The site refreshes it while it runs, but the file keeps the old token: capture
it again when the signed-in tests fail at sign-in.

