# Build prompt: Spot the real ask

> **Integration contract (authoritative, added after this package was written).** The site's hook already
> exists: `play()` in `web/app.js` calls `window.Games["spot-the-real-ask"].mount(el, ctx)` when the game's `games.json`
> entry has `"status": "live"`, with `ctx = { Atlas, game, showAside, crumbs, esc }`. Register exactly that
> (`window.Games = window.Games || {}; window.Games["spot-the-real-ask"] = { mount }`), load `web/games/spot-the-real-ask.js` with a
> script tag after `app.js`, clean up on `hashchange`, and do not add another registry or hook. Where this prompt
> describes the hook differently (`render`, `unmount`, a new registry), `games/README.md` wins. The cover is
> already at `web/img/games/spot-the-real-ask.png`.


Paste everything below the line into a fresh Claude Code thread opened at `/Users/WK/product-role-atlas`.

---

You are building one browser game, **Spot the real ask**, in the role atlas: a static site in `web/` (no build
step) that maps what live job postings ask for, for 56 roles across 11 fields. A player sees a short excerpt from a
real posting, marks the phrases that are real requirements, lets the filler pass, and then sees how the atlas read
the same lines. The design is finished. Your job is to build it as specified.

## Read first

1. `CLAUDE.md` (working agreements: branches, PRs, evals, the Co-Authored-By trailer).
2. `games/README.md` (how games plug into the site).
3. `games/spot-the-real-ask/README.md`: the spec. Rules, scoring, ranks, difficulty, the data plan, the chunking
   and labelling rules, edge cases, keyboard and accessibility, persistence. Where this prompt and the README
   disagree, the README wins. Ask the owner about anything left open.
4. `games/spot-the-real-ask/mocks/*.html` and their PNGs: the four screens at high fidelity, on the site's tokens.
   Match them.
5. For the data work: `pipeline/extract.py` (`postings()`, `clean()`, `BOILER_RE`, `ABOUT_RE`, `SENT_RE`,
   `YOE_RE`, `years_required()`, `skills_for()`), `pipeline/tax.py` (`for_roles()`), `pipeline/processed.py`.
6. For the web side: `web/app.js` (router, `play()`, `store`, `esc`, `crumbs`, `page`, `showAside`), `web/atlas.js`
   (`fetchJson`, `index()`, `genericSkills()`), `web/style.css`, `web/tokens/`.

## Branch and boundaries

- Create the branch `feat/game-spot-the-real-ask` from `main`. Never commit to `main`.
- **Do not change** the matcher (`web/match.js`, the match panel in `web/app.js`), the taxonomy
  (`pipeline/taxonomy.json`), `pipeline/extract.py`, `pipeline/build_graph.py`, or any existing file in `web/data/`
  or `data/`. The game reads them. If you find a tagging bug, write it in the PR description and veto the passage.
  Do not fix the taxonomy here.
- The raw postings in `data/raw/` are read only. Never rewrite or re-scrape them.
- No API calls, paid or otherwise. The filler labels come from rules and a human review (open question 3, option A).

## Integration contract

- Route: `#/play/spot-the-real-ask`. In `web/app.js`, change `play(slug)` so that a slug with a built game calls
  that game. For example: `if (window.Games && Games[slug]) return Games[slug]({ main, page, crumbs, showAside, esc,
  store, Atlas })`. Every other slug keeps today's "Coming soon" page. Keep the diff to `app.js` small.
- Card: `web/data/games.json` holds the list (create the file if it does not exist yet, or add to it). The entry,
  exactly:
  ```json
  { "slug": "spot-the-real-ask", "title": "Spot the real ask", "tagline": "Mark what a posting really asks for", "cover": "img/games/spot-the-real-ask.png", "status": "soon" }
  ```
  Copy `games/spot-the-real-ask/mocks/cover.png` to `web/img/games/spot-the-real-ask.png`. Leave `status` as
  `"soon"`. The owner flips it to `"live"`.
- The game script is loaded from `web/index.html` after `app.js` dependencies (`<script src="games/spot-the-real-ask.js"></script>`),
  or loaded lazily by `play()`. Pick one and say which in the PR.
- Links out: "Open <role> →" goes to `#/role/<id>`, using MBA role ids (`brand_manager`) or product family ids
  (`pm`, `pmm`, `tpm`, `product_ops`, `product_analyst`, `product_owner`).
- Nothing the player does leaves the browser. The best rank and history go in `localStorage` key
  `game:spot-the-real-ask`, with every access in `try/catch`.

## Files to add

1. **`pipeline/game_passages.py`**: the build script (`python3 -m pipeline.game_passages`). It writes
   `web/data/game_passages.json`, with the shape and the sampling, chunking and labelling rules in the README
   ("What the file holds", "How passages are sampled and kept short", "Chunking", "The answer key"). Requirements:
   - Reuse, by import: `extract.postings(roleset)`, `extract.skills_for(roleset)` (or `tax.for_roles`),
     `extract.years_required` and `YOE_RE`/`YOE_WORD_RE`, `extract.BOILER_RE`, `extract.ABOUT_RE`. Do not copy
     the patterns.
   - Read US, open postings only. Join to the processed rows (`pipeline.processed`) for `country` and `open`.
   - Work on the **raw** description. Normalise whitespace (U+202F, U+00A0, repeated spaces). Skip mojibake and
     split-letter text.
   - Shares: for each ask chunk's primary skill, the role's share from `web/data/graph_mba.json` `skills[].by_family`
     (MBA) or `web/data/graph.json` (product). Also write `n_jobs` from `graph_mba.json` `meta`.
   - The filler list (`FILLER`) is data at the top of the script, starting from the README table.
   - `pipeline/game_passages_deny.json`: `{ "<passage id>": "reason" }`, empty at first, read by the script.
   - Write a review sheet to `data/experiments/game_passages_review.md` (gitignored): every passage with chunk labels,
     primary skills and shares, grouped by role.
   - Print a per-role count and the file size. Target: at most 12 passages per role, under 1 MB in all.
   - Seeded and deterministic (seed 7). The same inputs give the same file.
2. **`web/data/game_passages.json`**: generated by the script and committed.
3. **`web/games/spot-the-real-ask.js`**: the game. An IIFE that registers `window.Games["spot-the-real-ask"]`. Plain
   DOM, no framework, no new libraries. It contains:
   - screens: how it works (`01`), posting (`02`), reveal (`03`), run end (`04`), as in the mocks;
   - loads `data/game_passages.json` and `data/taxonomy_mba.json` / `data/taxonomy.json` (skill names) through
     `Atlas.fetchJson`, and `Atlas.index()` for the field labels and `meta.n_jobs`;
   - marking by click, by drag (pointer events; a drag that starts on a marked chunk unmarks), and by keyboard
     (Tab, Shift+Tab, Left, Right, Space, Enter, Escape), with `role="checkbox"` / `aria-checked` on chunks and
     a polite live region;
   - the soft 45-second timer, which never ends a round;
   - scoring exactly as the README says (found, missed, false alarm, "not on the atlas's list" is neutral; half asks
     found, half filler let pass; run mean; the rank thresholds);
   - a run of three: easy, medium, hard, different roles and employers, filtered by field when one is chosen;
     avoid passages in `seen`;
   - the reveal side panel: score in words; one fact for one missed ask (primary skill name plus its share in blue);
     the filler note, with the atlas's own share when the filler is tagged; the punchline; "Next posting →" and
     "Open <role> →";
   - `esc()` on every string from the data.
4. **Styles**, appended to `web/style.css` under the header
   `/* ---------- games: spot the real ask ---------- */`. Take them from the `<style>` block of the mocks, leaving
   out the `html, body` mock-frame rule. Tokens only, no raw colours. Check both themes. Green means the player's
   own marks and rank, blue the postings' numbers, amber attention (missed, false alarm). Skill areas are text.
   Sentence case, no emoji, no exclamation marks.
5. **`evals/game_passages.mjs`**: a node check of `web/data/game_passages.json`. Every chunk label is valid. Every
   ask has at least one skill id in the taxonomy of its set. Each block's chunk texts, joined, equal that block's `text` (the script writes `text` on every block). Shares
   are in [0, 1]. No passage over 700 characters. At most 12 per role. One employer per role at most once. The file is
   under 1 MB. Every role id exists in `graph_mba.json` `roles` or `graph.json` `families`. Add one line about it
   to `evals/README.md` under the evals list.

## Steps

1. Branch. Read the files above.
2. Write `pipeline/game_passages.py` and run it. Read the review sheet: at least two passages per field and every
   passage of the thinnest roles. Veto bad passages in the deny file (a false-positive ask, a key that misses most of
   the real asks, broken text) and rerun. Put the per-role counts and the vetoes in the PR description.
3. Write the game and the styles. Run the site (`cd web && python3 -m http.server 8000`), play at least 10 runs in
   both themes, and check the keyboard path from start to finish without a mouse. Tune the rank thresholds if a
   careful first-time read does not land on Careful reader or Recruiter's eye, and say so in the PR.
4. Run the evals and make sure nothing regressed: `node evals/run.mjs`, `python3 evals/run_pipeline.py` (use
   `.venv/bin/python` if the venv exists), and `node evals/game_passages.mjs`. None of the existing baselines
   should change, because the matcher, taxonomy and data files are untouched. If one does, stop and find out why.
5. Commit in logical pieces. Every commit message ends with the repo's trailer:
   `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
6. Push and open a pull request with the GitHub CLI in `tools/bin/gh`. In the description: what was built, the
   passage counts per role, the vetoes, the eval output, screenshots of the four screens, and the four open questions
   from the README with the option you built for each (the recommended ones unless the owner said otherwise). **Do
   not merge.** The owner merges.

## Done means

- `#/play/spot-the-real-ask` plays a full run of three postings with mouse and with keyboard alone, in both themes,
  and ends on a rank with links into three roles.
- The excerpts are real, short, and credited with the employer and a link. The answer key comes from the atlas's
  own patterns and rules.
- `web/data/game_passages.json` is under 1 MB and passes `evals/game_passages.mjs`. The existing evals are
  unchanged.
- No change to the matcher, taxonomy, `extract.py`, or the existing data files. A PR is open and not merged.
