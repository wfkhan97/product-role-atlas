# Build prompt: Guess the role

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["guess-the-role"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["guess-the-role"] = { mount }`), load `web/games/guess-the-role.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/guess-the-role.png`.


Paste everything below the line into a fresh Claude Code thread opened at `/Users/WK/product-role-atlas`.

---

Build the browser game **Guess the role** in the role atlas (`web/`, a static site). The design is finished; your job
is to implement it as specified, not to redesign it.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, the commit trailer, what triggers which evals).
2. `games/guess-the-role/README.md`, the spec. It defines the pool, sampling, the distractor rule, the clue rule,
   scoring, rank titles, every screen, edge cases, keyboard, accessibility and persistence. Follow it exactly; where
   it lists an open question, build the option marked *Recommended* unless the owner has answered otherwise in this
   thread.
3. The mocks in `games/guess-the-role/mocks/` (`01-start`, `02-clues`, `03-reveal`, `04-end`, `05-reveal-wrong`,
   HTML and PNG). They are the visual target. Their `<style>` block is the starting point for the game's CSS.
4. `web/atlas.js` (the data layer), `web/app.js` (the router, `play(slug)`, `store`, `crumbs`, `page`, `fail`),
   `web/style.css` and `web/tokens/`.

## Branch

`git checkout -b feat/game-guess-the-role` from an up-to-date `main`. Never commit to `main`.

## Integration contract

- Route: `#/play/guess-the-role`. `app.js` already routes `#/play/<slug>` to `play(slug)`, which today renders a
  "Coming soon" page. Add the smallest hook: when a game module has registered itself for the slug (for example
  `window.Games["guess-the-role"]`), `play` sets the crumbs (`Games` → `#/`, then `Guess the role`), hides the side
  panel, and calls the module's `mount(main, { Atlas, store, crumbs, fail })`. Otherwise it keeps the placeholder.
  The module returns an `unmount` (removes its key listener) that the router calls when the route changes.
- `web/data/games.json`: the entry for this game is already there. When the game is playable, change only its
  `status` from `"soon"` to `"live"` (check how `start()` in `app.js` renders a non-`soon` entry; it shows "Play →"),
  and keep the rest exactly as:
  `{ "slug": "guess-the-role", "title": "Guess the role", "tagline": "Name the job from its skills", "cover": "img/games/guess-the-role.png", "status": "soon" }`.
  Ask the owner before flipping the status if in doubt.
- Cover: copy `games/guess-the-role/mocks/cover.png` to `web/img/games/guess-the-role.png` if that file is missing or
  is a placeholder.

## Files to add or change

- **Add** `web/games/guess-the-role.js`: the whole game (state, data rules, screens, keys). A plain script like the
  others, no build step, no dependencies. It must also load in node (same UMD pattern as `atlas.js`) for its test, so
  keep the data rules (pool, sampling, distractors, clues, scoring, ranks) as pure functions separate from the DOM.
- **Add** a node test, `evals/games_guess_the_role.mjs` (or the place `evals/README.md` suggests for new evals), that
  loads `atlas.js` with `fs` the way the other evals do and checks, over all 48 roles: every role has at least one
  playable posting; every distractor set has three distinct roles, none above similarity 0.90, in a 2 + 2 or
  1 + 1 + 1 + 1 field pattern; every clue set has five distinct eligible skills, none generic, with the giveaway's
  disc > 0. Print the counts the README states (22,483 open, 19,004 playable, 46 roles with 2 + 2) and fail if they
  drift by more than a weekly data refresh can explain (warn, not fail, on count changes; fail on rule violations).
  List it in `evals/README.md`.
- **Change** `web/index.html`: one `<script src="games/guess-the-role.js"></script>` after `atlas.js`, before
  `app.js`.
- **Change** `web/app.js`: only the `play()` hook above. Nothing else.
- **Append** to `web/style.css` a section headed
  `/* ---------- games: Guess the role (#/play/guess-the-role) ---------- */`, every selector scoped under `.gtr`
  (the game's root class), built on tokens only. Port it from the mocks' `<style>` block. Respect the colour rules:
  green = you (right, chosen, your rank), blue = the postings' numbers, amber = attention or wrong; skill areas are
  text. Sentence case, no emoji, no exclamation marks.

## Rules

- Reuse `atlas.js`: `Atlas.index()`, `Atlas.role(id)`, `Atlas.genericSkills()`, `Atlas.fetchJson`, `ix.baseline`,
  `ix.skillById`, `ix.M.roles`. Do not change `atlas.js`.
- Read role metadata from `ix.M.roles[id]`, never `ix.roles[id]`, and never call `Atlas.product()`: the `pmm` id is
  shared with the product set and is overwritten once the product set loads (README, Edge cases).
- Load role files lazily: the first round's on Start, then prefetch the next round's during each round. Never load
  `graph.json`.
- No change to the matcher (`web/match.js`, the match panel), the taxonomy, the pipeline or any data file. If you
  find you need one, stop and ask.
- Never show a posting's title or company before the reveal.
- `localStorage` only, key `game.guess-the-role`, all access in try/catch; the game must work with storage blocked.
- Desktop only.
- Every number the game shows is computed from the data at run time. Do not hard-code the README's numbers into the
  UI.

## Check before the PR

1. `node evals/run.mjs` and `python3 evals/run_pipeline.py`: both must pass unchanged (you touched neither the matcher
   nor the data, so no baseline should move; if one does, find out why before going on).
2. Your new game test passes.
3. Serve `web/` (`python3 -m http.server -d web 8000`), open `http://localhost:8000/#/play/guess-the-role` at
   1280×800 in dark and light, and play a full game with the keyboard only. Compare each screen with its mock PNG.
   Check: the reveal for a `small` role, a wrong answer, a game where Marketing draws `pmm` after visiting Explore
   first, storage blocked (private window), and a slow network (role file not ready when Enter is pressed).
4. Screenshot the four screens and attach them to the PR.

## Commit and PR

- Commits end with the trailer in `CLAUDE.md`: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Open the PR with the GitHub CLI at `tools/bin/gh` (see README): title `Game: Guess the role`, body with what was
  built, the open questions and which option was built, the eval output, and the screenshots.
- Do not merge. The owner merges.
- Delete any scratch files before opening the PR; interim notes go in the session scratchpad or `data/experiments/`.
