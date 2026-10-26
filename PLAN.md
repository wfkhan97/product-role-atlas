# Product Job Graph — Plan

Goal: a Marble-style interactive map (withmarble.com/curriculum) of what product jobs actually
require, built from live postings, where a person can pick a job (or a job family + level), upload a
resume or a list of courses, and see how well they match and what the gaps are.

## Scope (v1)

Role families (product-related):
- Product Manager (APM, PM, Senior PM, Staff/Principal PM, Group PM, Director, VP/Head of Product, CPO)
- Technical Program Manager (TPM)
- Product Marketing Manager (PMM)
- Product Operations
- Product Analyst / Product Data
- Product Owner
- Suggested additions beyond the ask: Growth PM, Platform PM, AI/ML PM (tracked as specialisations,
  not separate families), and Product Designer as a future adjacent family.

Companies:
- Fortune 50 (2026 Fortune 500 ranks 1-50).
- An equal number of startups backed by a16z and Sequoia (portfolio lists scraped from a16z.com and
  sequoiacap.com; only companies with a public Greenhouse / Lever / Ashby / Workday board and >= 1 open
  product posting).

## Pipeline (`pipeline/`)

1. `registry` — one JSON row per company: ATS type + config (Workday tenant, Greenhouse board, ...).
   Built by probing each careers site (`data/raw/registry_*.json`, merged into `data/registry.json`).
2. `scrape.py` — adapters per ATS (greenhouse, lever, ashby, workday, eightfold, phenom, oracle_hcm,
   smartrecruiters, amazon, apple, google). Pulls every posting whose title matches the product-role
   regex, with the full description. Raw cache in `data/raw/jobs/<company>.json`.
3. `extract.py` — rule-based extraction (no LLM key available in this environment) against a curated
   taxonomy of ~170 PM skills/concepts (`pipeline/taxonomy.json`): craft, analytics, technical,
   domain, tools, leadership, credentials. Also pulls years-of-experience and degree requirements and
   classifies family / level / specialisation from the title. Output: `data/processed/jobs.json`.
4. `build_graph.py` — aggregates into `web/data/graph.json`: skill nodes (prevalence per family,
   level, company group), co-occurrence edges, level-progression deltas, and per-posting skill sets.

## Web app (`web/`)

Static site, no build step, published as an artifact and runnable locally. The first interface (v1 to v4: a
force graph with rails of filters and six views, the match flow in a modal) is described in the sections below for
the record; v9 replaced it with pages around the student's journeys.

## Filters (v3)

Role family, level, company group (Fortune 1–50 / 51–100 / 101–250 / 251–500, a16z, Sequoia), industry
(Fortune sectors), company name (search + chips), location (country, remote), years of experience asked,
specialisation from the title, education asked for. Every chip count reflects the other active filters.

## Views (v3/v4)

- 3D map: y = seniority, x and z selectable (kind of role, which path, how common, skill area);
  drag rotates, scroll zooms, a cube frame with seniority lanes gives orientation. Pure SVG projection,
  no 3D library, so every 2D interaction (click, satellites, match highlighting) carries over.

- Career map (default since 2026-10-09): columns = skill area, rows = seniority lanes (quartiles of the
  share-weighted level at which the skill is asked for). It is the one view where position is something a
  student can act on, and it has no rotation state to get lost in; the 3D map is kept as a secondary view.
- Table stakes vs. rare: x = share of the current slice, y = seniority.
- Which path: x = director+ share vs staff/principal share.
- Kind of role: x = TPM/platform/AI share vs PMM/growth share.
- Free: force layout by co-occurrence.
Sub-skills can be shown as satellite dots: on click (default), for every skill, or off.

## Role sets (v5, 2026-10-11)

A role set is a list of roles with its own title rules: `product` (the six product families) and `mba` (the 50
roles of mbapreferred.com's "50 MBA Career Options", `pipeline/roles_mba.py`). Scrape, extraction and the graph
build take `--roles`; the taxonomy is one vocabulary in which a skill is either shared or belongs to one role set
(`pipeline/tax.py`). Only US postings of the MBA set are shown.

## The MBA graph (v6, 2026-10-12)

`pipeline.build_graph --roles mba` writes the data the interface and the matcher need. The interface is not
designed yet; this is the data layer only.

- **One index, one file per role.** `web/data/graph_mba.json` (about 1 MB, always loaded) has every key of
  `graph.json` with `jobs` empty. `web/data/graph_mba/<role>.json` holds one role's postings. The index plus the
  postings of the roles loaded is a graph `web/match.js` reads unchanged. Comparing roles needs the index only.
  Cost: a view across roles ("all postings at one bank") loads many files.
- **Company-balanced shares.** One employer counts for at most 5% of a role (`pipeline/balance.py`). Each posting
  carries its weight `w`. Every share in the index is weighted.
- **What defines a role, kept apart.** `roles.<role>.defining` lists the skills on at least 80% of the role's
  postings that are at least 2.5 times as common as elsewhere (the role's own field). `asks` lists what the role
  asks beyond that. `credentials` lists degrees and experience.
- **Levels: one scale, three ladders.** Every posting has a level on one scale of eight keys, so levels compare
  across roles and the matcher keeps one order. The name of a level depends on the ladder: `corporate`, `bank`
  (banks, private equity, venture capital, asset managers) or `consulting`. A bank Vice President and a consulting
  Manager both sit at `senior`. Each posting carries its `ladder`; the index has the names per ladder.
- **Groups are labels.** The 11 groups in the index name sets of roles for the interface. They do not decide files.
- **Title rules as data.** `web/data/roles_mba.json` has each role's label, group, title patterns (JavaScript
  regular expressions), the roles it covers, the employer rules and the grade patterns of each ladder.
  `evals/roles_mba.mjs` is a reference reader.
- **Evals.** `evals/run_pipeline.py`: labelled titles, levels and countries, 99 golden postings, integrity of the
  processed file and of the graph files, the JavaScript reader against the Python rules, and the matcher on every role.

## Postings backlog and more sources (v7, 2026-10-13)

- **A backlog, not a snapshot.** The raw files keep every posting ever seen, with `first_seen`, `last_seen` and
  `closed`. A closed posting is not listed as open. It counts in shares and statistics for 12 months. The MBA
  set is refreshed weekly (`pipeline.scrape --roles mba --refresh`); entry-level and MBA postings open in
  recruiting windows and close fast.
- **Entry level.** Campus and programme titles count. For 20 roles the analyst and associate grades of the
  function are the role's entry level. Sales manager, general manager and chief of staff have none: people come
  to them from another job. An MBA internship that names a function is that role at entry level.
- **Employers.** 308 listed employers for these roles (60 added for the thin consulting, bank and fund cells),
  and the Fortune banks and investors now have a category. Adapters for tal.net and Yello boards.
- **Not done.** Boards behind a captcha or bot check are left alone (Evercore, Citadel, CBRE). Twelve board
  types have no adapter. A separate student board per bank is not looked up yet. "Entry level for an MBA"
  differs by firm (Consultant at a strategy house, Senior Consultant at Deloitte, Associate at a bank): see the
  entry mark below.

## The entry mark (v8, 2026-10-13)

Which level is "entry" for an MBA graduate? Not one level per ladder. A strategy house hires an MBA as
Consultant or Associate (`mid`), Deloitte as Senior Consultant (`senior`), a bank as Associate (`mid`), and the
corporate roles spread over three levels. "Associate" is the MBA grade at McKinsey and the bachelor's grade at
BCG. So the levels stay as they are, and each posting gets a second fact.

- **Three fields on a posting.** `entry`: `"mba"`, `"pre_mba"` or `null`. `intern`: true or false. `entry_src`:
  the evidence. An MBA internship is `entry: "mba", intern: true`. Internship is a field of its own because
  bachelor's internships exist too, and the interface needs both pairs.
- **Two kinds of evidence, kept apart.** `title` and `text`: the posting says who it is for ("MBA", "Summer
  Analyst", "currently pursuing an MBA", "graduating 2027"). `firm` and `category`: the title is the grade that
  group joins at (McKinsey Associate, an investment bank's Associate). A grade mark does not say the posting is
  for new graduates; most such postings also ask for experience. The index counts both: `n` and `posted`.
- **`null` means "experienced hire or no evidence".** A plain "Financial Analyst" has no mark. A low level is
  not evidence.
- **The table is data** (`pipeline/entry_mba.json`): nine firms and two categories, each row with its source
  and `basis` (`primary`: the firm's own posting or page; `secondary`: a guide or another office). It is
  exported in `web/data/roles_mba.json` for the resume reader.
- **Order of rules.** A job about students (a campus recruiter) and a posting for PhD graduates only get no
  mark. Then: the firm's row; a title that names the audience; a line of the text that says who the posting is
  for; the category default for the grade; "Summer Associate"; a text that asks for no experience; campus
  words, an internship or a programme (read as pre-MBA).
- **Not built, on purpose.** No default for private equity, venture capital, asset management, commercial
  banking, the Big Four other than Deloitte, or brand management: the research has only secondary sources, or
  our postings contradict it (see `evals/NOTES.md`). The interface is not designed; label text is in
  `meta.entry` of the index.

## The interface around journeys (v9, 2026-10-13)

The one-screen analyst tool (rails, thirteen filter sections, six map views, eleven area colours) is replaced by
pages for the journeys a student has. Audit and pattern picks are in the session notes (`data/experiments/ui_audit.md`,
`ui_design.md`, gitignored); the decisions are the owner's (2026-10-13).

- **First visit.** A choice: "Tell us about you" (three questions, an optional resume; the answers pick the fields)
  or "Explore the roles". Desktop only; there is no phone layout.
- **Explore.** The fields as circles sized by open postings (ten MBA groups plus Product), then the roles of a
  field sorted by open postings with what defines each, then the role screen. Breadcrumbs carry the path. The MBA
  set's own product group is not shown: the Product field opens the product role set.
- **The role screen.** One layout for both role sets, no legend: rows by how many postings ask for a skill (over
  half, a quarter to a half, one in ten to one in four), two columns (asked at every level; asked at least 1.5
  times as often in leadership postings as in entry ones, measured over the whole role so a level filter re-ranks
  without moving skills), skill areas as text labels inside a cell, ◆ for the skills that define the role, a blue
  share bar on every skill. A level filter and an employer-type filter re-rank the grid. A skill opens in a side
  panel: definition, sub-skills with their shares in the view, example sentences from postings by level group, the
  level ladder, build steps, postings that ask for it, skills often asked together. A posting opens in the same
  panel. Why not a map: within a role the level profile of most skills is flat (30 to 45% of a role's skills are
  asked more at senior levels, the rest at every level), so a seniority axis spreads nothing; and three colours
  with meaning (green = you, blue = the postings' numbers, amber = gaps) replace eleven colours without.
- **Tell us about you (step 2).** Three questions (where you are, what you look for, which fields) and an optional
  resume, read in the browser. The answers and the resume stay in local storage. A rough read of the resume
  against the index alone (the share of each role's main asks it shows, and the roles it says the person held)
  picks the fields on Explore and marks roles in a field; the band of fit needs the role's postings and comes on the
  fit screen. A student sees the entry grade first.
- **Your fit (step 2).** The matcher is created the way the bands were calibrated (the MBA set with the
  distinctiveness weighting and a baseline of mean shares over the 50 roles; the product set without). The band is
  the headline on a four-step scale; no percentage anywhere. A group without bands gets a sentence that says so
  and the evidence without a verdict. Then: what to evidence next (three gaps, with the industry and AI slots in
  plain words), what the resume shows, presumed skills, gaps, named-not-shown, and disclosures for "say it in this
  field's words", credentials and industries, unread lines. The grid is painted: green shows it, amber dashed is a
  gap; presumed skills stay plain.
- **Check a course (step 3).** A syllabus or course description, read as a student's course list: a mention counts.
  The screen lists the role's skills the text names (with the share of postings that ask for each), the skills most
  postings ask for that it does not name, which of the person's gaps it covers when a fit was read, and the grid
  painted. It cannot tell a course that teaches a skill without naming it the way postings do.
- **Prepare for an event (step 3).** One screen per field with three kinds. Networking: the roles by open postings
  with the one or two skills that set each apart (the defining skills, else the most asked skills that are not
  generic to every role), the three skills the resume shows that most of these roles ask for, and the employers
  hiring now from the field's postings. Employer roundtable: role by role, the skills most postings ask for that the
  resume shows with the line that shows it, and two they may ask about. Hackathon or case: the skills most roles of
  the field ask for that the resume does not show, with the build step where one is written. No event data exists:
  "who is in the room" means the field's roles, not a guest list.
- **Step 5.** Everything the first four steps left as a note is done or measured: the rough read on Explore has the
  shape of the full score and an eval against it (`evals/rough_fit.mjs`); the product families get defining skills
  by the MBA build's own rule; "generic" skills are measured (asked by most postings of at least half the roles);
  the roundtable runs the full matcher on each role; the course reader counts sub-skill hits and keeps the last
  course; a "Graduates and interns" chip filters on the entry mark.
- **Filters (step 4).** One pattern everywhere: a chip row with counts. On the role screen: Level and Employers in the
  row; Industry, Employer (search) and Location (countries and remote for the product set; US only and remote for
  the MBA set) behind "More filters", a sheet under the row with the same chips. Filters set in the sheet show in
  the row as removable chips when it is closed. Every count reflects the other filters. The fit and course screens
  read the same view. Dropped for good, per the audit: investor, funding stage, years asked for, specialisation and
  degree filters; the five map views and the 3D controls; the sub-skills toggle; the area colour legend; the
  percentage ring and meters.

## The first visit: games, then what jobs ask for (v11, 2026-10-18)

Owner's decisions (2026-10-18): the first screen leads with games. The top two thirds are a header ("What do MBAs
go on to do after grad school?") and a carousel of game cards; the bottom third keeps "See what jobs ask for, and
how you fit" with its two choices (tell us about you, explore the roles). Each card opens `#/play/<slug>`, which
says "Coming soon" until that game is built. The card list is data (`web/data/games.json`), so a game ships by
adding its screen and setting its `status` to `live`. Eight games are designed in `games/`; a Wordle-style "Atlas
daily" was considered and dropped.

## The games, second pass (v12, 2026-10-20)

An audit of the eight games on 2026-10-20 (artifact https://claude.ai/artifact/BagFBr66e2UZHRfuSj7iNP; local copy and
screenshots in `data/experiments/games_audit_2026-10-20/`, gitignored) found four causes behind "hard to start, not
fun, gimmicky, nothing learned": a rulebook and a setup form before the first move (141 to 294 words, up to 22
controls and 3 decisions); eight different shells, key sets, end screens and rank ladders (43 invented titles, the
lowest one on 7 of 8 first visits); reveals that show every number instead of one takeaway (Guess the role about
150 words and 20 numbers, What does it ask for Steady 48 numbers on one board); and a first round that is the
hardest one (Shift mode out of lives at 0:12, Where's the demand opening on an employer-type pair of 20 against 24,
a Skill path route that follows the biggest number failing by design). Four games taught the same fact (the share
of a role's postings that ask for a skill) through four mechanics.

Owner's decisions (2026-10-20), all the audit's recommendations:

1. **Five games and one tool, not eight.** Keep Spot the real ask, Climb the ladder, Guess the role. Merge Higher
   or lower, What does it ask for and Build the hire into one game, **Know the role**: pick or call the asks of one
   role, end on the role's own ranked list with the player's calls painted on it. Where's the demand becomes
   **rank the fields** (five fields in order of open postings, then five roles of the player's field). Skill path
   becomes a card game without the map (the map drawn once, on the end screen) plus an unscored **route planner**
   on the Explore map (from, to, shortest route, the player's skills ticked). The retired games' code, evals,
   `games.json` entries and covers go; their design packages in `games/` stay as history with a note at the top.
2. **Untimed by default, no lives.** A Speed round of the same game unlocks after one clean untimed round and is
   marked as the challenge it is; the clock alone, no lives, no blown slots, no multiplier.
   Built as (2026-10-20, step 1): "clean" is a finished untimed game with at least half the measure (Guess the role
   half the rounds right, Where's the demand 5 of 10, Spot the real ask half the asks found, What does it ask for
   half the asks known with at most two filler picks); the games that never had a clock set no Speed round. What
   does it ask for keeps its Shift only as the Speed round (the clock alone), with Steady as the game.
3. **No rank titles.** The end screen leads with the measure in plain words ("You know 9 of 15 · up from 6").
4. **A Know-your-role record** per role in the browser (asks met and known, ladders sorted, postings read, demand
   pairs seen), written by every game, shown as a card on the role screen beside the action row, on About you,
   and as the first line of every end screen; "Practise what's missing" starts a round from it. Nothing leaves
   the browser.
5. **Entry points.** A quiet "Practise" link in the role screen's action row opens a round on that role;
   "Practise your gaps" on the fit page builds a Know-the-role round from the gap skills. The hub stays as the
   overview (see 7).
6. **Skill path**: card game (1A) plus the route planner tool (1C).
7. **The first screen** keeps the games on top, as a grid of all cards grouped by the fact they teach (what a role
   asks for · how postings read · what senior means · where the jobs are), one card marked "Start here", each card
   with a line drawing of its mechanic, a verb line, an outcome line naming the role it will open on, and a meta
   line (rounds · minutes · the player's state). The carousel goes. Section B (tell us about you / explore) keeps
   its place below.
   *Revised 2026-10-25 (owner, #89): the grid by group laid one or two cards per row under five headings, so six cards
   ran the length of the page and pushed "See what jobs ask for" below the fold. The cards are one horizontally
   scrolling carousel row, in the order of the facts they teach, each card naming its fact as an eyebrow; nothing
   else on a card changed.*

Conventions for every game after this pass (the audit's G1 to G10):

- **One shell.** Header: game · role, round pips ("2 of 5"), one ⓘ (rules, keys, provenance, the storage note), one
  Quit. Body: the game. Footer: at most one primary and one quiet action. Keys: 1 to 4 choose, Enter confirms,
  Esc quits; everything else is a click; a key shows as `kbd` on its control and nowhere else.
- **One results template.** The measure, one takeaway in words with one visual (a bar against the role's ranked
  list, or the phrase coloured in place), one link, the evidence behind a "Why" disclosure.
- **Play first.** One sentence under the title and Play on a default role (the profile's first field, else the
  role the player came from, else Product Manager); one coachmark on the first move; "Change role" and ⓘ after
  that. Where a picker is still needed it is one shared component: the Explore field cards, then the field's
  roles with the player's record as the secondary line.
- **Round one is winnable.** From the player's own field, the easy band, untimed, with a second try at half
  credit; the ramp happens inside the session and is announced; no round ends on the first mistake.
- **One storage record** for all games (`localStorage`, every access in try/catch), replacing the eight keys.

Per-game shapes (the audit's options chosen):

- **Know the role** (merges HOL, WIA, BTH): one board of twelve skills, "Pick the five that most <role> postings
  ask for" (WIA2-A / BTH1-A), or eight over-or-under calls against the role's top ask as the anchor (HOL1-A); the
  reveal and the end screen are the role's ranked list with the twelve (or eight) placed and the calls marked, one
  line per miss ("Learning programmes: 6% of MC postings ask for it; 73% of Org Development Manager postings do").
  Decoys are the skills other roles prize (the WIA filler pool). Field hop is a second round type offered after the
  first round, not a mode.
- **Guess the role**: five rounds, three clues, the first clue already distinctive, a second guess for half the
  points, the player's fields first (GTR1-A); the reveal leads with the giveaway as the takeaway, one bar against
  the all-roles average, the posting as a link, "Why not <your answer>?" behind a disclosure (GTR2-A).
  Built as (2026-10-20, step 6): 300 / 200 / 100 points by the clue, half on the second guess, 1,500 a game; the
  first clue is the first of the more distinctive half of the candidates (never the skill every role asks for), the
  second the most distinctive but the giveaway; the fields are the profile's, in its order, then the rest shuffled.
  The Speed round (20 s a clue) stays. "Why not X or Y?" names both wrong guesses.
- **Climb the ladder**: starts on the target role's top skill with the ladder on screen and the first sentence
  pre-placed on Entry as the example (CL1-A); the checked screen is the measure, the ladder in the right order with
  misplacements marked, the verb chain as the takeaway, Next; build steps, roles and grade names behind More (CL2-A).
- **Where's the demand**: rank the fields, reveal as the Explore cards' bars with the gap line and employer count as
  the why; no clock (WID1-B, WID2-A). The employer-type and skill-across-fields question kinds go.
  Built as (2026-10-20, step 6): two rounds, "N of 5 in place"; click the cards in order (1 to 5), or drag a placed
  card; no two cards with the same count on a board (Banking and Marketing tie at 1,928, so never together). The
  player's field is the profile's first MBA field, else the one chosen last time, else the largest; round two is its
  roles, topped up with the largest roles of other fields when it has fewer than five. The takeaway is the card the
  player put furthest from its place against the card that sits where they put it; fields give the role count as
  the why (a field's employer count would double-count), roles the employer count. Without a clock there is no Speed
  round for this game any more; the record keeps best and last "in place" out of 10.
- **Spot the real ask**: one line at a time, Real ask / Filler, the verdict in place with the skill and its share,
  "3 of 7 found" as the meter; the whole posting coloured is the end of the round (SRA1-A); after a found ask, the
  resume line the fit page would write (SRA1-C). No clock.
  Built as (2026-10-20, step 6): a line is an ask or filler chunk shown inside its bullet, the phrase in question
  underlined; "other" chunks (no atlas rule) are never asked about and show plain. The scorer is unchanged (half the
  asks found, half the filler let pass), fed by the line calls. The rank titles (`RANKS`) are gone. The reveal is the
  results template: the whole posting coloured (four states, no inline tags), one fact about the top missed ask,
  and "Say it on your resume": for up to three found asks, one evidence sentence from how postings say it (the same
  sentences the skill card and fit page quote; there is no resume-line generator to borrow). No clock, so no Speed
  round for this game any more.
- **Skill path**: from the profile's field to the fit page's target with one line ("From Marketing to Product
  Manager in 3 hops"), no difficulty (budget is par plus two) (SP1-A); the round is a row of four cards with the
  target's share on each and a strip of hops, the map on the end screen (SP2-A); "Can you already show it?" asked
  once at the end on the route, pre-ticked from the resume (SP3-A); a hop is good when the target asks for it and
  the round ends on a top-three skill, no hidden par (SP4-A). The route planner on Explore is SP2-C.
  Built as (2026-10-20, step 7): the round is a row of four cards (name, area, the target's share and a bar, ★ on a
  skill that ends the round) under a strip of hops; no map and no side panel in play. A hop is good when the target's
  share is 25% or more (the arrival skills' own floor); the measure is "Arrived in 4 hops · 2 of 4 good" or "2 hops
  short · 1 of 3 good". The budget is still the shortest route plus two, shown as "hops left · shortest route N"; the
  shortest route is a comparison on the end screen, not a score, and the rank titles are gone. "Tick the hops you
  can already show" is a checkbox per skill of the route on the end screen; the ticks come pre-filled from the
  resume on file through the fit page's own matcher (`SkillPath.tools.evidence`, the evidenced and transferable
  skills), feed Build next and the Know-your-role record (route met, ticked known), and are saved as they change.
  The map is drawn once, on the end screen, with the route, the shortest route and the arrival skills. The route
  planner is `SkillMap.planner` on the Explore map view: a field and a role, Show route, the shortest route drawn in
  green on the map with ✓ on the skills the resume shows, the hop count, the shares and Build next in one line; the
  role in the hash (`?role=`) is its target. The random pairing pool is one pool (a shortest route of 2 to 6 hops).

Build order, one branch and one PR each, each branch cut from the one before (cascading, no worktrees; retarget the
next PR to main before a base branch is deleted):

1. `feat/games-2-1-shell`: the shared shell, results template, key convention, storage record, untimed default,
   rank titles removed, keys and notes off the body copy (G2, G6, G7, G8). Logic and evals untouched.
   Built as (2026-10-20): cut from `main` (PR #67 had merged by then) as `web/gameshell.js` plus one `.gm-` section
   in `web/style.css`; the record key is `games`. The rank functions left the two rules objects tests cover (Guess
   the role's `rules`, Climb the ladder's exports) with their tests; `rank` stays in Skill path's `logic` and
   `RANKS` in Spot the real ask's until steps 6 and 7 re-point their evals.
2. `feat/games-2-2-start`: play-first start on a default role, coachmark, ⓘ, the shared picker (G1, G9, SP1, BTH1
   start, HOL2, CL1, WIA2 start).
   Built as (2026-10-20): `GameShell.start`, `defaultRole`, `coachOnce` and `picker`. The default role is the role
   in the hash (`?role=`, the role the player came from) first, then the profile's first field's largest role, then
   Product Manager: a "Practise" link that names a role must land on it, so the hash outranks the profile. Climb
   the ladder draws by role now (the role's top skill first, its Entry sentence placed); Skill path fixes the budget
   at par plus two and keeps its from/to form behind "Change route"; Higher or lower offers Field hop as the quiet
   action of its end screen.
3. `feat/games-2-3-hub`: the hub grid, Practise on the role screen, Practise your gaps on the fit page (H1, H2, G10).
   Built as (2026-10-20): a fifth group, "How skills link", holds Skill path (the four groups in decision 7 have no
   place for it). "Start here" and both Practise links point at What does it ask for until step 5 builds Know the
   role (`PRACTISE` in `web/app.js`); "Practise your gaps" passes the gap skills as `&skills=`, which What does it
   ask for puts on its first board.
4. `feat/games-2-4-record`: one takeaway per reveal and the Know-your-role record (G3, G4, GTR2, BTH3, CL2).
   Built as (2026-10-20): the record lives under `roles` in the one `games` key (`GameShell.record.saveRole`), one
   entry per role: the asks met (dealt in a game) and known (got right: picked on a board, called right in Higher or
   lower, hired in Build the hire, a clue of a round answered right in Guess the role, found in Spot the real ask, a
   ladder sorted right in Climb the ladder, a hop you can show in Skill path), the ladders sorted, the postings read
   (Guess the role, Spot the real ask) and the demand pairs seen (Where's the demand, per role on a card). A role's
   asks are the skills at least 40% of its postings name (What does it ask for's cut), so "9 of 15" means the same
   on every screen. The card sits beside the role screen's action row with "Practise what's missing"; the ranked
   list marks the asks known with ✓; About you lists the roles with a record.
5. `feat/games-2-5-know-the-role`: Know the role from WIA Steady and HOL (WIA1, WIA2, HOL1, BTH1, BTH2); HOL, WIA
   and BTH retired.
   Built as (2026-10-20): `web/games/know-the-role.js` with `games/know-the-role/README.md`, three rounds on one role
   (a board of twelve, eight calls against the anchor, a second board; "Try the same skill across fields" swaps the
   second round for the field hop: the role's top ask over eight roles of other fields). The pools are What does it
   ask for's (asks at 40%, decoys other roles prize); the ramp is inside the game (the first board's decoys from
   another world, the first calls 20 points from half). The three retired games had no eval, so nothing was re-pointed;
   `evals/game_know_the_role.mjs` is new. "Start here" and both Practise links now open Know the role.
6. `feat/games-2-6-demand-guess-spot`: rank the fields (WID1, WID2), Guess the role shortened (GTR1), Spot the real
   ask line by line (SRA1).
   Built as (2026-10-20): `evals/games_guess_the_role.mjs` re-pointed to the three-clue rule (its README counts
   updated: 20,313 playable of 22,367 open, the relaxed rule needed for 364); `evals/game_spot_scoring.mjs` replaced by
   a line-by-line scorer eval (five simulated readers answering every line); Where's the demand had no eval and gets
   `tests/web/wheres-the-demand.test.mjs`; `tests/web/spot-the-real-ask.test.mjs` is new.
7. `feat/games-2-7-skill-path`: the card game and the route planner (SP1 to SP4).
   Built as (2026-10-20): `evals/skill_path.mjs` replaced by the card game's checks (the board, the README's round
   under the new rules with the ★ marks, build next with and without ticks, the biggest-blue-number route from Supply
   chain, the one random pool of 454 from a field and 2,113 from a role, four simulated players on every pairing);
   `tests/web/skill-path.test.mjs` re-pointed (no ranks, no difficulty, the ticks, the order of a pairing's best).

The game evals test data rules, not screens; steps 1 to 4 leave them intact. Steps 5 to 7 change the rules of five
games and re-point or replace their evals and baselines in the same PR (`evals/README.md`, "Game evals").

## Explore as a skill map (v10, 2026-10-18)

Owner's decisions (2026-10-18): one map for both role sets, MBA links as they are, every link drawn faint, on by
default with a switch to plain circles. A map behind the page and a map in the side panel were tried and dropped:
neither related to where the field circles were, so the map showed only around them and read as noise.

- **One picture.** The 11 fields sit on a ring, ordered so neighbours ask for similar skills (cosine over the
  mean share of each skill across a field's roles). Every skill's home is the fields' positions weighted by
  (share / mean share)^3, pulled slightly inwards: a field's own skills land beside it, the skills every field
  asks for land in the middle. Skills repel each other and are pushed out from under the circles.
- **One vocabulary.** All 98 product skills are in the MBA index under the same ids (96 with the same patterns), so
  the map uses `graph_mba.json` (278 skills, 1,272 links) and the product field's shares come from the product set.
- **Hover a field:** its 25 most distinctive skills (share × share over the mean field's, capped at 4) turn blue
  with spokes from the circle, and the five most distinctive are named. **Click a skill:** it and its six closest
  links are named; the side panel shows where postings ask for it most, as links to roles and fields.
- A field's page links to its place on the map (`#/explore?field=<group>`). The role screen keeps its grid.
- **Fix (2026-10-18): two roles called `pmm`, and Product counted worldwide.** Both graphs have a `pmm`; once the
  product set loaded, its family overwrote the MBA Product Marketing Manager in the index, so Marketing showed 812
  worldwide postings and linked into the product set. Product families now sit in the index as `product.<family>`
  (`#/role/product.pmm`; a bare product id such as `#/role/tpm` still opens the product role, a bare `pmm` the MBA
  one). Owner's decision (2026-10-18): Product's counts are US postings like every other field (6,015 of 8,765,
  graph.json of 2026-10-11 against graph_mba.json of 2026-10-14); role pages, the matcher and the skill shares still
  read every product posting, and each count says its date. Refreshing the product graph to the MBA date is a
  separate `data/` branch.
  The games that read `ix.roles` (skill path, build the hire, climb the ladder, higher or lower, what it asks, spot
  the real ask) read a role's shares by `family` and link product roles by their `product.<family>` id; skill path's
  eval expects 54 pickable roles (53 while the MBA `pmm` was hidden).

## Skill depth for the MBA skills (built 2026-10-14; the plan below is what was built, with the changes noted)

The 180 MBA skills had a one-line definition. Sub-skills and level ladders are now drafted from postings by
`pipeline/depth_gen.py` and published by `pipeline/depth_publish.py`; build steps come from `pipeline/build_steps.py`
on two keys (postings name the target, an allow-listed source says what it contains), not from posting sentences
(step 2 below drafted duties, not ways to learn: `evals/NOTES.md`, "Skill depth pilot"). The content evals of step 8
are `evals/run_depth.py`. No subject experts are available to review the content, so every statement comes from
postings and passes automated checks. Ladders are specific to an industry. Nothing generic is kept. The skill card shows the
ladder of the role's industry (corporate, bank or consulting) with that industry's level names, and only the rungs
the postings support; when the role's industry has no ladder for the skill, it shows another industry's and says
which. Product skills keep one flat ladder.

The unit of content is a **claim**: one sentence with the postings that support it. A claim with no support is
not published.

1. **Evidence packs** (code, no model). For each skill, ladder and level: the sentences of US postings that
   matched the skill, with company, title, level and URL. At most two sentences per employer. A cell with fewer
   than 8 postings from 4 employers gets no rung; the interface says "not enough postings at this level".
   Cost: about 40% of cells will be empty, mostly senior grades of small roles.
2. **Draft** (model 1). Input: one skill's evidence packs and its definition. Output per ladder: 3 to 6
   sub-skills (name, patterns, example), one rung per level with evidence, 3 build steps. Every sentence carries
   the ids of the evidence sentences it rests on and one quoted phrase of at most 12 words.
3. **Evidence check** (code). Each quoted phrase must appear word for word in the cited posting. Each sub-skill
   pattern must match at least 5% of the skill's postings and at least 3 employers. Each rung must cite postings
   of its own ladder and level. A claim that fails is dropped, not repaired by hand.
4. **Specificity check** (code, then model 2). A rung must name a tool, an artefact, a counterparty or a number
   that occurs in its evidence. The code check is a list of terms taken from the evidence. Then a swap test: the
   critic sees the rung without the skill name and the level, and must pick both from four options. A rung that
   fits two levels or two skills equally is generic and is dropped.
5. **Style check** (code). ASD-STE100 about 80% of the way: at most 20 words for an instruction and 25 for a
   description, one idea per sentence, active voice, simple present, no idioms. Domain terms stay (DCF, S&OP).
6. **Critic** (model 2, a different model family from model 1). For each claim: "Do the cited sentences support
   this? Answer from the sentences only." Unsupported claims are dropped. The critic also lists what the evidence
   says that the draft left out; that list feeds one redraft.
7. **Ladder check** (code). Within a ladder, a higher rung must not repeat a lower one, and the evidence of a
   higher rung must come from higher-level postings. Rungs out of order are dropped.
8. **Release report** per skill: claims drafted, dropped at each check, cells with no rung. A skill with fewer
   than two rungs on a ladder shows the definition only on that ladder.

Evals that stay in the repository: the evidence, specificity, style and ladder checks run on the published
files with no model (`evals/README.md`, "Content evals for skill depth"). A sample of 100 claims per release is
re-judged by the critic with a new seed, to measure how many supported claims the first pass let through wrongly.

Cost: about 180 skills, up to 3 ladders. About 400 drafting requests, 400 redrafts, and 6,000 to 9,000 critic
and swap-test requests (one per claim). That is above 5,000 requests, so it needs a go-ahead. A pilot on 12
skills (4 per ladder) costs about 600 requests and shows the drop rates before the full run.

What this does not give: a judgment that a rung is true of the job where postings are silent. Postings say what
employers ask for, not how the work is done. The content will say "postings at this level ask for", not "at
this level you do".

## A stratified taxonomy (v13, 2026-10-24)

The problem (owner, 2026-10-24): every posting of every role asks for communication, leadership and collaboration, so
the taxonomy's flat list of 278 skills tells a student little about what the asks mean in their field or how to show
them. A product manager does not write "I have written PRDs"; they write "took a payments feature from 0 to 1 with
engineering and marketing, defining the requirements". Leadership in investment banking and leadership in product are
both asked for in the same words and shown by different work. Measured on the US postings of the MBA set, communication
is asked for in 79% to 88% of postings in all 11 fields, but what travels with it differs completely: pitch books and
valuation in banking, PRDs and roadmaps in product, synthesis and decks in consulting; influence in supply chain is
supplier negotiation in 84% of the postings that ask for it; cross-functional work in finance is business partnering in
97%. The differentiation is in the data; the taxonomy did not carry it.

Three layers, all data, no screens (the interface work runs on another branch and reads these):

1. **Kind** (`pipeline/taxonomy.json`, `kind` on every skill; `pipeline/tax.py`, `KINDS`). Seven kinds, each with a
   default form of evidence and one rule a student can act on: `method` (145: a craft with a procedure and an artefact),
   `practice` (39: work through people and structures, shown by scope), `behaviour` (10: asked by every field, shown
   through other work, never a line of its own; the matcher's SOFT set plus data-driven decision making), `technical`
   (14), `knowledge` (18: industries and rule sets), `tool` (23), `credential` (29). Patterns, clusters and ids do not
   change; extraction does not read the kind, so nothing was re-extracted and no posting is retagged.
2. **Evidence** (`pipeline/evidence.json`, one entry per skill, hand-written). The `form` (through, scope,
   artefact, outcome, built, context, named), the `artefacts`, `counterparts`, `measures` and `verbs` a resume line that
   shows the skill carries, and `shown_by`: for a behaviour or a practice, the concrete skills whose evidence counts for
   it. Tools and credentials are `named`: the rule is the kind's.
3. **Field** (`pipeline/fields.json`). For the 24 skills that four or more of the 11 fields ask for (mean share over
   the field's roles at least 25%; tools excluded, since Excel means the same everywhere), one entry per field that asks:
   `reads_as` (one sentence in the field's words), `shown_by` (two to six of the field's own skills that carry it) and
   `line` (one resume line with a number). 225 entries. The carriers were drafted from the co-occurrence of the field's
   postings and then checked against them: each must be asked for together with the skill in at least 15% of the
   field's postings that ask for it; 66 of the first drafts failed that check and were rewritten from the postings'
   own ranking (`evals/taxonomy_baseline.md` prints both side by side).

The graph build publishes all three: `kind`, `how_shown` and `fields` on every skill node of both indexes, the field
entries with the postings' side beside them (`share` of the field, `with`: the six carriers the field's postings rank
highest, `subs`: the sub-skill mix within the field), and the kinds and forms tables in `meta`. `tax.validate` is the
shape check (`tests/python/test_taxonomy.py`); `evals/run_taxonomy.py` checks coverage, grounding and the behaviour
carriers against the postings and is in CI.

What this is not: a judgment about resumes. The carriers are grounded in postings (what employers ask for together);
the readings and lines are editorial, written on that evidence, and no resume reader has judged them yet.

Next, planned in "The taxonomy adapted to each role (v14)" below: making the layers adaptive to each role. The matcher
credits a behaviour through its carriers instead of hiding it; the fit page's "a line that would show it" comes from the
field entry, not the product-only `signals`; the gap text follows the kind (name the artefact; say who and how many; name
the industry); the skill card shows "in this field it means" and the sub-skill mix; the role grid groups rows by kind so
the asks every role makes stop crowding out the craft; the course reader says which kinds a course can evidence
(methods, technical, knowledge) and which it cannot (behaviours, practices).

## The taxonomy adapted to each role (v14, 2026-10-24)

The stratified taxonomy (v13) is data no screen reads yet. What the screens and the matcher do today, measured on the
role files of 2026-10-14 (MBA) and 2026-10-11 (product):

- **The matcher drops the behaviours.** `requirements()` in `web/match.js` skips the nine skills of its `SOFT` set, and
  the `soft` list it returns is read by no screen. Those nine are 45% of a role's top row on average (the skills asked
  for by over half of the role's postings; from 28% up to five of Sales Manager's six), so the fit page scores a student
  on about half of what the role asks for most and says nothing about the rest. Data-driven decision making, the tenth
  behaviour, is not in the set and is scored like a method.
- **The resume lines are product lines.** "A line that would show it" on the fit page, "Postings say it like" under "Say
  it in this field's words" and "Resume lines that show it" on the skill card all read `signals`: two hand-written lines
  on each of the 98 product skills and on none of the 180 MBA-only skills. A Treasury analyst's gap in communication gets
  "Wrote the 6-pager that secured funding for the new product line", or nothing.
- **The grid is the asks every role makes.** Rows are ordered by share, so a role's top row holds on average 5.7
  behaviours and 3.0 practices against 3.4 methods; in 47 of the 50 MBA roles behaviours and practices outnumber the
  craft there, and Product Manager in the product set reads 7 behaviours, 2 practices, 4 methods, 2 technical.
  `genericSkills` in `web/atlas.js` (asked by most postings of at least half the roles) is 8 skills, 6 behaviours and 2
  practices, and only the event screen reads it.
- **The course reader counts a mention of anything.** A syllabus that says "teamwork and communication" paints both
  green and counts them among the gaps it covers.
- **The field entry's carriers are a field's, and roles differ inside a field.** Communication in finance is business
  cases and reporting: of the FP&A postings that ask for communication, 79% ask for a business case and 62% for
  financial reporting, but the field's four carriers reach 27% at most in Treasury and 19% in M&A integration. Problem
  solving in consulting is transformation programmes in 93% of Transformation postings and in 22% of Strategy Manager
  ones. 25% of the postings that ask for a behaviour carry none of the field entry's carriers (Commercial banking RM,
  ownership: 90%); with the evidence file's carriers added, 11%; every one of them carries at least one skill of a
  carrier kind.

Decisions (proposed 2026-10-24; the owner confirms each, and the ones still open are listed at the end):

1. **The matcher credits a behaviour through its carriers.** A behaviour ask stays a row, in the tier its share sets,
   with the `kind` on the row. Its credit is its best carrier's: the carriers are the union of the skill's
   `how_shown.shown_by` and the role's field entry `fields[g].shown_by`, re-ranked by the role's own postings (decision
   6); a carrier counts when the resume shows it with a line of work (strength 2 or more), and the row's status is
   `through`, naming that carrier, never `evidenced`. A resume that names the behaviour itself ("strong communicator")
   earns nothing for it: the kind's rule is that naming is not evidence, so the row reads "named, not shown", with the
   carriers to show it through. Sub-skill hits (presenting, writing documents) count as depth, as today. The weight is
   the row's share times its lift, as for every ask: in the MBA set a behaviour has a lift of about 1 everywhere, so it
   enters at the floor (0.2 of its share) and the craft keeps the score; in the product set `distinct` is off and seven
   behaviours would weigh as much as the fifteen other top-row asks, so there the weighting comes on first or the
   behaviours stay out of the sum (open decision 1). **The bands do not move by accident.** `createMatcher` takes
   `behaviours: "score" | "show"`; `bands.json` and `bands_mba.json` record it under `scoring` beside `distinct`; the
   interface creates the matcher as the bands file says. The step lands with `show` (rows, status and carriers shown,
   weight 0, bands unchanged) and reruns `evals/calibrate.mjs` with `score`; `score` lands only when the rank statistics
   do not fall (today a same-role score is above an other-field score 89% of the time and above an adjacent-role score
   77%) and no group loses its bands, and the six samples' `score_band` move in that commit with the reason.
2. **The fit page's lines and gap text come from the field entry and the kind.** One pure module,
   `web/evidence_text.js` (a classic script like `match.js`, required by node), builds every sentence from data, in this
   order: the role's field entry (`fields[g].line` and `reads_as`; 24 skills, 11 fields, 225 entries; a product role
   reads `fields.product`), else the product skill's `signals` (98 skills, until open decision 6 retires them), else a
   template from `how_shown` by the kind's form with its slots named, never a number invented ("Built the [roadmap] with
   [engineering, design]; [initiatives shipped against plan]"). The gap sentence follows the kind's `how`: a method,
   name the artefact and what changed; a practice, who, how many and what you were trusted with, with the role's
   counterparts; a behaviour, "never a line of its own", then the two carriers the role asks for most that the resume
   does not yet show, or, when one is shown, that its line already shows it; technical, what you built or queried;
   knowledge, the industry in the lines of work (the `__domain` slot's text today); a tool, the tool inside a line of
   work. "Say it in this field's words" quotes `reads_as` and the field's line instead of `signals[0]`; "Shown, but
   without specifics" adds the kind's `measures` ("add a number: decisions the document carried").
3. **The skill card says what the skill means here.** In the first fold, after the definition and when the role's field
   has an entry: "In finance: <reads_as>" and "Shown through" the carriers as skill tags (decision 6 picks them); the
   eyebrow carries the kind's label beside the area ("Craft · Finance"). "Mostly means" keeps the sub-skill shares of
   the view, which are the role's own mix. The Build it tab opens with the kind's `how` rule and the line decision 2
   builds; `signals` leave the card. A skill with no field entry (254 of 278) shows the kind's rule and its `how_shown`
   artefacts, counterparts and measures in one sentence.
4. **The role grid lifts the behaviours out of the craft.** The area accordion stays as chosen (R3, 2026-10-19). Every
   behaviour row leaves its area for one last panel, "How you work", collapsed by default, whose summary line says what
   it holds ("Asked by nearly every role: communication 84%, …; shown through the work above"); inside, each row
   carries its carriers from decision 6. Practices stay in their areas: who you work with is part of a field's craft.
   `roleLead` no longer names a behaviour among "lead the asks" (today it leaves out only tools and domain). The course
   screen's flat list inherits the panel. `genericSkills` stays measured for the event screen and gains the check that
   it lies within the behaviours and practices (today 6 + 2).
5. **The course reader says which kinds a course can show.** A mention counts for a method, technical, knowledge or tool
   skill, as today. A behaviour or a practice the syllabus names is listed apart ("Named, but a course cannot show
   these"), is not painted green and is not counted among the gaps it covers; "It does not cover" lists only skills of
   the four kinds, so the amber is craft the course misses. One sentence says why: a course shows craft; how you work is
   shown through work, on the fit page.
6. **Per-role flavour needs no new hand-written content.** The reading and the line stay the field's. The carriers
   shown (card, grid, fit page) and credited (matcher) are picked per role in the browser from `R.jobs`: among the union
   of the field entry's and the evidence file's carriers, those asked for together with the skill in at least 15% of the
   role's postings that ask for it (the grounding rule of `evals/run_taxonomy.py`, applied per role), ordered by that
   share, four at most; with fewer than two, the field entry's list as written, marked "in this field". The edges and
   the ladders already differ per role and per industry ladder and are not touched. Roles whose field reading does not
   fit them (M&A integration and Corporate development read finance's "monthly reporting packages"; Treasury and
   Commercial banking RM are the other two measured) are the case for a role override in `fields.json` (open decision
   4), a data change with the same checks.

Conventions: every sentence a screen shows about a skill is built from `taxonomy.json`, `evidence.json`, `fields.json`
and the postings; no screen holds a hand-written line about a skill. The logic sits in pure functions
(`web/evidence_text.js`; `carriers()`, `areas()` and `readCourse()` in `web/atlas.js`), so the node tests and the eval
run the code the app runs. One eval runner, `node evals/adaptive.mjs [--only text|carriers|grid|course]`, exits 1 on a
rule violation and is in CI from step 2; each step adds its part (`evals/README.md`, "Evals to build").

Built (2026-10-25, PRs #84 to #88, one branch per step, each cut from the one before; step 6 not started). What
landed, against the decisions above:

1. **Matcher** (decision 1, #84). A behaviour is a row in the tier its share sets, with `kind` on the row; its carriers
   come from `Matcher.pickCarriers` (the union of `how_shown.shown_by` and the role's field entry, kept at the 15% floor
   on the postings in hand, four at most; with fewer than two, the field's list; with no entry, the two most asked;
   a lone carrier marked as a fallback) and its status is `through` with the best carrier's credit, `thin` when only
   named (no credit: decision 2 as proposed), `presumed` or `gap`. `createMatcher({ behaviours: "show" | "score" })`;
   both bands files record `"show"` (weight 0) under `scoring` and the interface creates the matcher as they say. One
   deviation from "every score is what it was": data-driven decision making scored as a method before v13 made it a
   behaviour, so a resume whose own analysis lines scored it loses that credit (the grad-student sample: 45% to 43% at
   entry level; its band moved to 0.42 with the reason in its file). The fit page and the rail show a `through` row as
   shown, marked ⤷ with its carrier.
2. **Fit text** (decision 2, #85). `web/evidence_text.js` builds every sentence about a skill from the data: `line`
   (the field entry's line, else the product `signals`, else a template from `how_shown` by the kind's form, slots
   named, no number invented), `reads`, `gap` by kind, `thin` (the measures to add), `summary` (one sentence for a skill
   with no field entry) and `sayIt`. The rail's gap rows, "Say it in this field's words", "Shown, but without
   specifics" and the event screen's "say it like" read it. Over 56 roles and 3,138 rows: 1,046 lines from a field
   entry, 1,102 from `signals`, 990 from a template. One role and behaviour has no carrier on any posting (VC
   associate, product sense) and gets the kind's rule with the skill's artefacts.
3. **Card and carriers** (decisions 3 and 6, #86). `Atlas.carriers(R, slice, id)` is the matcher's rule on the view's
   postings, so a level filter re-picks them with the asks. The card's eyebrow carries the kind's label beside the
   area ("How you work · Leadership & communication"); the first fold says what the skill means in the role's field
   ("In finance: monthly reporting packages, variance commentary and business cases that leaders read to decide on
   spend") or one sentence from the evidence file, and names a behaviour's or practice's carriers as skill tags; Build
   it opens with "How to show it". `signals` left the card. Over 54 roles and 1,127 behaviour or practice rows: 754
   picked on the role's postings, 21 the field's list, 41 the two most asked under the floor, 311 with no carrier
   (practices whose evidence entry names none); no top-row behaviour without one. No role override written (decision
   4 as proposed).
4. **Grid** (decision 4, #87; open decision 3 as proposed). `areas()` moves every behaviour row into one last panel,
   "How you work", collapsed by default, whose summary is built from the view's shares and whose rows name their
   carriers; practices stay in their areas; `roleLead` names no behaviour; the course screen's flat list inherits it.
   All 54 roles with postings have the panel (485 rows); the first panel leads with a skill of a carrier kind or a
   defining one in every role (an analyst's is Technical fluency, a business developer's is Leadership &
   communication with its practices). The generic skills are 9 on the 2026-10-25 data: 6 behaviours, 2 practices and
   process design, so the eval asserts the majority and prints the composition, not the 6 + 2 of 2026-10-14.
5. **Course reader** (decision 5 as proposed, #88). `readCourse` returns the found set split by kind
   (`Atlas.courseSplit`: `teaches`, `named`, `other`); the screen paints and counts only what a course can show, lists
   the behaviours and practices the text names apart under "Named, but a course cannot show these", and "It does not
   cover" lists only the craft. The course sample names 57 skills: 48 a course can show, 9 named apart.

Evals: `node evals/adaptive.mjs` (parts `text`, `carriers`, `grid`, `course`) in CI; `must_show_through` in seven
expectation files; six behaviour cases in `tests/web/match.test.mjs`, four `areas` and `courseSplit` cases in
`tests/web/atlas.test.mjs`, the builder's own tests. Every step kept the web tests, the matcher evals and their
baseline, `run_pipeline.py --only matcher` and `--only js`, `run_taxonomy.py` and the five game evals green.

Decisions settled on the way: open decision 1 (behaviours in the score) measured, not switched. The 304-resume set the
bands were calibrated on is not on the build machine (48 of its files are), so `evals/calibrate.mjs` ran in try mode
on those 48 for both settings and wrote nothing: MBA same-role above other-field 78% with `show`, 80% with `score`;
above adjacent-role 64% and 65%; own role on top 13 and 11 of 48. `score` does not fall, but the sample is a sixth of
the calibration's, so the setting stays `show` until the full set is rerun (`BEHAVIOURS=score node evals/calibrate.mjs
--roles mba`); the product set cannot be measured here (one same-role file). Decisions 2 to 5 taken as proposed. Still
open, under Later: decision 6 (a hand-written line per skill so `signals` can retire; step 6) and the `score` switch.

What this is not: the readings and the lines are still editorial and no reader has judged them, and the carriers are
grounded in postings, not in resumes. The eval that would close that gap is listed in `evals/README.md`, "Evals to
build".

## About you, Explore and the role page around three kinds of student (v15, 2026-10-24)

Owner's review of 2026-10-24 (three rounds of mockups in a scratch folder, since swept): the site was trying to do too
much for everyone at once. The users are Cornell Tech and IE New York graduate students of three kinds: **looking**
(want a good job, open on the role, will drop a resume to see what they have a shot at), **targeting** (know the role
or have interviews, want to know which of its skills they have and how to fill the gaps) and **curious** (not
searching, want to understand the roles). One page serves all three; what the person has told us decides what it
leads with. The matcher, the bands and the taxonomy did not change.

- **About you.** Three questions. *What are you studying?* lists the programs Cornell Tech and IE New York offer,
  folded to the five groups the postings can speak to (business, management or finance; analytics or data science;
  computer science or software; electrical, hardware or systems; information science, design or health/urban tech).
  No law, PhD, undergrad or "working": the beachhead. *Where are you in your search?* is the three kinds above,
  stored as `you.stage`. *Which fields interest you?* is unchanged. The summary names the three closest roles as
  links; every row is one link. American spelling in the copy. (The data files still carry British spellings from
  the model-written depth; a display-time map or a regeneration is a `data/` branch, under Later.)
- **The role page and its rail.** The side column on a role screen is the rail: always there, 380 px, sticky, an edge
  tab and an overlay under 1180 px. It holds the legend (one component, rows left out when they do not apply), then
  one of three blocks by what we know (nothing: drop a resume or answer the questions; answers: the program and stage,
  the entry-grade count and the employers hiring at it, the drop zone, ordered by the stage; a resume: the band, one
  sentence "you show N of the M skills most postings ask for; K are gaps", every core gap as a row that opens to the
  line that would show it and a waitlist placeholder, a link to the full fit), then what to do with the role (a
  course, the three event kinds, the classes; with a fit also "Build these skills" and "Ways to show your skills",
  placeholders until those journeys exist). A skill or posting card draws over the rail with "← Back". The main
  column lost the three-button row, the help box, the fit toggle and the key: the list is painted whenever a fit is
  read, and the painted core skills are exactly the greens and ambers the sentence counts. Each role has one
  hand-written sentence on what the job is (`web/data/role_blurbs.json`). The fit is computed once per view
  (`computeFit`) for the rail and the fit screen; the fit screen keeps its two columns and details. Bands read New to
  the field / Relevant foundation / Qualified for the role / Strong match. The event prompt left the field page.
- **Explore.** No "For you" filter: every field, the ones that fit first. The skill map shows every skill at rest; the
  35 most-asked are solid (fainter than the fields) and named with a collision pass, the rest a faint fill named by a
  lens around the pointer; skill areas are faint words at their centre, not colours. With a resume and fields that
  fit, the skills those roles ask for (a quarter or more of a role's postings) are green when the rough read shows
  them and blue when not; nothing else is coloured. No sub-skills on the map.
- **The field page.** Half and half: the roles with their sentence on the left, the field's skills on lanes on the
  right. Across is the share of the field's postings asking (the MBA set counts a year of postings, open and closed;
  the product set open only). Without a resume the lanes are the kind of skill: the field's craft, working with
  people, asked in every field (the taxonomy's `kind` once the taxonomy branch lands; until then measured: the skills
  most postings of half the roles ask for, then the leadership, delivery and people areas). With a resume: the gaps
  these roles require, already on your resume. A lane is as tall as its share of the dots. Hovering a role lights its
  skills; a dot opens the skill card. The multiplier ("how much more this field asks than others") and the quadrant
  names of the first mockups were dropped as confusing.
- **What this reads from the stratified taxonomy (v13 and v14):** `kind` on every skill (the lanes), `fields[<field>].reads_as`
  and `line` (the "in marketing, this means" column and the gap rows' example lines, instead of the product-only
  `signals`), `how_shown` (the gap text by kind). Wired on 2026-10-25 by v14's steps 2 to 4: the rail's gap rows and the
  skill card read `web/evidence_text.js`; the field page's lanes still read the measured fallback until they are moved
  onto `kind` (Later).

## The demand-gen pass (v16, 2026-10-25)

The frame (owner, 2026-10-24, not to be reopened): the atlas is demand generation for GradBuddy and, later, its jobs
back end. Its users are graduate students at Cornell Tech and at IE New York, of the three kinds v15 stores as
`you.stage`: **looking** (open on the role, will drop a resume), **targeting** (know the role, want its skills sorted
into shown, shown in other words, to evidence better, to build, and how) and **curious** (not searching). The dividing
line: **the atlas states facts and matches; GradBuddy synthesizes and acts.** The atlas runs no model at runtime, never
sends a resume or a syllabus anywhere, and generates no per-person prose beyond sentences built from data (v14). Project
briefs, outreach drafts and people to contact are GradBuddy's; every "coming soon" in the atlas is a hand-off to
GradBuddy, never a promise the atlas keeps itself.

The owner's decisions of 2026-10-25, all settled: (1) games are merged and frozen, the `curious` path, below the fold;
(2) behaviours stay `show`, not `score`, until the full 304-resume calibration is rerun and both rank statistics hold;
(3) no hand-written line per skill: `signals` stay as the fallback for the 98 product skills and v14 step 6
(`chore/adaptive-6-signals`) is dropped for good, because a reader-judged line per skill is GradBuddy's synthesis, not
an atlas fact; (4) the first screen leads with the stage question; (5) capture is wired now: the waitlist placeholders
become real and anonymous funnel counts leave the browser, nothing a person types or drops ever does; (6) the precision
pass has a cutoff (an MBA skill's patterns change only under 60% tagged-sample precision in the top two rows of a role's
grid); (7) the next student-facing build is the class picker reading the person's gaps, on `main` by 2026-11-07 for
Cornell Tech's Spring 2027 pre-enrollment on 2026-11-10; (8) posting links stay hidden on role screens and skill cards
(`POSTINGS = false`) and become visible on the fit screen and in the rail's gap rows for a person with a resume on file;
(9) v14's open decisions 2, 3 and 5 stand as the steps took them, and decision 4 is taken: the four measured roles whose
field reading does not fit them (M&A integration, Corporate development, Treasury, Commercial banking RM) get role
overrides in `fields.json`; (10) a model reader judges the generated fit-page lines before any generated line is shown.

Ten steps, one branch and one PR each: capture, the first screen by stage, the class picker reading the gaps, campuses
as data, American spelling on screen, the v14 follow-ups, the MBA precision pass, visa sponsorship as a posting fact,
a pasted posting on the fit screen, and the GradBuddy contract page. What each built is below as it lands.

### Step 1 — capture: the waitlist and the funnel counts (`feat/capture-1-waitlist`, 2026-10-25)

Two tables in the `gradbuddy-catalog` Supabase project (`pipeline/sql/2026-10-25_capture.sql`, applied by the owner):
`waitlist` (email, source: `show` · `build` · `ways` · `fit` · `start`, the role on screen, stage, program group, the
fields picked) and `events` (a name from a closed list of eighteen, a session id, stage, program group, a role or field
id). Row-level security, anonymous insert only, no select for anyone but the service role. The unique index the brief
asked for on `(lower(email), source)` is a generated column `email_key` plus a unique index on `(email_key, source)`,
because PostgREST's `on_conflict` names columns, not expressions; the browser inserts with `resolution=ignore-duplicates`,
so a second click is not a second row.

`web/capture.js` (a classic script, node-testable with its dependencies passed in) exposes `Capture.event` and
`Capture.waitlist`: both post to the REST endpoint with the publishable key, swallow every error, and are no-ops when
`CONFIG.CAPTURE_ENABLED` is false. The session id is 24 hex characters made once per browser session (`sessionStorage`
in try/catch, else one for the life of the page), written nowhere else and never joined to an email. `app.js` fires
`start`, `explore`, `field`, `role`, `event_prep`, `classes` and `play` (the slug in `role_id`) from the router,
`you_done` when the questions are saved, `resume_read` when a resume is taken, `fit` once per role per visit, `course_read`
when a syllabus is read, `posting_link` on a click, and `waitlist_<source>` from `Capture.waitlist`. The three rail
placeholders are real boxes now (an email, "Join the GradBuddy waitlist", "You're on the list" in place; the sources
joined are kept in localStorage, never the email), the fit screen has the same box at its foot with `source: "fit"`, the
start screen's privacy line says what the waitlist keeps, and `#/about` says what is counted and that no content is.

Decision 8 landed here, because the `posting_link` event needed something to click: with a resume on file, each gap row
of the rail (when opened) and of the fit screen's "Needs more evidence" column names up to three open postings of the
view that ask for the skill, as links out. `POSTINGS` stays false everywhere else.

`pipeline/funnel.py` prints the funnel for a date range: sessions, the share that reached each event, by stage and by
program group, and the waitlist rows by source. It reads `CAPTURE_DB_URL` (the catalog project's pooler string; the
backlog's `SUPABASE_DB_URL` points at another project) and falls back to `SUPABASE_DB_URL`. Nothing is written to the
tree. Tests: `tests/web/capture.test.mjs` (no-op when disabled, the payload's exact keys, a throwing or failing fetch
never throws, the session id stable within a session, the names the script accepts equal the migration's).

What this is not: no event carries a skill id, a text or a file name, by construction (the script's whitelist and the
table's check constraints). The counts begin when the owner applies the migration; until then every post is a 404 the
page swallows.

### Step 2 — the first screen routes by stage (`feat/start-stage-first`, 2026-10-25)

`start()` leads with one question, "Where are you in your search?", as three cards with the v15 wording and sublines.
A click stores `you.stage` (the key the About you flow writes), fires `start_stage`, and routes by stage: `looking` and
`targeting` to About you at the program question (`#/you?step=0&from=start`; the wizard skips the stage question it
already has), `curious` to Explore. A returning visitor with a stage on file sees one line ("You said you're set on
the role you want · change") instead of the question. Below: "See what jobs ask for, and how you fit" as before, the
Spring 2027 classes card, then the games under "Or play your way in", unchanged inside. The H1 is "What do the jobs you
want actually ask for?"; the games' eyebrow and the old H1 left the top.

For `targeting`, the About you summary leads with "Open the role you want": a search box over every role label
(`Atlas.index()`, 54 roles; a label two sets share is suffixed with its field), Enter or the datalist opens the role,
and the three roles closest to the resume sit under it once one is read.

The ordering is a pure table, `Stage` in `web/app.js` (exported beside `parseRoute`): `startRoute`, `youLead`,
`railBlocks` (the rail's blocks in order, with and without a resume) and `firstAction`. The screens read it: the stage
cards link to `Stage.startRoute`, the summary reads `Stage.youLead`, the rail's "For you" section orders its blocks by
`Stage.railBlocks`. `evals/stage.mjs` (in CI) checks, for each stage, that the first action each screen offers is the one
the stage asks for (looking: a resume drop or the fields; targeting: the role search or the gaps; curious: explore or a
game), and that the screens read the table. The first eval of the stage answer, listed as missing in `evals/README.md`.

What this is not: a measure of whether each kind of student gets what they came for; that is the funnel of step 1.

### Step 3 — the class picker reads the person's gaps (`feat/classes-gaps`, 2026-10-25)

The join both ways between the fit and the Spring 2027 roster, live before Cornell Tech's pre-enrollment (decision 7).

- **In the picker**, with a fit on file for the chosen role (`#/classes?role=<id>`, or the role picked on the screen),
  every card says which of the person's gaps the course covers ("Covers 2 of your 17 gaps: Budgeting & forecasting,
  SQL", or "Covers none"), a chip "Covers a gap" filters, and a Sort control gains "Gaps covered" beside Code and
  Relevance. The count reads the course text by kind (v14, decision 5): only a method, technical, knowledge or tool
  skill the text names is a covered gap; a behaviour or a practice it names is not. The gaps are the fit's core and
  common asks the resume does not show (status `gap` or `thin`), without the industry and AI slots: `gapsFor(roleId)`
  in `app.js`, handed to `classes.js` through the shell context, is the fit on screen when it is this role's, else the
  matcher at the default level, cached per role and resume. The relevance band still reads every skill the text names,
  as its thresholds were set; the gaps column is the one by kind.
- **In the rail**, with a fit on file, "Classes that cover your gaps" lists the three courses that cover the most core
  gaps (`Catalog.topCovering`), each a link into the picker with that course open and the role carried along; each
  opened gap row also names up to three classes that cover it. When the roster cannot be read here (sign-in on and no
  session, an empty roster for an anonymous reader, no client) the block is one line from the campus file
  (`rail_closed_line`: "The Spring 2027 roster opens here for sign-in on Nov 10.") and the picker's link.
- **On the fit screen**, the "Needs more evidence" rows name the same classes above the posting links.

The reads are one per card per page (`readCard` in `classes.js`, shared by the relevance column and the gaps) and
yield every eight cards. Pure functions in `catalog.js`: `gapsCovered(teaches, gaps)`, `coverLine`, `sortCards(cards,
mode, info)`, `topCovering`, and `filterCards` with `coversGap`. `tests/web/classes.test.mjs` grows four cases on
synthetic rows: a course naming a behaviour and a practice covers neither; covered gaps come core first; the chip filter
composes with the others; the three sorts and the rail's three. Every Cornell-Tech string stays in `sp27_campus.json`.

What this is not: a judgment that a course teaches a skill it does not name; the reader counts mentions, as the course
screen does, and the card says so.

## Later

- An "Open now / Last 12 months" switch on the field page and the role page; first the product graph keeps its
  closed postings the way the MBA graph does (a `data/` branch).
- The field chart's lanes with a resume read as two skew lines (the share orders both); a better second axis now that
  every skill has a kind and the shared skills a field reading (v13, v14); the lanes without a resume can read `kind`
  instead of the measured fallback.
- ~~v14 step 6, `chore/adaptive-6-signals`~~: dropped for good on 2026-10-25 (v16, decision 3). `signals` stay as the
  fallback for the 98 product skills; a reader-judged line per skill is GradBuddy's synthesis, not an atlas fact.
- Behaviours in the score: rerun `BEHAVIOURS=score node evals/calibrate.mjs --roles mba` (and the product set) on the
  full 304-resume calibration set; switch both bands files to `"score"` only if neither rank statistic falls and no
  group loses its bands, moving the six samples' `score_band` in the same commit. Measured on 48 files on 2026-10-25:
  no fall (v14).
- `evals/run_depth.py` has 28 failures on `main` since the 2026-10-25 refresh (sub-skill shares outside the 5% to 50%
  band on the new postings): a `pipeline.depth_publish` rerun on a `data/` branch, with the baseline.
- The waitlist boxes ("Help me show this", "Build these skills", "Ways to show your skills", the fit screen) are a
  sign-up since v16 step 1; the journeys behind them are GradBuddy's.
- American spelling in the data: a display-time map in `atlas.js` now, or an American rule in `depth_gen` and the
  taxonomy names plus a regeneration (`run_depth.py`, `extraction_baseline_mba.md`).
- LLM-based extraction (Claude) for higher-recall skill tagging and requirement vs nice-to-have split.
- Nightly refresh via a scheduled job; history of postings over time.
- More families (design, engineering) and more companies (full Fortune 500).
