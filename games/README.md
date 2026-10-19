# Games

Short games built on the atlas's data, shown as a carousel on the first-visit screen (`#/`). Each folder is a
design package for one game, written to be built in its own thread:

- `README.md` — how the game works: rules, a round step by step, scoring, the end screen, where its data comes
  from, edge cases, open questions.
- `PROMPT.md` — the prompt to paste into a fresh Claude Code thread to build it.
- `mocks/` — high-fidelity screens (HTML on the atlas's tokens, with a PNG of each) and `cover.png`, the image on
  its carousel card (copied to `web/img/games/<slug>.png`).

Like the inspiration (infisical.com/403, a game about Infisical's own problem), each game is about the atlas's
problem: nobody can read thousands of postings to learn what a role asks for, and every round ends in a real role.

| Game | Folder | One line |
|---|---|---|
| Skill path | [`skill-path/`](skill-path/) | Hop between linked skills from your field to a new role |
| Guess the role | [`guess-the-role/`](guess-the-role/) | Name the role from a real posting's skills |
| Build the hire | [`build-the-hire/`](build-the-hire/) | Be the hiring manager: draft a candidate on a budget |
| What does it ask for | [`what-it-asks/`](what-it-asks/) | The 403 format: tap the real asks, let filler pass |
| Climb the ladder | [`climb-the-ladder/`](climb-the-ladder/) | Sort a skill's statements onto Entry, Mid, Senior, Lead |
| Higher or lower | [`higher-or-lower/`](higher-or-lower/) | Which skill do more of a role's postings ask for |
| Where's the demand | [`wheres-the-demand/`](wheres-the-demand/) | Which role or field has more open postings |
| Spot the real ask | [`spot-the-real-ask/`](spot-the-real-ask/) | Highlight the requirements in a posting, skip the boilerplate |

## How a game plugs into the site

- Route: `#/play/<slug>`, handled by `play()` in `web/app.js`. Until a game is built it shows a "Coming soon" page.
- Code: `web/games/<slug>.js`, a plain script added to `web/index.html` after `app.js`. It registers itself:

  ```js
  window.Games = window.Games || {};
  window.Games["<slug>"] = {
    // el: the main column (empty); ctx: { Atlas, game, showAside, crumbs, esc }
    // Atlas is web/atlas.js (index, product, role, shares, fetchJson…); game is its games.json entry;
    // showAside(html | null) opens or closes the side panel; crumbs([[label, href | null], …]) sets the breadcrumbs.
    async mount(el, ctx) { /* render into el; read data through ctx.Atlas */ },
  };
  ```

  `play()` calls `mount` when the entry's `status` is `"live"` and the script has registered. A game cleans up its
  own timers and listeners on `hashchange`. Styles go at the end of `web/style.css` under a section header named
  after the game; look changes only through the tokens.
- Card: an entry in `web/data/games.json` (`slug`, `title`, `tagline`, `cover`, `status`). Set `status` to `"live"`
  when the game ships; the card then says "Play →".
- Nothing a player does leaves the browser; personal bests live in `localStorage` only.

Atlas daily (a Wordle-style daily role) was considered and dropped by the owner (2026-10-18).
