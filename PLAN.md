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
   overview, as a grid (see 7).
6. **Skill path**: card game (1A) plus the route planner tool (1C).
7. **The first screen** keeps the games on top, as a grid of all cards grouped by the fact they teach (what a role
   asks for · how postings read · what senior means · where the jobs are), one card marked "Start here", each card
   with a line drawing of its mechanic, a verb line, an outcome line naming the role it will open on, and a meta
   line (rounds · minutes · the player's state). The carousel goes. Section B (tell us about you / explore) keeps
   its place below.

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

## Later

- LLM-based extraction (Claude) for higher-recall skill tagging and requirement vs nice-to-have split.
- Nightly refresh via a scheduled job; history of postings over time.
- More families (design, engineering) and more companies (full Fortune 500).
