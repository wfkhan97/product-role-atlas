# Build prompt: Higher or lower

> **Integration contract (authoritative).** `play()` in `web/app.js` calls `window.Games["higher-or-lower"].mount(el, ctx)` when the `games.json` entry has `"status": "live"`; see `games/README.md`. The cover is already at `web/img/games/higher-or-lower.png`.


Paste everything below the line into a fresh Claude Code thread opened at `/Users/WK/product-role-atlas`.

---

You are building one browser game, **Higher or lower** (slug `higher-or-lower`), into the role atlas, the static
site in `web/`. The design is finished; your job is to build it as specified, not to redesign it.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, the commit trailer, evals), `README.md`, `PLAN.md`.
2. `games/README.md`: how a game plugs into the site. Its integration contract is authoritative.
3. `games/higher-or-lower/README.md`: the spec. Rules, the round step by step, pair selection and the gap bands,
   Field hop, titles, the end screen and its sentences, data sources, edge cases, keyboard and accessibility,
   persistence, out of scope. Where this prompt and that README disagree, the README wins; say so in the PR.
4. `games/higher-or-lower/mocks/*.html` and their PNGs: the target look at 1280 × 800, dark theme.
   `mocks/game.css` holds the proposed styles.
5. `games/higher-or-lower/deal.js`: the reference dealer on the real data. Run
   `node games/higher-or-lower/deal.js pm fpa --seed 7`, `node games/higher-or-lower/deal.js --hop --seed 7` and
   `node games/higher-or-lower/deal.js --sim`, and keep the output: your game, given the same seed, must deal the
   same pairs.
6. `web/atlas.js` (`index()`, `product()`, `baseline`, `skillById`, `TIER`), `web/app.js` (`route()`, `start()`,
   `play(slug)`, `store`, `crumbs`, `showAside`), `web/style.css`, `web/tokens/`.

Do not edit anything under `games/`.

## Branch

`feat/game-higher-or-lower`, from `main`. If `play()` in `web/app.js` or `web/data/games.json` is not on `main` yet,
branch from the branch that adds them (`feat/games-landing`) and say so at the top of the PR description.

## Integration contract

- Route `#/play/higher-or-lower`. The router already sends `#/play/<slug>` to `play(slug)`, which calls
  `window.Games["higher-or-lower"].mount(el, ctx)` when the `games.json` entry has `"status": "live"` and the script
  has registered, with `ctx = { Atlas, game, showAside, crumbs, esc }`. `play()` already sets the breadcrumbs to
  Games / Higher or lower.
- `web/games/higher-or-lower.js` is a plain script (an IIFE) that registers
  `window.Games = window.Games || {}; window.Games["higher-or-lower"] = { mount }`. No other registry or hook.
  It removes its own key listener and timers on the next `hashchange`.
- Optional query parameters, read from `location.hash` after `?`: `role=<set>:<id>` (skip the start screen),
  `mode=one|hop`, `seed=<integer>` (deterministic deal for tests and screenshots, the same `mulberry32` as `deal.js`).
- `web/index.html`: add `<script src="games/higher-or-lower.js"></script>` after `app.js`, as `games/README.md` says.
- `web/data/games.json`: the entry is
  `{ "slug": "higher-or-lower", "title": "Higher or lower", "tagline": "Which skill do more postings want", "cover": "img/games/higher-or-lower.png", "status": "soon" }`.
  Change only its `status` to `"live"` in this PR; the owner decides at merge.
- `web/img/games/higher-or-lower.png`: copy `games/higher-or-lower/mocks/cover.png` there if the file does not exist.
- Styles: append `games/higher-or-lower/mocks/game.css` to the end of `web/style.css` under the header
  `/* ---------- game: Higher or lower (#/play/higher-or-lower) ---------- */`. Tokens only, no new colours. Green =
  you (a right pick, the streak), blue = the postings' numbers (shares and bars), amber = attention (the pick that
  ended the run). Skill areas are text. Note that `.skill` is taken by the role grid: the card's name is `.hl-name`.

## Files

- Add `web/games/higher-or-lower.js` (one file; aim for under 600 lines).
- Change `web/index.html` (one script tag), `web/style.css` (one appended section), `web/data/games.json` (status).
- Add `web/img/games/higher-or-lower.png` if missing.
- Nothing else. **No change** to `web/match.js`, `web/atlas.js`, `web/skillmap.js`, `web/app.js` beyond what the
  contract above already provides, `pipeline/`, the taxonomy, or any data file other than `games.json`. If you think
  one of them needs a change, stop and ask.

## What to build

Follow the README section by section. In short:

1. **Roles and pools**, at mount: `await Atlas.index()`; start `Atlas.product()` at once without awaiting it and render
   the start screen; the product roles show "loading" until it resolves. Build the playable roles exactly as
   `deal.js` `playableRoles()` does: MBA roles from `ix.M.roles` (not `ix.roles`, where the product family `pmm`
   overwrites the MBA `pmm`), skip `small` roles and the MBA Product group and the MBA `pmm`; product families from
   `P.G.families`. Shares: MBA from `ix.M.skills[].by_family`, product from `P.G.skills[].by_family`, as
   `Math.round(share * 100)`. Skip the `credentials` cluster and `yoe_` ids. Key every role `<set>:<id>`.
   Expect 48 playable roles. Do not load role files; the index has every number.
2. **The dealer**: copy `oneRoleDeck()`, `hopDeck()`, `hopSkills()`, `band()`, `rankOf()` and `mulberry32()` from
   `deal.js` as they are. Pool floor 10% (`Atlas.TIER.some`), minimum gap 8, the four gap bands, the coin-flip
   direction, the relaxing steps, Field hop runs of 4 per skill with the right card from another field when possible.
3. **Screens**: start (01), pick (02), right (03), streak over (04), field hop (05). Copy wording from the mocks and
   the README: sentence case, no emoji, no exclamation marks. Long skill names split at the parenthesis (README,
   edge cases).
4. **The context line** after a right pick: the role's share against `ix.baseline[skill]` (mean over the 50 MBA
   roles), "<n> times as often as the average MBA role (<b>%)" when the ratio is at least 1.5, "less often than the
   average MBA role (<b>%)" when it is at most 0.67, otherwise "about as often as the average MBA role". Skip the
   line when there is no baseline. One decimal for the ratio.
5. **The reveal sentence** on a wrong pick: "<Skill>: <n>%, not <higher|lower>." then the row phrase: "Over half of"
   (50+), "A quarter to a half of" (25 to 49), "One in ten to one in four" (10 to 24), "Fewer than one in ten" (below
   10) "<role> postings ask for it."
6. **End screen**: streak, title and distance to the next, reveal, the missed pair, the punchline with the role's real
   posting count, the pairs log, the last runs, and **See what <role> postings ask for →** to `#/role/<id>`.
7. **Keyboard**: `H`/`ArrowUp` higher, `L`/`ArrowDown` lower, `Space` skip the wait, `Enter` start / play again,
   `S` surprise me, `Esc` back to start. Ignore keys while focus is in an input, and between a pick and the end of
   its reveal.
8. **Accessibility**: real buttons, one polite live region for outcomes only, verdicts in words, `<` and `>` in the
   log, `prefers-reduced-motion` removes the count-up, slide and title flash. No timer.
9. **Persistence**: `hol-v1` and `hol-mode` in `localStorage`, every access in try/catch, the shape in the README.

## Check before the PR

- `node games/higher-or-lower/deal.js pm --seed 7` and the game at `#/play/higher-or-lower?role=product:pm&seed=7`
  deal the same first 12 pairs. Same for `fpa` and for `?mode=hop&seed=7`.
- Every number on screen is a share from the index or a posting count; nothing is hard-coded.
- Play a full run in both themes; screenshot the four screens at 1280 × 800 and compare with the mocks.
- Keyboard only: start, play, lose, play again, Esc, without the mouse.
- `localStorage` blocked (a private window): the game still plays; the best shows as none.
- `node evals/run.mjs` and `python3 evals/run_pipeline.py`: both pass unchanged (the game touches neither the matcher
  nor the data; if either changes, something is wrong).

## PR

Open it with `tools/bin/gh pr create` against `main`. Title: `feat: Higher or lower game (#/play/higher-or-lower)`.
The description lists the files changed, the seed check, the screenshots, and any place you departed from the
README and why. Do not merge. Commits end with the repository's trailer from `CLAUDE.md`:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```
