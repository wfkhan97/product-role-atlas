# Build prompt: What does it ask for

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["what-it-asks"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["what-it-asks"] = { mount }`), load `web/games/what-it-asks.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/what-it-asks.png`.


Paste everything below the line into a fresh Claude Code thread opened at `/Users/WK/product-role-atlas`.

---

You are building one browser game, **What does it ask for** (slug `what-it-asks`), into the role atlas, the static site in `web/`. The design is finished; your job is to build it as specified, not to redesign it.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, trailer, evals), `README.md`, `PLAN.md`.
2. `games/what-it-asks/README.md`: the spec. Rules, timers and spawn table, the deal, filler difficulty, scoring, rank cut-offs, Steady mode, end screen, data sources, edge cases, keyboard and accessibility, persistence, out of scope. Where this prompt and the README disagree, the README wins; say so in the PR.
3. `games/what-it-asks/mocks/*.html` and their PNGs: the target look, at 1280 by 800, dark theme. `mocks/what-it-asks.css` holds the proposed styles.
4. `games/what-it-asks/pools.js`: the reference computation of real asks and filler through `web/atlas.js`. Run `node games/what-it-asks/pools.js fpa pm brand_manager` and keep its output: your game must produce the same pools.
5. `web/atlas.js` (`index()`, `product()`, `genericSkills()`, `baseline`, `skillById`), `web/app.js` (the router `route()`, `start()`, `play(slug)`, `store`, `crumbs`, `page`, `showAside`), `web/style.css`, `web/tokens/`.

Do not edit anything under `games/what-it-asks/`.

## Branch

`feat/game-what-it-asks`, from `main`. The landing carousel (`web/data/games.json`, the `#/play/<slug>` route and `play()` in `web/app.js`) comes from `feat/games-landing`. If that branch has not landed on `main` yet, branch from `feat/games-landing` instead and say so at the top of the PR description.

## Integration contract

- Route `#/play/what-it-asks`. The router already sends `#/play/<slug>` to `play(slug)`. Query parameters are read from `location.hash` after `?`: `role=<role id>` (skip the picker), `mode=shift|steady`, `seed=<integer>` (deterministic deal, for tests and screenshots).
- The game registers itself, with no build step: `web/games/what-it-asks.js` is an IIFE that sets `window.Games = window.Games || {}; window.Games["what-it-asks"] = { mount(el, ctx), unmount() }`. `ctx` is `{ crumbs, showAside, params }` passed from `app.js`. It uses the global `Atlas`.
- `web/app.js`, the only lines to change there: in `play(slug)`, when `window.Games && window.Games[slug]` exists, call `mount(main, ctx)` instead of the coming-soon page; keep the coming-soon page for games without a module. In `route()`, before dispatching, call `unmount()` on the game mounted last (next to `SkillMap.leave()`), so timers and key listeners never outlive the route.
- `web/index.html`: add `<script src="games/what-it-asks.js"></script>` after `skillmap.js` and before `app.js`.
- `web/data/games.json`: the entry is `{ "slug": "what-it-asks", "title": "What does it ask for", "tagline": "Tap the real asks, let filler pass", "cover": "img/games/what-it-asks.png", "status": "soon" }`. Change `status` to `"live"` in this PR (the card then shows "Play →"); the owner decides at merge.
- `web/img/games/what-it-asks.png`: copy `games/what-it-asks/mocks/cover.png` there if the file does not exist.
- Styles: append `games/what-it-asks/mocks/what-it-asks.css` to `web/style.css` under the header `/* ---------- game: What does it ask for (#/play/what-it-asks) ---------- */`, without the mock-only rules (`.mock-frame`). Tokens only, no new colours. Green = you, blue = the postings' numbers, amber = attention; skill areas are text.

## Files

- Add `web/games/what-it-asks.js` (one file; aim for under 700 lines).
- Change `web/app.js` (the two hooks above), `web/index.html` (one script tag), `web/style.css` (one appended section), `web/data/games.json` (status).
- Add `web/img/games/what-it-asks.png` if missing.
- Nothing else. **No change** to `web/match.js`, `web/atlas.js`, `web/skillmap.js`, `pipeline/`, the taxonomy or any data file other than `games.json`. If you think atlas.js needs a change, stop and ask.

## What to build

Follow the README section by section. In short:

1. **Pools**, at mount: `await Atlas.index()`, then `await Atlas.product()` (start it immediately and render the MBA fields while it loads; `pmm` must resolve to the product family). Real ask: share ≥ 0.40. Filler: share ≤ 0.10 (≤ 0.15 when a role has fewer than 14 at ≤ 0.10), asked by ≥ 0.40 of another openable non-small role, at ≥ 2 times `ix.baseline`. MBA shares from `graph_mba.json` `skills[].by_family`, product shares from `graph.json` `skills[].by_family`. Skip the `credentials` cluster and `yoe_` ids. Generic asks from `Atlas.genericSkills()` score half. Mirror `pools.js`; do not invent another rule.
2. **Screens**: pick a role (04), how it works (01, four example tiles from the role's own data), shift (02), shift over (03), Steady (05). Copy from the mocks, sentence case, no emoji, no exclamation marks.
3. **Shift loop**: `requestAnimationFrame`, one clock, 50 s, the four-stage table, the 70-spawn sequence built at start with `R = max(asks, 21)` real positions spread evenly (last by spawn 66), filler difficulty by stage, pause on Esc / blur / `visibilitychange` with the board hidden, end at 50 s, third life, or 16 blown slots.
4. **Scoring and rank** exactly as the README tables.
5. **Steady**: three boards of 16, asks split across boards, toggle buttons with `aria-pressed`, arrows, Space, Enter, reveal, same rank rule.
6. **Keyboard**: `event.code` `Digit1..4`, `KeyQ KeyW KeyE KeyR`, `KeyA KeyS KeyD KeyF`, `KeyZ KeyX KeyC KeyV`. Ignore keys while focus is in an input.
7. **Accessibility**: one polite live region for outcomes only; tile buttons named "Q: Roadmapping"; colour never the only cue; `prefers-reduced-motion` removes pop-in, shake, flash and the count-in.
8. **Persistence**: `wia-best-v1` and `wia-mode` in `localStorage`, every access in try/catch.
9. **End screen links**: `#/role/<id>` (primary), Play again, Another role, and two "Next door" roles of the same field.

## Check before the PR

- `node games/what-it-asks/pools.js fpa pm brand_manager` and the game's pools for the same roles agree (add a `?debug=pools` view or a console table that prints counts; remove noisy logging before the PR). Expected: FP&A Manager 27 asks, 78 filler; Product Manager 22 asks, 12 filler at ≤ 15%; Brand Manager 20 asks, 90 filler.
- `node evals/run.mjs` and `python3 evals/run_pipeline.py` (or `.venv/bin/python evals/run_pipeline.py`): both must pass unchanged. You touched no matcher or data, so no baseline should move; if one does, stop and find out why.
- Serve `web/` (`cd web && python3 -m http.server 8000`) and play: a full shift on `fpa`, a shift on `operations_manager` (10 asks, second pass), `pm` (wide filler), `vc_associate` (small sample), Steady on `pm`, keyboard only, with storage blocked (private window), with reduced motion.
- Screenshot each screen at 1280 by 800 with `?seed=1` and compare with the mocks:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --screenshot=/ABS/PATH/out.png "http://localhost:8000/#/play/what-it-asks?role=fpa&seed=1"`
  Look at every PNG and fix what is off. Put scratch screenshots in your session scratchpad, not in the tree.
- No console errors; leaving the route mid-shift stops all timers.

## Pull request

- Commits end with the repo's trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Open the PR with `tools/bin/gh pr create` (see README for the CLI). Title: "Game: What does it ask for". Body: what was built, the files changed, the eval results, the pool check for the three roles, the screenshots, anything that differs from the spec and why, and the open questions from the README that you had to assume an answer for (default to the recommended option).
- **Do not merge.** The owner merges.
