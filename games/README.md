# Games

Short games built on the atlas's data, shown as a grid of cards on the first-visit screen (`#/`), grouped by the fact
they teach, one marked "Start here". Each folder is a design package for one game, written to be built in its own thread:

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
- Code: `web/games/<slug>.js`, a plain script added to `web/index.html` after `app.js` and `gameshell.js`. It registers itself:

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
  after the game, under the game's own root class; look changes only through the tokens.
- The shell: every game draws inside `window.GameShell` (`web/gameshell.js`; PLAN.md, "The games, second pass (v12)").
  `frame(el, { game, role, round, rounds, marks, info, quit, cls })` draws the one header (game · role, the round
  pips, one ⓘ with the rules, the keys, the source and the storage note, one Quit) and returns `{ body, set, live,
  focusMeasure }`; the game renders into `body` and calls `set({ round, role, marks })` as it goes. `foot({ primary,
  quiet })` is the one action row (one primary button or link, one quiet action); `results({ measure, record,
  takeaway, visual, link, why, foot })` is the one end-screen template: the measure in plain words, the change since
  last time, one takeaway, one visual, one link, the evidence behind "Why". `ranked(rows, label)` paints a role's
  ranked list with the player's calls. `keys({ choose, confirm, quit, other })` is the one key convention: 1 to 4
  choose, Enter confirms, Esc quits; everything else is a click; a key shows as `kbd` on its control and nowhere
  else. `info({ rules, keys, source })` writes the ⓘ text. Shared styles live under `.gm-` in one section of
  `web/style.css`. Play first (G1, G9): `start(F, { title, lead, role, play, change, extra })` is the one start
  screen (one sentence, Play on the default role, "Change role" and ⓘ after that); `defaultRole(Atlas, roles)` is
  the one default (the role in the hash, else the profile's first field's largest role, else Product Manager, among
  the roles the game can play); `coachOnce(slug, host, text)` shows the one coachmark on a game's first move;
  `picker(F, { Atlas, roles, field, secondary, onRole })` is the one picker: the Explore field cards, then the
  field's roles with the player's record as the secondary line.
- The record: one `localStorage` key (`games`) for every game, read and written through `GameShell.record`
  (`game(slug)`, `saveGame(slug, patch)`, every access in try/catch; the game plays the same with storage blocked).
  A game keeps its best, its last result and what it needs under `games[slug]`; `played: true` in a patch counts a
  play. No rank titles: the end screen leads with the measure in plain words and the change since last time. Games
  are untimed; a game that had a clock keeps it as a Speed round (the clock alone, no lives), on offer once
  `games[slug].clean` is set by a clean untimed round.
- The Know-your-role record (PLAN.md v12, decision 4): `roles[<roleId>]` in the same key holds the asks met and
  known, the ladders sorted, the postings read and the demand pairs seen. A game writes it at the end of a round
  with `GameShell.record.saveRole(roleId, { label, met, known, ladders, postings, demand })` and reads it with
  `record.knowledge(roleId, asks)`, where `asks` is `record.asksOf(ix, P, roleId)` (the skills at least 40% of the
  role's postings name). `GameShell.knowLine(before, after, label)` is the first line of every end screen ("You know
  9 of the 15 things PM postings ask for · up from 6"); `GameShell.knowCard(...)` is the card the role screen and
  About you show, with "Practise what's missing". A reveal is one takeaway in words, one visual, one link, and the
  evidence behind "Why" (`results`).
- Card: an entry in `web/data/games.json`: `slug`, `title`, `tagline`, `cover` (the "Coming soon" page's image),
  `status` (`"live"` once the game ships; the card is otherwise dimmed and says "coming soon"), and the grid's fields
  (PLAN.md v12, decision 7): `group` (the fact the game teaches: `asks`, `read`, `senior`, `jobs`, `links`), `verb`
  (what you do), `outcome` (what you learn; `{role}` is the role the card opens on, the hub's default role), `rounds`,
  `minutes`, and `start: true` on the one card marked "Start here". The card's line drawing is `DRAW[slug]` in
  `web/app.js`; its meta line ends with the player's state from the games record (`gameState` in `web/app.js`).
- Entry points: the hub's cards open on the player's default role (`?role=`); the role screen's quiet "Practise"
  link opens a round on that role; the fit page's "Practise your gaps" opens a round with `&skills=<ids>`, the gap
  skills a game can put first. Both links point at `PRACTISE` in `web/app.js`.
- Nothing a player does leaves the browser; the record lives in `localStorage` only.

Atlas daily (a Wordle-style daily role) was considered and dropped by the owner (2026-10-18).
