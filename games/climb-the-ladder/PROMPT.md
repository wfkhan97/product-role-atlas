# Build prompt: Climb the ladder

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["climb-the-ladder"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["climb-the-ladder"] = { mount }`), load `web/games/climb-the-ladder.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/climb-the-ladder.png`.


Paste everything below the line into a fresh Claude Code thread opened at the repository root
(`/Users/WK/product-role-atlas`).

---

You are building one browser game, **Climb the ladder**, for the role atlas: the static site in `web/`, with no build
step. The design is done. Build what it says. Where the design leaves something open, take the option marked
"recommended" and say so in the PR.

## Read first

1. `CLAUDE.md`: working agreements (branches, PRs, commit trailer, what each kind of change requires).
2. `games/README.md`: how a game plugs into the site.
3. `games/climb-the-ladder/README.md`: the full spec (rules, scoring, titles, data sources and counts, edge cases,
   keyboard, persistence, open questions). It is the source of truth.
4. `games/climb-the-ladder/mocks/*.html` and their PNGs (`01-pick`, `02-sort`, `03-checked`, `04-end`,
   `05-checked-bank`), plus `mocks/climb.css`, the proposed styles.
5. `web/atlas.js` (data layer), `web/app.js` (router, `play()`, `store`, `esc`, `pct`, `LADDER_KEYS`, `skillCard`),
   `web/style.css` and `web/tokens/`.

## Branch and PR

- Branch: `feat/game-climb-the-ladder` from `main`. Never commit to `main`.
- Commits end with the repo's trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Open the PR with `tools/bin/gh` (see README). **Do not merge.** The owner merges.
- The PR description: what was built, which open questions you resolved and how (the recommended option, unless the
  owner says otherwise), screenshots of the four screens in both themes, and the test commands with their output.

## Integration contract

- Route: `#/play/climb-the-ladder`. In `web/app.js` `play(slug)`, when `slug === "climb-the-ladder"` and the game
  module is loaded, hand the main column to the game: `ClimbTheLadder.mount(main, { Atlas, crumbs, showAside, esc,
  pct, store })`. Keep the breadcrumbs `Games / Climb the ladder` and no side panel. Every other slug keeps the
  "Coming soon" page.
- `web/data/games.json`: the entry stays exactly
  `{ "slug": "climb-the-ladder", "title": "Climb the ladder", "tagline": "What senior actually means", "cover": "img/games/climb-the-ladder.png", "status": "soon" }`.
  Flip `status` to `"live"` only if the owner asks in this thread.
- Cover: copy `games/climb-the-ladder/mocks/cover.png` to `web/img/games/climb-the-ladder.png` (if it is not there yet).

## Files

- **Add** `web/games/climb-the-ladder.js`: one IIFE that exposes `window.ClimbTheLadder = { mount }`. Logic and DOM
  live here. Keep the pure parts (pool, filter, draw, scoring, verb chain, new words) in functions that do not
  touch the DOM, so they can be tested in node.
- **Add** `<script src="games/climb-the-ladder.js"></script>` to `web/index.html`, after `atlas.js` and before
  `app.js`.
- **Append** to `web/style.css` a section headed
  `/* ---------- game: climb the ladder (web/games/climb-the-ladder.js) ---------- */`, starting from
  `mocks/climb.css`. Drop the mock-only rules (`.mock-frame`, `.mock-note`). Use tokens only, no new colours.
  Green means the player's right rung, blue means the postings' numbers, amber means a wrong rung. Skill areas are
  text.
- **Edit** `web/app.js` only for the `play()` hand-off above. Nothing else in it.

## What to reuse, what not to touch

- Data through `Atlas.index()`, `Atlas.product()` and `Atlas.genericSkills()`; `Atlas.STEPS` for rung order. Do not
  call `Atlas.role()`: the game needs no postings.
- Do **not** change `web/match.js`, `pipeline/`, `pipeline/taxonomy.json`, any file in `web/data/`,
  the evals or their baselines. Do not write the "what changes" lines: that is a data gap the owner fills
  later (see the README).
- Grade names per industry: copy `RUNG_NAMES` from `pipeline/depth_gen.py` into a constant in the game file, with a
  comment that names its source. Use `M.ladders[<l>].levels` where it agrees.

## The logic, in short (details in the README)

- **Pool.** Atlas-written ladders: `graph.json` `skills[].ladder` with all four keys `associate, mid, senior, lead`
  present and not empty (64 today). Postings ladders: `graph_mba.json` `skills[].ladder.<corporate|bank|consulting>`
  with all four keys (18 today). Exclude a ladder if the word-overlap Jaccard between any two neighbouring rungs is
  0.35 or more. That leaves 16 postings ladders today: 11 corporate, 4 bank, 1 consulting. Print the counts in the
  console once at load, in dev only, and check that they match the README.
- **Draw.** For the field picked: candidates are pool ladders whose average share over the field's roles is 10% or
  more, minus `Atlas.genericSkills()`. Use MBA `by_family` for the MBA fields and product `by_family` over the six
  families for Product. Draw five at random, weighted by share. At most two postings ladders. Never two ladders of
  one skill. "Any field" draws from all candidates of all fields. Order the five easiest first (lowest top
  neighbour overlap).
- **Shuffle** so that at least two sentences are off their rung.
- **Score.** Per sentence: 2 on the right rung, 1 one rung off, 0 otherwise. Titles: 0–19 Summer intern, 20–27
  Analyst, 28–33 Manager, 34–37 Senior manager, 38–39 Director, 40 Head of the ladder.
- **What changes.** The verb chain (first word of each rung, with "You " removed), and bold for words new at a
  rung (rule and stop list in the README). Write the "same first word" note from the data. Show a written
  `climb` line only if the skill has one; none does today.
- **Links.** "How to build <skill> →" opens an in-game drawer with `skills[].build` as written. Where there is no
  build step, the link reads "How postings say it →" and goes to the top role. Roles: the top three by share →
  `#/role/<id>`. Skip the MBA `product` group's families. End screen: "Open <field> →" → `#/field/<group>`.
- **Keyboard.** Select with Enter or Space; `1`–`4` places; Backspace returns; Escape clears; Enter on Check checks.
  Drag and drop with pointer events is an extra on top. Use `aria-live` for verdicts. Words as well as colour on
  every result.
- **Persistence.** `localStorage` keys `game.climb-the-ladder.best` and `game.climb-the-ladder.last-field`. Every
  access in `try/catch` (the `store` helper in `app.js`).

## Checks before the PR

1. `node evals/run.mjs` passes. You changed no matcher code, so the baseline must not move.
2. `python3 evals/run_pipeline.py` passes (use `.venv/bin/python` if the venv exists).
3. In node, test the pure functions: pool counts (64 / 16), the filter excluding `engagement_culture` and
   `earned_value_mgmt` (corporate), a draw for every field returning five distinct skills, scoring on the 24 orders
   of four (totals 0, 1, 2, 3, 4, 6, 8 only), and the verb chain and new words on `vendor_mgmt` (Lead new words:
   strategy, budget, across) and bank `ma_execution` (Lead new word: originate). Keep the test as a scratch script
   (session scratchpad or `data/experiments/`), not in the tree, unless `evals/README.md` lists it as an eval to
   build.
4. Serve with `cd web && python3 -m http.server 8000`. Play a full game with the mouse and one with the keyboard
   only, in dark and light. Compare against the mocks at 1280×800. Check the console has no errors.
5. Delete any scratch files from the tree before opening the PR.
