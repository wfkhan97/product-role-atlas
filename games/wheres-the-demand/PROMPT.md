# Build prompt: Where's the demand

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["wheres-the-demand"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["wheres-the-demand"] = { mount }`), load `web/games/wheres-the-demand.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/wheres-the-demand.png`.


Paste everything below the line into a fresh Claude Code thread opened at the repo root
(`/Users/WK/product-role-atlas`).

---

You are building one browser game, **Where's the demand**, into the role atlas (a static site in `web/`, no build
step). The design is finished; your job is to build it as specified, not to redesign it.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, the commit trailer, what may and may not change).
2. `games/README.md` (how a game plugs into the site).
3. `games/wheres-the-demand/README.md`: the full spec (rules, question types, pair selection, difficulty, scoring,
   rank titles, end screen, data sources, edge cases, keyboard and accessibility, persistence). It wins over
   anything in this prompt if they disagree.
4. `games/wheres-the-demand/mocks/*.html` and their PNGs: the four screens. Match them. The `.wd-*` styles in each
   mock's `<style>` block are the starting point for the real styles.
5. `web/atlas.js` (the data layer you reuse), `web/app.js` (routes; `play(slug)` today renders "Coming soon"),
   `web/style.css` and `web/tokens/` (look changes go through tokens only).

If the owner has answered the open questions at the end of the README, follow the answers. Otherwise build the
recommended options: standalone game with a `miniRound` export; MBA roles and fields only (no product set); the
skill question counted in roles with the share check; a random round each time.

## Branch

`git switch -c feat/game-wheres-the-demand` from an up-to-date `main`. Never commit to `main`.

## Integration contract

- Route: `#/play/wheres-the-demand`.
- `web/data/games.json` already has the entry; keep its shape:
  `{ "slug": "wheres-the-demand", "title": "Where's the demand", "tagline": "Guess where the open jobs are", "cover": "img/games/wheres-the-demand.png", "status": "soon" }`.
  Set `"status": "live"` in this PR only when the game is playable end to end.
- Cover: copy `games/wheres-the-demand/mocks/cover.png` to `web/img/games/wheres-the-demand.png`.
- Hook into `play(slug)` in `web/app.js` with the smallest change: if a registry of built games exists
  (`window.Games`, possibly added by another game's PR), register in it; if not, add it:
  `window.Games = window.Games || {}`, and in `play()`, `if (window.Games[slug]) return window.Games[slug].render({ main, page, crumbs, showAside, esc, fmt });`
  before the "Coming soon" page. Breadcrumbs: `[["Games", "#/"], ["Where's the demand", null]]`.
- Load the module with one `<script src="games/wheres-the-demand.js"></script>` in `web/index.html`, after
  `atlas.js` and before `app.js`.

## Files to add or change

- **Add** `web/games/wheres-the-demand.js`: the game. An IIFE that registers
  `window.Games["wheres-the-demand"] = { render }` and exposes `window.WheresTheDemand = { buildRound, miniRound }`.
  Pure pair-building code (`buildRound(ix, roleFiles, rng)`) apart from the DOM code, so it can be tested in node.
- **Append** to `web/style.css` a section `/* ---------- game: where's the demand ---------- */` with the `.wd-*`
  styles from the mocks, on tokens only (no new colours: green `--primary` for the player's right picks,
  blue `--secondary` for counts, amber `--warning` for misses and the last 3 seconds of the timer).
- **Change** `web/app.js` (the `play()` hook only), `web/index.html` (one script tag), `web/data/games.json`
  (status, when live).
- **Add** `web/img/games/wheres-the-demand.png` (the cover).

Do not change `web/match.js`, the match panel in `app.js`, `pipeline/`, `pipeline/taxonomy.json`, `web/atlas.js`,
or any file in `web/data/` other than `games.json`. No new data files.

## Data: reuse `atlas.js`

- `Atlas.index()` → `ix.M` (the raw MBA index) and `ix.groups`. Skip the `product` group.
- **Role counts from `ix.M.roles[id].n_open`, never from `ix.roles[id].nOpen`**: the product set's `pmm`
  family overwrites `ix.roles.pmm` once `Atlas.product()` has run (812 worldwide instead of the MBA role's 613 US).
- Field counts: `ix.groups[k].nOpen` (sum of `n_open` over the field's roles).
- Data date: `ix.M.meta.generated`; total for the punchline: `ix.M.meta.n_open`. Never hard-code either.
- Employer type: `Atlas.fetchJson("data/" + ix.M.roles[id].file)`, count `jobs` with `open !== false` by
  `Atlas.employerType(j)`; labels from `Atlas.EMPLOYER_TYPES`.
- Skill question: `ix.M.skills[].by_family[role] >= Atlas.TIER.core`; exclude `cluster === "credentials"`, ids
  starting with `yoe_`, and the set from `Atlas.genericSkills()`; exclude roles with `small: true`.
- Only counts that are in these files appear on screen. No estimates.

## Behaviour checklist (from the README)

- 10 questions: 1 to 3 in the 2 to 3× band (one role, one employer type, one skill), 4 to 7 in 1.5 to under 2×
  (two roles, two fields), 8 to 10 in 1.2 to under 1.5× (three roles). No entity twice; same-field role pairs
  preferred; one concentrated pair when available; winner side random; fallbacks as specified; `?seed=` for a
  reproducible round.
- 8-second soft timer (bar turns amber at 3 seconds left); time-out costs the point, never the round; pauses when
  the tab is hidden; "No timer" switch on the start screen.
- Answer: both counts in blue, bar in proportion, employers for role cards, verdict words, one line on the gap; no
  auto-advance.
- Results: rank title from the table, score and best, biggest surprise by the three rules, the punchline
  "Nobody reads <n_open> postings by hand. That's the point.", "Counts refresh weekly from live postings. These are
  as of <date>.", buttons Explore the fields → (`#/explore`), Play again, Open <surprise role>; the recap.
- Keys: ← and → pick; Enter and Space move on; Enter starts; Escape returns to the start screen. `aria-live`
  results; focus moves as specified; reduced motion respected.
- `localStorage` key `game.wheres-the-demand`, best plus the last 5 rounds, all access in `try/catch`.
- Sentence case, no emoji, no exclamation marks. Desktop only.

## Check before the PR

1. `cd web && python3 -m http.server 8000`, open `http://localhost:8000/#/play/wheres-the-demand`, play three
   rounds with the mouse and one with the keyboard only; one with "No timer"; one in the light theme. Check that
   every count on screen matches `web/data/graph_mba.json` (spot-check five) and the date matches `meta.generated`.
2. Check in node that `buildRound` with 200 seeds never produces a tie, a repeated entity, or a ratio outside its
   slot's band (except a logged fallback). Keep that check in the scratchpad, not the tree, unless the owner asks
   for it in `evals/`.
3. `node evals/run.mjs` and `python3 evals/run_pipeline.py` (or `.venv/bin/python evals/run_pipeline.py`): both
   must pass unchanged, since you touched neither the matcher nor the data.
4. Delete any scratch files from the tree.

## PR

Commit on the branch with messages that end with the repo's trailer:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Push and open a pull request with the GitHub CLI (`tools/bin/gh` per `CLAUDE.md`; if that path is missing, use `gh`
on the PATH). Title: "Game: Where's the demand". Body: what was built, the screens (attach screenshots), the
checks run and their results, and any departure from the spec with its reason. **Do not merge**; the owner merges.
