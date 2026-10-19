# Build prompt: Skill path

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["skill-path"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["skill-path"] = { mount }`), load `web/games/skill-path.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/skill-path.png`.


Paste everything below the line into a fresh Claude Code thread opened at the root of this repo.

---

You are building one browser game, **Skill path**, in the role atlas (`web/`, a static site with no build step). The
design is finished and approved for build; your job is to build it as specified, not to redesign it.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, evals, the Co-Authored-By trailer), `README.md`, and in `PLAN.md`
   the sections "The interface around journeys (v9)" and "Explore as a skill map (v10)".
2. `games/skill-path/README.md`: the spec. Rules, the choice rule, shortest route, scoring and ranks, difficulty,
   end screen, data sources, edge cases, keyboard, persistence. Where this prompt and the README differ, the README
   wins; tell me about the difference in the PR.
3. `games/skill-path/mocks/*.html` and their `.png`: the look. Five screens at 1280 × 800 on the real tokens. The
   `<style>` block in each mock (all `sp-*` classes) is the starting point for the CSS.
4. `web/atlas.js`, `web/skillmap.js`, `web/app.js`, `web/style.css`, `web/tokens/`.

Open questions in the README have a recommended option. Build the recommended option for each unless I have
answered otherwise in this thread. If I have not answered and you need a decision, ask me as a series of questions,
each with 2 to 4 concrete options and your recommendation marked.

## Branch and PR

- Work on branch `feat/game-skill-path`, created from the current `main`. Never commit to `main`.
- Commits end with the repo's trailer from `CLAUDE.md`: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Before the PR run `node evals/run.mjs` and `python3 evals/run_pipeline.py` (or `.venv/bin/python evals/run_pipeline.py`
  if the venv exists) and the new game eval below; all must pass with no baseline change. Paste the summaries in the
  PR description.
- Open a PR with the GitHub CLI as `CLAUDE.md` says. Do not merge. In the description: what was built, screenshots of
  the three screens (headless Chrome at 1280 × 800, dark and light), the eval results, and any place you departed
  from the README with the reason.

## Integration contract (another session builds the games landing page; it relies on this)

- The game lives at hash route **`#/play/skill-path`**.
- It is listed in `web/data/games.json` as
  `{ "slug": "skill-path", "title": "Skill path", "tagline": "Hop from your field to a new role", "cover": "img/games/skill-path.png", "status": "soon" }`.
  When the game works, change only this entry's `status` to `"live"` (leave the other entries alone). If the landing
  page has not landed on `main` yet, do not create `games.json` yourself; say so in the PR.
- Cover image: copy `games/skill-path/mocks/cover.png` to `web/img/games/skill-path.png` if that file does not exist yet.
- Routing: if `app.js` on `main` already dispatches `#/play/<slug>` (the landing page's work), register the game in
  that dispatch. If not, add the smallest dispatch that serves `#/play/skill-path` and leaves `#/play` to the landing
  page (fall back to `start()` for an unknown slug). Breadcrumbs: `Games` (`#/play`) / `Skill path`.

## Files

- **Add `web/games/skill-path.js`.** Two parts in one file, UMD like `atlas.js`:
  - `logic` (pure, no DOM, loads in node): build the board from the index (drop credentials, `yoe_*` and
    `Atlas.genericSkills()`), arrival skills, start skill (field or role), BFS from the arrival skills, the shortest
    route with its tie-break, the choice rule, a round as a small state machine (hop, answer, step back, out of
    hops, arrived), rank, route fit, build next, the pairing pools per difficulty, and the seeded random pairing.
    Exactly as in the README's "Data sources" and "Scoring" tables.
  - `ui`: the start screen, the play screen (board + check + choices in the side panel), the end screen, keyboard,
    live region, storage.
- **`web/index.html`**: one `<script src="games/skill-path.js"></script>` after `skillmap.js`.
- **`web/skillmap.js`**: add one read-only export and nothing else, e.g. `SkillMap.board = async () => { await load(); return { nodes: data.nodes, byId: data.byId, adj: data.adj, field: data.field, FS: data.FS }; }`.
  The game uses these positions so its board is the Explore map. Do not duplicate `computeLayout`, `fieldShares` or
  the layout cache, and do not call `SkillMap.stage()` from the game. Note `data.adj` includes generic and credential
  links; the game filters its own copy.
- **`web/style.css`**: append the game's styles at the end under the header
  `/* ---------- Skill path (web/games/skill-path.js): the skill map as a board, a route of hops ---------- */`.
  Take them from the mocks' `<style>` block, drop the mock-frame rules (fixed 1280 × 800 body, aside height), and use
  tokens only: no new colours, no hex values. Green = you (route, Yes, chosen), blue (`--secondary`) = the postings'
  numbers and the arrival skills, amber (`--warning`) = Not yet and build next. Skill areas are text, never colours.
- **`app.js`**: only the route dispatch above, if needed.
- **Add `evals/skill_path.mjs`** (and list it in `evals/README.md` under the evals that exist): loads `atlas.js` and
  the game's `logic` in node the way `evals/rough_fit.mjs` loads `atlas.js`, and checks on today's data:
  - the board has 240 skills and 936 links in one connected piece, every skill with at least 2 links;
  - Product Manager (`pm`) arrival skills are Roadmapping, Product strategy, Systems & architecture;
  - Marketing's start skill is Marketing campaigns; par Marketing → `pm` is 3 and the shortest route is Marketing
    campaigns → Consumer products & B2C → Product discovery & validation → Roadmapping;
  - the choices at each hop of the README's played route (Advertising & media, Consumer products & B2C, Product
    discovery & validation, Roadmapping) are exactly the four listed in the README, in that order;
  - Supply chain & procurement → `pm`: start Vendor, budget & contract management, par 4, and the biggest-blue-number
    route of the README runs out of hops 3 short;
  - the random pools from a field are 86 / 313 / 51 (easy / normal / hard);
  - every one of the 53 pickable roles has three arrival skills; no pairing leaves a player with no choice and no
    step back.
  These numbers are today's data. When a data refresh changes them, the eval prints the new values and fails with a
  note to update the README and the eval together (a data branch, per `CLAUDE.md`).

## Rules for this work

- No change to the matcher (`web/match.js`), the taxonomy, the pipeline or any data file. If you find you need one,
  stop and ask.
- Reuse `Atlas.index()`, `Atlas.product()`, `Atlas.genericSkills()`, `ix.baseline`, `ix.roles` (after
  `await Atlas.product()`, so `pmm` is the product PMM, as on the role screen), `ix.groups`, `ix.skillById`.
- Never invent a number. Every number on screen comes from the data at run time; "not read" where the product set
  has no share for an MBA-only skill (README, edge cases).
- Desktop only. Sentence case, plain words, no emoji, no exclamation marks. Map labels at 13px, the token floor.
- Storage: one `localStorage` key, `game-skill-path`, every access in try/catch; the game works with storage
  blocked; nothing is sent anywhere. Yes/Not yet answers are never stored.
- Accessibility as in the README: keys `1`–`4`, `Y`, `N`, `B`, `Esc`; focus moves; a polite live region; the choices
  panel is a complete interface without the map; `prefers-reduced-motion`.
- Scratch files go in the session scratchpad, not in the tree. Do not edit anything under `games/` (the design
  package stays as it was approved), except to report a discrepancy in the PR.

## Done means

- `#/play/skill-path` plays the README's Marketing → Product Manager round with the same choices and numbers as
  the mocks, in both themes; the end screen links to `#/role/pm`, `#/field/product` and `#/explore?field=marketing`.
- The three evals pass; `evals/skill_path.mjs` is new and passes.
- A PR is open from `feat/game-skill-path`, not merged, with screenshots and eval output.
