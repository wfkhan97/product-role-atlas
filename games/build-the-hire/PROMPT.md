# Build prompt: Build the hire

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["build-the-hire"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["build-the-hire"] = { mount }`), load `web/games/build-the-hire.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/build-the-hire.png`.


Paste everything below the line into a fresh Claude Code thread opened at `/Users/WK/product-role-atlas`.

---

You are building one browser game for the role atlas: **Build the hire** (slug `build-the-hire`). The design is
finished; your job is to build it as specified, not to redesign it.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, the commit trailer, what touching the matcher means).
2. `games/build-the-hire/README.md` (the spec: rules, cost formula, card draw, match score, ranks, end screen,
   data sources, edge cases, keyboard, persistence). Where this prompt and the README disagree, the README wins
   and you say so in the PR.
3. `games/build-the-hire/scripts/compute.js` (the reference model, runnable in node; your module must give the
   same numbers for the same role and deal).
4. `games/build-the-hire/mocks/*.html` and `*.png` (four screens at 1280×800) and `mocks/bh.css` (the proposed
   styles, tokens only).
5. `web/atlas.js`, `web/app.js` (the router, `play(slug)`, `store`, `crumbs`, `page`), `web/style.css`,
   `web/index.html`, `web/data/games.json`.

## Branch

`git checkout -b feat/game-build-the-hire` from an up-to-date `main`. Never commit to `main`.

## Integration contract

- Route: `#/play/build-the-hire`, with optional query `?role=<id>&deal=<n>` (and `&view=score` for the scorecard).
  Only a role id and a number go in the URL.
- `web/data/games.json`: the entry for this slug already exists. Replace it in place (keep its position and the
  other entries untouched) with exactly:
  `{ "slug": "build-the-hire", "title": "Build the hire", "tagline": "Draft a hire, then let postings judge", "cover": "img/games/build-the-hire.png", "status": "soon" }`.
  Leave `status` as `"soon"` unless the owner says otherwise; say in the PR that flipping it to live is one edit.
- Cover: copy `games/build-the-hire/mocks/cover.png` to `web/img/games/build-the-hire.png`.
- Registry: if `main` already has a games registry (look for `window.Games` or similar in `web/app.js` and
  `web/games/`), use it. If not, add the smallest one: `web/games/build-the-hire.js` sets
  `(window.Games ||= {})["build-the-hire"] = { mount(main, ctx), unmount() }`, and `play(slug)` in `web/app.js`
  calls `Games[slug].mount(...)` when it exists, else shows today's "Coming soon" page. `ctx` passes what the app
  already has: `crumbs`, `esc`, `store`, the query string. Add the script tag to `web/index.html` after `app.js`'s
  dependencies (`atlas.js`) and before `app.js`. That `play()` change is the only edit to `app.js`.

## Files to add or change

- Add `web/games/build-the-hire.js`: the whole game (model, four screens, keyboard, persistence). Plain browser
  JavaScript in the style of `web/app.js` and `web/skillmap.js` (IIFE, `"use strict"`, no build step, no new
  libraries).
- Append the styles to `web/style.css` under a section header
  `/* ---------- game: Build the hire (#/play/build-the-hire) ---------- */`, taken from `mocks/bh.css` without
  the `.mock-frame` rules. Tokens only; no new colours. Green = the player's picks, blue = the postings' numbers,
  amber = attention (over budget, overspend, traps). Skill areas are text.
- Change `web/data/games.json` (the one entry), `web/index.html` (one script tag), `web/app.js` (the `play()` hook)
  and add `web/img/games/build-the-hire.png`. Nothing else.

## What not to touch

- `web/match.js`, `Atlas.matcher()`, `roughFit()`, the match panel in `web/app.js`.
- `pipeline/`, `pipeline/taxonomy.json`, anything under `web/data/` other than the one `games.json` entry, the
  evals' expectation files and baselines.
- `web/atlas.js`: reuse `Atlas.index()`, `Atlas.product()`, `Atlas.role(id)`, `Atlas.fetchJson()` as they are. If
  something seems to need a change there (for example the shared `pmm` id, see the README edge cases), do not
  make it; note it in the PR.

## How to build it

1. Port the model from `scripts/compute.js`: `CFG`, the distinctiveness factor (read `floor` and `full` from
   `data/bands_mba.json` → `scoring.distinct`), prices, pools, the seeded deal, the scorer with its inverted index,
   best-from-dealt, rank, and the verdict lines. Load `Atlas.product()` before building the role picker (the README
   explains why).
2. Check it: in the browser console or a tiny node check, Product Manager deal 130 played with the same choices
   (SQL, Prioritization & trade-offs, Cross-functional leadership, Customer obsession / user empathy) must give
   1,790 matched postings (31.8%), best from the cards dealt 75.7%, rank Recruiting coordinator. Do not commit a
   scratch check; put it in the PR description.
3. Build the four screens to match the mocks: 01 brief and role picker, 02 draft, 03 verdict, 04 scorecard.
   Copy: sentence case, no emoji, no exclamation marks; the punchline is exactly "Hiring managers pay for the
   skills that set a role apart."; the primary verdict button is "See what <role label> postings ask for →" to
   `#/role/<id>`.
4. Keyboard and accessibility as in the README (radio group, 1 2 3, Enter hires, S skips, live region, focus after
   each hire, words alongside every colour).
5. Persistence: `localStorage` key `game:build-the-hire`, every read and write in `try/catch`, best per role kept
   only when the relative score is higher. The game must work when storage throws.
6. Edge cases from the README: small roles (note, no price setting), dry pools, no affordable card, a deal with
   nothing buildable (no rank, no save), product vs MBA roles.
7. Look at it in the browser at 1280×800 in dark and light themes (`cd web && python3 -m http.server 8000`).

## Before the PR

- `node evals/run.mjs` and `python3 evals/run_pipeline.py` (or `.venv/bin/python evals/run_pipeline.py` if the
  venv exists). Both must pass unchanged; you have not touched what they test, so any change in their output is a
  bug in your branch.
- `git diff --stat main` shows only the files listed above.
- No scratch files left in the tree.

## PR

- Commit with a message that says what was built, ending with the repo's trailer:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Push and open the PR with the GitHub CLI (`tools/bin/gh` if present, else `gh`). Title: "Game: Build the hire".
  Body: what was built, the deal-130 check, eval results, screenshots of the four screens, anything that differs
  from the README and why, and the open questions from the README that are still open.
- Do not merge. The owner merges.
