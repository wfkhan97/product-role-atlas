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
because PostgREST's `on_conflict` names columns, not expressions. *Corrected 2026-10-26, on applying the migration:* the
duplicate-ignoring upsert PostgREST runs for `on_conflict` needs `select` on the table, which the policy withholds on
purpose (a 401 for every click), so the browser inserts plainly and reads the unique index's 409 on a second click as
"on the list". The index still does its job; the script just stops asking PostgREST to.

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

### Step 4 — campuses as data, IE New York as a second campus (`feat/campus-list`, 2026-10-25)

`web/data/sp27_campus.json` is a list under `campuses`. Each entry: `id`, `label`, `term`, `term_label`,
`pre_enrollment`, `roster_updates_until`, `start_card`, `closed_notice`, `rail_closed_line`, `privacy_line`,
`eligibility`, `programs` (each program with its categories and the v15 program group it belongs to), `relevance`,
`signin_domains` and `catalog`. Entry one is Cornell Tech exactly as before, with `signin_domains: ["cornell.edu"]` and
`catalog: true`. Entry two is IE New York (`ienyc`, Spring 2027, the four IE programs the v15 question folds, each with
its group, `signin_domains: []`, `catalog: false`, a start card that says the roster is not loaded yet). The rule, in
the file's `_note` and in `README.md`: a new campus is a new entry, never a code change.

The person's campus (`Catalog.campusFor`, pure): the one stored (`classes.campus`), else the campus of the picker program
chosen, else the one campus whose programs include the v15 group answered (`cs`, `ece` and `infosci` are Cornell Tech's
alone; `business` and `analytics` belong to both), else none, and the classes screen then asks once, as two cards, with
"change campus" in its eyebrow afterwards. The start screen shows the person's campus card, or, with no campus known,
"Spring 2027 classes · Cornell Tech and IE New York". A campus with `catalog: false` shows its closed notice and stops;
the rail's "Classes that cover your gaps" says the same in one line. Sign-in accepts an email whose domain is in the
campus's `signin_domains` (`Catalog.allowedEmail`; a subdomain counts), Google sign-in passes that domain as `hd`, a
signed-in account no campus accepts is signed out, and a campus with an empty list shows "Sign-in for IE New York is
not open yet" instead of the form. `isCornell` is gone. Tests: the file's shape and the two entries, the inference
order, the domain check.

### Step 5 — American spelling on screen (`data/spelling-us`, 2026-10-25)

The data files carry British spellings from the model-written depth and the taxonomy (artefact 168 times, programme
119, modelled and modelling 71, analysed 23, fulfilment 16, prioritised 12, and 15 skill names: "Transformation
programme leadership", "Scenario & sensitivity modelling", "Warehouse & fulfilment operations", "FINRA licences",
…). The copy on screen is American since v15, so the two met on the same page. `Atlas.us(text)` in `web/atlas.js` is
a display-time map applied once at load to every skill name, definition, ladder rung, build step, sub-skill name and
example, evidence-file string, field reading and line, product `signals` and cluster label of both indexes (517 of
28,831 strings on the 2026-10-25 data). Quoted posting sentences, posting titles and snippets, and a sub-skill's
regular-expression `patterns` are never touched. The data files are not regenerated; the matcher reads the taxonomy
patterns, not the names, so nothing it does moves.

The word list is data, `web/data/spelling_us.json`: whole words (programme, licence, artefact, fulfilment, practise,
catalogue, adviser, …), the -ise/-isation → -ize family with an exception list of stems it must keep (enterprise,
exercise, advise, expertise, surprise, premise, promise, compromise, raise, fundraise, merchandise, supervise, the
-wise words, …), -yse → -yze, the -our → -or stems (behaviour, labour, colour, favour, …), the -re → -er stems (centre,
metre, fibre, theatre, calibre, …) with the words they keep (parameter, genre, acre, …), and the British double l
(modelled, levelling, counsellor, …). Case is kept. An exception is a line in a list, not a code change.
`tests/web/atlas.test.mjs` gains three cases: the families from the brief, the words that only look British, and the
index's fields mapped against a posting's text left alone.

What this is not: a regeneration. `depth_gen` still drafts in British English, and the `data/` branch that regenerates
with an American rule (and reruns `run_depth.py` and the extraction baselines) stays under Later.

### Step 6 — what the v14 cascade left open (`feat/adaptive-6-followups`, 2026-10-25)

Four things, one PR.

- **Eval 8, the reader's judgment of generated lines.** `evals/lines_judged.mjs` draws 50 sentences per release from
  `web/evidence_text.js` over both role sets (a pool of 897 distinct sentences on the 2026-10-25 data: 499 gap sentences,
  249 field lines, 149 templates), a third per type, one from each kind-by-field cell in a seeded order, and asks a
  model reader of a different family from the depth's drafter (`anthropic/claude-haiku-5.5` through OpenRouter) three
  yes/no questions: names an artefact or a counterpart; carries a number where its kind asks for one; in the field's
  words. Answers are cached under `data/experiments/lines_judged/`, `--dry-run` states the cost (about 19,000 tokens), the
  report is `evals/lines_judged.md` with failures by skill and field, and the runner exits 1 while a sentence fails.
  **Not run live here**: the build machine has no `.env`, so the committed report says so and the first live run
  overwrites it; the fix-and-rerun loop on `fields.json` is the owner's first step with the key. The gate stands
  (decision 10): no later PR changes a sentence template before it runs.
- **Role overrides in `fields.json`** (v14 open decision 4, taken). Measured on the roles' own postings, the finance
  entry's carriers fail the 15% rule on 20 of M&A integration's asks, 17 of Corporate development's and 3 of Treasury's,
  and banking's on 5 of Commercial banking RM's: 45 (skill, role) pairs where fewer than two carriers of the field entry
  co-occur with the skill. Each got an override, a key `role:<id>` beside the field keys with the same `reads_as` /
  `shown_by` / `line` shape, written from the role's own carriers (integration planning, M&A execution and programme
  management for the integrator; M&A execution, diligence, the model and the sponsors for corporate development; cash,
  banks and hedges for treasury; credit, coverage and the portfolio for the banker). `tax.validate` checks the role is
  one of the 50, `run_taxonomy.py` grounds each override on the role's postings (1,080 grounding checks pass, 45 of them
  overrides), `build_graph` publishes them on the MBA nodes with the role's postings beside them, and the readers try the
  override before the field: `EvidenceText.line` and `reads` and `Matcher.pickCarriers` take a list of keys
  (`tax.field_keys`, `Atlas.fieldKeys`: `["role:<id>", group]`), so the card says "For M&A Integration Manager:" where an
  override exists and "In finance:" elsewhere. 34 behaviour-or-practice rows across the four roles now read their own
  entry.
- **Carriers for the practices that had none.** 35 of the 39 practices named no `shown_by`, so 311 of 1,127
  behaviour-or-practice rows in the grids had no carrier. Each got three to five, drafted from the co-occurrence of the
  practice's postings in its three largest fields (share times log-lift within the field) and chosen by hand from that
  list (UX & design collaboration through discovery, user research, PRDs; client coverage through credit analysis, key
  accounts, prospecting; board governance through governance design, risk frameworks, executive reviews). The
  `carriers` check of `run_taxonomy.py` now holds every practice's carriers to the 10% rule a behaviour's met (288
  checks); one existing carrier under it (post-merger integration for cross-functional leadership, at 10%) left. Rows
  with no carrier: 311 → 8 (`evals/adaptive.mjs --only carriers`).
- **The full calibration for `score`.** The 304-resume calibration set (`evals/resumes/private/`) is not on this
  machine, in either checkout, so nothing was rerun and `score` stays unmeasured beyond the 48-file try of v14. The
  command and the bar are unchanged (`evals/README.md`, "Evals to build", item 6).

What this is not: the overrides and the practice carriers are editorial, grounded in what postings ask for together, not
in what a resume reader accepts; the reader's judgment that would read them as a student would is built and waiting on
the key.

### Step 7 — the precision pass with the cutoff (`data/precision-mba`, 2026-10-25; draft until re-extracted)

Decision 6 of the pass: an MBA skill's patterns change only when its tagged-sample precision in
`evals/extraction_audit_mba.md` is under 60% and the skill sits in the top two rows of some role's grid. The audit of
2026-10-25 has 15 skills under 60%; `Atlas.grid` over the 50 roles puts 13 of them in a top-two row (Board & committee
governance and the risk certifications are outside the rule and untouched): transformation programme leadership (six
roles, including 90% of Transformation Manager's postings), investor relations (PE associate, VC associate, strategic
finance), audit & SOX (treasury, risk, compliance, governance), banking relationships (commercial and corporate banking,
IB associate), credit analysis, portfolio-company value creation, the three real-estate skills (development &
entitlements, property types, leasing), procurement platforms, HR operations, HRIS tools and BI development tools.

What changed, pattern by pattern (the rule in `README.md`: anchored phrases, no bare everyday words): a bare "digital
transformation" or "transformation work" no longer counts, a transformation programme, office or portfolio or a verb
on a transformation does; fund administration, co-investment and "general partners" leave investor relations; external,
regulatory and customer audits leave audit & SOX, which keeps the internal audit, the audit universe and the SOX
controls; a line of credit, merchant services, treasury services and "financial solutions" named in passing leave
banking relationships; credit risk and credit policy leave credit analysis for the risk domain, and "commercial
lending" alone counts only with an underwriting verb; an exit counts for portfolio-company work only beside an
investment, a sponsor or a fund; feasibility studies, renovations, capital and tenant improvements leave development
(they are asset management) and construction counts when it is managed, budgeted or financed; a bare "CRE" and "property
types" leave the property-types knowledge; "leasing" counts as leasing activity, a leasing team or retail, office,
industrial or tenant leasing, not equipment or lease accounting, and a landlord only in relations or representation;
contract-management and spend systems leave procurement platforms; onboarding counts for HR operations as a process, not
a manager's duty, and global mobility leaves it; applicant-tracking systems and "HR technology" in passing leave HRIS;
Power Apps, Power Automate and Tableau desktop leave BI development tools. 37 pattern lines removed or narrowed, 21
written.

Measured here, on the 99 golden postings (`evals/run_pipeline.py --only golden`): must-found stays at the 85% floor,
must-not-tagged stays at 15.1% with one false positive fixed (leasing on a real-estate project manager) and one
true tag recovered with a narrower phrase (tenant interactions). Not measured here: the tagged-sample precision
itself. The build machine has no `.env`, no `data/raw/jobs_mba/` and no saved model answers under `data/experiments/`,
so the chain `CLAUDE.md` names for a taxonomy change (`pipeline.extract --roles mba`, `role_corpus`, `role_coverage`,
`skill_audit --reuse`, `build_graph --roles mba`, the extraction and pipeline baselines) is pending and the PR is a
draft until it runs; the processed file, the graphs and `extraction_audit_mba.md` still carry the old tags. Skills
outside the rule: 167 of 180 untouched.

### Step 8 — visa sponsorship as a posting fact (`data/sponsorship`, 2026-10-25; draft until re-extracted)

Not a skill. `pipeline/sponsorship.py` reads a posting's raw description with the patterns in
`pipeline/sponsorship.json`: `"yes"` when the employer says it sponsors ("visa sponsorship is available", "will
sponsor H-1B", "limited immigration sponsorship may be available"), `"no"` when it says it does not ("not eligible for
visa sponsorship", "unable to sponsor", "must not now or in the future require sponsorship", "without the need for
employment-based sponsorship"), else `null`, which is most postings. Every pattern is anchored on visa, immigration,
work-authorization or H-1B words, so a project sponsor, a company-sponsored event or a sponsored security clearance
never counts; a no wins over a yes in the same posting. `extract` writes the field on every posting of both sets;
`build_graph` carries it into the role files and the product graph's postings and the three counts per role (yes, no,
silent) into the MBA index; `Atlas.index()` and `Atlas.product()` expose `role.sponsorship`.

On screen: a chip "Says it sponsors" in the role screen's Level row, both sets alike, with the count of postings in
the view that say so; on hover, "Postings that say they sponsor a visa; most postings say nothing either way", with the
count that say they do not when any does. The chip is a filter like the others (every count reflects it, the fit is
read on it) and appears only once the data carries the fact. The rail says nothing special for an international-heavy
program: the chip is enough (the brief).

Labelled examples: `evals/sponsorship.json`, each row a real posting with the sentence that decided it in `note`,
checked by `evals/run_pipeline.py --only sponsorship`. The brief asks for 40 postings (15 yes, 15 no, 10 silent); the
build machine had only the 99 golden postings to read, which gave 22 rows (1 yes, 11 no, 10 silent, eight of the silent
naming a sponsor of another kind). The 14 yes and 4 no rows still to add come from the backlog, as the file says.
Unit tests in `tests/python/test_sponsorship.py`.

Not done here: the re-extraction that writes the field (`pipeline.extract` for both sets), the rebuild and the
baselines. Until then the processed files have no `sponsorship` (the eval part says so), the chip stays hidden, and the
PR is a draft.

### Step 9 — the fit screen reads a pasted posting (`feat/paste-posting`, 2026-10-25)

Under the resume on the fit screen, "Have a posting? Paste it.": a drop-or-paste box read in the browser by
`Atlas.readPosting` and kept in `localStorage` under `posting`, like `course`, per role. With a posting on file the two
columns re-rank: the skills the posting names come first, each marked "this posting asks for it", their status from
the resume unchanged; the band stays the role's (one document; the band is calibrated on the role). The rail says "N of
the M skills this posting asks for are on your resume" above the role sentence, and the fit screen says the same with
"Paste another" and "Forget it". The posting never leaves the browser.

The reader is the pipeline's, not the resume matcher's. The first draft reused the course reader (`readCourse`): against
the pipeline's tags on the 99 golden postings it showed 99% of them and 8,057 skills the pipeline does not tag, because
a resume is read with resume-language extras, sub-skill hints and transfer vocabulary that a posting must not get.
`Matcher.tagPosting` runs the taxonomy's own patterns over the whole text, after a port of the pipeline's cleaner
(`BOILER_RE`, `ABOUT_RE`, long lines split into sentences, apostrophes straightened, a letter outside ASCII read as a
word character the way Python's `\b` reads it) plus the one thing the pipeline is given and a pasted posting is not,
the employer's name: it is inferred as the capitalised phrase that opens two or more lines, and its self-description
lines are dropped anywhere; a single such line only at the top or under an "About" heading. `evals/posting.mjs` (in CI)
pastes the 99 golden postings and holds the browser to the pipeline: at least 80% of each posting's tags shown, never a
skill it does not tag; today 2,318 of 2,321 shown and 0 extras. `web/data/taxonomy_mba.json` was regenerated so the
browser reads the step 7 patterns the pipeline reads (the graphs were not; they wait for the re-extraction).

What this is not: a posting-specific band or score. The posting changes the order and the marks; the verdict stays
the role's, by design.

### Step 10 — what GradBuddy reads from the atlas (`docs/gradbuddy-contract`, 2026-10-25)

`docs/GRADBUDDY_CONTRACT.md`, one page, no new code: the files and functions another program reads, with their shapes
and ids. The MBA index and the role files (roles with `defining`, `asks`, `entry`, `sponsorship`; skills with `kind`,
`how_shown`, `fields` including the `role:<id>` overrides, shares), the product graph, the taxonomy and sub-skill
files, `web/match.js` in node (`createMatcher`, `match`, the row statuses `evidenced` · `transferable` · `presumed` ·
`thin` · `through` · `gap`, the tiers, `tagPosting`, `pickCarriers`, `bandOf` and the bands files), `web/evidence_text.js`,
the browser readers in `web/atlas.js` (`readCourse` and `readPosting` by kind, `grid`, `areas`, `carriers`, `us`), the
relevance thresholds and the campus file, and the privacy rule (what never leaves a browser, and the two things that
do). It says what is stable (ids, statuses, tier and band names, paths, signatures) and what is not (shares, counts,
dates, the editorial lines, the patterns, the cut points).
## Scheduled jobs off the Macs, and one store for what git ignores (v17, 2026-10-26)

Two things kept failing for one reason: jobs scheduled on the owner's two Macs failed when the machine was asleep,
away, or missing a file the other machine had (the 2026-10-25 roster re-scrape: classes.cornell.edu down, `db/.env`
on the other Mac), and a thread landing on either machine found half the working data missing (the taxonomy thread
could not run the calibration: 264 of the 304 sample resumes were on the other Mac). The rule this change builds
toward: a fresh machine, or a fresh cloud session, gets everything it needs with one command, and nothing that runs
on a schedule depends on a laptop being awake. Three kinds of work, three homes: Claude work stays in Claude's cloud
scheduled tasks; deterministic compute (scrape, extract, build, calibrate) runs on GitHub Actions on a cron with
Supabase as the only state; nothing in the two repositories needs a Mac any more. The owner's decisions of
2026-10-26: the scrapes run on GitHub-hosted runners after one trial run; a blocked family gets a self-hosted runner
on the Mac mini; secrets live in each repository's Actions secrets and in the password manager, nowhere else; the
raw transcripts move to a private, service-role-only bucket; the GradBuddy student workspace is out of scope.

- **One store** (`pipeline/store.py`, step 1, #101): the private `atlas-store` bucket, one manifest per store
  (`evals`: the sample and private resumes; `caches`: `data/experiments/` except `scratch/` and `_trash/`; `logs`).
  Push never deletes; pull never overwrites a newer local file; `bootstrap` is the fresh-machine command. The same
  shape in the research repository as `tools/private_store.py` over `research-private` (step 5).
- **One row per run** (step 2, #107): `public.runs` (`pipeline/sql/002_runs.sql`, service role only) and a
  `RunRecorder` in `pipeline/log.py` that writes the row when the stage's process ends: the summary line's counts,
  the WARNING and ERROR tallies, the host, the log path. `python -m pipeline.runs` reads it. Nothing in a row is
  content.
- **The jobs** (step 3, #103; step 4 in the research repository): `refresh-mba.yml` weekly, one scrape job per
  ATS family (25) and a build job that opens the data pull request; `refresh-product.yml` monthly; `rescrape-sp27.yml`
  weekly with three attempts ten minutes apart and a pull request only when the roster changed; `load-catalog.yml`
  on every push to `main` that touches the curated JSON. No job pushes to `main`. The scheduled runs are gated on a
  repository variable, set after the runner trial (`evals/runner_trial_2026-10-26.md`); the trial could not run
  from the thread (the workflow must be on `main`, the secrets and the bucket did not exist), so the report holds
  the shares, the command, the comparison method and the decision rule, and `evals/runner_trial.py` fills in the
  results from the logs.
- **The pages**: `docs/WHERE_THINGS_LIVE.md` (every path git ignores, where its contents live, the jobs table),
  `docs/OWNER_CHECKLIST_2026-10.md` (what only the owner can do, in order), `docs/SELF_HOSTED_RUNNER.md`.

What the thread found and decided on its own, recorded in the pull requests:

- The brief's premise of one Supabase project does not hold: the backlog is in the project named GradBuddy
  (`joanndudsiqrfoemwogm`, the default URL of `pipeline/backlog.py`), the catalog in gradbuddy-catalog
  (`qqkzbzwmpkrmlicoxijy`); both in one organisation, so the Pro plan covers both. Each repository stays on the
  project it already uses; the `runs` table is in the GradBuddy project for both (the research repository gets a
  `SUPABASE_DB_URL` secret for it). Consolidating is a migration for later, not a condition of anything here.
- The demand-gen thread's first pull request (#91) had not merged when this thread started; the branches were cut
  from `main` as it was, stacked on one another, and touch none of that thread's files. The whole v16 stack merged
  while this thread ran, and the branches were rebased onto it (two doc conflicts, both sections kept).
- A pull request opened with the workflow's own token gets no CI run (GitHub's rule), so the build jobs run CI's
  commands themselves and report them; an optional `ACTIONS_PAT` secret opens the pull request as the owner instead.
- `pipeline.scrape` gained `--no-snapshot` so 25 family jobs do not each upload the whole role set; the build job
  snapshots once. `rescrape_sp27.py` exits 1 on a failed subject so the job's retry loop retries.
- A stage that ends with `sys.exit("message")` after no ERROR line records `ok = true`: Python gives an `atexit`
  handler no exit code. The stages log an ERROR before they fail.

## The cohort hook (v18, 2026-10-26)

The frame (owner, 2026-10-26, not to be reopened). On 2026-10-25 the fellowship's mentors judged the atlas's
résumé-and-fit flow undifferentiated: a motivated student gets most of it from Claude in one prompt, and the flow reads
as another applicant-tracking-system tool. The owner agrees. The atlas is therefore no longer GradBuddy's front door.

The atlas is two things now. **GradBuddy's grounding layer**: the postings, the taxonomy, the graphs, the course
registry; `docs/GRADBUDDY_CONTRACT.md` stays the contract, and the first consumer is built in a separate thread in
`gradbuddy/` (an atlas-grounded "shadow apprentice map": a five-level project ladder for one student and one role,
reading `web/data/` files by path). None of that is built here: the atlas still runs no model at runtime and generates
no per-person prose beyond data-built sentences. **One public surface: the Spring 2027 class picker** (`#/classes`,
`web/classes.js`, `web/catalog.js`, `web/data/sp27_campus.json`), because every Cornell Tech student must pick classes
before pre-enrollment (Nov 10–12) and "which classes move me toward the role I want" is a question nobody else can
answer. The picker is the hook that recruits for the owner's first paid cohort: a hand-delivered, paid, six-week
program for five graduate students at Cornell Tech and IE New York pivoting into tech, each with a named target role,
each shipping two or three projects aimed at it by Dec 19, with a weekly session. Applications open Oct 31; the atlas
captures them and promises nothing it does not do itself. The price is never shown (the owner states it in his
reply); the word "paid" is.

What gets no new work, here or in later threads: the fit screen, the role rail, Explore, About you and the games
stay as they are. Not removed, not promoted. The one change they get is the cohort application replacing the waitlist
wording (step 1). The privacy posture is unchanged: the résumé, the syllabus, a pasted posting and every skill list
never leave the browser; a waitlist row carries an email, where the click was, the role, the stage, the program and
the fields, and, new in step 1, one optional short sentence the person types knowingly; events carry no text, ever.

Four steps, one branch and one PR each: the reframe in the documentation (`docs/atlas-is-grounding`), the waitlist
becoming the cohort application (`feat/cohort-application`), the picker's instructor and content facets
(`feat/picker-facets`), and the IE New York roster, discovery first and gated on what IE publishes (`data/ienyc-roster`).
What each built is below as it lands.

**Built, step 0** (`docs/atlas-is-grounding`): this section; the "Later" items that invest in the fit flow moved under
"Frozen with the fit flow"; `README.md` opens with what the atlas is now; the contract names its first consumer and
the files it reads. No code.

**Built, step 1** (`feat/cohort-application`): the waitlist box is the cohort application box, one component
(`applyBox` in `web/app.js`, its copy the pure table `Apply` beside `Stage`) everywhere the waitlist was: the rail's
three placeholders (sources `show`, `build`, `ways`, still opened by their links, now labelled "· Cohort 1"), the fit
screen's foot (`fit`), the start screen in its own section under the stage question (`start`, new: the start screen had
only a privacy line before) and, new, the class picker's result view at its foot (`classes`), introduced by one
data-built line ("These are your gaps for <role>. Cohort 1 closes gaps like these with real projects.") when a role is
chosen and the fit leaves gaps, else the box alone; the picker records its chosen role as the role on screen. The box
has two fields, the email and "The role you want, in your words" (optional, 200 characters, single line); the button
says Apply; a 2xx or a 409 reads "Applied. Wally replies within two days."; the privacy line says what is kept. The
sentence is the one free-text field in the whole capture: `Capture.waitlist` sends `note`, trimmed and cut at 200,
only when typed; events carry no text, by construction. `pipeline/sql/2026-10-26_cohort.sql` (applied by the owner,
never by a thread) adds the column with its check, extends the `source` check with `classes` and the event names with
`waitlist_classes`. `pipeline.funnel` counts applications by source and prints the sentences only under `--notes`,
with the email to reply to. `#/about` says the sentence is kept if you apply. `evals/stage.mjs` checks, for every
stage, that the first call to action on the start screen and on the rail is the application box (`Stage.cta` begins
"Cohort 1") and that the screens draw it from `Apply`. Tests: the note sent, left out when empty, cut at 200; the
script's names and sources equal the latest migration's. The price is nowhere on screen; "paid" is.

**Built, step 2** (`feat/picker-facets`): what already existed in the picker: the text search (`S.q`, over the codes
and the title only), the subject chips, the "Covers a gap" chip and the professor card. Added, in the brief's order:
(1) an **instructor facet**, a select over every instructor of a section this term (`Catalog.instructorList`, from the
cards' instructor fields as `catalog.js` reads them, one entry per person, alphabetical by surname, the slug kept);
choosing one filters the cards (`filterCards` gains `instructor`, by slug when both sides have one, else by name) and
shows "About <name> →" to the professor card, or one line saying the roster has no profile; (2) the **content search
covers the description and the outcomes** (`matchField`: code, title, description, outcomes in that order; never
`roster_syllabus_md`, never `research_note_md`, the rule in `catalog.js` stands), and a card whose match the person
cannot see on it carries a small label, "in outcomes" or "in description"; (3) the **professor card reads the person's
gaps**: with a role chosen in the picker and a fit on file, "Your gaps" lists which of the person's gaps this
instructor's classes this term cover, each with the codes that cover it (`instructorCards` picks the cards,
`instructorGaps` joins the picker's own per-card reads, `readCard`, core first), or one line saying none; the public
facts stay as they were, and nothing is a rating or a review. Tests on synthetic rows: the instructor list, the match
field and its label, the join. No change to relevance bands or thresholds; desktop only.

**Built, step 3** (`data/ienyc-roster`): discovery first, from public pages only, filed as
`../GradBuddy Project/discovery&research/course_catalog/SP27_ienyc/README.md` in the shape of the Cornell Tech one.
What IE New York College publishes: no roster (no sections, times, instructors or syllabi), but a College Catalog
2026-2027 with every course's code, credits, prerequisites and description, and one study-plan page per program
placing each course in a term. Five master's programs, not four, and not the four the campus file named: "Data
Science & Decision Analytics" was a Cornell Tech program name; the real fifth and fourth are Global Business &
Sustainability and Strategic & Creative Marketing. Three terms (an August term of four weeks, a fall and a spring
semester of 15 weeks; the spring runs Jan 19 to May 10, 2027), a real selection window (the specialization course
selection deadline, Dec 17, 2026), no instructors named anywhere, and a student email domain the public pages do not
show (every staff address is `@ienyc.edu`; the catalog says students get an "IENYC email address"). The gate passed
(all five programs have a public course list with descriptions), so the build followed: `fetch_catalog.py`,
`build_dataset.py` producing `sp27_ienyc_classes.json` (68 courses in the Cornell Tech record shape, nulls where IE
publishes nothing, `eligibilityCategory` the program id or `ienyc_shared`, the study plan's term per program with
the spring-2027 reading and its basis on every record) and a `db/` loader with a `campus` column migration, written
and not run. In the atlas, data only: the `ienyc` campus entry has the five programs with their catalog names and
groups (verified, `unverified` dropped), each seeing its own courses and the shared ones, `pre_enrollment` set to
the Dec 17 deadline, the start card and the closed notice saying the courses are being loaded, `signin_domains`
still empty and `catalog` still false. Three things wait for the owner: apply `db/schema_ienyc.sql`, run the loader,
and confirm the student email domain; and one code line waits before `catalog: true`, under Later.

## The four verbs behind a door (v19, 2026-10-29)

The frame (owner, 2026-10-29). One site. A **door** (`#/`): a welcome screen that says what GradBuddy is and asks for an
email and "What are you studying?"; everyone can skip it. The email is capture and routing, never a credential: nothing
behind the door is private, and no screen says "sign in". **Home** (`#/home`): four verbs, which are also the top bar.
**Find jobs** (`#/jobs`): one search over every open US posting of both role sets, with filters; with a résumé on file,
each card says how many of the skills the posting asks for are on it. **Explore roles & build skills** (`#/skills`): a
launcher (roles by field, a résumé drop) into the fit screen and the role rail as they are, ending in a coming-soon door.
**Find classes** (`#/classes`): the Spring 2027 picker on a public catalog file, no sign-in anywhere. **Networking**
(`#/network`): who to meet for the roles a person wants, and the faculty on campus; ends in a coming-soon door. The doors
are Tally forms with a native fallback; the cohort application box, the sentence field and the word "paid" leave every
screen; intake says coming soon and takes an email. The site still runs no model at runtime, writes no per-person prose
beyond data-built sentences, and nothing uploaded leaves the browser. The Oct 31 demo shows the owner's current checkout;
the Classes path is previewable by Nov 5 and merged by Nov 7; pre-enrollment is Nov 10–12.

Phase A (nothing in the tree) built a mock kit, a flow map and clickable mocks per surface on real data in
`data/experiments/scratch/surfaces/` (gitignored; swept at the end of the thread). The owner's round-1 review decided:

1. **No A/B arm on the door.** Everyone sees "Skip for now". The door is a welcome screen, not a gate: what GradBuddy
   is, that a few offerings are ready to share, what is inside, then the email, a line that some parts are for students,
   then the skip. "Enter your email to get in" was too harsh. The placeholder is `user@school.edu`.
2. **The Cornell gate is the NetID shape**, not the domain: two or three letters then one to four digits at
   `cornell.edu` (`wk332`, `ub47`, `khg9`). A matching address opens Find classes. Every other address is still kept,
   and the Find classes card stays on home for everyone, grayed, with a line that says it is gated for now.
3. **Home is a 2×2 grid**, one data-built line per card: Find jobs counts the postings open at the last scrape and the
   companies ("over 25 thousand jobs … from over 1,500 companies", never typed); "Explore roles & build skills" counts
   the roles; Find classes names the term, the campus and the class count; Networking says "faculty on campus" and no
   more, since students outside Cornell have none.
4. **Find jobs keeps the filter rail** (J1) and gets a real clean-up of its search after an audit of the popular job
   aggregators (round 2).
5. **The launcher is roles two thirds, résumé one third** (S3): browse by field, click a field then a role, or search;
   a role in several fields shows under each (none is today); after a résumé, the match details show lightly.
6. **The class picker drops the program picker**; "Rate for" becomes "Match to roles", a multi-select; the matching is
   tuned on the test résumés first and the tuned cases become evals (round 2).
7. **Networking is not event prep.** It is navigating who to meet: hiring managers, people in the role, faculty, alumni.
   Round 2 plans it afresh.
8. **The stage question** ("Where are you in your search?", v16 step 2) stays in About you, step 2 (the owner's
   pick on 2026-10-29, after the round-2 explanation). Nothing on the door, nothing on the launcher.
9. **The round-2 and round-3 picks (2026-10-31).** Find jobs: J4, search first with counted facets, on the
   aggregator audit's search spec. Explore roles & build skills: S5, S4 at screen width (roles two thirds of the
   screen, the résumé the right third). Networking: N6, the any-school "who to meet" frame with N5's prep card in the
   right third; no draft names a school. Find classes: the tuned matching with the field tie-break, and its cases as
   evals. The owner: "we're on the right track".

Phase B, one branch and pull request per step, each on the one before: B1 `chore/hosting` (this section opens with
it), B2 `feat/door-home`, B3 `data/catalog-public` (the owner tests in a preview before anything after it), B4
`feat/find-jobs`, B5 `feat/skills-network`, B6 `feat/plain-copy`, B7 `feat/doors-tally`, B8 `docs/four-verbs`. Every
suite stays green at every step. What each step built is noted under it below as it lands.

### B1 — hosting (`chore/hosting`, 2026-10-29)

Built: README "Hosting" (a Vercel project `gradbuddy-atlas`, root `web`, framework Other, no build; the owner creates
it); `tests/web/assets.test.mjs`, which fails when `web/index.html` names a local script or stylesheet that is not on
disk, when a path is absolute, when a token import is missing, or when a remote script pins no version. Nothing in
`web/` changed.
### B2 — the door and home (`feat/door-home`, 2026-10-29)

Built: the door at `#/` (an empty hash too): "Welcome to GradBuddy.", three short paragraphs on what GradBuddy is,
that a few pieces are ready to share and what is inside (the role count from the index, rounded down to a multiple
of 10), then a native form: the email (placeholder `user@school.edu`, not required), "What are you studying?" (the
five groups of About you's first question), the line that some parts are for Cornell students, Continue and "Skip for
now". Both buttons keep what was typed in this browser (`door.email`, `door.where`, `door.seen`), a program answer
fills About you's first question, and the person lands on the deep link they arrived on, else `#/home`. The email
never goes in the URL and nothing is sent anywhere (B7 adds the Tally form and the events). The pure table `Door`
beside `Stage` and `Apply` holds every string (`COPY`), the gate (`opens`: a Cornell NetID, two or three letters then
one to four digits at `cornell.edu`, decision 2), `next`, `bounce` and `verbs`; `tests/web/door.test.mjs` checks them
and that no string says "sign in", "cohort", "paid" or "apply", uses one of the five banned words, or runs a sentence
over 20 words. Home at `#/home`: "What do you want to do?" and the four verbs as a 2×2 grid (one column under 640 px),
each with one line built from the data: Find jobs counts the open US postings of both role sets and the employers
behind them ("over 25 thousand … from over 1,500 companies", rounded down, the product set added once its file
arrives), Explore roles & build skills counts the roles, Find classes names Spring 2027 at Cornell Tech and is grayed
(no link, `aria-disabled`, "For Cornell students for now. Enter a Cornell address to open it.") until the email on
file opens it, Networking says "faculty on campus" and no more (decision 3). Under the grid, "More about you" to
`#/you`. The four verbs are the top bar after the brand (Find classes only when the address opens it; the bar says
"Explore roles" for the second), the current one marked, the brand to home; the breadcrumbs and the theme switch stay.
A deep link bounces to the door once: any route but the door while `door.seen` is unset draws the door over it, and
Continue or Skip lands on it. The stage question is nowhere on the door or home: it stays in About you, step 2
(decision 8). `#/jobs`, `#/skills` and `#/network` exist now so the hrefs never change; until B4 and B5 land, `#/jobs`
and `#/skills` draw Explore (the fields, then a field's roles: the closest thing to "pick a role" today) and
`#/network` draws the event screen of the field the person's answers and resume point to, else the biggest field.
The start screen is gone: its stage cards, the games carousel and its application box; `#/play/<slug>` and the games
stay reachable from the role pages as before (a game's "Quit" in `gameshell.js` now goes to `#/home`, since `#/` is
the door). `Stage.startRoute` and the start case of `Stage.firstAction` went with the
screen, and `evals/stage.mjs` no longer checks a start screen: the reason is at its top, and it keeps every case for
About you, the rail and the application box on the rail and the fit screen. The door copy's "Inside" sentence is
the owner's, cut to 19 words. Home's job and company counts come from the MBA index's meta alone: the product set's
postings sit in a 9 MB file home does not load, and a number that changes once a file arrives reads as broken; B4's
`jobs_open.json` carries the count of both role sets, and home reads it then. An unknown route now shows home, not the
first screen.

### B3 — the picker on a public file (`data/catalog-public`, 2026-10-31)

Built: `pipeline.catalog_export` runs the course catalog's own loader in its dry-run mode (the JSON in the research
folder is the source of truth; no network, no `.env`) and writes `web/data/catalog/cornell_tech.json`, the rows the
picker reads (125 classes, 116 professors with `profile_md`, sections, meetings, cross-lists, prior offerings, the
roster date), and `web/data/local/catalog_full.json` (gitignored), the same rows plus the prior-term syllabus digest.
The public file never holds the digest or the research note: the export asserts it and `tests/web/catalog_files.test.mjs`
checks it. `node pipeline/catalog_tags.mjs` reads the local copy once, runs `Atlas.readCourse` over description,
outcomes and digest per class code, and writes `cornell_tech_tags.json`: the skills each class names outright
(strength one or more: a sub-skill hint alone no longer counts, the first of the tuning changes), with the sha256
of both taxonomy files, so a stale tags file fails the tests and a taxonomy change means a rerun (CLAUDE.md).
`web/catalog.js` reads the two files the campus entry names (`catalog_file`, `tags_file`; `CONFIG.CATALOG_SOURCE`
is `"files"`) and opens no database client; the supabase-js script tag, the sign-in form, the session gates and
`navSync` are gone, `#/signin` says sign-in is off and goes home, and the Supabase URL and key in `config.js` serve
`capture.js` alone. With one roster loaded the picker asks no campus question. The owner's decisions landed: no
program picker and no "Show all" (the eligibility label stays on every card); "Rate for" is "Match to roles", a
multi-select of chips, and several roles combine their asks and gaps through `Catalog.combineRoles` (a skill is a gap
when any role leaves it open, weighted by the sum of their shares over the number of roles, core when core for any);
with no résumé on file the filter row holds the shell's résumé drop (C1), and "Read my fit" reads it in the browser.
The matching is the tuned run of the round-2 study plus the field tie-break: generic skills count half in the
relevance score and are left out of the gaps covered; the Gaps sort orders by the share of the gaps covered, then the
relevance score, then `Catalog.inField` (a class whose subject belongs to the chosen roles' fields, `field_subjects`
in the campus file, data not code), then code; when no class covers any gap the list says so once and orders by
relevance. The thresholds were re-cut to 0.270 high and 0.083 medium (from 0.35 and 0.12) so the band shares stay what the old reader gave (about one card in
forty high, one in two medium or high). `evals/run_classes.mjs` runs the eight test résumés over 32 cases (two or
three roles each, and all at once) against the public files, exactly as the picker scores them, and checks
`evals/classes/*.json` (`must_top`, `must_not_top`, `must_cover`, `no_cover`; each file says why); the baseline is
`evals/classes_baseline.md`. Five checks are known failures (named in their spec files with the reason), all of one shape: one small gap such as the Office suite carries a class the role does not need; the run stays green on them and goes red if one starts to pass unnoticed. Deviations from the brief: the picker reads tags, never the digest, so the "live read"
of the brief's third test is the tags command itself, checked against `Atlas.readCourse` on twelve codes when the
local copy exists; the thresholds moved because the strict rule halves what a class names.

### B4 — Find jobs (`feat/find-jobs`, 2026-10-31)

Built: `pipeline.jobs_open` reads the committed graphs of both role sets (`web/data/graph.json`, the product set's
US slice; `web/data/graph_mba/<role>.json`, the open rows) and writes `web/data/jobs_open.json`, every open US
posting of either set (31,965 at the Oct 25 graphs: 6,015 product, 25,950 MBA; 1,508 companies; 56 roles) in a
column-oriented shape (tables of companies, locations, roles, titles, skill ids; one compact row per posting with the
flags as bits and the URL after the company's common prefix), 7.4 MB raw and 1.8 MB gzipped, loaded only on `#/jobs`;
and `web/data/jobs_meta.json`, the counts alone, which home reads for its Find jobs line ("over 31 thousand … from
over 1,500 companies"). `Jobs.rowsOf` expands the file once; the pure parts in `web/jobs.js` (`searchJobs`,
`filterJobs`, `facetCounts`, `fitOf`, `fitLine`, `sortJobs`, `dedupe`, `pageOf`, `parseState`, `stateQuery`, the
level words) follow `search_logic.md` from the round-2 audit and have their tests. The screen is the owner's J4: one
search box over title, company, role name, skill names and location (every word must match; a whole word beats a
prefix; title 3, company 2, role 2, skill 1, location 1), Location beside it, a rail of counted facets (Field, Role,
Level as four words, Entry, Employer type, Company with the top twenty then all, Remote, Says it sponsors a visa; a
facet that would leave nothing is drawn plain), fifty cards a page, the posting open in the side panel with every
tagged skill by kind and "Open the posting at <company>" (the existing `posting_link` event; a `jobs` route event
waits for B7's migration), the empty state with each active filter as a chip an × removes, and the hash as the
state. With a résumé on file every card and the panel say "N of the M skills this posting asks for are on your
résumé" (the résumé's skills first and green; never a percentage), Fit is the default sort, and the role filter
defaults to the role chosen on the role, fit or classes screen. Deviations from the brief: `jobs_open.json` is
written by its own stage after `build_graph` (`run_all.sh` and both refresh workflows), not by `build_graph`, so it
can be rebuilt from the committed graphs on any checkout; `first_seen` is carried by `build_graph` into the MBA role
rows from this change on, but the graphs were not rebuilt in this thread (the Oct 26 processed files are here, and a
rebuild moves every baseline), so every row's `first_seen` is null until the owner's data thread runs `build_graph`
for both sets and then `jobs_open`; there is no Newest sort until then, as the spec says. No posting carries pay, so
the screen says nothing about pay.

### B5 — Explore roles & build skills, and Networking (`feat/skills-network`, 2026-10-31)

Built: `#/skills` is the owner's S5 (round 3): a search over every role of both sets (each typed word a prefix of a
word in the label, so "prod man" finds Product Manager), the field tiles with their role and open counts (four a row
from 1280 px, three from 900, two below), a field's roles under the tiles with "Most postings ask for" the three
skills most of its postings name, each a link to the role page; and the right third of the screen for the résumé,
sticky: the shell's drop with none on file, else the band line, "N of the M skills most <role> postings ask for are
on your résumé" for the role chosen, the link to the fit, and the three closest roles as "N of M" (the rough fit's
top three, then the core count per role through the matcher). The pure parts are `web/launcher.js`. `#/network` is
the owner's N6 (round 3): a role (the one chosen on the site, else the top role of the field the person's program
points to), the people types as tabs (a hiring manager, someone in the role now, a recruiter, an alum in the role, a
classmate; faculty on campus sixth when the door's address is a Cornell NetID, read from the public catalog with the
gaps each professor's classes cover), the left two thirds "Who to look for" (titles by level from the role's postings,
the five employers with the most open postings) and "Where to find them" (searches built from the data, each with
what it opens; the professor cards), the right third sticky with the prep card (the company, the opener, three
questions, what to listen for, the draft the person edits and copies, "Add to my list") and the list kept in the
browser. No draft names a school: the opener is "I am a grad student." everywhere (the owner's note on round 2). The
pure parts are `web/network.js`. The `Apply` table is `Intake`: "GradBuddy is coming soon.", one line per surface,
the email pre-filled from the door, "Notify me", "Got it. We will be in touch.", the privacy line; no screen says
cohort, paid, Nov 14 or apply. The rail's three placeholders, the fit screen's foot and the picker's foot open it
with the sources `capture.js` already accepts; the network box keeps its email in the browser until B7's migration
adds its source. `#/about` says what the site is and what it counts, with no cohort. `evals/stage.mjs` checks the
intake heading in place of the cohort heading, with the reason at its top. `tests/web/intake.test.mjs`,
`launcher.test.mjs` and `network.test.mjs` cover the strings and the joins. Left for the editorial pass: the
"Who to look for" level lines run long for roles with many senior titles.

### B6 — plain copy (`feat/plain-copy`, 2026-10-31)

Built: `web/copy.js`, one pure table of every string a screen owns (913 strings in 14 groups: common, door, home,
intake, you, explore, role, fit, jobs, skills, network, classes, about, games), loaded first; `Door.COPY`, `Intake`,
`Launcher.COPY` and `Network.COPY` are views over it, and the screens fill templates with `Copy.fill`. The sentences
`web/evidence_text.js` builds about a skill and the lines built from the data stay where they were. Each string was
rewritten to "How to write" as it moved (the door and home copy, the owner's, untouched): passive lines active
("Nothing is uploaded." → "Nothing leaves your browser.", "Your résumé is read" → "We read your résumé"), "Practise" →
"Practice", the tier headings active, long notes split, "score" gone from the bands tip. `evals/copy.mjs` reads the
table and the two data files the screens show (`sp27_campus.json`, `games.json`) and reports every sentence over 20
words, every passive construction and every stoplist word; for those three the count is zero and
`tests/web/copy.test.mjs` fails on the first offender. For the editorial data files it reports counts into
`evals/copy_baseline.md` and does not gate: `graph_mba.json` 65 long, 46 passive, 17 stoplist of 13,148 strings;
`role_blurbs.json` 2, 5, 0; the evidence quotes 1,886 long (posting text, quoted as it is); the sub-skill files three
and one stoplist words. That editorial pass is a "Later" line.

### B7 — the doors as Tally forms (`feat/doors-tally`, 2026-10-31)

Built: `web/config.js` gains `TALLY: { door: null, intake: null }`; the owner fills the two form ids, and until an id
is set the native form renders, so the site never shows a blank box. `web/doors.js` holds the embed (Tally's script
added at mount time, never in `index.html`; the iframe transparent, left-aligned, dynamic height; hidden fields
`surface`, `source`, `role` and, on the intake, the `email` from the door), the loaded check (only Tally's own
message or a resize counts as loaded: the iframe's load event fires on Tally's error page too, which left a blank
box in the first cut), the three-second fallback to the native form with a "Loading the form…" line meanwhile, the
return handling (`#/home?email=…&where=…` read once, stored as the door stores it, the query cleared with
`replaceState`), and `nativeSubmit`, which posts the native form to `waitlist` with the source `door` or
`intake_<surface>`. The door screen sends `door` when shown (in place of the old `start`) and `door_passed` on
Continue, Skip or the Tally submit; home's cards send `home_jobs`, `home_skills`, `home_classes` (open cards only)
and `home_network`; the intake boxes send `intake_skills`, `intake_classes` and `intake_network`, and the network
box now posts like the others. `pipeline/sql/2026-10-31_doors.sql` (written, never applied by a thread) extends the
two check constraints with these names and adds `surface text` to both tables; no `variant`, since the A/B arm was
dropped (decision 1). `pipeline.funnel` prints the door funnel (shown → passed → each verb) and the intakes by
surface, and guards the `surface` column so it runs before the migration. `tests/web/doors.test.mjs` checks the
names against `capture.js` and the migration text, the fallback clock, the return query and the sources. **Until the
migration is applied, the database rejects the new names: the events are dropped silently and a native Notify me
says it did not go through. Apply the migration before merging this step.**

## AI-forward roles in the scrape (2026-10-30)

The ask (2026-10-29): add AI transformation roles to the jobs scrape, and the new AI product roles ("Associate Product
Engineer" at Book of the Month), with the index and the search logic. Built on `feat/ai-forward-roles`.

**What the research found.** Three kinds of title, read against what the rules already caught:

1. *AI product titles the pm family already reads*: AI Product Manager, Agent Product Manager (Decagon's standalone
   title), Forward Deployed Product Manager, AI Product Lead, AI Product Owner, TPM for AI infrastructure. The product
   graph held 15 "AI Product Manager" and 9 "Forward Deployed Product Manager" postings on 2026-10-29. Nothing to add
   but the pin (`tests/python/test_roles.py`) and the 2026 words in the `ai_ml` specialisation (applied AI, GenAI,
   agents, foundation models, forward deployed).
2. *The builder role between product and engineering*: "Associate Product Engineer" (Book of the Month, New York, under
   the VP of Product: front-end components, back-end automations, agent workflows, owns a feature from spec to measurement,
   ships with Claude Code; candidates from CS, front-end, product management or UX), "Product Engineer" (PostHog's and
   Linear's word for an engineer who owns the product, not the code), "AI Product Engineer" and "Applied AI Product
   Engineer" (builds product features on models that exist, as against the ML engineer who trains them), "Forward
   Deployed Engineer" (the 2026 title with the fastest growth in every recruiter count: OpenAI's board listed 26 on
   2026-10-25, Anthropic's 6; variants Forward Deployed Software/AI Engineer). None was in the scrape: the exclude list
   dropped "product engineer" as a manufacturing job.
3. *AI transformation*: "AI Transformation Lead/Leader/Manager" (the backlog held 37 of them under `transformation`, at
   Writer, Databricks, Santander, eBay, Accenture, Guardian), "Head of AI Transformation & Enablement" (LifeStance, Voice
   Systems Engineering), "Head of AI Transformation" (SimplePractice), "Head of AI and Data Transformation" (BlackRock),
   "AI Enablement Lead" (Experis, Siemens Energy; the most-posted of the enablement titles), "AI Adoption", "AI Center of
   Excellence", "Chief AI Officer". The labelled set split them three ways (transformation, tech_strategy,
   program_manager), so the user's question could not be answered from the graph.

**Not added, with the reason.** AI Engineer, Applied AI Engineer, ML Engineer, Evals Engineer (engineering: thousands of
postings at the Fortune 500 would flood a scrape whose adapters list whole boards; neither a product nor an MBA role);
Prompt Engineer (the 2026 roundups say the title folded into other roles); AI Governance (already the `governance` role,
which names `ai governance`); AI Program Manager (labelled `program_manager`); AI Strategy Lead (labelled
`tech_strategy`); AI Solutions Engineer and Deployment Strategist (sales engineering).

**Decisions.**

1. **`product_engineer`, the seventh product family** (`pipeline/roles.py`): the pattern reads before `pm`, or
   "Associate Product Engineer" is an associate PM. The same words name a manufacturing job, so `HARDWARE_RE` drops the
   titles that say so ("Product Test Engineer", "Mechanical Product Engineer", "Product Engineer - Wafer Fab",
   "Product Engineer (Systems)") and `software_build(text)` settles a bare "Product Engineer" at extraction: software
   words (a stack, a repository, deploys, an AI coding tool) against hardware words (CAD, tolerances, BOM, the plant);
   hardware words that outnumber software words drop the posting, a text with neither keeps the title's reading.
   `roles.family(title, text)` takes the text; `extract` passes the raw description. The scrape searches for "product
   engineer" and "forward deployed engineer" (`SEARCH_QUERIES`); the list-whole-board adapters need no query. The
   resume reader (`web/match.js`) knows the family: `PM_TITLE`, `TITLE_FAMILY`, `PRODUCT_FAMILIES`. "Product
   Applications Engineer" is excluded (two postings of hardware noise read as `pm`); "Product Marketing Engineer" stays
   `pmm` (ClickHouse, Snowflake and Temporal post technical PMMs under it; Texas Instruments' eleven are semiconductor
   marketing, Later).
2. **`ai_transformation`, a 51st MBA role** (`pipeline/roles_mba.py`): outside the 50 of the source list, so batch 2;
   group `consulting_strategy`, covered by `transformation` as `digital_transformation` is. The pattern takes "AI
   Transformation" with the words companies put between (AI & Product, AI and Data, Digital & AI, Gen AI, AI Process,
   AI SDLC), "AI Enablement", "AI Adoption", "AI Center of Excellence", "Head of AI", "Chief AI Officer". The exclude
   list keeps out the people who build (engineer, developer, architect, scientist, research, labs, infrastructure,
   MLOps) and the fields that are their own role (governance, ethics, safety, policy, security, compliance), so "Head
   of AI Governance" stays `governance` and "Head of AI Research" is none. "AI Strategy Lead" stays `tech_strategy`
   and "AI Program Manager" `program_manager`, as labelled. At a consulting firm a consultant stays
   `management_consultant`, whatever the practice (the employer rule runs first there). Three searches ("AI
   transformation", "AI enablement", "AI adoption"). 17 labelled rows (set `ai-transformation-2026-10-30`), two rows
   relabelled with the reason in their note. The rules move 86 stored postings, listed by the integrity eval: 37 from
   transformation, 8 from digital_transformation, 4 each from program_manager, hr_manager and supply_chain (function-scoped
   AI enablement leads in HR and marketing are the role: "Vice President, HR AI Enablement").
3. **A role with no postings yet.** The scrape and the extraction did not run here (this checkout has no `.env` and no
   backlog), so the role exists in the rules and holds nothing. `build_graph` writes it to `roles` with `n` 0, gives it
   an empty file and lists it in no group: the interface reads the groups, so it shows nothing until the postings come;
   `Atlas` leaves it out of the distinctiveness baseline. The integrity eval reports the stale postings (stored role
   against the current rules) and a role those postings would fill as waiting for `pipeline.extract --roles mba`,
   instead of failing on "a role with no US postings"; the graph eval expects the empty role in no group; the matcher
   eval asks no bands of it. `evals/pipeline_baseline_mba.md` and `evals/baseline.md` are rewritten from this state.
4. **What the next refresh does.** `refresh-mba` (weekly) re-extracts with the new rules, so the 86 postings move and
   the role appears, and its scrape runs the three new searches; `refresh-product` (monthly) runs the two product
   searches and the list-whole-board adapters start keeping product engineer titles, then extraction reads their texts.
   Nothing in this change needs the owner's hand beyond the merge.

**Later** (also under Later): sample resumes with a product engineer line for `evals/run.mjs` once the family has
postings to score against; the `rough_fit` and `calibrate` reruns that give `ai_transformation` bands; Texas
Instruments' "Product Marketing Engineer" noise in `pmm`.

## IE New York behind a switch; the sign-in flag that v19 made moot (2026-10-28 to 2026-10-31)

The owner's asks of 2026-10-28, on `feat/open-read-flag` (PR #112): pause every sign-in gate behind a flag so the whole
flow can be tested, and put everything IE New York behind a second flag. The first was built as `CONFIG.CATALOG_OPEN`
(the picker, the professor card and the rail reading the roster with no session, a local copy of the catalog when the
database refused, and the application box retrying a row the unmigrated `waitlist` refused). On 2026-10-31 v19 (B3)
landed on `main` first: the picker reads public files (`catalog_file`, `tags_file`), no screen opens a database client
or asks for a session, and `#/signin` is one line then home. Every gate that flag paused is gone, so the merge dropped
the flag, the local-copy script and the anon-read policy file (`pipeline/sql/2026-10-28_open_read.sql`, never
applied) rather than carry dead switches; nothing on `main` needs them.

**What stays: `CONFIG.IENYC_ENABLED`, off.** The `ienyc` campus entry carries `enabled_by: "IENYC_ENABLED"` (campus
facts in data), and `Catalog.campuses()` returns a campus only while its switch is on, so every surface that reads
the list (the chooser on `#/classes`, the start card and its neutral title, `campusFor`) is Cornell Tech only; a
stored `classes.campus` of `ienyc` or an IE program id resolves to Cornell Tech. The IE data (the entry, its five
programs, the loader and dataset in the research folder) is untouched; flipping the switch brings it back. The
About-you hint in `web/copy.js` still reads "MBA, Tech MBA, Master in Management, Master in Finance": degree names, not
a campus, and `Copy` is a pure table the copy evals check, so it stays as it is.

## The apprentice map as a skill tree and a quest map (v20, 2026-10-31)

The frame (owner, 2026-10-28 and 2026-10-31, revised on 2026-10-31 after the first design round). **Build skills has
two tiers.** Everyone gets the free tier: a role, a résumé, the fit, the gaps, the coming-soon door. A person the
owner has invited gets the full tier: their apprentice map, in the atlas. **The gate is a real sign-in**: Supabase
Auth with sign-ups off; the owner invites each person from the dashboard; sign-in is a magic link to any invited
address, no campus rule; it gates the maps and nothing else. **Public facts as files, private artifacts behind
sign-in**: a map quotes one person's résumé, so it lives in a private bucket under their user id, never in a
repository; the name on the page is made up. **The atlas renders; GradBuddy generates**: the `/apprentice-map`
skill in `gradbuddy/` writes `map.json` by hand, per student, offline; the atlas reads it and draws it with its own
tokens; no model runs in the atlas, no chat, and feedback is captured without a model and read by the owner. **Three
levels and a reach**: Level 1 "Fundamentals" (I do), Level 2 "Three demos in a day" (we do), Level 3 "One project,
real users" (you do), then one optional Reach card; levels 4 and 5 of the Shadow Apprentice method are gone (the
founder arc). **The site promises only what it does**: a person without a map sees the free tier and one line, "Have
an invite? Sign in."

Phase A (nothing in the tree; `data/experiments/scratch/map/`, swept at the end of the thread) wrote a walkthrough of
how a map is made with every rule numbered, a flow map, a mock kit built from the real atlas and the real example
(`gradbuddy/apprentice/examples/pmm-nyc`, a fictional person against a real posting), and clickable mocks per
group, each checked by a critic that built none. Two rounds.

**Round 1 (2026-10-31).** The owner kept: **K1**, the card as a side panel over the tree; **F1**, three buttons ("I'll
build this" · "Not this one" · "Change it") and a note, saved beside the map in the private bucket and read by the
owner with a script; **E1**, Build skills opens the map first for an invited person, the free tier behind one link;
**P1**, a shipped mission turns its skills to "shows" with a date; and the print page. He rejected every tree (one
cluster per skill area, columns, rings): too many words, signs and lines; a card tied to several nodes read as
weird; the legend must be one thin bar at the top. Three changes followed.

1. **One tree per class of roles, not per role.** The class is the one to four roles a person picks that share a
   field; the map is built on the first role at the first company. The tree's nodes are the class's core skills
   only (half or more of a role's postings), credentials out: 19 for the marketing class against 38 core-and-common
   nodes for one role. Behaviors (communication, ownership, execution and the like) are one "How you work" line,
   never nodes: the atlas credits them only through other work. A node sits on the **trunk** (every role in the
   class asks for it), a **shared** branch (two or more) or a role's **own** branch (one). Its state is the best
   across the roles' reads. No lines at rest; the co-asked edges draw only while a node is open, three at most, and
   never mean "learn this first". The common tier sits behind one link, "More skills these roles sometimes ask for".
2. **The quests on a quest map, apart from the tree.** Worlds in order (the three levels, then the Reach), missions
   inside; a world clears after k of its n missions (2 of 6, 2 of 3, 1 of 1 by default, set per map by the
   generator; the Reach never clears or blocks); "Not this one" takes a mission off the world and off n at the
   republish. A card no longer hangs off nodes on the picture; it names the skills it builds, and a node's panel
   lists the missions that build it.
3. **The read is never a count.** On the eight test résumés across eight roles (`evals/resumes/`), a pivoter shows 2
   to 8 of about 38 nodes and an experienced product manager 27; the count is honest and crushing. Measured on the
   way: a quarter of a role's nodes were behaviors no résumé line can unlock on its own; the matcher status
   `transferable` ("shows in other words") fired on none of the 72 pairs; `presumed` fires only for people who held
   the role; the band was always kinder and truer. So the screen leads with the band in words, then "What you
   already bring" (every skill the read found, each under the résumé line that showed it), then "The gaps your
   quests aim at" (the posting's, at most eight); nothing counts the rest. Two matcher candidates (the transfer
   vocabulary; a craft skill counted as named when its artifact is on a line) are a thread of their own, eval-gated.

**Round 2 (2026-10-31).** The owner approved **T4**, trunk and branches; **Q1**, the overworld (four worlds on one
path, numbered stops, "You are here", a flag when a world clears); **D1**, band, what you bring, the gaps. Three
defaults in the build plan stand unless he says otherwise: the missions cover the first role's gaps (a gap of another
role in the class with no mission reads "No mission builds it yet"); the k of n defaults above; the student sees their
own past feedback on a card, and the owner's reply once republished.

The rules, as approved (the walkthrough's numbering). The nodes (R1, revised R22), the archetypes as the role
screen's areas (R2, folded into R24's places), depth as the senior lean (R3; on the tree only as the "senior roles ask
more" mark), the co-asked edges (R4, revised R25), the four states from the matcher's statuses (R5: evidenced or
through → shows; transferable → shows in other words; thin or presumed → must evidence better; gap → must build),
the line that showed a node (R6), the posting's named skills marked and aimed at first (R7), the three "why" lines
each quoting its source and checked word for word (R8, R10, R11), the gap sentence from the synthesis (R9), the real
project in the form the strangest fit gives it (R12), classes from the roster only (R13, R14), one Level 1 card per
archetype with a core gap and at most six (R15), exactly three demos on the marked gaps (R16), exactly one real project
with named users as a kind of person (R17), a reach only when the gap sentence names a thing nobody has built and more
than one term is left (R18), cut never pad (R19), the atlas never writes to a map (R20), only a choice, a note and a
card id go up (R21), the class tree (R22 to R26), the worlds (R27 to R30), the read on screen (R31).

Phase B, one branch and pull request per step, each on the one before: **B1** in `gradbuddy/` (files written, the
owner commits), **B2** `feat/map-gate`, **B3** `feat/map-tree`, **B4** `docs/map`. What each built is below.

**Built, B1** (`gradbuddy/apprentice/`, 2026-10-31; the owner commits): `INTAKE.md` takes `roles:` (one to four atlas
role ids of one field, the first the map's role; a lone `role:` still reads). `ground.mjs` reads every role, writes
per role the core and common skills and the matcher's read, and the class tree (the union of the roles' core skills,
credentials out, behaviors apart, `place` trunk · shared · own, the state as the best across the roles, `grows`,
`posting_names`, the line that showed it), `more`, `posting.names` and the read (`band`, `brings`, `marked_gaps`,
`how_you_work`) into `grounding.json`. New `assemble.mjs <slug>` copies those deterministic parts into `map.json` as
version 2 and writes `worlds` from the cards with the k defaults, keeping every hand-written part and any `clear`,
`shipped`, `changed`, `declined` or `reply` the owner set. `check.mjs`: levels 1, 2, 3 and `"reach"` only; Level 2
exactly three, Level 3 exactly one, the Reach at most one; `worlds` with `clear` at most the count; `tree` and `read`
present with every id in the taxonomy; every sentence of a "why" line at most 20 words and no percent sign; a card
skill off the tree prints a note and does not fail; an optional second argument names a map file, for the tests.
`SKILL.md` carries the class, the three levels and the reach, and R15 to R19 in its own words; `assemble` runs after
the cards and before the check. `render.mjs` and `template.html` draw the three levels and the Reach with each
world's "Ship k of these n" line and the class tree as a list by place (the owner's check view). The example:
`roles: pmm, marketing_manager, growth_manager, brand_manager`; level 4's Claimkeeper is the Reach, level 5 is gone,
every "why" line rewritten to sentences of at most 20 words with no percentage and no change to any quote, one source
title shortened to drop a real person's name; 19 nodes (3 trunk, 6 shared, 10 own), 6 behaviors, 14 more, 11 cards.
Six broken copies of the map each fail the check with one line; the real one passes with two notes (`data_driven` sits
off the tree on two cards).

**Built, B2** (`feat/map-gate`, 2026-10-31): `MAPS_ENABLED: true` in `web/config.js`. `web/auth.js`, a classic script
with no Supabase library: the magic link to an invited address only (`/auth/v1/otp` with `create_user: false`), the
session read from the link's landing hash (`#/map#access_token=…`, the implicit flow) and kept in `localStorage`, the
person's own `maps/<uid>/map.json` read with their token, one feedback file per card written the same way with
upsert; the pure parts (`sessionFromHash`, `feedbackPath`, `feedbackObject`, `refusedMessage`, `MapGate.next`) load
in node. `#/signin` in the invited mode ("Have an invite? Enter the email it came to.", the sent state, "This email
has no invite." when GoTrue refuses, a spent link's line); `#/map` with a session reads the map (plain text until B3),
without one goes to `#/signin`, with a session and no file yet says the map is being written; `#/skills` is E1 (a
signed-in person with a map goes to the map; `?all=1` is the launcher with "← Back to your map"; no session: the
launcher plus "Have an invite? Sign in."). The sign-in and the map never bounce to the welcome door. Every string in
`web/copy.js` (`signin`, `map`). `pipeline/sql/2026-11-03_maps.sql`, written and never applied: the private bucket
`maps` (JSON only, 2 MB) and three policies on a person's own folder (read; insert and update of
`<uid>/feedback/<card>.json`; nothing for anon), with the owner's four steps in its header. `pipeline/map_publish.py
<slug> <email>` finds the invited user by email through the admin API and uploads the student's `map.json`;
`pipeline/map_feedback.py [<email>]` lists the feedback files; both on `CATALOG_URL` and `CATALOG_SERVICE_ROLE_KEY`
(`.env.example`; the gradbuddy-catalog project, the one the site points at) and exit 0 without the key. Tests:
`tests/web/map_gate.test.mjs`, `tests/python/test_map_publish.py` on a fake client.

**Built, B3** (`feat/map-tree`, 2026-10-31): `web/map.js`, the pure parts (`MapModel` in the browser, `require("web/map.js")` in node):
`classTree`, `treeLayout` (the trunk as a bar, trunk nodes on it, shared nodes on ticks beside it, one stem per role
with its own nodes on ticks, nothing threaded on a stroke), `coAsked` (three at most, from the index's edges),
`worlds` (each mission's state from the card's `shipped`, `declined`, `changed` and the person's last answer; `n` with
declined missions off it; `clear`; cleared; "you are here", the first open or chosen mission; the progress line in
words), `questLayout`, `questsOf`, `readLines`, `shippedLook`, `dateWords`, `skillInfo`. `#/map` draws the read first
(D1), one legend bar whose content follows the tab, the quests tab (Q1) and the skill tree tab (T4) with "How you
work" as one line and "More skills these roles sometimes ask for" as a panel, the node panel with its "asked together
with" lines drawn only while open, the card in the side panel (K1) with the feedback control (F1: `Auth.writeFeedback`,
the last answer read back on open, the owner's `reply` from the map), the shipped look (P1) and the print sheet (one
landscape page, the four worlds as columns, the tree's states as dots). A sent choice shows on the card and its stop;
the world's counts follow the map file until the owner republishes. Every string in `web/copy.js`. Tokens only, no
arrowhead, nothing under 13 px on screen, no count of skills anywhere. Tests: `tests/web/map.test.mjs` on a synthetic
map, and the example map when the GradBuddy folder is on the machine.

**Built, B4** (`docs/map`, 2026-10-31): this section; `docs/GRADBUDDY_CONTRACT.md` "What the atlas reads from
GradBuddy" (the map file, what is stable, the privacy rule for maps and feedback); README (the bucket, the two
scripts, the owner's steps, the `web/` bullets); `evals/README.md` "Evals to build" (the layout against a hand-placed
example); the scratch folder swept.

## Transferable on the MBA roles: the vocabulary reaches the pivoter (`fix/transfer-reach`, 2026-10-31)

The ask: on the eight test résumés `transferable` seemed never to fire against an MBA role. Measured first
(`measure.mjs` of the map kit, and a per-hit diagnosis): it does fire, on 148 of the 384 résumé × role pairs (eight résumés, the 48 MBA roles),
from four résumés (course_list, experienced_pm, grad_student_new, pivot_phd_hci); the kit's table adds it to the
"shows" count, so it never shows as its own column (the v20 note above, "none of the 72 pairs", read that table). Where it does not fire, three reasons, counted over every via hit:
the skill also has a direct hit (326), the role does not ask for the skill (312), or there is no via vocabulary at all
for the skill (every MBA-only skill: the 21 skills with via patterns were all product skills). The example pivoter
(pmm-nyc, sales to product marketing) had no transferable node on any role (it has three since this change: measured
when the example was reassembled on 2026-11-04).

Two changes in `web/match.js`, each measured:

1. A direct hit that is only a mention (strength 1: a skills list, a degree line) no longer masks the via lines of
   work: a skill is transferable when every line of work that shows it is a via line. Status only, credit unchanged.
2. Via vocabulary for the MBA asks a pivoter's lines carry: `research` → consumer insights (semi-structured
   interviews, thematic analysis, focus groups); `sales` → market research (win/loss, objections and lost deals),
   positioning and messaging (objection sheets, talk tracks, discovery-call guides), customer-facing engagement (trade
   shows, industry events); `community` → content (a weekly brief, a newsletter, an audience grown to N members). Two
   new `VIA_LABEL`s. On 40 published sample résumés the new patterns fire on two lines, both fair reads.

The procurement pivoter (experienced_with_coursework) still reads no transferable node: its lines name the MBA skills
in their own words (vendors, suppliers, quarterly business reviews), which is direct evidence. A transferable row keeps
full credit, so the example pivoter's Product Marketing Manager score rises from 25% to 55%, "Qualified for the role";
the bands were not recalibrated (the 304-résumé calibration set is not on this machine), which is the next step before
the screens show it.

**Measured and not taken: a craft skill named by its artefact** (`feat/craft-artefact-named`, draft). A line that
names one of a method skill's `how_shown.artefacts` would count as naming the skill (strength 1). On the eight résumés
and the example no tree node changes: the taxonomy patterns already catch the artefacts these résumés write. On the 40
published samples the multi-word artefacts name 28 skills the patterns miss, about 16 of them wrongly ("annual plan" as
a compliance program, "test plans" as controls testing, a dissertation "case study" as customer proof); with single
words too, 184, and "Community Credit Union" reads as content. The artefact lists tell a student what to name; they
are not patterns, and a reader of them would need curated patterns per skill first.

## The first pass on the live site (v21, 2026-11-01)

The owner walked gradbuddy-atlas.vercel.app on 2026-11-01 and sent one list of fixes, screen by screen, with a first
and primary ask: the matcher finds only the skills a résumé names, so his own product-manager résumé never shows
"PRDs & requirements writing", "Enterprise SaaS & B2B" (Dealpath) or "Payments, fintech & banking" (American
Express). Everything landed in one branch, `claude/vercel-feedback-fixes-dba6e9`, built by six agents on one checkout,
each on its own screen, and verified in the browser pane by the lead. Two decisions the owner took up front: the
résumé text leaves the browser once, to a model, and the copy says so (he had promised the opposite everywhere); and
Tally's theme is a per-form setting, so every form exists twice, light and dark.

**The model read** (`web/api/infer.js`, `web/infer.js`, `web/match.js`). After the regex read, the site sends the résumé
text and the ids it already credited to `/api/infer`, a Vercel function at the project's root (`web/`, so `web/api/`;
`web/vercel.json` bundles the three data files it reads). The function asks `claude-haiku-5-5` (the Messages API over
plain fetch, structured JSON, the skill list prompt-cached, the provider swappable through `INFER_PROVIDER`) for the
skills the résumé shows without naming them, each with the line that shows it; it validates every id against the
taxonomy, never offers credentials or behaviours, drops what the regex found, caps the list at 12 and drops any quoted
line that is not in the text. The text is never stored or logged; without `ANTHROPIC_API_KEY` the route answers 503
and the site reads the patterns alone. The browser caches the answer under a hash of the text, so one upload is one
call; "Forget" and "Start over" clear it. In the matcher an inferred skill is the status `inferred` at credit 0.75:
above a mention (0.5), because the model read the line as work; below a line of work (1), so naming the skill still
helps. It counts as shown everywhere a line of work does (covered, extras, the industry slot, the rough read) but
never credits a behaviour through a carrier and never beats a line the résumé has. `Atlas.useInferred` wraps every
matcher the screens get, so the fit, the rail, the launcher, Find jobs, the classes' gaps and Networking all read it
without threading it through. The eval, `evals/infer.mjs`, runs the read over the sample résumés with saved answers
under `data/experiments/infer/` (`--reuse` needs no key or network; `--url` goes through a deployed route, since the
key lives only on Vercel) and writes `evals/infer_baseline.md`; `evals/run.mjs --baseline` is unchanged with no list.
Cost is about $0.002 per résumé cold and $0.001 warm. The read is tested on the whole résumé set, never the eight
samples alone (CLAUDE.md): `evals/infer.mjs` reads the eight and then every published external sample
(`evals/resumes/external/`, the calibration's set, pulled from the `atlas-store` bucket), scores each against its own
role and writes an aggregate. The first full-set runs went through the pull request's preview deploys on 2026-11-01
(`--url` with `INFER_COOKIE` from the deploy's share link, since previews sit behind Vercel Authentication), on the
40 of 495 files this machine held. The first run showed the model writing items and taking them back in the reason
("Not a real signal; omitted", "this item should be dropped"); the route now requires a `sure` flag on every item and
drops a hedged reason or a one-word line, and a stricter prompt then dropped the employer-to-industry reads the owner
asked for first, so the prompt names those as sure by rule and the call runs at effort medium. The run that stands, once the store was pulled (301 of the 495 sources were ever fetched; the rest never
were): 304 résumés read (the eight plus 296 published, 29 files skipped as packet parts without a role or not a
single résumé), 14 inferred on the eight (FinServ Startup → fintech, Stripe → fintech and enterprise SaaS, 5M users →
consumer), none of the eight's expectations lost or gained, 3.4 inferred per published résumé on average (the most:
enterprise SaaS 30, process improvement 27, consumer 24, healthcare 23, fintech 22: the employer-to-industry reads
the owner asked for), 32 band moves up and none down (each résumé scored against the role it was written for, so up
is the right direction; the largest, investment manager 48% → 75%, are the regex under-reading a résumé of the role),
zero credentials, behaviours, unknown ids or unquoted lines, about $0.36 for the set. The run went five résumés at a
time through the preview route (the eval is sequential; a driver script called it per file with `--only <file>`).
Left open: a rate-limit rule on `/api/infer` and a spend cap on the key.

**The door and the forms.** The door's words are the owner's, verbatim, held past the 20-word rule by an exception
in `evals/copy_lib.mjs` that lasts only while the string is his. Ten Tally forms (`web/config.js` lists them): the door
and four intake kinds (skills, positioning, classes, network), each light and dark; the site embeds the one matching
the theme in effect and remounts on a toggle or an OS change (`Doors.themeOf`, `remountForms`). "What are you
studying?" is optional on the door and its answer, which Tally returns as the label, lands in About you as the id
(`whereId`), marked `whereFrom: "door"` so a program the person chose in About you is never overwritten. Each intake
form carries its own line, so the box under Networking no longer promises "personalized projects". A new surface,
`positioning`, backs "Help me improve my positioning →" on the role rail; `pipeline/sql/2026-11-01_positioning.sql`
adds it to the capture tables and the owner applies it by hand.

**Home.** Under the four verbs, About you inline: the three questions and the résumé drop until any is answered, then
a one-line summary with Edit. "Explore roles & build skills" is "Explore careers" everywhere. Every count comes from
the Find jobs file (`openCounts`), so home, About and the search agree; the footer is the "About the data" link alone.
The résumé paste box is gone from every screen: people upload a file.

**Explore careers.** On the launcher a field's roles take the tiles' place, with "← Back to fields". The bar that
compared the fields' counts is gone. A field's chart shows at most 20 named dots, by one rule (`Atlas.fieldChart`):
credentials and tools out (Office suite with them), at most three of the skills every field asks for in their own
lane, then every defining skill of the field's roles and the highest field shares at 10% or more; sub-skills were
never on it. A role's header is "N open postings · N employers". The rail lost the entry-grade paragraph, "Do
something with this" and "Then"; one link remains, "Find classes relevant for this role →". The gap rows offer "Help
me build this skill →" and "Help me improve my positioning →". "Clear all" became "Reset filters" and resets every
filter, the level included, through one pure table (`RoleFilters`): the old handler cleared three of the eight.

**Networking.** With no About you answer, no résumé and no role, the screen opens with the questions. Role and
Company are searchable drop-downs (`web/pick.js`, the one component every screen uses for a choice from a long list).
"A classmate" is gone, so are the type descriptions, the counts, the lead line, the list feature, "Listen for", "Open
with" and the message draft. Employers sort by the role's own open postings (Amazon's 507 Product Manager postings,
not its 965 across the field), professors by gaps covered with a résumé and by the role's asks they teach without one,
and "See more companies in Find jobs →" opens the search with the role and field set. The prep card is the company,
"Where to find them", then "Suggested approach": what to lead with, the ask, three questions, and Copy. A question
never names a behaviour, a generic skill or a credential; it draws on the role's defining skills (the top craft asks
where a role defines none), the person's craft gaps, the company's own postings by title, count and level, and a
posting sentence when one fits in 20 words. The alumni searches carry LinkedIn's school filter for the three Cornell
ids the owner tested, so nobody adds their school by hand.

**Find classes.** Prior offerings are gone; Grading shows only when the roster has it, each part as a percentage;
"Enrollment limited to" and the eligibility tag show only for a known restriction (an unverified one says nothing).
The cards lost the grading chip, the prior-term line and the "You" rating; the GradBuddy band shows only when a
role is chosen. The roster line, the two-columns line and the count line are gone. Sort is Relevance, or Gaps covered
with a résumé, and absent when nothing is chosen (roster order then). Subject stays open; Days, Credits, "Who can take
it" and Professor fold under it, collapsed. The professor card says nothing about identity and lost the ratings
disclaimer.
**The second pass (`fix/live-site-pass-2`, 2026-11-01).** The owner's follow-up after #136 merged: too much dead
space and a sideways scroll on Networking's type tabs; explainer lines under links; the role page's areas open on
arrival. Widths: Networking, the launcher, the role page beside its rail and Find jobs lost their caps (880 to 1200px)
and use the main width; Find jobs' results run in columns of at least 440px, the class cards in columns of at least
540px, home's four verbs in one row from 1280px; leads and About paragraphs stay at 72ch. Tab strips wrap, never
scroll. Gone everywhere: "Each link is a search built from the data. We list no one ourselves.", every "Opens …"
line under a link, the professor-card explainer, the per-type lead under "Who to look for" (only the "no senior
posting open" fallback stays, since it replaces an empty list), the Faculty type's "Where to find them" (the
professor's name links to the card instead), and the launcher's "Each opens your fit." The note reads "paste into
your AI helper". The role page's skill areas all start collapsed and the area rows read "7 skills" without the "N in
most postings" part; on Find jobs only Field opens on its own and an active-filter chip row shows what is set. The
legend's "already on your resume" and "a gap this role requires" are the skill map's dots, before each row's name
too; the gap dot is amber on the role and fit screens, where a gap row is amber, and blue on the map. The résumé
upload has a processing state (`processing` in app.js): the drop zone turns solid and lists the three steps (reading
the file, matching it to the postings, the model read) with the running one marked and the done ones checked, the
Read button reads "Reading…" and is disabled, a second drop or click joins the read in flight instead of starting
over, and the screen redraws when it ends. Before, the click on Read showed nothing for up to 20 seconds while the
model read ran, so people uploaded again.

## Refresh pull requests merge themselves when every check passes (2026-11-01)

The owner asked why every scrape needs a merge. The scrape itself never does: each file goes to the Supabase backlog as
it is written (new postings added, missing ones closed after the one-by-one check, none deleted). What needs `main` is
the site: `web/data/` and `data/processed/` are files in git that Vercel serves, rebuilt from the backlog. Until now
the owner merged that pull request by hand, and a week's numbers sat unpublished whenever nobody did.

**Decision: `refresh-mba.yml` and `refresh-product.yml` merge their own pull request** when `evals/run_pipeline.py` and
every command `ci.yml` runs pass in the job (a pull request opened with the workflow's own token gets no CI run, so
the job's checks are the gate; `evals/stage.mjs` and `evals/posting.mjs`, which the job had skipped, now run there
too). A failing run still opens a draft titled "evals failed: do not merge". The merge is a merge commit pinned to the
checked head (`--match-head-commit`); if it fails (main moved and conflicts) the job comments on the pull request and
fails, so the failure email means a refresh is waiting. The repository variable `REFRESH_AUTO_MERGE` = `off` turns it
off; an MBA trial run never merges. Opening the pull request at all still needs "Allow GitHub Actions to create and
approve pull requests" or an `ACTIONS_PAT` secret. CLAUDE.md records the exception to "merge only when the user says so".
## The 2026-11-01 MBA refresh: the skill board drops dead ends (2026-11-01)

The weekly MBA refresh (PR #131) failed CI on two tests. `web/data/jobs_open.json` had not been rebuilt after the graph
(rerun of `pipeline.jobs_open`, no code). The other was a rule the data had kept by luck: the Skill path board (and the
skill map's route planner, which builds the same board) leaves out the generic skills, and `Atlas.genericSkills()`
measures them (core for at least half the MBA roles). With the refresh `ai_transformation` filled (49 MBA roles) and
problem solving fell to core for 24 of them, just under half, so it stopped being generic. Healthcare & life sciences,
whose every other link goes to a generic skill, came onto the board with one link: a dead end, where a player can only
step back, which the real-board test and `evals/skill_path.mjs` forbid.

**Decision: `buildBoard` drops a skill with fewer than `MIN_LINKS` (2) links, again until none is left**, rather than
fixing the generic list by hand or moving its threshold. The list stays measured (the README's reason for it holds),
and the board's no-dead-end rule now holds by construction whatever a refresh does to it. On the 2026-10-25 data the
pruning changes nothing (healthcare had no link then). The inline test boards that state the round's rules on a line
of skills pass `minLinks` 1 to keep their dead ends. The eval's EXPECT and the game README's worked rounds moved to the
new data together: Marketing → Product Manager now goes through Mobile platforms (1 good hop of 4), the Supply chain
biggest-number round stops 3 hops short, the pools are 478 and 2,311, 55 roles are pickable. The README's mocks still
show the 2026-10-25 round.

`ai_transformation` (164 postings after the refresh) had no group in `bands_mba.json`. `calibrate.mjs --roles mba` reran on
2026-11-02 on the 333 published samples (301 files from the store, 37 cut from packets) and puts it in Consulting &
strategy. The cut points moved a point or two: in range from 54% (was 55%), like the role from 73% (74%); every group
but risk keeps its bands. The first run read only the 70 text files (the worktree had no `npm install` in `evals/`, so
PDF and DOCX samples failed silently) and left seven groups without bands; `calibrate.mjs` should refuse to write when
samples fail to read, and now does (it stops with the count of unread files). The merged product refresh (#138) adds product engineer as a seventh product family: 56
pickable roles in the skill path game, its pool 485 from a field and 2,396 from a role.

With `ai_transformation` in Consulting & strategy, three field carriers fell just under the 15% co-occurrence floor of
`evals/run_taxonomy.py`. As the rule says, the carriers changed, not the threshold: go-to-market for consulting is shown
by strategic planning (24%) instead of strategy development (15%), positioning for consulting by executive communication
(58%) instead of client engagement (15%), and partnerships for finance by stakeholder management (81%) instead of
investor relations (14%). Only `graph_mba.json` changes; the product graph has no field entry for these skills.

On 2026-11-04 CI failed before any check: `ubuntu-latest` became Ubuntu 26.04, which has no Python 3.9 build for
`actions/setup-python`. `ci.yml` and both refresh workflows now ask for 3.12, the version the Macs' `.venv` runs
(every check passes on it), so the scheduled refreshes do not stop on the same error.

## The 2026-11-01 product refresh: specs that pinned the postings' order (2026-11-01)

The first product refresh with the AI-forward rules (778 product engineer postings) failed three matcher checks, all
`must_show_through`. Nothing in the reading changed: on the associate PM postings `prd` and `roadmap` now tie at 43% for
communication (the alphabetical tie-break picks `prd`) and `discovery` leads `user_research` 41% to 34% for customer
obsession, and `course_list` and `grad_student_new` show each pair at the same strength, so the pick between them
follows the postings. **Decision: a `must_show_through` value may be a list, any one of which carries the behaviour**,
used where the resume shows the carriers equally strongly. Pinning one would draft every refresh that reorders them,
now that refreshes merge themselves. The cost: `course_list` now shows customer obsession through its statistics
course ("experiment design", tagged discovery) rather than its user-research course; a tie-break that prefers the
carrier closer to the behaviour would need a per-behaviour order, left for later.

Merging main into the refresh also tripped the networking screen's 20-word rule: the alum's "which would you build first"
question had no shorter form, and "Capital One Financial" with two long skill names made 21 words. It now falls back
through `chooseNoLeadShort` and `chooseShort` (`web/copy.js`) with `firstFit`, as the other questions do.

## The bands recalibrated on the full set; a transferable row earns 0.75 (`data/bands-recal`, 2026-11-02)

Both bands files were rerun with `evals/calibrate.mjs` on the full calibration set, the 301 files `pipeline.store pull
evals` brought from `atlas-store` (304 samples, since packets hold several; 281 written for an MBA role, 51 for a
product role), the first full-set run since 2026-10-14. The rank statistics hold: MBA same-role above other-field 89%
and above adjacent-role 77%, as on 2026-10-14 (0.8870 and 0.7709); product 95% and 89% (0.9499 and 0.8862; 95% and
88% before). No group loses its bands: Risk & compliance stays the only group without (the owner's hold). What moved:
MBA in range 0.55 to 0.54, like the role 0.74 to 0.73, and five bottom lines (consulting 0.31 to 0.29, product 0.26 to
0.25, marketing 0.23 to 0.22, people 0.24 to 0.23, analytics 0.33 to 0.28); product related 0.33 to 0.32, in range 0.51
to 0.49, strong 0.69. `group_of` now lists `ai_transformation` (consulting & strategy), which is what the MBA refresh
(#131) failed on. #133 itself barely touches the set (45 of 15,504 MBA résumé × role scores, from 8 files; 6 of 1,824
product), because published samples are written in their own role's words. **Decision: a `transferable` row earns 0.75
(`TRANSFER` in `web/match.js`, in the score and in `creditOf`), not full credit.** Measured at 1, 0.75 and 0.5 (770
MBA scores from 41 files change, 134 product from 33): MBA same-role above other-field 0.8869, 0.8870, 0.8870, above
adjacent 0.7709, 0.7709, 0.7708; product 0.9498, 0.9499, 0.9497 and 0.8862, 0.8862, 0.8857. The set cannot tell the
settings apart beyond the fourth decimal; 0.75 is level or higher on all four, 0.5 lowers the adjacent statistic in
both sets, and 0.75 is the model read's rule for the same case (the work is there, the words are not the role's, so the
rewrite the row suggests still helps). The cost is the pivoter: the pmm-nyc example's Product Marketing Manager score
goes from 55% ("in range") to 48% ("related background"); business developer 73% to 68%, still in range. The eight
test résumés stay inside every `score_band` (`run.mjs` 513 pass); one fit band moves, staff_pm_terse against associate
PM, 69% to 68%, under the unchanged 0.69 strong line. Not run: `BEHAVIOURS=score` on the full set (`evals/README.md`,
"Evals to build" item 6), still open.

## The campus gate: the door's email reads as a campus flag (`feat/campus-gate`, 2026-11-04)

The owner's asks of 2026-11-04: any `@cornell.edu` address opens what a NetID address opened (v19 B2, decision 2, the
NetID shape, is retired); a visitor whose address is not a school's does not see Find classes at all (no card, no
top-bar link, no route, nothing grayed) and sees neither "An alum in the role" nor "Faculty on campus" on Networking;
an IE New York address reads the IE roster and IE's LinkedIn school filter. Decisions:

1. **The flag table is data.** `CAMPUS_DOMAINS` in `web/config.js`: `{ cornell: ["cornell.edu"], ienyc: [] }`; a new
   campus (Johnson Ithaca next) is a new flag id there. `Door.campus(email, domains)` in `web/app.js` is pure: the flag
   whose list holds the address's whole domain, any case, spaces around it ignored; `wk332@alumni.cornell.edu`, a gmail
   address, an address with two "@" or none is no campus. In the browser the table defaults to the config's.
2. **A flag opens a roster through the campus entry.** Each entry of `web/data/sp27_campus.json` carries `flag`
   (`cornell_tech` is `cornell`, `ienyc` is `ienyc`). `Door.rosterOf(flag, campuses)` is the listed campus of that flag
   with `catalog: true`, over `Catalog.campuses()`, which honors `enabled_by`. `Door.opens(email, domains, campuses)`
   keeps its name and now means "the address belongs to a campus with a loaded roster". Today: cornell opens Cornell
   Tech; ienyc opens nothing until the IE files exist, `catalog` turns true and `IENYC_ENABLED` flips.
3. **Closed means absent.** The top bar and home draw only the open verbs, so a visitor with no roster sees three cards
   (`.verbs.n3`: one row of three from 1280 px, else two by two wrapping); `Door.reach(name, open)` sends `#/classes` and
   `#/professor/<slug>` home in `route()`. The grayed card and its strings (`home.closed`, `closedLink`, `closedAfter`)
   are gone. `route()` waits once for the campus list before its first draw, so every screen reads the gate
   synchronously (`campusGate()` in the shell: `{ flag, open, campus }`). `Catalog.campusFor` prefers the flag's campus
   with a roster over a stored choice, and the picker hides "Change campus" for a flagged visitor.
4. **Networking by flag.** `Network.types(flag, roster)`: hiring manager, someone in the role and recruiter for
   everyone; the alum for any flag; faculty when the flag's roster is loaded. The alumni search's school filter is per
   flag, `SCHOOLS` in `web/network.js` (`cornell`: the owner's three ids of 2026-11-01; `ienyc`: empty until the owner
   gives IE's id); an empty list builds the plain people search with no `schoolFilter`. The link labels say
   "{school} alumni" from `Copy.network.schools` ("Cornell", "IE"). No draft names a school but the alum's ask, as
   before. The faculty tab reads the flag's campus entry (`campusProfs(campus, gaps)`, one roster read per campus
   through `Catalog.loadCatalog`), so IE's professors come from its own `catalog_file` and `tags_file` once they exist.
5. **The door's line names no campus.** "Some parts are for students. A school address opens them." (`door.school`,
   was `door.cornell`). The owner's door paragraphs are unchanged.

The owner's two values (2026-11-04): the IE domains are `student.ie.edu` and `ie.edu` (`CAMPUS_DOMAINS.ienyc`), and the
IE school filter is the four school pages of the people search he sent, 740718, 5141380, 2816303 and 2816341
(`SCHOOLS.ienyc`). An IE address today sees three verbs, the alum tab with IE's filter, and no Find classes or faculty:
the IE roster is not on the site. What is missing for it: `web/data/catalog/ienyc.json` and `ienyc_tags.json` (the
research folder `SP27_ienyc/` holds `sp27_ienyc_classes.json`, but `pipeline.catalog_export` is written for the Cornell
Tech loader alone and needs an IE branch or a second script), `catalog: true` with the two file names on the `ienyc`
entry, and `IENYC_ENABLED` on. Nothing in this change needs to move when they land.

Verified in the browser pane on the local server (2026-11-04): a gmail address draws three cards, three top-bar links
and three people types, and `#/classes` rewrites to `#/home`; `john.smith@cornell.edu` draws four, opens the Cornell
Tech picker, the Cornell alumni filter and the faculty roster; `someone@student.ie.edu` draws three, the alum tab with
IE's four ids and "IE alumni" labels, and no Find classes.

Tests: `tests/web/door.test.mjs` (the table, `Door.campus`, `Door.opens` over any @cornell.edu, the IE cases with and
without a roster, `campusFor`'s flag, three open verbs), `tests/web/network.test.mjs` (types per flag, the school filter
per flag, the empty-id case, the IE labels), `tests/web/routes.test.mjs` (the closed routes). `evals/copy_baseline.md`
rewritten (string counts only; zero offenders).

## The apprentice generator moves into the atlas (`feat/apprentice-in-atlas`, 2026-11-04)

The ask: make and publish a map from this repository alone. Until today the generator lived in GradBuddy
(`gradbuddy/apprentice/`), read the atlas by file path, and the owner had two repositories to keep in step. Decisions
(the lead, 2026-11-04, under the owner's brief "everything apprentice lives in the job atlas"):

1. **The generator is `pipeline/apprentice/`**, the same files (`_lib.mjs`, `new.mjs`, `ground.mjs`, `assemble.mjs`,
   `check.mjs`, `render.mjs`, `template.html`, `INTAKE.md`, `README.md`, `config.json`). Every script runs from the
   repo root. The atlas root is found from the scripts' own path, so `atlasPath` is gone. `config.json` keeps the
   roster (`catalogPath`, `rosterFile`, `campusId`, `term`) and adds `gradbuddyPath`, the import source; each is
   looked for beside the repository, then under the home folder, as `pipeline/catalog_export.py` does.
2. **The example moves in**: `pipeline/apprentice/examples/pmm-nyc/`, every file with `research/`. It is a fictional
   person against a real posting, so it is committed.
3. **Real students are never in git**: `data/apprentice/students/<slug>/`, gitignored. `new.mjs <slug>` makes one from
   the intake; `new.mjs <slug> --import` copies one from GradBuddy's `apprentice/students/` and refuses to overwrite.
   A slug resolves to the students' folder first, then the examples.
4. **The skill moves to `.claude/skills/apprentice-map/SKILL.md`**, its procedure unchanged, every path updated.
5. **`pipeline.map_publish` reads the map from this repository** (students, then examples); the GradBuddy fallback is
   gone. `map_feedback` shares its client and needed only its docstring.
6. **The tests run everywhere.** `tests/web/map.test.mjs` reads the tracked example, with no skip.
   `tests/web/apprentice.test.mjs` covers the intake reader, assemble's pure part and the check: the example passes
   with its two notes, and six broken copies each fail with one line (a fourth Level 2 card, a quote not in
   `posting.md`, a 21-word why sentence, a percent sign, a marked gap off the tree, version 1). `check.mjs` and
   `assemble.mjs` export `checkMap` and `assembleMap` and still run as scripts, so no test spawns one. Without the
   research roster (CI), the check and the page read class codes and titles from `web/data/catalog/cornell_tech.json`.
7. **`docs/GRADBUDDY_CONTRACT.md`**: "Consumers" and the map section say where the generator is now. GradBuddy's
   folder is a read-only source of intake material for students taken in before the move. The schema, the states,
   the bucket paths and the privacy rule stand.

`grounding.json` records the atlas as `"path": "."` and the roster by its configured path, so no machine or worktree
path leaks into a file.

**The run** on `main` after #140 (recalibrated bands, `TRANSFER = 0.75`), with `ground`, `assemble`, `check`, `render`:

- **wk332** (imported; pmm, growth_manager, marketing_manager at Harvey): Relevant foundation; 14 brings, 6 marked
  gaps; 17 nodes (4 trunk, 3 shared, 10 own), 6 behaviors, 14 more; cards 4, 3, 1 and a Reach. No node changed state:
  the map was assembled on 2026-11-01, after #133, and the recalibration moves scores, not states.
- **pmm-nyc** (pmm, marketing_manager, growth_manager, brand_manager at Agentio): Relevant foundation, as before;
  brings 8 → 14, marked gaps 8 → 6; 19 nodes (3 trunk, 6 shared, 10 own), 6 behaviors, 14 more; cards 6, 3, 1 and a
  Reach. Six states moved, all from #133, which the example's map of 2026-10-31 predated: positioning and messaging
  (shared), customer-facing engagement and market research (own) from "must build" to "shows in other words";
  communication ("must evidence better") and adaptability ("must build") to "shows"; content in "more" to "shows in
  other words". The v20 note that the example pivoter had no transferable node no longer holds: it has three.
- `check` passes on both: pmm-nyc with its two notes (`data_driven` off the tree on two cards), wk332 with two (the
  leadership and technical tracks have no Level 1 card). An `assemble` over a copy of wk332 with `shipped`,
  `changed`, `declined`, `reply` and a hand-set `clear` kept every one. Nothing was published.

Left open: GradBuddy's `apprentice/` folder and its skill still exist there (read-only for us); retiring them, or a
pointer README there, is the owner's call in that repository. The "Later" line "commit the B1 files in
`gradbuddy/apprentice/`" is moot now that the files live here.

## World 1 opens with story cards: one résumé line, said so it shows (`feat/story-cards`, 2026-11-05)

The owner's reading of World 1 (2026-11-05): the first missions should be guided and about the person's own story,
not a page to write. Half of a résumé's core skills are half shown: named but not evidenced, or shown in another
field's words. A line rewritten so the atlas reads the skill as shown is the smallest possible win, it is practice for
every later card, and a model can coach it if the prompt is right. Decisions (the lead, on the owner's pick "Story
cards first"; stacked on `feat/apprentice-in-atlas`, since the generator lives there):

1. **The generator writes them, the skill never does.** `assemble.mjs` adds up to two cards (`kind: "story"`, ids
   `s1-<skill>`) from the grounding alone: a skill of the first role's read in `must evidence better` or `shows in
   other words`, on the tree, with a work line; the posting's skills first, then the larger share. Deterministic, so
   a re-assemble writes the same two; the owner's `shipped`, `changed`, `declined` and `reply` survive by id, and a
   card the grounding no longer picks goes. A bad pick is declined, never edited. The check holds the rules
   (`pipeline/apprentice/README.md`).
2. **A work line, never a list.** `ground.mjs` keeps, per read row, `work_lines`: bullets, the summary and the
   profile's prose of six words or more. A course plan or a skills list reads as "named, not shown" too, and the first
   draft picked one; a story card on it would ask the person to rewrite a course list. `shown_by` (the slots of
   `pipeline/evidence.json`: artefacts, verbs, measures, counterparts) rides on every skill of the grounding.
3. **Nothing invented.** The card's text is the grounding's words: the line as it stands, `reads_as` (else `what`),
   the slots, the share in words ("About two in three postings … ask for"; never a percentage), and a prompt that
   quotes the line, names the slots, asks three questions and drafts three lines under 30 words with `[ ]` where a
   number goes. The owner's "practice with an LLM with a provided prompt" is that prompt, copied with one button into
   any model; the atlas calls none.
4. **The read is live and local.** The card has a box; a pasted line goes to the matcher of the map's role
   (`Atlas.matcher`, the one that read the résumé) on its own, and the row's status for the card's skill reads as one
   of the four states (`MapModel.lineState`). Nothing is stored or sent; the person tells the owner with F1 ("I'll
   rewrite it"). The owner marks the card shipped once the line is on the résumé. A line read alone can read lower
   than the same line in a whole résumé (no role context), so the card says "read on its own".
5. **The release labels go, the framing stays.** "I do / we do / you do" leaves the worlds (`release` is no longer
   written; an old file's is ignored), the check, the pages, the print sheet and the docs; each world's `who` line
   carries the framing in words ("Guided first: two lines of your own, then a page each"). World 1 clears at 2 of its
   n missions as before; the story cards count like any mission, so two rewritten lines clear it.
6. **More about you.** `INTAKE.md` gets a ninth section (side projects, talks, application essays); `ground.mjs` puts it
   into `profile.md` under "More about you", so the read and the story lines see it. Uploads to a private
   `maps/<uid>/context/` folder need a storage policy, so a migration: deferred to Later, not applied by a thread.
7. **The whitelist is the invite.** A map opens for an invited address only (magic link, `create_user: false`); no
   new flag.

Built: `pipeline/apprentice/assemble.mjs` (`storyCards`, `storyPrompt`, `WORLDS` without `release`), `ground.mjs`
(`work_lines`, `shown_by`, section 9), `check.mjs` (the story rules, the release rule dropped, story cards apart from
the one-to-six), `template.html` (the story card in the check view), `INTAKE.md`, `README.md`; `web/map.js`
(`storyOf`, `lineState`, missions carry `kind`), `web/app.js` (the story card in the panel, `storyControls`, the
story choices in F1, the release labels out, "1 hour"), `web/copy.js` (`map.card.story`, `feedback.storyChoices`),
`web/style.css`; the example reground and reassembled (two story cards: positioning & messaging, customer-facing
engagement, both named by the posting); wk332 rebuilt locally (one: product launches). Tests:
`tests/web/apprentice.test.mjs` (the picks, the hand edits, the prompt, three more broken copies),
`tests/web/map.test.mjs`. The contract and the skill updated.

## Thirteen business roles, and a checklist for adding a role (`feat/mba-roles-13`, 2026-11-05)

**Why.** The role-coverage audit of 2026-11-04 set the outcomes Cornell Tech and IE publish against a census of 56,708
titles on 1,143 Greenhouse, Lever and Ashby boards: 81% of the titles matched no role. Thirteen of the gaps are business
roles those graduates take (IE sales roles 9-31% by programme, Cornell Tech MBA analytics 17%, IE HR programmes 65-82% HR).
The rest (software, ML, data and security engineering, design, legal) need a role set of their own and are proposed apart.

**The roles.** `account_executive` (account executive, account manager, SDR and BDR), `solutions_engineer` (solutions,
sales, value and customer engineers, presales, technical account managers; architects excluded, as the labelled set
already said), `data_scientist`, `data_analyst` (data analyst, business analyst), `project_manager`, `recruiter`,
`implementation` (implementation, onboarding, customer experience), `communications` (PR, internal and corporate
communications, social media, content), `demand_gen` (demand generation, performance, paid, SEO, digital marketing),
`market_research` (market research, consumer and marketing insights, competitive intelligence), `sustainability`,
`public_policy`, `fraud_risk` (fraud, AML, KYC, financial crime, credit risk). Placed in the existing groups except
sustainability and public policy, which make a twelfth, Sustainability & policy (`impact`), with no fit band until it
has sample resumes. All batch 2; 26 searches added.

**Order decisions.** A sales title names its market after a comma ("Account Executive, Financial Services - Investment
Banking"), so the two sales roles read before everything but `ldp`. The subject wins over the vehicle: "Climate Program
Manager" is sustainability, "Fraud Manager - Business Operations" fraud, "Fraud Strategy Analyst" fraud. The function
wins over the project: "Supply Chain Project Manager" stays supply chain, as the procurement row said. Lifecycle and
content marketing stay `marketing_manager` (the labelled rows said so); "Digital Marketing Manager" moves to
`demand_gen`. Compliance named outright stays compliance ("AML Compliance Officer"). A bare "Business Analyst" at a Big
Four firm is now the analyst role (relabelled); at a strategy house it stays the consulting grade. An SDR or a sales
representative is the corporate entry grade (`representative` joins the associate grade words).

**Labels first.** Set `business-roles-2026-11-05` in `evals/titles_mba.json`, 113 rows from census titles and written
edges, labelled before the patterns; 20 older null rows took a new role (marked `relabelled`, reason in the note), and
two level misses are marked known with the reason. Eight resume titles relabelled the same way. On the census the rules
read 17,879 titles as a role, up from 9,283.

**A role with no postings, again.** The backlog keeps only titles that matched a role, so the 13 start empty.
`roles_mba.ADDED` records the day each later role joined; `run_pipeline.py` reports a role added after the last scrape
as waiting for one, and fails it if it is still empty after. `build_graph` leaves out a group with no postings.

**The audit of the roles added since the first 50.** The first 50 MBA roles got their skills on 2026-10-11 from their
own postings (`role_terms`, `skill_probe`, four drafting passes, then definitions, depth and credentials). Nothing made
that a step for later roles: `ai_transformation` and `product_engineer` were added with title rules alone. Neither had a
`role_terms` pass or new skills; `ai_transformation` has no credentials entry in `pipeline/depth/mba_roles.json`, no
depth evidence from its postings, no sample resumes, resume titles or game passages; `product_engineer` has no sample
resume and no coverage row (`role_coverage` reads the MBA set only). `role_coverage` itself reports what a role asks
for among existing skills, never what the taxonomy lacks. So the steps are now a checklist, "Adding a role" in
`evals/README.md`, and CLAUDE.md requires it: a role is added when its skills are, not when its titles are.

**Checks.** `pytest tests/python`; `node --test 'tests/web/*.test.mjs'`; `node evals/run.mjs`;
`evals/run_pipeline.py --baseline`. Not run here: `pipeline.scrape` and `pipeline.extract` (the refresh does both).

## The visitor journey: accounts, saved state, logging (plan of record, `feat/journey-logging`, 2026-11-05)

**The ask** (the owner, 2026-11-05). Once the apprentice map is self-serve, nothing on the site is personal without an
account: the roles a person likes, the read of their résumé and its gaps, their quests. Replace the Tally door with a
sign-in that needs no password, save state per person, and before any of it, log comprehensively enough to judge the
calls to action. The owner's answers to the lead's questions, which fix the design:

1. **Anonymous browsing stays.** Explore, the fit read and Networking open to anyone. Sign-in appears at the first
   personal act (a heart, an upload to save, "get your tree") and gates only what follows from it.
2. **Email plus a six-digit code**, not a link: Outlook's scanner consumed the owner's own magic link within a minute
   (2026-11-04). GoTrue's email OTP, verified on the page (`web/auth.js` gains `verifyCode`). The invited map users of
   today keep working.
3. **The saved read keeps the lines.** Per person, per résumé (a SHA-256 of the normalized text, computed in the
   browser) and per role: the skill ids with their state and the résumé line that showed each, the gaps, the date; the
   model read's inferred ids too, so a return visit costs nothing. The résumé text itself is never stored. A new
   résumé is a new hash; the latest marks the current read. The About page's "we do not store it" changes to "we keep
   your read and the lines, never the file", with a deletion path (by hand through Supabase first) and a consent line
   for EU students.
4. **One heart.** On the card and on the open role, the same list; the open role also gets a clear Save. On first
   sign-in the browser's About-you answers, read and hearts move into the account, so signing in loses nothing.
5. **Logs stay in Supabase** (`events`, the catalog project), read by `pipeline.funnel`: drop-off by screen and day,
   each call to action shown, clicked and done, returns (two or more distinct days per browser or per person),
   visible time by screen. The Supabase SQL editor answers the rest. No dashboard product.
6. **Feedback needs no sign-in**: a persistent Feedback link in the top bar and the footer, a native box (screen
   prefilled, text at most 500 characters, email optional and prefilled when signed in) into a `feedback` table with
   anonymous insert. The prompt fires once per browser after twelve meaningful actions or six minutes of visible time,
   whichever first; never on the door, the sign-in or within a minute of signing in; dismissed or sent counts as asked;
   it may ask again after thirty days only when new actions happened; a second prompt at the first tree opened.
7. **Tally keeps the four intake boxes** (the secondary doors); the door's form retires with the sign-in.
8. **The sequence**: logging, identity, state, the self-serve tree tier, the calls to action, feedback. The tree tier
   is ground plus assemble with no model: the tree, the read and the story cards for any signed-in person, written to
   their `maps` folder by a capped function; the build cards stay by hand or by invite.

**Outside the code**: a custom SMTP sender on a domain the owner controls (Supabase's mailer sends a few an hour),
before sign-ups open; the migrations, one per table change, applied by the owner; the Anthropic cap; the three open
PRs (#141, #142, #143) land first, since identity builds on the map's sign-in and the campus flag.

**Step 1, built here: logging.** Decisions:

- **Every route is a screen event.** `Capture.screen(name)` in `route()` names the event (the launcher still sends
  `explore`, an event `event_prep`; the other routes get their own name) and every event after carries the `screen`
  column, so drop-off reads per screen without a name per screen. The event list stays closed in `capture.js`
  (`EVENTS`, tested); the table keeps only the shape of a name (`2026-11-05_journey.sql`), so later steps add names
  without a migration each. A name of at most forty lowercase characters cannot carry a sentence.
- **A visitor id** (`capture.visitor`, localStorage, one random id per browser) joins visits, which the per-session id
  by design never did; the About page says so now. The signed-in person's id rides along once the browser holds a
  session; the anonymous insert policy stays, so the column is a claim and the funnel joins visitors first.
- **Calls to action** are three events with a `cta` id: `cta_shown`, `cta_click`, `cta_done`. The door drawn and
  `door_passed`, and an intake box's own event, already are a shown and a done, so `funnel.py` aliases them and the
  box sends only `cta_shown` when it draws. The hearts, Save, "get your tree" of later steps call `Capture.cta`.
- **A heartbeat** every thirty seconds of visible, active time (an input within the last minute), capped at a minute,
  with the screen: a tab left open counts nothing. `Capture.tick(now, visible, lastActive)` is the pure step.
- **Actions are counted in the browser** (`journey.actions`, localStorage; a role, a fit, a class, a quest or a prep
  opened) and never sent: the feedback prompt of step 6 reads the count.
- **Everything waits behind `CONFIG.JOURNEY_ENABLED`**, off until the owner applies the migration: PostgREST refuses a
  row whole when it carries a column the table lacks, so shipping the columns first would silence every event.
  Off, `capture.js` behaves exactly as before (the old names, the old keys).
- `funnel.py` prints the four journey tables after the funnel of before, reading each column only once it exists.

**Step 2, built (`feat/journey-signin`, stacked on step 1): the sign-in.** Decisions:

- **A code, not a link.** `Auth.sendCode(email)` posts GoTrue's email OTP with `create_user: true`;
  `Auth.verifyCode(email, code)` posts `/auth/v1/verify` with type `email` and keeps the session under the same key and
  shape the map reads (`maps.session`), so the map's screens need no change. The invited map users keep their link.
- **The first personal act is the résumé read.** With accounts on and no session, the drop zone draws the sign-in's
  door ("Sign in to read your résumé"), and a Read button goes to `#/signin?next=<the hash>`; the sign-in returns to
  that hash (a hash of this site only, never the sign-in itself). Explore, a role, a field, Networking and the
  classes stay open with no sign-in, as decision 1 says.
- **The verified address becomes the door's**: `door.email` is set at verify and `doorKept` prefers the session's
  email, so the campus rule reads a verified address. The top bar shows the address and Sign out when a session
  exists, Sign in otherwise (not on the door or the sign-in).
- **The door is its own form** with accounts on (Tally's door form retires; the four intake boxes keep theirs):
  the native fallback of v19 B7, one waitlist row per address and source, so the Tally duplicates end with it.
- **Everything behind `CONFIG.ACCOUNTS_ENABLED`, off** until the owner has set up the catalog project: a custom
  SMTP sender (Project Settings → Authentication → SMTP; Supabase's own sends a few an hour), sign-ups on
  (Authentication → Sign In / Providers → Email → Allow new users), the Magic Link email template carrying
  `{{ .Token }}` (Authentication → Email Templates; GoTrue sends that template for a code too, and without the
  token the mail holds only a link), and the rate limits (Authentication → Rate Limits; emails per hour). The
  events `cta_shown` · `cta_click` · `cta_done` for `signin` measure the flow once step 1's flag is on.

**Step 3, built (`feat/journey-state`, stacked on step 2): the saved state.** Decisions:

- **Three tables, the person's own rows** (`pipeline/sql/2026-11-05_state.sql`; applied 2026-11-06 through the Supabase
  connector once the owner allowed its `apply_migration` tool in the worktree's local settings; an earlier line here
  said 2026-11-05, which `list_tables` disproved): `profiles` (the About-you answers as the browser keeps them, the campus flag, the hash of the
  résumé on file), `hearts` (one list of role ids: the card's heart and the open role's are the same), `reads` (one
  row per résumé hash per role: the band, the core and common skills with their state and the one line that showed
  each, the gaps, the model read's inferred ids). Row-level security for every verb on `user_id = auth.uid()`,
  nothing for anon, the service role for the owner's scripts. Tables, not storage objects, so the owner can ask
  "which roles do people heart" in SQL.
- **The résumé's id is its hash.** `State.hash` is a SHA-256 of the whitespace-normalized text, computed in the
  browser (WebCrypto) and kept on the stored résumé; a new file is a new hash and its reads are new rows; the latest
  hash on the profile marks the current one. The text never leaves the browser but for the model read, as before.
- **A read goes up when it happens.** `matchRole` (the one matcher run per role per résumé) hands its result to
  `saveReadFor`, which upserts `reads` and refreshes the profile's hash; nothing waits on it, a failure is retried at
  the next read. `State.readRows` is the pure part: the core and common rows as the map's four states, one line per
  skill cut at 300 characters, the gaps as the core rows named but not shown or missing.
- **The answers sync on every change** (`syncProfile` in both places About you saves) and **carry in at sign-in**:
  `restoreState` loads the three tables, `State.merge` lets the browser's answers win when set and takes the server's
  otherwise, unions the hearts, and sends up what the server lacks. The same runs at every page load with a session,
  so a second browser gets the answers back. Hearts have their store and their sync now; their control is step 5.
- **Forgetting is a button on About you** (`Forget what you saved`): the person's rows in the three tables go; this
  browser keeps its own copy; `auth.users` stays until the owner deletes it. The About page's privacy section gains
  the sentence on what a sign-in keeps, drawn only with accounts on.
- **Nothing runs with accounts off**: every call sits behind `stateOn()` (accounts on, `state.js` loaded, a session).

Not in this step: the function (step 4), the hearts' control and the other calls to action (step 5), the feedback
box (step 6). The campus flag goes on the profile once #142 and this branch share a tree.

Steps 1 to 3 merged to main on 2026-11-05 (#148, #149, #155); `JOURNEY_ENABLED` went on the same day (#158), the
journey migration being applied. `ACCOUNTS_ENABLED` stays off until the owner has the SMTP sender and has applied the
state tables: a merge deploys to production, so the sign-in ships dark.

**Step 4, merged (`feat/journey-tree`, #159, 2026-11-05): the self-serve tree tier.** Decisions:

- **The generator's pure part moves into the site.** `web/apprentice.js` (a classic script that loads in node, like
  `map.js`) holds `Apprentice.ground`: the role, its skills with what each means in the field, the tracks, the person's
  read, the posting's names, the class of roles, the class tree and the read the map leads with, exactly what
  `ground.mjs` computed, less the roster classes and the student's own fields, which stay in the script. The story
  cards, `assembleMap` and the new `selfServeMap` sit beside it; `ground.mjs` and `assemble.mjs` call them, so the
  owner's maps and the site's come from one code. The refactor was checked on the example: the grounding and its
  markdown byte-for-byte the same before and after.
- **One function, `web/api/tree.js`**, beside `infer.js`: the résumé text, one to four role ids of one field, a
  posting's text if the person has one, the door's campus. Who the person is comes from GoTrue (`/auth/v1/user` with
  the session's token), never the body. The map goes to `maps/<uid>/map.json` with the service role, the caller's
  own folder only; the function reads the object first and refuses (409) to overwrite a map with a build card, so a
  map the owner wrote by hand stays. The text is grounded and dropped: the map keeps the lines the read found, as the
  saved read does. `web/vercel.json` bundles the MBA role files the matcher reads (the 65 per-role files, about 42
  MB, read lazily per role); the product and tech sets are not offered.
- **The site's map is World 1 alone**: the story cards (two at most), the tree and the read; no company, no gap
  sentence, no build cards; a world with no mission is left out of the file. `student.self_serve` marks it, and the
  map screen draws "Built from your résumé on …" with "Build it again" (`#/map?build=1`), which draws the form over
  the map.
- **The form sits on `#/map`** where the waiting line was: the résumé on file (or the drop zone), the field, the
  role the tree builds on, up to three more roles of the field, the optional posting. It sends `cta_shown`,
  `cta_click`, `cta_done` for `tree`. Behind `CONFIG.TREE_ENABLED`, off: the function needs
  `CATALOG_SERVICE_ROLE_KEY` in the Vercel project's environment (the owner adds it; a thread never types it), and
  without the key it answers 503 and the form says the build did not go through.
- **No spend cap**: nothing here calls a model (the owner, 2026-11-05). The judgment half of the self-serve map (the
  build cards, the company research) stays under "Later".

Not in this step: the hearts' control, Save and the other calls to action (step 5), the feedback box (step 6).

**Step 5, built (`feat/journey-ctas`, off main after #159): the hearts, Save and "Get your tree".** Decisions:

- **One heart, drawn in two places, kept in one list.** The field screen's role rows and About you's saved list get a
  heart beside the row, outside its link (a press never opens the role); the open role gets the same heart with a word
  beside its title: "Save role", "Saved" once on. The list is the browser's `hearts` (step 3's store), so a heart
  works for anyone today, accounts on or off; with a session the press also goes to the person's `hearts` row
  (`State.heart`), and a call that failed is mended by the next restore's merge. Explore shows the saved roles as a
  strip above the fields and About you lists them with their hearts, so a heart leads somewhere.
- **The sign-in is asked without leaving the page.** With accounts on and no session, a heart on the open role draws
  the line "Kept in this browser. Sign in to keep it on your account." under the facts, with the sign-in's link and
  the way back; the role is kept in the browser either way and carries up at sign-in (decision 4). Nothing of this
  draws with accounts off, so production today only gains the heart itself.
- **"Get your tree" sits under the read**, on the fit screen, as a box with one button, drawn only with the tree flag on
  and a sign-in anyone can use (accounts on, or a session already held): the tree needs a session, and the invited
  magic link is no door for a visitor. With a session the button opens `#/map?build=1&role=<id>`; without, the sign-in
  with that hash as `next`. The tree form picks the field and the role the hash names, so the person lands on a form
  with one choice made.
- **The funnel reads them as `heart` and `get_tree`.** `cta_shown` once per screen that draws a heart (a list of
  rows counts once, not per row) and once per role per visit for the tree box; `cta_click` on the press; `cta_done`
  when the heart turned on. The tree box has no done of its own: the tree form's `tree` done is it. Every row carries
  `role_id`, never a label.

Not in this step: the feedback box (step 6). Still the owner's before the flags flip: `CATALOG_SERVICE_ROLE_KEY` in the
Vercel project (the tree), the SMTP sender and the state tables (the sign-in).

**Step 6, built (`feat/journey-feedback`, off main after #162): the feedback box and its prompt.** Decisions:

- **One table, insert only** (`pipeline/sql/2026-11-05_feedback.sql`, the owner applies it): the sentence (at most 500
  characters, the check is in the table), the email only when typed, the screen the box opened on, whether the prompt
  opened it, capture's session and visitor ids, the person's id when the browser holds a session. Anon and
  authenticated may insert one row and never select; the owner reads the sentences in the SQL editor and
  `pipeline.funnel` prints the counts (rows, prompted, with an email, by screen; `feedback_counts` is the pure part).
- **The box is one sheet** (`openFeedback`), from a persistent Feedback link at the bar's end and in the footer, or from
  the prompt: the lead, a textarea with its count, the email prefilled from the session or the door and left blank
  when neither is known, the privacy line, Not now, Send. Sent, it thanks and closes on its own. The link draws on
  every screen but the door.
- **The prompt is a pure rule** (`Feedback.due`, `web/feedback.js`), checked when a screen draws and every thirty
  seconds while the page is visible: the first time after twelve meaningful actions (`Capture.actions`) or six
  minutes of visible, active time (`Capture.visible`, the heartbeats' sum kept in this browser; nothing more is sent),
  whichever first; never on the door or the sign-in, nor within a minute of signing in (`Feedback.signedIn` at the
  code's verify and the magic link's landing); shown counts as asked, dismissed or sent; again only after thirty days
  and only with new actions since; and once more, its own lead, when a self-serve tree first draws (`treeOpened`).
  The marks live in localStorage (`feedback.asked`, `feedback.tree`, `feedback.signin`).
- **The funnel tells the two apart**: the link is the call to action `feedback`, the prompt `feedback_prompt`, each
  with shown, click and done. A row carries the role on screen, never the sentence.
- **Everything behind `CONFIG.FEEDBACK_ENABLED`, off** until the migration is applied: a row for a table the project
  lacks is refused, and the link would promise a box that cannot send. The About page's privacy section gains the
  sentence on what the box keeps, drawn with the flag.

With this, every step of the plan of record is built. The feedback flag flips with `chore/feedback-on` once the
owner has applied `2026-11-05_feedback.sql` (the box needs neither the sign-in nor the tree, so it goes first). Still
the owner's, because each holds a secret a thread must never see or type: `CATALOG_SERVICE_ROLE_KEY` in the Vercel
project (then `TREE_ENABLED`); a domain of theirs verified at the mail provider and that provider's SMTP password in
the catalog project's Auth settings, plus the state tables applied (then `ACCOUNTS_ENABLED`). Each flip is a
one-line PR the owner approves.

**The key is a new-style secret key (2026-11-06, `fix/tree-secret-key`).** The owner put `CATALOG_SERVICE_ROLE_KEY` into
the Vercel project (Production) as one of Supabase's new secret keys (`sb_secret_…`), since the legacy `service_role`
JWT is on its way out. A secret key is no JWT, so it cannot ride in `Authorization: Bearer`; it goes in `apikey` alone
and the Authorization header stays empty (Supabase, "Migrating to publishable and secret API keys"). `web/api/tree.js`
now sends the key that way when it starts with `sb_`, and the legacy JWT in both headers as before. The health line
(`GET /api/tree`) gained `storage`: a probe of the bucket's record with the key, so production can say the key works
before anyone signs in. The pipeline scripts (`map_publish.py`, `map_feedback.py`) read the same name from `.env`
through the Python client and were not run against a secret key; check them when the owner next publishes a map.

**The flips, 2026-11-06.** The owner allowed the Supabase `apply_migration` tool in the worktree's local settings and
both migrations went in (`feedback`; `profiles`, `hearts`, `reads`). `FEEDBACK_ENABLED` flipped with #166; production's
insert was smoke-tested with the publishable key (one marked row, anon select refused). #167 merged and production's
`GET /api/tree` answered `storage: true`, so `TREE_ENABLED` flips with `chore/tree-on`: with accounts off, only a
session (the invited map users) reaches the form, so the public sees no change until `ACCOUNTS_ENABLED`, which still
waits on a domain of the owner's and the SMTP password.

## A third role set: engineering, design and legal (`feat/tech-role-set`, 2026-11-05)

The ask (2026-11-05, from the role-coverage audit of 2026-11-04): most Cornell Tech technical graduates (MEng CS and ECE,
Connective Media, Health Tech, Urban Tech, Design Technology) and its LLM graduates take jobs neither set holds. The
audit's census of 56,708 titles on 1,143 Greenhouse, Lever and Ashby boards found software 7,590 postings, ML/AI 1,556,
security/GRC 1,178, legal/policy 806, design/UX 526, data engineering 293. The 13 business roles the same audit named
go into the MBA set in another thread; Product Engineer and AI Transformation Manager were already live. The owner
approved the plan below on 2026-11-05. It lands in five pull requests; this section grows with each.

**Measured before deciding.** Workday search is loose: on 24 of the 218 Workday boards, "product designer" returned
1,659 hits at Republic Services and 1,202 at Wells Fargo, almost none design jobs; the adapter reads 15 pages a query
and fetches every matching title's details, so engineering searches would flood. The backlog database (GradBuddy
project, Pro plan, 8 GB) held 454 MB, `postings` 429 MB for 78,147 rows: about 5.5 KB a posting. Storage is not the
limit; run time and balance are.

**Decisions (the approved plan).**

1. **Set `tech`, seven roles in five fields, US only.** `software_engineer` (Software engineering); `ml_engineer`,
   `data_engineer` (Data & AI engineering); `security_engineer` (Security, with GRC and AI-governance *engineers*);
   `product_designer`, `ux_researcher` (Design & research); `counsel` (Legal: in-house counsel). Engineering, design and
   research managers are the leadership levels of their role, not roles of their own. Law-firm associates are out of
   scope (no law firm is on the registry).
2. **Each set reads every title on its own; the borders are rules and labels.** The product set keeps Product Engineer,
   Forward Deployed Engineer and its variants, and every product title that names no engineering, design, research or
   legal job (`product_gate`: "Technical Program Manager, Security" stays a TPM, "Product Security Engineer" is ours).
   The MBA set keeps data scientists and analysts, solutions, sales and support engineers, market research, public
   policy, and the GRC, compliance and AI-governance managers (its `governance` rule already drops "engineer"); a GRC
   analyst is ours only when the title says security, cyber or IT. Order inside the set: counsel, UX research, design,
   security, ML, data, then software, so "Software Engineer, Machine Learning" is an ML engineer and "Software Engineer,
   Security" a security engineer. The note in the shared session folder lists the borders for the MBA-roles thread.
3. **Three ladders on the one scale.** `engineering` (engineers, designers, researchers): associate = intern, new grad,
   I, junior; mid = II or no grade; senior = Senior, III, IV; staff = Staff, Lead, V; group = Principal, Distinguished
   and the managers of engineers, designers or researchers; director; vp = VP, Head of; cpo = CTO, CISO. A numbered
   grade counts only after the job word ("Engineer II", "SDE 3"); a range is read at its lower end ("Senior / Staff");
   "Member of Technical Staff" is a job name, not the Staff grade. `legal`: Counsel is mid, Senior Counsel senior,
   Assistant GC staff, Associate GC director, Deputy GC vp, General Counsel cpo. `bank`: at a bank, or wherever a bank
   grade is set off beside a working title ("Site Reliability Engineer - Vice President", "Associate, Software
   Engineering"), Vice President is senior, AVP and Associate mid, Analyst associate.
4. **The entry mark is `grad` or none, with `intern`** (`pipeline/entry_tech.json`): the title names students or new
   graduates (new grad, university graduate, early career, a graduation year, residency, apprenticeship, analyst
   programme, law clerk), or, on an associate-level title, a line of the text does. A firm row (the grade an employer
   hires graduates at) enters only with its source; there are none yet.
5. **One taxonomy, extended** (PR 3): about 60 skills marked `only: ["tech"]` (languages, systems, data and ML methods,
   security, design craft, contract law), ten MBA skills widened to `["mba", "tech"]` (security frameworks, AI
   governance, law degree...). The product and MBA extractions cannot change; a rerun proves the diff is zero.
6. **The scrape is capped** (PR 2): US only, decided at the listing; at most 30 open postings per employer and role,
   held postings first, nothing ever deleted (`sampled` records what was not kept); 3 pages per query on search
   boards, with exact-title queries (`SEARCH_QUERIES`); a count-only run in Actions before any store run. Estimate
   about 20,000 postings, 110 MB, 20 minutes for the Workday family.
7. **Shown behind `CONFIG.TECH_ENABLED`** (PR 5) only once every product eval has its counterpart (PR 4: golden
   postings, entry labels, integrity and graph parts, hand-written and published sample résumés with bands, the model
   read on the whole set, the taxonomy fields, the class picker, the games).

**PR 1 (this branch): the title rules.** `pipeline/roles_tech.py` (roles, borders, ladders, entry mark, `export()`),
`pipeline/entry_tech.json`, `web/data/roles_tech.json` (written by `python -m pipeline.roles_tech` until the tech graph
build exists) and its reference reader `evals/roles_tech.mjs`; `evals/titles_tech.json`, 748 titles labelled by two
model readers that saw a written spec and never the rules: 480 drawn by keyword and at random (seed 11) from a fresh
census of the 1,098 Greenhouse, Lever and Ashby boards (54,658 titles), 236 written to probe the borders, banks and
ladders, 32 entry titles; 76 are `sure: false`. `evals/run_pipeline.py --roles tech` checks role, level and ladder,
entry mark and the JavaScript reader (`pipeline_baseline_tech.md`; CI runs it). The first run failed 25 of 1,386
checks; the rules were fixed (no label was changed) and all pass. On the whole census the rules then gave software
8,237, ML 1,994, security 1,052, design 635, data 519, counsel 494, UX research 24 (all countries); a read of 25 random
hits per role took out the false positives it found (legal engineers, research operations at AI labs and in the field,
quantitative researchers, chiefs of staff to a CTO, an electromechanical "Staff Engineer").

**The checklist for adding a role** (`evals/README.md`, "Adding a role", landed the same day in #144) applies to every role of this set, with the tech files in place of the MBA ones. PR 1 is its part A, except the résumé-title twin (`evals/resume_titles.json`), the role blurbs and the campus subjects of the new fields, which come with the interface (PR 5) because nothing shows the set before then. PR 2 is part B. PR 3 is part C: the ~60 skills listed above are a first guess, and the taxonomy takes the ones that `role_terms` and `skill_probe` find in the set's own postings. PR 4 is part D.

**What this does not show.** The rules were fixed on the labels that now measure them, and the out-of-sample read was
one reader's: a fresh labelled sample is the honest rate (as `evals/README.md`, "Evals to build", item 4, says for the
MBA set). No Workday or Fortune titles are in the labels yet beyond the written probes; the count-only run in PR 2 is
their first test. UX research is thin (24 census titles, 11 labelled): if the scrape keeps it under the size a role
needs, it folds into `product_designer` as a specialisation rather than stand alone.

**PR 2 (`feat/tech-scrape`): the capped scrape.** `pipeline.scrape --roles tech` keeps `data/raw/jobs_tech/` and the
`tech` rows of the backlog (`backlog.ROLE_DIRS`, no migration: `role_set` is free text in the key). The rules:

- **US only, at the listing.** `scrape.in_country` drops a posting only when its location names another country
  (no location, "Remote" or "3 Locations" stay; extraction reads them again with the text). On Workday the test runs on
  the listing's location, so a foreign posting's detail page is never fetched.
- **A cap per employer and role** (`CAP_PER_ROLE["tech"] = 30`, `cap_new`): every posting the backlog already holds is
  kept and refreshed as before; a new one is admitted, newest first, while the role has fewer than 30 open postings at
  the employer. The file records `sampled` (role → seen today and not kept). Nothing is deleted; a posting left out
  today can be admitted when a slot frees, with its `first_seen` the day it was admitted.
- **Search boards sample.** The set's twelve exact-title searches (`roles_tech.SEARCH_QUERIES`), three pages a query,
  and on Workday a budget of 40 listing hits per role (the title rule returns the role). The deliberate page limit makes
  the fetch incomplete, as a capped search always did, so nothing is closed by absence and the held postings that did
  not come back are asked one by one (at most 30 per role per employer); it is logged at INFO, not as a warning.
- **`--count-only FILE`** lists Greenhouse, Lever, Ashby and Workday boards with these rules (no detail page fetched,
  nothing written, no backlog) and writes per employer and role what was seen and what would be kept.
- **`refresh-tech.yml`**: one scrape job per ATS family, on the second Sunday with `REFRESH_TECH_SCHEDULE` on, or by
  dispatch, whose default is `count_only` (the counts as an artifact). No build job until PR 3 gives the set a taxonomy;
  a dated snapshot when a full run ends. A dispatch needs the workflow on `main`, so the first Actions run follows the merge.

**The count-only run, here, on 2026-11-05** (no store involved, 11 minutes, 5,534 requests, 1,312 employers counted,
3 boards failed): the rules would keep **11,579 US postings, about 62 MB at the backlog's 5.5 KB a posting**: software
6,362 (912 employers), ML/AI 1,923 (519), security 1,263 (427), counsel 740 (312), data 643 (310), design 620 (330), UX
research 28 (27). Greenhouse 3,527, Ashby 3,717, Lever 381, Workday 3,954 from 217 boards. The cap binds for software at
53 employers and hardly elsewhere (security 5, ML 7, data 2, counsel 1). The search families not counted (SuccessFactors,
Oracle, Eightfold, Phenom and the single-employer boards, about 270 employers) should add a few thousand: the first
real scrape is about 15,000 postings and 85 MB, well inside the plan's estimate. **UX research has 28 postings at 27
employers:** too few for a role page; it will fold into `product_designer` as a specialisation unless the search
families change that (decided in PR 3, when the set has postings to read).

**Workday titles, read.** The labels hold no Workday titles, so a count-only listing of 30 random Workday boards was
read by hand: 464 titles kept, most right (Fortune software, AI, data, security and legal titles). It found eight false
positives, now excluded and pinned in `tests/python/test_roles_tech.py`: IT project managers for cybersecurity,
corporate and regional physical security, a "Systems Engineering Manager" in metrology, apparel designers at a
retailer ("Designer - Women's Tek Gear", "Associate Technical Designer"), aerospace data-handling engineers.

**PR 3 (`feat/tech-taxonomy`): the set's skills, extraction and graph.** Part C of the checklist, on a corpus the
set's own rules collected: `pipeline.scrape --roles tech --no-db` over the Greenhouse, Ashby and Lever boards on this
Mac (7,618 postings from 1,095 employers, 6,796 in the US; nothing pushed to the backlog, which holds no tech rows
yet; `data/raw/jobs_tech/` is now ignored like the other raw folders). Fortune boards (Workday and the search families)
join with the first `refresh-tech` run.

- **Phrases first.** `role_terms --roles tech` per role, read against the shared skills' shares: the shared technical
  skills are too broad for engineering postings ("AI" alone tagged 82% of them, `system_architecture` 87%, because
  every posting says "architecture" and "infrastructure"), and nothing named a language, a design craft or a contract.
- **48 skills `only: ["tech"]`**, probed with `skill_probe` until each role's share and matched sentences read right:
  seven language families (Java/JVM, JavaScript/TypeScript, Go, C/C++, Rust, Ruby, C#), frontend, backend services,
  databases, algorithms, performance and concurrency, Linux and systems, code quality, infrastructure as code,
  observability tools; orchestration, streaming, lakehouse formats, deep learning frameworks, model training, model
  evaluation, MLOps and serving, inference and GPU optimisation, LLM frameworks, research publications; threat
  modelling, application security, detection and response, offensive security, vulnerability management,
  cryptography, security certifications; interaction design, visual design, prototyping, design systems,
  accessibility, design critique, design portfolio; commercial contracts, product counselling, privacy law,
  intellectual property, corporate law, litigation, outside counsel, contract management tools. Five clusters
  (Software engineering, Data & ML engineering, Security engineering, Design craft, Legal practice). A skill the taxonomy
  had got a wording, not a twin: CI/CD and observability stay `devops_sdlc`, Kubernetes `cloud`, RAG and agents
  `genai_llm`, firmware `hardware`.
- **Six shared skills worded for the set** (`patterns_for: {"tech": ...}`): `system_architecture` (system design,
  distributed systems, technical design: 41% instead of 87%), `ai_ml` (no bare "AI": ML engineers 77%, the rest 11
  to 35%), `ux_design_collab` (an engineer's partnership with design), `quality_testing` (automated tests),
  `figma` (Adobe, Framer, ProtoPie) and `gtm` (no bare "commercial", which tagged 74% of counsel postings).
- **13 MBA skills widened to `["mba", "tech"]`**: security frameworks, AI governance, data governance, IT risk,
  third-party risk, GRC tools, law degree, regulatory change, policy management, board governance, employment law
  (`hr_compliance`), dashboards and BI development tools.
- **The other sets do not move.** `tax.for_roles("product")` and `("mba")` give the same 98 and 278 skills with the
  same patterns as before (checked against `HEAD`, and pinned by `tests/python/test_taxonomy.py`), so their extraction
  cannot change and is not rerun here. The extract text cache now fingerprints a set's own view of the taxonomy, not the
  whole file, so the next tech change leaves the MBA and product caches valid; this PR changes `pipeline/extract.py`
  itself, so the first MBA and product refreshes after it retag every text once (the MBA build has 180 minutes).
- **Evidence and field entries.** An evidence entry per new skill; 57 field entries for the five fields, on the twelve
  skills four of them ask for (the behaviours, prioritisation, cross-functional work, stakeholder management, process
  improvement, GenAI, security and privacy), each carrier taken from the skill's co-occurring skills in the field's
  postings. `evals/run_taxonomy.py` now reads the tech set's fields beside the MBA ones (coverage counted per set) and
  `graph_tech.json`; without `data/processed/jobs_tech.json` it reports the tech fields as waiting and checks their
  entries for shape only. All five parts pass on the local corpus: coverage 456, grounding 1,251, published 1,247.
- **Extraction and graph.** `pipeline.extract --roles tech` and `pipeline.build_graph --roles tech` (US only, the
  `grad` entry mark counted per ladder) build: 6,796 postings, 762 employers, 159 skills, a 0.7 MB index and 7.3 MB of
  role files. `evals/extraction_baseline_tech.md` (`role_coverage --roles tech`) is committed from this local corpus;
  the processed file and the web files are not: they come from the store, so `refresh-tech.yml` now has the build job
  that writes them and opens a `data/tech-<date>` pull request, merged by the job when the set's evals and CI pass.
- **What the first numbers say.** Software 3,867 postings at 654 employers, ML/AI 1,232 (363), security 621 (265),
  design 414 (240), counsel 353 (184), data 294 (187), UX research 15 (15). UX research stays a small role (`*` in the
  baseline) until the Fortune boards are in; folding it into `product_designer` is decided on the first refresh's
  numbers. Behaviours top every role's list; the set's own skills sit at 4 to 6 per posting (median).
- **Not done (checklist C10, C11):** the model audit of the new skills (`skill_audit --roles tech`, needs a model
  key) and their definitions and depth (`pipeline.depth_gen`); both are under Later.

**PR 4 (`feat/tech-evals`): the eval counterparts that need no published résumés.** Labels first, from postings of the
local corpus drawn by seed 13 before any rule was run on them, by model readers that saw a written spec and never the
code or the patterns:

- **Golden postings** (`evals/golden_tech.json`): two US postings per role, 225 must and 144 must-not skills, the text
  kept in the file. The tagger finds 87.6% of the must skills and tags 26.4% of the must-not ones; the floors are set
  there (0.87, 0.27). The MBA set's ceiling is 16%: most of the tech set's wrong tags are shared product skills (launch,
  partnerships, growth loops, go-to-market, pricing) that fire on what a company says about itself. A tech wording for
  them is Later; the patterns were not tuned against the labels that measure them.
- **Entry marks on postings** (`evals/entry_tech.json`): 130 postings, 53 marked `grad` (39 internships), read with
  their text. The first run missed one ("Software Development Engineer in Test I": a grade at the end of the title
  is now read wherever the job word sits); 128 of 128 sure rows pass.
- **The pipeline parts, per set.** `run_pipeline.py --roles tech` now runs entry, golden, integrity, graph and
  matcher beside titles and js; integrity, graph and matcher read the set's processed and graph files and wait where a
  checkout has none (CI, until the first `refresh-tech` lands; the refresh's build job runs them). On the local data:
  1,729 checks pass. `evals/graph_mba.mjs` takes the set (`node evals/graph_mba.mjs tech`); `roles_tech.export()`
  gained `covered_by`, which the graph part reads.
- **Matcher samples** (`evals/resumes_tech/`, `node evals/run_tech.mjs`, `evals/baseline_tech.md`): seven hand-written
  résumés, one per role and a pivot (a Cornell Tech MEng CS new grad, an ECE embedded MEng, a Connective Media designer,
  an ML master's with a workshop paper, an IT administrator turned SOC analyst, an LLM graduate from a law firm, a data
  analyst turned analytics engineer), each with targets, a judgment band, must-evidence, must-not-tag and real gaps,
  written before the runner read them. The skill checks need only `web/data/taxonomy_tech.json`, now committed with
  `subskills_tech.json` (`python -m pipeline.roles_tech` writes both from the taxonomy; the js part fails when they are
  stale), so they run in CI; the scores wait for the graph. The first run found four patterns too narrow on résumé
  language (profiling and latency, a portfolio link, counselling on product launches, vulnerability scans), fixed. Three
  matcher limits are marked as known misses with their reason: the level read counts years in product, so every tech
  career reads as associate; a paper under a Publications heading is read as a mention; the LLM sample's counsel score
  (46%) sits under its band because of the first. All three belong to PR 5, where the matcher learns the set.

**Still owed before the set is shown** (PR 5 and after): bands from published résumés (`calibrate.mjs --roles tech`,
ten or more samples per field in `external_sources.json`; done 2026-11-06 for software and security, see "Bands of fit
for the tech set"); the model read over the whole résumé set once the tech
skills reach `/api/infer`'s list; the class picker's counterpart (Cornell Tech's technical courses tagged with
`catalog_tags.mjs` reading `taxonomy_tech.json`, and labelled cases in `evals/classes/`); the games' evals over the
tech roles; a fresh labelled sample of titles; sponsorship rows from tech postings.

**PR 5 (`feat/tech-interface`): the matcher reads the set, and the interface carries it behind `CONFIG.TECH_ENABLED`
(off).**

- **The matcher reads tech titles.** `web/match.js` reads `roles_tech.json` itself (`compileTechRoles`: the words that
  are never the job, the product set's titles left to it, customer-facing and hardware engineering out, the ladder from
  the title), so a résumé's jobs are tech roles and the years and level in the target role come from them, as the MBA
  roles' do. `tests/web/match.test.mjs` holds it to `evals/roles_tech.mjs` on all 748 labelled titles. On a résumé a
  level comes only from a grade the title names, and a lawyer in private practice ("Associate, Technology
  Transactions", "Attorney") reads as counsel, a résumé-only rule (law firms post nothing in the set). A target may name
  its role (`target.family`) when no postings are loaded. A credential (a certificate, a licence, a publication) is now
  held wherever it is listed, under an Awards or Publications heading too; `evals/run.mjs --baseline` does not move.
- **The three known misses of PR 4 are gone**: the level read now passes on all seven samples, and the publication is
  read. One expectation changed, with its reason in the sample's note: the LLM graduate (22 months at a firm) reads as
  associate, under the matcher's two years for mid, and a junior lawyer against mid-level counsel postings scores in the
  40s, so its band starts at 35%.
- **`web/atlas.js`.** With `TECH_ENABLED` (read through `config()`, as `Catalog` reads its switches), `index()` also
  loads `graph_tech.json`; its five fields join the field list with `set: "tech"` and its roles are `tech.<id>`. A
  missing file leaves the site as it was. `role()` reads a tech role from its own index (skills, ladders, evidence);
  `matcher()` builds it with `taxonomy_tech`, `roles_tech` and `bands_tech.json` when it exists (no file, no verdict);
  `roughFit` reads the tech roles with a second reader on the set's own taxonomy and rules; distinctiveness for tech
  roles is measured against the MBA and tech roles together (`baselineTech`).
- **The interface.** The field page of a tech field lists its roles; its chart and the skill-map link wait, because the
  skill map is built on the MBA skills and has no tech eval yet. The skill map, Skill Path, Know the role and Climb the
  ladder keep to the product and MBA roles (`Atlas.shownEverywhere`). The role page, the postings, the grads chip
  (`grad` reads as the MBA set's new-graduate mark), the share tip ("all engineering, design and legal roles") and the
  fit screen work for tech roles. Checked in a local preview with the switch on and the local graph: five tech fields on
  Explore, the field and role pages, and the fit screen for Software Engineer with the MEng sample (8 of 8 core asks, no
  verdict).
- **Off on `main`.** The switch stays off until the evals PR 4 lists as owed exist, the first `refresh-tech` has put the
  set's files on `main`, and the owner says so.

**The first refresh (2026-11-05).** `refresh-tech` ran count-only in Actions (11,542 postings would be kept, within 0.3% of
the local count; Workday 12 minutes), then for real (every family; Apple's board took 40 minutes, Workday 22). It found
13,831 US postings at 1,118 employers: software 7,103, ML/AI 2,348, security 1,576, counsel 1,026, data 879, design
849, UX research 50 (33 employers). The set's pipeline evals (1,729), the résumé samples (147) and CI's checks passed;
the taxonomy eval failed coverage, because with the Fortune boards three more skills reach four tech fields: influence
(data, security, design, legal), program management (software, security, design, legal) and stakeholder management
(software). Nine field entries were added, grounded on the refresh's postings (`fix/tech-refresh-fields`). The
dated snapshot ran as a job of its own, which has no `data/raw/jobs_tech/`; it now runs in the build job after the pull,
as `refresh-product` does. The run's data PR (#156) opened as a draft.

## `rough_fit` skips the roles with no postings yet (`fix/rough-fit-empty-roles`, 2026-11-05)

- **What broke it.** The thirteen business roles of 2026-11-05 (`feat/mba-roles-13`) went into `graph_mba.json`'s
  families before any refresh gave them postings. `evals/rough_fit.mjs` took its role list from `G.families` and passed
  each role's postings to `M.match`, so for those thirteen the target's `jobs` was `undefined` and `match.js` threw
  (`jobs is not iterable`). `evals/graph_mba.mjs` already skipped them; `rough_fit` did not.
- **The fix.** The eval scores over the roles with postings (51 today) and names the ones left out in `rough_fit.md`.
  When `refresh-mba` gives the thirteen postings they join on their own. No matcher change.
- **Rerun on the whole sampled set** (59 resumes, 45 published, as on 2026-10-14): median Spearman 0.79 (was 0.80 over
  50 roles), the full top role in the rough top 5 78% (80%). It passes its floors. Reading the PDF and DOCX samples
  needs `npm install` in `evals/`; without it, or without `pipeline.store pull evals`, the run sees about 21 resumes
  and fails the top-5 floor (62%).
- **Not in CI.** `ci.yml` has neither the store key nor the published samples, and on the in-repo samples alone the
  floors don't mean anything. Its place is the checks step of `refresh-mba.yml`, which has the key, after
  `pull evals` and `npm ci` in `evals/` (listed under Later).

## Bands of fit for the tech set (`feat/tech-bands`, 2026-11-06)

The 304-résumé calibration set had no résumé written for a tech role, so the bands needed new samples first.

**The samples.** Five searches (one per field) listed 64 published samples from universities, engineering and law
schools and community colleges, never résumé sites and never a real person's résumé. They are in
`external_sources.json`, read from listing pages and search results with no file opened. `fetch_external.mjs --roles`
fetched 45 of the 55 marked for it; ten links were dead or refused, and `MAX_MB=15` let two long design guides through.
Each file was then read before it got an entry in `external_expectations.json`, and 15 packets were cut into résumés by
line range. Only the tech résumés of mixed packets were cut. A part that carried a real-looking personal email and
phone was left out, and so were two whole files (Penn State IST: no guide text, contact details matching the names; a WCSU handout
with no résumé in it).
Two "data" samples read as general CS master's résumés and are filed under software engineering. Usable now:
software 18, legal 30, security 11, design 8, data and AI 5.

**Years as placeholders.** Many school samples date everything "20XX". The rule stays that a template is left out of
calibration, with one exception: `only_years: true` marks a template whose only placeholders are the years. Its words
are a whole résumé of a student or new graduate, so the years read (near zero) are the years such a person has.
Fifteen tech entries carry it; no MBA entry does, so the MBA and product calibrations do not change.

**Adjacent, for this set.** Three of the five groups hold one role, so "the other roles of the group" left almost no
adjacent scores. The first run put the middle line (57%) above the top one (52%). For the tech set, adjacent is a
tech résumé against a tech role it was not written for, and another field is a résumé written for an MBA or product
role (`adjOf` in `calibrate.mjs`). The MBA set keeps its groups.

**The scoring is the site's.** The site weighs tech asks by how distinctive they are against the MBA and tech roles
together (`web/atlas.js`); `run_tech.mjs` did not, so its scores were not the site's. Both evals now take the baseline
from `evals/lib.mjs` (`techBaseline`), and a test holds the site's to it on the real data. All 147 sample checks still
pass with the site's scoring.

**The result** (`evals/calibration_tech.md`, `web/data/bands_tech.json`, 376 résumés). In range from 29%, reads
like people in the role from 54%. Related background from 13% for software and 11% for security. A same-role score
ranks above an adjacent one 78% of the time and above another field's 80%. No bands, so no verdict:
- **Data and AI**: 5 samples.
- **Design**: 8 samples.
- **Legal**: half of the 30 law résumés score below the group's own bottom line.

Legal is a finding, not only a count. Counsel's core asks come out as "regulated industries and compliance" and risk
management. The legal skills (contracts, litigation, IP, privacy) sit among the common asks. So a law student's résumé
scores lower against counsel than an MBA compliance résumé (same-role median 13%, other field 19%). The fix belongs to
the taxonomy, not to the bands.

## The model read for the tech set (`feat/tech-infer`, 2026-11-06)

**What changed.**
- `/api/infer` offers a fourth set, `"all"`: the MBA list plus the 45 skills only the tech set has. They are offered by
  name only, because tech skills have no definitions yet.
- The site sends `"all"` only with `CONFIG.TECH_ENABLED` on. Its `found` then includes what the tech patterns found
  (`Atlas.roughFit`'s new `shownT`).
- The tech rough reader now applies the model's answer, as the MBA reader already did; before, the tech roles' rough
  scores ignored it.
- The `"both"` request stays byte-identical, so the site with the switch off asks exactly what it asked before.

**The runs.** Both settings ran over the whole résumé set through this branch's preview route (the 8 samples plus 376
published résumés, 344 files present). Answers were not in the store's caches, so every résumé was asked again, about
$0.45 a run.
- **`"both"`** (`infer_baseline.md`): 3.2 skills inferred per résumé; 40 bands up, none down. All four must-be-zero
  counts are zero (credentials, behaviours, unknown ids, quotes not in the text).
- **`"all"`** (`infer_baseline_tech.md`): 3.3 per résumé; 45 bands up, none down; the four counts are zero.
  - On the 72 tech samples scored on their own tech role: 196 skills inferred, 56 of them tech-only (litigation,
    databases, contracts, privacy law, visual design, backend services lead).
  - Median score 38% → 41%, three bands up.
- **One expectation lost in the `"both"` run.** `pivot_phd_hci` got `stakeholder_mgmt` from "coordinated timelines with
  clinicians and IRB", and it is one of that sample's `real_gaps`. The request is unchanged, and the same résumé was not
  tagged in the 2026-11-01 baseline or in the `"all"` run, so this is the model's variance. It is left as measured,
  not tuned away.

## The class picker for the tech set (`feat/tech-classes`, 2026-11-06)

**The tags.** `pipeline/catalog_tags.mjs` reads each class twice: with the MBA taxonomy, as before (`tags`), and with
the tech set's (`tags_tech`). It records the tech taxonomy's hash, so `tests/web/catalog_files.test.mjs` fails when the
tags go stale; that test also checks a sample of the tech reading against a live read. Of 127 classes, 114 carry a tech
tag and 66 a skill only the tech set has (algorithms, backend services, prototyping and model training lead).

**The picker.** With a tech role among the chosen roles, a card's tags are the two readings joined (`Catalog.tagsFor`,
in `web/classes.js` and the network screen's professors). With none, the MBA reading alone, as before.

**The catalog.** `pipeline.catalog_export` was rerun to build the local file. The research folder's roster is from
2026-11-01, so the public file gains two classes (INFO 5315 Conversation Engineering, LAW 6492 IPOs for Technology
Companies). The MBA reading changed for four classes: those two, plus INFO 5305 and NBAY 5180, whose text changed.

**The eval.** `evals/run_classes.mjs` gains 21 cases: the seven tech samples, each against its own tech role, one
neighbour and both together. The lawyer's neighbour is the MBA compliance role, so one case mixes the sets. The
expectations were written from the catalog before the picker ran on them.
- 0 failures, 16 known failures, each with its reason. They share two shapes:
  - The gaps sort lets a class that names one small gap outrank the role's core course (AI Law and Policy above
    Advanced Operating Systems for a CS student, whose gaps include hardware and security).
  - Broad syllabus tags (Advanced ML Systems is tagged only AI/ML and hardware).
- Some misses read acceptably: ML Hardware and Systems leads the ML cases in place of Advanced ML Systems.

**Not this change.** The MBA and product cases have 11 failures and 2 known failures that now pass, on `main` as
well. The data refreshes since the 2026-10-31 baseline moved them, and the class eval is not in CI. The baseline
committed here records them as they are.

## The games for the tech set (`feat/tech-games`, 2026-11-06)

**Know the role deals the tech roles.** It is the game a role page's "Practise" link opens, and it works from posting
shares alone. A tech role's pool uses the same rules over the tech index's skills.
- A decoy's other role is another tech role, or an MBA role that prizes a skill the two sets share.
- The lift is measured against the tech set's baseline (`ix.baselineTech`), as the site's matcher does.
- The shell offers a tech role only to a game that says it deals the set (`defaultRole(..., { tech: true })`,
  `picker({ tech: true })`), so the other games never open on one.
- `evals/game_know_the_role.mjs` runs with the tech index on: 63 roles, all playable, every rule holds.
- On the tech roles: 14 to 22 real asks a role, 28 to 39 decoys; a first board's decoys come from business roles
  (vendor management, partnerships, positioning).

**The other five stay with the product and MBA roles,** each for a reason in the data or the design:
- **Climb the ladder** sorts a skill's statements by level, from the depth files. The tech skills have none (checklist
  C10 and C11 in "Adding a role").
- **Skill path** plays on the skill map, which does not cover the tech set.
- **Spot the real ask** reads passages that `pipeline/game_passages.py` cuts from postings; none are cut from tech
  postings yet.
- **Guess the role** and **Where's the demand** deal across the fields of one role set (five rounds, one field each).
  The owner decided on 2026-11-06 that both stay business-only: no tech edition.

## The usability audit of 2026-11-06: the harness, nine fix clusters, the site guide (`chore/ui-harness` … `feat/site-guide`, 2026-11-06)

**The ask.** Cornell Tech's pre-enrollment runs Nov 10–12, and many students meet GradBuddy there first. The owner
asked for an audit of every public surface, in every visitor state, before that week. Every broken or blocking
finding was to be fixed, and a guide in context was to explain what each screen does.

**The harness** (#172, `chore/ui-harness`). `tests/ui/serve.mjs` serves `web/` with its two functions mounted as
Vercel mounts them. Playwright (a library that drives a real browser) runs the specs as a phone (390×844) and as a
desktop (1280×800). The `visitor` fixture gives four states: fresh (the door not passed), campus (a Cornell address),
general (any other address) and signed in. It stubs every write to Supabase, so no event, waitlist or feedback row
leaves the machine. axe (an accessibility checker) reports the WCAG 2.1 A and AA violations and never fails a test.
Three working facts:
- The threads worked in shared clones under the session scratchpad, not in git worktrees: the app refuses writes
  into a sibling worktree.
- The tree key is live in this Mac's environment, and the local server reads it. A signed-in tree build on the
  local server would write to the production `maps` bucket. Never submit the tree form locally.
- The Tally door sends a local visitor on to production after the form (a Tally setting), so the fixture passes the
  door by its return address.

**The method.** Three auditors, read-only, each took one part of the site: A the door, home and Find classes; B Find
jobs, Explore careers, About you, the field map and the games; C Networking, the sign-in and map gate, feedback, the
top bar, the footer and About. Each made three passes in the three states and both viewports. Pass 1 held every screen
against ten usability heuristics. Pass 2 ran three visitors as task scripts: a graduate student who wants any job, a
person with a target role, a person who wants to understand a field. Pass 3 checked the copy rule, axe, a keyboard-only
path and the contrast of the text tokens in both themes. Each finding has one plain title, the surface, the state, a
severity, the evidence (steps and a screenshot or an axe rule) and a fix, or the flag "explain" when the control is
right and only unlabelled. Severity: broken (a path fails), blocking (a first-time visitor cannot tell what to do
next or what happened), cosmetic (the rest). The three files held 87 findings; the dedupe left 75: 5 broken, 16
blocking, 54 cosmetic.

**The owner's decisions at Pause 1.**
- Scope: every broken and blocking finding, and the cosmetic ones that live in the same files. The rest goes to Later.
- The door's own chrome (the top bar, the brand, the footer's About) passes the door as "Skip for now" does.
- The Fit sort on Find jobs ranks by share with a floor: N / max(M, 15). The floor sits near the 7th percentile of
  the skills a posting asks for, so a thin two-of-two posting does not top the list.
- The feedback box opens with its email field empty. It offers the address on file as one press ("Use …").
- The owner waived Pause 2 (the review of the guide's design) and gave full clearance to build it.

**The nine clusters** (one pull request each, stacked; merge in this order: #172, #177, #178, #179, #180, #181, #183,
#182, #184, #185, then the guide's pull request and this one). All 5 broken and all 16 blocking findings are fixed,
with 49 of the 54 cosmetic ones and 12 more that the fixers and the checks found on the way. Of the other five
cosmetic findings, the guide alone explains four, and one is Tally's (the dark door's purple Submit), deferred.
1. The door (#177, `fix/door`): the door's top bar and footer About did nothing; the Tally door had no Skip; the
   native door's student line was wrong; the top bar lacked Find classes after the Tally return; "Question 2 of 3"
   sat over four bars.
2. Find classes and the campus gate (#178, `fix/classes-gate`): "Find classes relevant for this role" showed to a
   visitor with no campus address; a visitor sent home from Find classes got no word why; the Find classes screen's
   "Read my fit" with no role showed nothing; the screen did not say "pick a role first"; focus fell to the page after
   each redraw; the pre-enrollment dates, the gap names, the empty-list filters, the Faculty tab's "asks", the picker's
   order and its two Product Marketing Managers, the band tag's contrast.
3. Phone layout (#179, `fix/phone-layout`): the role page was 1,246 px wide on a phone, so the "Your fit" tab opened
   off screen; the Networking prep card started 2,040 px down; Find jobs put the field list above the postings; the
   panels were cut at the right edge; the top bar took four rows; the skill map's labels overlapped; the game board
   broke words.
4. Keyboard and contrast (#180, `fix/keyboard`): a keyboard could not reach "choose a file", so it could not give a
   résumé; Find jobs, the launcher and Networking dropped focus after a choice; the Networking types ignored the arrow
   keys; the feedback sheet let Tab leave it; links in a sentence had no underline; names that lacked their visible
   words; the game's key hint at 4.09:1.
5. The résumé return path (#181, `fix/resume-return`): "Add your résumé" on Find jobs and on Networking's prep card
   ran the whole wizard and lost the search; the rail said two questions over a wizard of three; the résumé line
   named the AI reader when it had not answered; "résumé" and "resume" both showed; "Start over" erased everything
   without a question.
6. The fit screen, the course screen, the games and Explore (#183, `fix/fit-course-games`): the course screen said
   "0 of the 0 skills" at Entry; the rail said "7 of the 7" while the fit screen listed eleven skills to evidence; no
   link led to the course screen or into the games; two screens were called Explore (`#/explore` is now "The fields
   and their skills", crumb "All fields"); the intake boxes said their lines twice; one thing carried different counts
   on different screens.
7. Find jobs (#182, `fix/jobs-fit-sort`): the Fit sort put Staff and Principal postings first for a new graduate;
   the MBA set's Product Manager cards had no field; a phone had no way to the filters below the postings.
8. Networking (#184, `fix/network`): the Role box found nothing for "data" or "software" and did not say what it has;
   "Who to look for" showed titles from the employers first in the alphabet; the recruiter's links were senior
   postings; a Product Marketing Manager level row said "Product Manager"; skill names kept capitals mid-sentence;
   the Faculty tab overflowed a phone.
9. Feedback, the sign-in, About and the chrome (#185, `fix/feedback-signin-about`): the feedback box sent the door's
   email unasked and took a non-email; the map's sign-in gave a visitor without an invite no way on, lost `next`, and
   said "Check your connection" on a rate limit; About jumped to the top when its class count loaded, and said "About
   the data" in the footer; one breadcrumb rule (`Routes.Crumbs`); the Feedback link looked like the current page; the
   theme button had no visible name and one press in three changed nothing.

The audit's fixes touched screens frozen with the fit flow (2026-10-26): repairs, not new work, by the owner's brief.
No matcher, taxonomy, model-read or pipeline file changed, so no eval chain was due.

**The guide** (`feat/site-guide`, `web/guide.js`, behind `GUIDE_ENABLED`, shipped off).
- Shape: tips per screen, not a linear tour. On a first visit to a screen, two to four spotlight steps on its
  controls, 41 rows over 11 screens; the door has none (the owner dropped its one tip on the morning after: the door's
  own copy is the guide there). "Show me around" in the top bar and the footer replays them.
- Build: hand-rolled, no library: a classic script like `feedback.js`, with a pure part node tests. Strings in
  `Copy.guide`, checked by the copy rule; styles from the tokens. A step whose target is not in the page is skipped, so a
  step never points at nothing.
- Gating: the flag; a run waits until the screen is still (and for its ready element on the fit screen and
  Networking); nothing else open; the screen unseen, or its version raised. The seen-state is `guide.seen` in
  localStorage; a screen counts as seen at its first tip. The feedback prompt waits while a tip is due or open.
- Phone: at 640 px and under, a bottom sheet (at most 45% of the height) and a ring on the target, no dim layer.
- Accessibility: the card is a non-modal dialog. Focus moves into it, Tab stays among its buttons, Esc skips. The spec
  had every end give focus back; as built, Done, a skip and a vanished target give it back, while a click on the
  target (it goes through to the page) and a route change do not. The page is never inert, so a screen reader can leave the card.
- Instrumentation: no migration. The tips send `cta` rows: `guide_<screen>` shown, click, done; `guide_skip` done;
  `guide_relaunch` click (kept, so the funnel tells a replay from a first visit). `pipeline/funnel.py` prints shown,
  completed and skipped per screen.
- Versioning: one version per screen (all 1). Raising one shows that screen's tips once more to everyone.
- Two behaviours the build added to the design: `.guide-room`, 50vh of padding below the page while the phone
  sheet is open, so a target near the page end can scroll above the sheet; and Esc caught in the capture phase, so
  the app's own Esc handler does not also fire.
- Two phone fallbacks in the step table: the home relaunch tip and the About feedback tip point at the footer's link
  when the top bar's link sits past the phone's edge.
- Four copy changes from the plan: the field screen's heart tip says "All fields" (the cluster 6 rename); the home
  relaunch tip says "on a screen with tips"; the Networking types tip says "a recruiter or a hiring manager" (a
  gmail visitor has no alum tab); the role rail tip says "in the fit box" (the desktop rail is headed "How do you
  fit?", the phone tab "Your fit").
- The six "explain" findings it resolves. The guide alone explains four: the class cards' band and the label "from
  the course description"; the subject codes (BANA, NBAY); the gap count that changes with the program answer; the
  role page's closed areas. Two also got an interface change: the fit screen's two counts (a line under the lead)
  and the Explore view buttons named only by a glyph (an aria-label).

**Deferred** (each is a line under Later, below). The Tally-owned items: the dark Submit colour, the contrast inside
the iframe, the redirect to production; they are the owner's form settings. The data strings (a role blurb's passive,
team names repeated in titles): a data pass and a cleaner rule, with their own checks. Six token pairs under 4.5:1
that no screen draws as text. The phone Tab order after the CSS reorders: a markup change on three screens. The
Product field filter on Find jobs: the owner's call. The verifiers' small residuals.

**Not audited: the signed-in state** (the map, the tree form, the hearts' sync, Forget, "Get your tree", the feedback
email from a session, the top bar with Sign out). The owner's relayed code and magic link both answered
`otp_expired`. Outlook's Safe Links opens a link in a mail before the reader does, and the six-digit code shares the
link's token, so the scanner spent both. The risk for `ACCOUNTS_ENABLED`: Cornell mail is Outlook, so the code email
template must carry `{{ .Token }}` and no link, or no student can sign in.

**The tests at the top of the stack.** `npm test`: 478 web tests, 477 pass and 1 skip (it was there before).
`npm run test:ui`: 364 tests, 300 pass and 64 skip (a viewport's own cases and the signed-in ones), none fail.
`tests/python/test_funnel.py` passes. The evals are unchanged (`run.mjs` 515; `run_classes.mjs` 197 pass, 11 fail,
3 known).

## The tech set's last pieces before the switch (`feat/tech-go-live`, 2026-11-06)

The four items "A third role set" left for the interface pull request, done before `TECH_ENABLED` flips.

**Role blurbs.** One sentence for each of the seven tech roles in `web/data/role_blurbs.json`, keyed `tech.<family>`,
written from each role's top asks. Each is under 15 words, as the file's rule asks.

**Campus subjects.** `field_subjects` in `web/data/sp27_campus.json` gains the five tech fields: software (CS, ECE,
TECHIE, INFO), data and AI (CS, ORIE, ECE, BANA, INFO), security (CS, ECE, LAW, INFO), design (DESIGN, INFO) and
legal (LAW). These subjects come from the class titles of the Spring 2027 roster. A subject left out only loses
the tie-break. Real estate (CRP) stays out of legal: its land-use classes would win counsel's ties. The classes test now asks for one entry per field of both role sets.

**The résumé-title twin.** `evals/resume_titles_tech.json` has 156 titles as résumés write them, checked by
`node evals/run_tech.mjs`.
- 65 rows come from the published tech samples, with the employer line beside them. I drew them from 739 job lines
  in the 64 tech files and the seven samples.
- The rest are edges written from the posting spec: hardware, customer-facing and IT-support jobs; graphic and
  interior design; data analysts and scientists (an MBA role); paralegals and counsellors.
- I labelled every row before running the reader. The first run passed 145 of 156, with every level right.
- The fixes are rules only a résumé needs, in `web/match.js`. The posting rules are unchanged.
  - A judicial intern, extern or clerk reads as counsel.
  - A bare "Associate" whose employer line is a law firm (LLP, "law firm") reads as counsel.
  - An internship named by its field alone reads as the role ("Embedded Software Intern", "Android Development
    Intern", "Cyber Security Intern"). A posting writes the job word instead.
  - `RESUME_TITLE` ("Growth Marketer", "Change Manager") answers only with a family the matcher's role set holds. The
    tech matcher had been reading those titles as MBA roles.
- Result: 153 of 153. Three known gaps keep their reasons:
  - Google's "Engineering Practicum Intern": the title names no field, and a résumé carries no industry.
  - An information systems security officer.
  - A control-systems designer.
  The last two need posting-rule changes (Later).
- The MBA résumé titles stay at 173 of 173.
- One effect reaches the class picker. The counsel sample's "Associate" at a law firm now reads as counsel held. That
  closes six of its seven gaps against In-house Counsel, so the picker sorts by score. Technology Transactions II falls
  to rank 17, recorded as a known failure with that reason; the other 10 failures are the ones main shows. The tech
  bands do not move (`calibrate.mjs --roles tech`); the level read now agrees with the résumé in 66 of 72 samples, up
  from 65.

**One role in a field.** Four tech fields hold a single role, a case no business field had. The field tiles and the
field line on Explore careers now say "1 role" there (`tileOne`, `fieldLineOne` in `web/copy.js`), where they said
"1 roles".

**Sponsorship.** `evals/sponsorship.json` gains 40 tech postings (`set: "tech"`): 17 yes, 13 no and 10 silent.
- They were drawn from the 2026-11-05 tech refresh with a fixed seed, one per company.
- The draw covered postings that name sponsorship, ones that use the word otherwise (clearance sponsorship, sponsored
  open-source projects, mentoring) and ones that say nothing.
- Each was labelled from its own sentence before the reader ran. The reader got 28 of 40 right.
- The patterns in `pipeline/sponsorship.json` now read these:
  - "We do sponsor visas", "can sponsor your visa", "happy to support visa sponsorship" and "happy to sponsor
    international candidates";
  - "eligible for visa sponsorship", visa sponsorship in a benefits list, and a bare "Sponsorship available" (but
    not after "clearance" or "security");
  - "support H-1B transfers";
  - "not sponsoring" and "permanent work authorization is a condition";
  - a no that names two qualifiers ("unable to offer new H-1B visa sponsorship"). Before, it read as yes.
- All 62 rows pass.
- I ran the old and new readers over the 7,618 tech postings at hand: 147 move from silent to yes, 13 from silent to
  no, one from yes to silent (the clearance) and one from yes to no (the H-1B case above). I read samples of each
  group and every one was right. Nine of the twelve sampled yes moves are one employer's standing line.
- The new reads reach the processed files at the next extract of each set. The MBA raw files were not on this
  machine, so their change is unmeasured.

## A fresh sample of tech titles (`evals/tech-titles-fresh`, 2026-11-06)

The 748 labelled titles of `titles_tech.json` all pass, but the rules were written against them. This sample gives
the honest rate ("Evals to build", item 4, for the tech set).

**The sample** (`evals/titles_tech_fresh.json`). 420 titles drawn after the rules, none already labelled:
- 240 by plain keyword and 60 at random from the census of the Greenhouse, Lever and Ashby boards, with a new seed.
- 120 from postings the refresh kept on the other boards (Workday, Oracle, SuccessFactors and others). The first sample
  never saw these boards. They passed the rules, so they measure precision only.

**The labels.** Two model readers labelled every title from the first labelling's spec, never the rules.
- They agreed on the role for 403 of 420 titles, and on role, level, ladder and entry mark for 394.
- A row counts only where both were sure and agreed: 302 rows.

**The rates** (`run_pipeline.py --roles tech` reports them and never fails on this file):

| Measure | Rate |
|---|---|
| Role right | 95.4% |
| Recall | 97.8% |
| Precision | 91.7% |
| Level and ladder, where the role is right | 99.2% |
| Entry mark | 100% |

On the census draws the role is right for 96.7% (keyword) and 100% (random). On the kept postings from the other
boards, precision is 87.1%.

**The misses.**
- Eight of the twelve false roles share one shape: a bare "Engineer" or "Designer" title at a company that does not
  make software. Examples: "Engineer I - Sr Lead" at Entergy, "Senior Engineer, Occupational Safety" at Ford, "Designer,
  Toys" at Paramount, "Associate Project Designer" at Dominion Energy.
- The rule reads a bare engineer title as software unless the title names hardware; the employer's industry is not
  consulted.
- Three titles were missed: two security titles worded as "automation" and "attack" engineers, and a search
  infrastructure engineer read as ML.

Per the method, no rule was changed on this sample; the fix goes through new rows in `titles_tech.json` (Later).

## Bare titles and the employer (`fix/tech-bare-titles`, 2026-11-06)

The fresh sample of tech titles showed one shape behind most false roles: a bare "Engineer" or "Designer" title at an
employer that does not make software. 888 stored postings were bare-only; at utilities, plants, hotels, stores and
refineries they are field, facility and drafting jobs.

**The labels first.** 90 bare-only postings were drawn across employer industries ("bare-border" in
`titles_tech.json`, with each employer's industry). One reader labelled them from the spec, with the employer shown;
64 are sure.

**The rule** (`pipeline/roles_tech.py`, `BARE`):
- A bare title ("Senior Engineer", "Engineer II", "Designer") is the role when the employer's industry is unknown (a
  résumé, an employer with none on file), a software industry (`SOFTWARE_INDUSTRIES`), or startup portfolio tags.
  Tags for defence hardware or biotech (`PORTFOLIO_NOT_SOFTWARE`) do not count.
- At any other employer, a bare "Engineer" counts when the rest of the title names software work (`BARE_HINT`: cloud,
  data, Java, identity, site reliability, trading and the like). A bare "Designer" counts when it names digital
  product design. A bare "Developer" is software everywhere.
- The designer exclusions add data halls, substations, eyewear and visualization.
- The security pattern now reads a dash or a grade between the job and the security word ("Engineer - Cloud Security",
  "Engineer II, Cybersecurity").
- `family()` takes the industry. Extraction and the evals pass it.
- The exported rules carry `bare` patterns and `bare_titles` for the JavaScript readers. The résumé reader has no
  industry, so a résumé reads as before.

**The result.**
- All 736 sure labelled titles pass, and the JavaScript reader agrees with Python on all 838.
- One known level miss is recorded: an internship at an exchange reads on the bank ladder at the same level.
- On the fresh sample, overall precision rises from 91.7% to 96.4%, and from 87.1% to 98.2% on the Workday and other
  boards' postings. Those numbers are no longer blind for the bare titles, since the misses were seen before the rule
  was written; the border rows, not the fresh file, set it.
- The stored data changes at the next refresh: 619 postings read differently (564 leave the set, 55 move to security).
  A sample of 30 leavers read right in 27; the two clear software ones (a warehouse system, a trading engineer) were
  added to the hints.

## Skills for the later MBA roles (`feat/skills-later-roles`, 2026-11-06)

Part C of "Adding a role" for the 15 roles added after the first 50, run on the refresh that gave the 13 business roles
postings (54,792 US MBA postings, 64 roles).

**Title rules first.** Seven labelled titles (set `noise-2026-11-06` in `evals/titles_mba.json`) keep customer service
reps, Halliburton's ESG service codes, chip and network implementation and janitorial project managers out of
`sustainability`, `implementation` and `project_manager`.

**Eleven MBA-only skills,** drafted from each role's `role_terms` and probed on its postings:
- A new cluster, "Sustainability & public affairs": `esg_reporting`, `carbon_accounting`, `decarbonization_strategy`,
  `government_affairs`.
- In existing clusters: `fraud_prevention` (risk), `ats_tools` (tools), `technical_demos_poc` and
  `implementation_delivery` (sales), `crisis_issues_mgmt`, `editorial_writing` and `research_design` (marketing).
- Every pattern ties its noun to a working verb or object ("ESG reporting", not "ESG"), the lesson of the audit below.

**Context.**
- Evidence entries for all eleven.
- The `impact` field (sustainability and public policy) gets 20 field entries. `business_case`, `genai_llm`,
  `supply_chain` and `synthesis_recommendations` crossed four asking fields and get an entry for each.
- Sixteen carriers changed where the eval found no co-occurrence; no threshold moved.
- Each new skill has a "what" in its depth file (`mba_impact.json` is new). Ladders and sub-skills wait for
  `depth_gen`, which needs the OpenRouter key.

**The text cache keys on what tagging reads.** `TextCache`'s fingerprint read the whole depth files, so a new
definition voided the cache and cost a cold re-extract. It now hashes the sub-skill patterns only. A test pins that a
definition change keeps the cache.

**Evals.**
- `run_pipeline` passes (1274) and `run_taxonomy` passes.
- `run_depth` keeps 64 failures that `main` already had after the 2026-11-05 refresh: 20 cited postings no longer in
  their ladder and level, and 44 sub-skill shares outside 5% to 50%. The baseline is not rewritten, because it is written
  only from a clean run. The fix is a `depth_publish` rerun (Later).
- Bands: `calibrate.mjs --roles mba` places the 13 roles in their groups. The upper lines hold (54%, 73%) and the
  groups' bottom lines move by a point or two. `impact` gets no bands, with fewer than 10 same-role résumés. `run.mjs`
  passes (515).

**The audit of what counts as a skill** (owner's request, same day) is a proposal, not a change. It covers years of
experience, credentials, industry tags, broad patterns and behaviours across all three sets; nothing was pruned. The
owner decides row by row. The rows that land get their own dated sections.

## Requirements and industries leave the skill surfaces (`feat/skill-surfaces`, 2026-11-06)

The owner's decisions on rows 1, 2 and 3 of the skills audit of 2026-11-06 (artifact "Skill Graph Pruning Audit").
A tag stays in the data. What changes is where each kind is shown: a **skill** is something a person can learn or
show; a **requirement** is a gate the employer sets; a **filter** narrows a search.

**Years of experience is a Find jobs filter.**
- `jobs_open.json` carries each posting's `yoe` as an eleventh column.
- Find jobs gets "Years of experience" (up to 2, 5 or 8). A posting that names no number of years always counts.
- The posting panel says "asks for N+ years".
- The `yoe_*` buckets stay in the graphs: they are the requirement the fit tab compares with the résumé's years.

**Credentials are requirements, not skills.**
- A posting's skills in `jobs_open.json` hold no credential, so "N of the M skills" counts skills only.
- The graphs' edges skip every credential, so "often asked for together" no longer pairs a skill with a degree.
- The skill map and the skill path board drop them.
- A security clearance ask is flag 128, with a "No security clearance" filter.
- The role page's Credentials block is unchanged.

**An industry is the employer's sector, except where it is the work.**
- An industry (cluster `domain`) is one of a role's skills only when it is in the role's `defining` list: measured, on
  most of the role's postings and rare elsewhere (fintech for treasury and the banks). No hand list is kept.
- Elsewhere it leaves the role screen's skill areas (it stays in the role's Industries block), the posting's skills in
  Find jobs, the skill map and the skill path board.
- Find jobs gets an Industry filter on the employer's sector (`companies[].sector`, 89% of open postings).
- The matcher's "Industry fit" is unchanged.

**Interface.** `docs/GRADBUDDY_CONTRACT.md` records the new column and flag, both appended, so a reader of the old
order still reads the first ten columns.

**Checks.**
- Web tests 391; `run.mjs` 515; `graph_mba.mjs` 64 roles; `rough_fit` pass; `run_tech` 147; both game evals hold.
- `skill_path.mjs` fails on its pinned example round. The 2026-11-06 refresh data already broke it (#189's code gives
  the same failures). Its invariants hold: no player is stranded, and a perfect player always arrives. Retune under Later.

## Tighter patterns, and three skills retired or moved (`feat/tighter-patterns`, 2026-11-07)

The owner's decisions on rows 4 and 6 of the skills audit of 2026-11-06. Every pattern change was read against both
corpora first: share before and after, by role, with sampled sentences the change drops and keeps. A tightening that
dropped real asks was reverted (stakeholder management stays as it was).

**Row 4: the over-broad patterns.** A skill's pattern now needs the ask, not the word. US shares, before and after
(product / MBA):
- financial_analysis 21% to 4% / 41% to 13%: "analysis" or "budget" in any sentence no longer counts; a model, a
  forecast, unit economics or financial analysis does.
- adaptability 55% to 37% / 46% to 28%: a line about the environment ("a fast-paced environment", "multiple
  priorities") is not adaptability; a disposition line (thrive in, comfortable working in, navigate ambiguity) is.
- system_architecture 55% to 37% / 11% to 6%: "infrastructure" or "architecture" alone no longer counts.
- consulting_banking 11% to 6% / 23% to 13%: the word "consulting" no longer counts; a consulting or banking
  background does.
- execution 68% to 60% / 62% to 55%; ai_ml 65% to 58% / 41% to 35%; positioning_messaging 30% to 23% / 22% to 14%
  ("narrative" needs a qualifier; "value prop" counts); process_improvement, risk_mgmt and people_management (mentoring
  junior or other staff alone no longer counts) move a few points each; hardware stays within a point.
- Tech (on the 2026-11-06 tech refresh, 14,165 US postings): financial_analysis 12% to 2%, adaptability 50% to 33%,
  execution 42% to 34%, people_management 27% to 21%, positioning_messaging 8% to 2%, consulting_banking 6% to 1%;
  ai_ml and system_architecture keep their tech readings and do not move.
- The recruiter's sourcing reading (`patterns_for.mba` of sourcing_category_strategy) needs procurement words, not
  candidate sourcing: 31% to 16% of recruiter postings.

**Row 6: three skills.**
- `domain_expertise` is retired: it never said which domain, and the industry tags do. It leaves the taxonomy, the
  evidence file, the product depth file and the matcher's structural list, and the `must` of 7 golden rows (each note
  says why).
- `consulting_banking` is tightened (above).
- `rotational_program` moves to the credentials cluster: a programme is an entry route, not a skill, so the
  surfaces of rows 1 to 3 treat it like a degree.

**Labels.** Adaptability left `must` in 9 MBA and 2 tech golden rows whose only evidence is an environment line, each
note giving the reason. With that, must found is 85.2% (floor 85%) and 87.4% (floor 87%); must-not tagged fell.

**Field entries.** Nine entries asked for in under the coverage floor after the tightening left `pipeline/fields.json`
(financial_analysis for eight fields, positioning_messaging for analytics); program_mgmt's impact entry carries
metrics_kpis instead of financial_analysis.

**Bands.** Recalibrated on the new tags: product moves a point; MBA in range from 49% (was 54%); tech in range
from 22% (was 29%), strong from 52% (was 54%), on the full 376-résumé set.

**Not regenerated.** `evals/extraction_baseline.md` (product) and `skill_audit --reuse` need model answers
(`decisions_results.jsonl`, the audit answers) that are in neither this checkout nor the store. `run_depth.py` keeps its
64 failures, all already on main; its baseline is written only from a clean run.

## Posted dates and a Newest sort on Find jobs (`feat/jobs-posted-newest`, 2026-11-07)

A student told us a listing's age matters most for new-grad roles, and Find jobs showed no date and had no Newest
sort. The boards' own date was already in the processed files as `posted`; it never reached the graph files.

**What `posted` is.** Whatever date the board gives, read by its adapter: Workday `startDate`, Oracle `PostedDate`,
Lever `createdAt` (epoch milliseconds), Eightfold `postedTs` (epoch seconds), Ashby `publishedAt`, SmartRecruiters
`releasedDate`, Amazon, Apple and KPMG as English text, BofA as month/day/year, the schema.org boards `datePosted`.
Greenhouse gives only `updated_at`, the last edit, so a Greenhouse posting can look newer than it is; we show it as
the posting date anyway, because the board offers nothing closer. Google,
SuccessFactors, McKinsey and Goldman give no date.

**The reader.** `build_graph.posted_day` turns each shape into `YYYY-MM-DD`, and writes `posted` on every job row
of `graph.json` and of the MBA and tech role files. A value it cannot read, or a day after the build or before
2000, is null: on a list sorted by date a wrong date is worse than none. On today's processed files it reads every
value but 32 of the MBA set's (28 future days, four zeros).

**The column.** `jobs_open.json` rows gain `posted` as a twelfth column, at the end, so `firstSeen` stays the tenth
and a reader of the old shape still reads the first eleven.

**Newest and the words.** Newest orders by `posted`, else `first_seen`, newest first, undated last, a tie in the Best
match order. The card's facts line and the panel's facts end with "Posted 3 Nov" for a board date and "Listed here
5 Nov" for `first_seen` alone. `first_seen` is the day our scrape first saw the posting; it clusters on scrape days,
so it is never called a posting date. The year shows only when it is not the current one.

**Coverage** (the rebuilt `jobs_open.json`, 48,075 open US postings): `posted` on 95.7% of the 6,513 product rows and
92.8% of the 41,562 MBA rows (93.2% overall); every MBA row has `first_seen`, so every MBA row has a date and 4.3% of
product rows have none. The tech role files carry `posted` on 95.5% of their 14,165 postings. 5,243 dates of the
three processed files are more than six months old, the oldest from 2019: the date is the board's, shown as it says.

## The tech set in Find jobs (`feat/jobs-tech-set`, 2026-11-07)

The tech set (software, ML, data and security engineers, product designers, UX researchers, counsel) went live behind
`TECH_ENABLED`, but Find jobs searched the product and MBA sets only: `pipeline.jobs_open` read `graph.json` and
`graph_mba/<role>.json` and nothing else, so a student searching "machine learning engineer" found only business
postings. The tech role files already carried every column the file needs, `posted` included, so this is a reader
change and a rerun, with no graph rebuild.

**The file.** `jobs_open` reads `graph_tech/<role>.json` by the MBA set's rule (`open` true, the index's country). A
tech row's id is `t<num>`, its role `tech.<family>` (the key `Atlas.index()` gives tech roles, so the screen's field
and role lookups hold), its level indexes `levels.tech`. Two new flag bits: `256` the tech set, `512` its
new-graduate mark (`entry` `"grad"`). The bits only add; the first twelve columns keep their meaning. An industry
stays in a tech row's skills only when it defines the role (data modeling for data engineers), as for the MBA set.
`skill_ids` is the union of the three sets, so its indexes shift; the product and MBA rows decode to the same values
as before (checked row by row against the previous file), though their bytes change.

**The switch.** The file holds the tech rows whatever `TECH_ENABLED` says. With the switch off, `jobsData` drops them
before anything counts them, so the lead and the facets never name a hidden set, and home and About read the meta's
new `without_tech` counts (the employers overlap across sets, so that count is its own number, not a difference).

**The words.** A tech new-graduate posting says "A job for new graduates" and is under the Bachelor's entry filter,
with the MBA set's `pre_mba`. The tech levels fold to the same four ids, said in the set's own words on the card and on
the rail while a tech field is picked (`Copy.jobs.levelsTech`: "Mid-level or senior", never "Manager"). About's line names
engineering, design and legal roles while the switch is on.

**The refresh.** refresh-tech runs `jobs_open` after its graph build and commits the two files, as refresh-product and
refresh-mba do; before, a tech refresh left Find jobs stale.

**Counts** (2026-11-08): 62,032 open US postings, 6,513 product, 41,562 MBA, 13,957 tech (498 of them for new
graduates), at 1,559 companies (20 new, 1,121 with tech postings), 78 roles. The file grows from 11.0 MB to 14.0 MB raw,
2.6 MB to 3.4 MB gzipped. "MLE" finds two postings, the two whose titles say it; an alias table is a later change.

## Sponsorship first, new graduates marked (`feat/jobs-filters`, 2026-11-08)

Two students told us the visa-sponsorship filter on Find jobs was too hard to find, and asked for the jobs for new
graduates to stand out, "the ones that can wait until graduation next year". The sponsorship row was the second row of
"Work", the last rail group, closed by default under eight others; on a phone the rail sits after the postings. The
Entry facet read only the MBA set's marks and the tech set's grad mark, so the product set had none, and nothing read a
start year.

**A strip, not a reordered rail.** Three toggle chips sit under the search form: "Says it sponsors a visa", "New
graduates", "Remote", each with the count it would leave on. Each is the same state as its rail row (the same
`data-key` and `data-val`, one click handler, `toggleFacet`), so the strip, the rail and the chips over the list always
agree and the hash holds one value. We chose a strip over moving the group up the rail because the rail is closed by
default and comes after the list on a phone, and these three are what the students asked for first. Focus after a
redraw stays in the container the person used: the same key and value sit in both.

**The rail scrolls on its own.** The rail is sticky and, with eleven groups, taller than a short window (800×600): its
last groups, Visa sponsorship among them, were out of reach until the list ended, which is part of why the filter felt
hidden. It now has a max-height of the window less its margins and its own scroll bar; the phone layout, where it is
static after the postings, is unchanged.

**Sponsorship has two values.** It is its own rail group, "Visa sponsorship", between Employer type and Company, with
"Says it sponsors" (`sponsor=yes`) and "Doesn't rule it out" (`sponsor=open`): every posting that does not say it will
not sponsor. Most postings say nothing either way (54,664 of 62,032 are open, 659 say yes, 7,368 say no), so a student
who needs a visa can drop the clear no's without losing the silent ones. The two are exclusive values of one key, like
Level. The panel now says "says it does not sponsor a visa" for a no, so a person sees why a posting is missing under
"Doesn't rule it out". Old links' `sponsor=1` read as `yes`.

**The title read.** `pipeline.jobs_open` sets bit `1024` when the title says the job is for new graduates, in every set,
by one regex (`GRAD_TITLE`): new grad(uate)s, university or college grad/hire, early career, campus hire, program,
recruiting or year, graduate program/scheme/hire/trainee/rotation, rotational, class of 20xx, and a year from 2026 to
2029 followed within four words by start, grad(uate)s, MBA, university or new grad. "Campus" and "university" alone
do not count ("Campus and Branch", "ServiceNow University"). A second pattern (`NOT_A_GRAD_JOB`) keeps the mark off
titles that name graduates but are not a graduate's job: an internship whose row lacks the intern flag ("2027 MBA
Intern – Product Manager"), a co-op, and the jobs that run the programs (recruiters, heads of, directors, onboarding).
An intern row never carries the mark. Limits: a title is a few words, so a posting that says "new graduates" only in its
text is not marked, and "Rotational Program Manager, Early Careers" still is. The mark adds 38 postings to the 1,646 the
set marks already held; the product set gets its first 11.

**The start year.** A thirteenth column, `start`: the first year from 2026 to 2029 in a title with the mark, else null.
The Entry facet is now New graduates (`pre_mba`, `grad` or the title mark), MBA entry, Internship and "Starts {year}
or later", the year after the file's `generated` year (`Jobs.ENTRIES(year)`, `ctx.year`), so it reads "Starts 2027 or
later" this year and moves with the data. The card's line says ", starting 2027" when a start is known. Old links'
`entry=bachelor` read as `grads`.

**The guide.** A tip for the strip after the search tip ("Three quick filters"); the field tip says the rail also
filters by level, employer, sponsorship and more. `SCREENS.jobs.version` is 2, so a returning visitor sees the jobs
tips once more.

**Counts** (2026-11-08): the title mark on 196 rows (11 product, 123 MBA, 62 tech); a start year on 97 (2026: 16,
2027: 81). Entry: New graduates 1,684, MBA entry 590, Internship 1,221, Starts 2027 or later 81. Sponsorship: says it
sponsors 659, doesn't rule it out 54,664.

## Find jobs reads abbreviations, falls back, and offers the filter (`feat/jobs-search`, 2026-11-08)

A student searched Find jobs for "MLE new grad", got nothing useful, and said the search "feels keyword-based". It
is: every word must hit a posting (AND), by whole word or the start of one, weighted title 3, company 2, role name 2,
skill names 1, location 1. "MLE" is a word in two titles; thousands say "Machine Learning Engineer". Three changes,
all in `web/jobs.js` and the screen, all deterministic.

**A table of short forms, not embeddings.** `ALIASES` maps 37 short forms to the words they stand for (mle, swe, sde,
pm, apm, pmm, tpm, po, ds, da, fde, ib, pe, vc, bd, cs, csm, ux, ui, ml, ai, eng, mgr, sr, jr, dev, ops, bizops, hr,
qa, sec, fpa, gm, cos, ae, sdr, ldp). A query word in the table hits a posting by the word itself, as a whole word
("PM, Growth"), or when every word of its expansion hits, as if typed; it scores the better of the two (the
expansion's words' average). The short form never counts as the start of a longer word: by the start of a word "pm"
found 1,830 PMO postings, "po" 23,142 (PowerPoint, positioning), "da" 35,917 (data, daily), "eng" 25,798 (engagement
among them). We chose a table over embeddings because it reads the same way every time, needs no key and no route,
and a wrong entry is one line; the search a student types is mostly these short forms and the filters below. Each
entry was counted against the 62,032 open postings: "de" (data engineer) is out, since 139 of the 166 postings with
"de" as a word have it in the location (Delaware) and its 30 titles are Spanish or French ("Líder de Producto") or
Delaware, none a data engineer; the other two-letter forms are rare words in their own sense (da 4 titles, po 1, pe
11, ui 45) or common in theirs (ai, hr, sr, ux). Before the words are cut, "FP&A" reads as "fpa" and "H-1B" as "h1b",
in the query and the postings alike; "new-grad" was already two words. "and" and "of" in an expansion are not asked for.

**The AND stays.** Every word still has to hit. Dropping it would rank postings that match half a query among those
that match all of it, and a student reads the top of the list.

**All but one, when nothing matches.** When a query of two or more words finds nothing, `searchJobsRelaxed` returns the
postings that match every word but one, with `relaxed: true` on the result, and a line over the list says so ("No
posting has every word you searched. These match all but one."). It runs only after an empty exact pass, so a query
that finds something costs what it did; never two misses, since past one the list stops being about the query. The
count keeps its numbers; when even that finds nothing, the empty state draws as before.

**The filter a query names.** `queryHints` reads the words that ask for a filter: new grad(uates), grad(s),
graduate(s), entry level, early career (New graduates); intern(s), internship(s) (Internship); remote; sponsor(s),
sponsorship, visa, h1b (Says it sponsors a visa); a year after the file's ("Starts 2027 or later"). A line over the
list offers each one whose filter is off ("Looking for remote jobs? Turn on the Remote filter."), the filter's name a
button that turns it on and takes those words out of the search, keeping the rest. It shows even when the search has
results: the title mark finds "new grad" in titles, and the filter also holds the postings whose mark came from the
MBA and tech sets' own reads. The rebuilt query is the query's words in lower case.

**Counts** (2026-11-08, the real file): "MLE new grad" 18 postings, the top an ML engineer new-grad title; "machine
learning engineer" 5,276; "PM new grad" 7 (Databricks' Associate Product Manager, New Grad first); "SWE" 8,084; "APM"
697.

## The class picker ranks by one line score (`fix/classes-line-score`, 2026-11-08)

**The shape.** The Gaps covered sort ordered by the sum of the gap shares a class covers, then by relevance. A class
with low relevance that named one small gap outranked the role's core course: Robots in the Wild third for the HCI
PhD matched to three product roles, Memory Technologies fourth for a product designer. Sixteen tech cases and six MBA
cases in `evals/classes/` were known failures of this shape or of broad tags.

**The lever tried.** Eleven variants of the sort were run over all 53 cases (scratch, 2026-11-08): the gap weight
plus k × relevance for k in 0.5 to 2, a floor under which a gap does not count (0.1 to 0.3), core-only weights,
weight × relevance, the weight normalised to the case's best. A floor on small gaps broke seven to sixteen passing
checks; k = 2 broke six. The one kept: the gap shares covered, halved when the class's relevance band is low, plus
0.75 × relevance (`Catalog.sortCards`, two named constants). Ties keep the old tail; the noCover case keeps score
order.

**What moved.** 281 pass, 18 fail, 17 known, from 279 / 19 / 18. Two known failures pass (Advanced UX and User
Research for the UX researcher, alone and with the designer), one real one passes (Robots in the Wild leaves the staff
PM's top 5), and one passing check becomes known: Advanced Operating Systems for the security career changer read as
a software engineer falls from rank 10 to 24, because its tags give it a relevance of 0.05 (system architecture and
Linux only). Where a top 3 moves (26 cases), a high-relevance core course steps past a low-relevance class that named
one gap.

**What the sort cannot move.** Ten of the sixteen tech known failures are tag problems: Analysis of Algorithms scores
0 and covers nothing; Advanced ML Systems is tagged AI/ML and hardware only; Privacy in the Digital Age scores 0.08.
No sort lifts a class with no relevance and no covered gap into the top 10. They stay known with their reasons until
the tags are reread (`pipeline/catalog_tags.mjs`, the data thread). The 18 failures left were on `main` before this
change, from the data refreshes since the 2026-11-06 baseline; their spec files are the reader's expectations and stay
as they are.

## Find jobs reaches every Product posting; a phone's Tab order; the polish list (`feat/site-reach-polish`, 2026-11-08)

The site half of the Later list, after the Find jobs pass. Browser side only; `web/data/*` and the pipeline are the data
thread's.

**Find jobs: the Product field.** The filter's role-to-field lookup read `Atlas.index()`, which leaves out the MBA set's
own Product group on purpose (the product set stands for that field), so `product_manager` and `product_strategy` had
no field and the Product filter dropped 3,716 open rows whose cards said "Product" (the card had its own fallback).
One lookup now serves the filter, its counts, the rail and the card (`Jobs.fieldLookup`): the index's group, else the
MBA graph's, else the product namespace. Two ids with one label are one role to the filter (`Jobs.roleKey`: the first
id in the file with that label, the product set's): "Product Manager" lists once and filters `product.pm` and
`product_manager` together; "Product Marketing Manager" the same, and since `pmm` sits in Marketing and `product.pmm`
in Product, that row shows in both fields with the field's own count. `#/jobs?role=product_manager` still opens, as
`product.pm`'s filter.

**A phone's Tab order.** Find jobs, the launcher and Networking showed the content first on a phone by CSS `order`,
so Tab crossed the facets, the tiles or the list before it. The markup now has the phone's order (the postings before
the facet rail, the résumé box before the tiles, the prep card before Who to look for) and the desktop columns are
pinned with `grid-column` under `min-width: 901px`. On a desktop Tab now reaches the postings before the filters too.

**The posting panel on a phone** covers the screen, so it is a dialog there: `role="dialog"`, named by its heading,
`aria-modal` true under 640 px, and Tab stays inside it (`trapTab`, the feedback sheet's loop made a helper for both).
Escape and the focus return were already there.

**The polish list**, one line each, with the choice made where Later left two:
- Explore opens in its list (grid) view on a phone when no field is picked; the map stays one tap away. The map's
  phone layout dropped its biggest field names to keep labels apart; a list has none to drop.
- Tap-to-light on the field page and the map: on a touch screen the first tap lights a role's or a field's skills,
  the second tap on the same item navigates, a tap elsewhere clears. Hover and the keyboard are unchanged.
- The phone top bar's verb strip fades at its right edge (a CSS mask) so a cut word reads as more to scroll.
- The six token pairs under 4.5:1: light green, blue and amber a step darker, dark neutral a step lighter
  (`web/tokens/colors.css` and the `style.css` override together); `tests/web/tokens.test.mjs` computes every drawn
  pair in both themes and holds the floor.
- `#/role/<id>/fit` has one h1 once a résumé is stored (the eyebrow line is it).
- The role page's "How you work" summary wraps at every width.
- Home says the exact role count from the data, the same count the launcher and Explore use; "over" is gone, and
  Explore's hard-coded fallback with it.
- Know the role's reveal lines say "from another role", never "decoy".
- The role rail's "change" returns to the role; "You show all N skills most postings ask for" sits before the
  still-count line.
- Networking's Company box keeps the bare name after a pick; "N open" is the option's hint.
- `Network.sentenceCase` lower-cases a tool named with bracketed examples (a category, not a product); the VP row puts
  the listed employers first and US titles first within each group.
- The feedback box's email field gets `aria-invalid` and `aria-describedby` on a bad address.
- The theme button cycles system → the other theme → system; every press changes the screen.
- Guide steps for the course screen, the games, the professor card (ids added to its markup) and the event screen;
  the guide's key listener moved to the window's capture so Esc in a game's tips skips the tips, not the game.
- `web/pick.js` opens on a click, typing or ArrowDown, never on focus (which also ends the guide's run on Find classes
  with the list open); the listbox has an id, a name and a tabindex, the box `aria-controls` and
  `aria-activedescendant`; the note rows are presentation. axe reports none of its three violations.
- `guide.seen` reads whole numbers only.

**Two small things found on the way.** The Networking role box said the engineering, design and legal roles come
later; the tech set is shown, so the note goes. The skill card averages over the roles the map shows (the product and
MBA sets), while the launcher counts every role; the counts test says so now instead of expecting one number.

**Checks.** `node --test 'tests/web/*.test.mjs'` (503), `node evals/copy.mjs`, and the Playwright suite in `tests/ui`
(phone and desktop) with a new spec for each change. The suite had fallen behind `main`: Find jobs' guide has four tips
at version 2, the guide flag ships on, the Role-box test's "data" and "software" match tech roles now, and the guide's
card took focus, Esc and the scroll under the keyboard and phone specs. Those specs read every guide screen as seen;
the guide's own spec covers the guide. One spec still fails on `main` and here: the résumé line naming the AI reader
on a 200 (in Later).

## The menus and the guide catch up with the site pass (`chore/menu-guide-copy`, 2026-11-08)

An audit of the top bar, the footer, the home cards and every guide tip against what the two site-pass PRs shipped.
The menus were current but one line: home's Networking card named "alumni, faculty, and peers" where the screen
offers hiring managers, people in the role, recruiters, alumni and faculty. Three tips lagged: the field page's and
the map's tap on a phone (a first tap lights, a second opens), and the class picker's Gaps covered sort, now named in
the band tip (the guide keeps two to four tips a screen and two sentences a tip, so no new row). Find jobs' field tip
says "then a role inside it". The skill card's share line says "business and product roles", since the launcher counts
the tech set too and the two numbers read as a disagreement. Field and classes go to version 2, so a person who saw
the old tips sees the new ones once.

## Find jobs opens on Newest, or on Fit with a résumé (`feat/jobs-default-sort`, 2026-11-08)

The owner's call after the first week of the Newest sort: a person with no résumé on file has no fit to rank by, and
"Best match" with nothing typed is company A–Z in practice, the order the students complained about. So the list
opens on **Newest** without a résumé and on **Fit** with one, and the menu reads Fit, Newest, Best match, Company A–Z
(Newest, Best match, Company A–Z without a résumé: there is no Fit to offer).

- `Jobs.defaultSort(have)` names the sort a person starts on and `Jobs.sortChoices(have)` the menu's order.
  `parseState(hash, sort)` and `stateQuery(state, sort)` take that default: an absent or unknown `sort` means it, and
  it stays out of the link. Any other sort is a choice and stays in the link, so with a résumé `sort=newest` and
  `sort=best` are written and without one `sort=best` is.
- Old links keep their meaning where they named a sort (`sort=best`, `sort=company`, `sort=fit`). A link with no
  sort opened on Best match for a person without a résumé and now opens on Newest; that is the change asked for.
  `sort=fit` without a résumé falls to Newest, where it fell to Best match.
- A typed query keeps the default: every row shown matches every word (or all but one, said in the line over the
  list), so newest-first among the matches is the reading asked for. Best match is one choice away.

Tests: the state's defaults and the menu's order in `tests/web/jobs.test.mjs`; the menu, the link and the newest-first
order of the cards with and without a résumé in `tests/ui/jobs.spec.mjs`.

## A model read of the backlog (`feat/postings-read`, 2026-11-09)

$103 of Anthropic API credit expires on 2026-11-10. We spent $95.99 of it on one thing the pipeline cannot do with
patterns: a model read of every posting in the backlog, saved as a cache. No stage reads the cache yet and the pipeline is
untouched; this section says what the cache holds, what the read found beside the regex, and how the data thread
uses it. The runner is `pipeline/experiments/postings_read.py`, the ladder drafts
`pipeline/experiments/postings_ladders.py`.

**What ran.** One request per posting through the Message Batches API (half price), the answer held to a JSON schema.
The role set's skill list (id, name, kind, the one-line definition where a depth file has one) rides in every request
as a cached block: the MBA list is about 19,500 tokens, the tech list 10,300, read at a tenth of the input price by
every posting after the first (one-hour cache). The posting's text is cut at 12,000 characters.

| run | model | batches | requests | cost |
|---|---|---|---|---|
| pilot, the 313 labelled postings (two effort settings) | Haiku 5.5 | 5 | 1,565 | $0.45 |
| pilot, the same postings | Sonnet 5.5 | 3 | 939 | $5.28 |
| the full read | Haiku 5.5 | 42 | 116,306 | $67.91 |
| the stratified subset | Sonnet 5.5 | 3 | 1,500 | $14.05 |
| the judge | Opus 5.5 | 1 | 250 | $4.39 |
| ladder drafts | Opus 5.5 | 1 | 59 | $3.79 |
| ladder critic | Haiku 5.5 | 1 | 698 | $0.12 |
| all | | 56 | 121,317 | $95.99 |

The raw files came from the `backlog` bucket's snapshots (product and tech 2026-11-06, MBA 2026-11-05), not from
`pipeline.backlog pull`: the shell's database URL in this checkout points at the catalog project. 116,304 postings:
MBA 97,278, tech 15,569, product 9,746 of which 6,289 are in the MBA set too (same URL), read once there and pointed
to from the product shards (`same_as`). Haiku 5.5 at medium effort read all of them at about $0.58 per thousand;
Sonnet 5.5 costs sixteen times that. Two answers came back as broken JSON and
were sent again, one posting a batch. No answer was cut at the token limit.

**What we changed from the brief, and why.**
- *One shard per employer, not a file per posting.* The caches store pushes files one by one; 116,000 objects would
  take hours and the backlog's own unit is the employer. 4,214 files, 542 MB, the largest 29 MB (the store's limit is 50).
- *Sonnet on 1,500 postings, not 20,000.* Sonnet costs $9 to $10 per thousand postings here; 20,000 would have been
  twice the credit. 1,500 across 543 cells of (set, family, regex level), at least one a cell and the rest in
  proportion, US and open postings first, is enough to say per field how often the two models agree.
- *The judge on 250 postings, not on every disagreement.* Nearly every posting both models read (1,813) differs somewhere
  (the skill lists almost always do). Opus 5.5 read 250: those with two disputed fields or more first, a random order
  within, so the fields are covered and the skills are not only the messiest postings'.
- *The cap.* The runner computes spend from each batch's usage at batch rates and refuses to submit when spend plus
  the estimates in flight would pass $100. The owner allowed a small overrun for the last batch.

**The cache** (`data/experiments/postings_read/`, gitignored, in the `caches` store).
- `<set>/<employer slug>.json` is `{id: record}`; the id is the sha1 of the posting's backlog key. A record carries
  the posting's facts (`company`, `title`, `url`, `location`, `family`, `posted`, `first_seen`, `last_seen`, `closed`,
  `text_sha`), `regex` (what `pipeline.extract` reads today: `skills`, `level`, `yoe`, `sponsorship`, `remote`,
  `country`, `entry`, `entry_src`, `intern`) and `reads`.
- `reads` is keyed by `<variant>@<prompt hash>`. `haiku@c61ca63f5830` is the full read; `sonnet@c61ca63f5830` exists
  on the 1,500 and on the labelled postings; `judge:haiku:sonnet@c61ca63f5830` on the 250. Each holds `model`,
  `effort`, `batch`, `usage`, `usd`, `stop_reason`, `answer` and `checks`. The 313 labelled postings also keep the
  pilot's reads under the first prompt, `52cfed7ad741`.
- `answer`: `skills` (`id`, `need` = `required` or `nice`, `quote`), `years_min`, `years_max`, `degree_min`,
  `degree_preferred`, `degree_fields`, `audience` (`intern`, `new_grad`, `early_career`, `experienced`, `unclear`),
  `program`, `sponsorship` (`yes`, `no`, `silent`), `start_date`, `remote`, `level`, and a quote for each.
- `checks`: `unknown_ids` (ids the model named that the set's list does not hold), `quotes` and `quote_missing`
  (quotes not found in the posting with whitespace folded and case ignored).
- `manifest.json`: the variants (model, effort, prompt hash, schema hash), every batch (id, tag, set, counts, usage,
  dollars), the spend, the counts per set. `prompt_<hash>.txt` is the prompt and schema under each hash.
  `sample_sonnet.json` is the stratified sample. `report.md` is the per-field report below, written by `report`.
  `ladders/` holds the drafts.

**How the data thread reads it.** `pipeline.store pull caches`, then
`postings_read.cache_index(set)` gives `id → (slug, record)`; join to the pipeline's postings by `url`, and treat a
record whose `text_sha` no longer matches the posting's text as unread. Four rules:
1. Drop every skill whose id is in `checks.unknown_ids`. 3.9% of the MBA set's skill mentions are made-up ids (40.7%
   of its postings carry one), 2.8% in tech. The prompt forbids them and Haiku writes them anyway; Sonnet almost
   never does (14 in 1,500 postings).
2. A quote is evidence only when it is in the posting: about 1% are not (`check_answer` says which).
3. `audience: early_career` is not the site's new-graduate mark. It means "0 to 2 years asked" and covers 14% of open
   US postings. The mark's counterpart is `new_grad` (and `intern`).
4. `level` is the weakest field (below); do not replace the title rules with it.
A posting scraped after the snapshots is not in the cache. `submit --roles all --variant haiku` reads only what the
cache lacks (about $0.60 per thousand postings at batch rates), then `collect`.

**What the read found.** The full tables are in `report.md` (`postings_read report`); the labelled set's in
`compare --pilot`.

*On the 313 labelled postings.*

| | Haiku 5.5 | Sonnet 5.5 | regex |
|---|---|---|---|
| required skills found (recall on the golden "must") | 78.3% | 93.0% | 85.5% |
| skills tagged that the label rules out | 2.4% | 3.1% | 15.9% |
| skills named per posting | 18.3 | 19.9 | 26.2 |
| sponsorship agrees with the label (62) | 58 | 58 | 62 |
| new-graduate mark agrees with the label (153) | 140 | 140 | 153 |

The regex was tuned on the sponsorship and new-graduate labels, so its full score there is the eval it was built
against; twelve of each model's thirteen misses on the mark are `early_career` or `unclear` answers counted as "not
marked". On skills the models are far more precise than the patterns; Haiku finds fewer of the required skills than
the patterns do, Sonnet more.

*On the whole backlog (Haiku beside the regex).*
- **Sponsorship**, 57,828 open US postings: the regex says no on 6,805 and yes on 631; the model says no on 9,098 and
  yes on 1,041. They agree on 54,789 (94.7%). The model alone says no on 2,250: real refusals the patterns miss
  ("This role is not eligible for immigration support", "will not commence an immigration case") and a wider
  reading the regex does not make (US citizenship or a clearance required; "must be currently authorized to work").
  The model alone says yes on 571 ("We do sponsor visas!", "VISA Sponsorship: Yes", "This role is eligible for visa
  sponsorship"). On 95 the regex says yes and the model no; the quotes are refusals ("cannot offer any sort of visa
  sponsorship", "no current or future work authorization sponsorship available"), so these are candidates for a
  wrong yes on the site today, except Deloitte's "Limited immigration sponsorship may be available", which the model
  reads as a no and is a hedged yes. On 48 the regex says no and the model read nothing. The report lists the most
  common quote and employer in every cell.
- **New graduates**, open US: the regex marks 1,048 postings entry (title 283, text 336, category 243, firm 186) and
  1,221 intern. The model reads 574 as new-graduate, 1,128 as intern and 8,323 as early-career. 113 postings the
  model reads as new-graduate carry no mark ("have completed their Bachelor's degree within the last 12 months",
  "Scheduled to obtain a Bachelor's degree by Spring 2027"); 38 it reads as internships carry none. Going the other
  way, the model calls 171 of the 186 firm-rule marks and 89 of the 243 category-rule marks experienced: those two
  rules mark by employer and category, not by what the posting says. 2,609 postings name a programme and 2,492 give
  a start date (summer 2027 the most common).
- **Years**: both read a number on 86,681 postings and it is the same number on 78.1%; the model alone reads one on
  5,999, the regex alone on 1,767.
- **Degree**: a bachelor's is the minimum on 51.7%, none is named on 36.2%, 6.9% say in words that no degree is
  required, a master's 2.6%, a JD 0.9%, an MBA 0.4%, a PhD 0.2%.
- **Remote**: the regex has one flag (8,132 remote). The model reads 9,422 remote, 22,596 hybrid, 38,225 on site and
  46,059 unclear; 78% of the regex's remote postings are remote to the model, and 3,110 it calls remote carry no flag.
- **Level**: the model's grade equals the title rules' level on 45.7%. The scales differ (the regex's `mid` is the
  default for a title without a level word, 52,656 postings, which the model spreads over entry, mid, senior, manager
  and unclear), and this is also where the two models agree least (67.7%).
- **Skills**: the model names 15.6 skills a posting in the MBA set where the regex tags 24.9 (mean Jaccard 0.34), 15.3
  against 23.4 in tech (0.40), 18.1 against 23.1 in product (0.47). Four of five asks are `required`, one `nice`. The
  regex tags behaviours and industry words the model leaves out (collaboration on 71.7% of MBA postings against
  25.2%, ownership 66.1% against 32.3%, supply chain 28.6% against 1.5%, fintech 30.6% against 5.3%): the golden
  set's 15.9% wrong tags at scale. The model names more of the sales and requirement skills (consultative selling,
  quota attainment, analytics requirements).
- **Ids the model made up** are a list of what postings ask for and the taxonomy does not hold, mixed with near
  misses of ids it does hold. MBA: project management (1,963 postings under two spellings), negotiation (1,313),
  executive communication (1,054; the id is `exec_communication`), competitive analysis (915), account planning,
  coaching and mentoring, automation, forecasting, financial modeling. Tech: mentoring (568 under three spellings),
  distributed systems (226), C++ (124; the id is `c_cpp`), incident response (104), Kubernetes, microservices, CI/CD.

*Haiku beside Sonnet* on the 1,500: skills Jaccard 0.53, the same `required` or `nice` on 94.0% of the skills both
name, sponsorship 95.9%, audience 92.3%, degree 92.3%, years 96.9%, remote 83.5%, level 67.7%.

*The judge* (Opus 5.5 on 250 postings; 219 outside the labelled set are counted): where one reader names a skill and
the other does not, the judge's own reading matches Sonnet on 1,561 of 2,239 (70%). It sides with Sonnet on audience
(73%), level (73%), remote (79%), sponsorship (67%) and years (72%), and with Haiku on the minimum degree (45 of 56).
Read with the golden set: Haiku is precise and under-names; a field that matters is worth Sonnet's price on the
postings where it matters.

**Ladder and definition drafts** (`ladders/`, `pipeline/experiments/postings_ladders.py`). With what was left, Opus
5.5 drafted a definition, five sub-skills and the rung statements for the 48 skills only the tech set holds and the 11
MBA skills of the later roles, none of which has a depth file. The evidence is the sentences the Haiku read quoted in US
postings (12,238 tech postings name one of the 48, 7,406 MBA postings one of the 11), bucketed by the regex level into
the ladder's rungs (engineering or legal for tech, corporate for MBA). `depth_gen`'s code checks ran on every claim,
then its support question went to Haiku 5.5 for the 698 that passed. `run_tech.json` and `run_mba.json` are in
`depth_gen`'s run shape (`results[].claims[]` with `kind`, `key`, `status`, `why`, `evidence`), `report.md` has one
row a skill.

| | drafted | pass the code checks | pass the critic too |
|---|---|---|---|
| definitions | 59 | (not checked) | (not checked) |
| sub-skills | 295 | 251 | 178 |
| rung statements | 459 | 447 | 107 |
| rungs, a skill and level with a statement left | 229 | | 93 |

One skill keeps every rung (`research_publications`); eight keep none (`ruby_rails`, `performance_concurrency`,
`code_quality`, `observability_tools`, `appsec`, `cryptography`, `design_portfolio`, `carbon_accounting`). The critic
dropped a statement for one of two reasons: fewer than two employers' sentences carry it (184, `STMT_MIN_EMPLOYERS`),
or a part of it is not in the evidence (156 statements, 73 sub-skills; often a clause the drafter added, "that other
systems and user interfaces call"). `depth_gen` recovers both kinds with its redraft round, which did not run here;
neither did the swap test. These are first-round drafts for the data thread: nothing was written to `pipeline/depth/`,
and nothing reaches it except through `pipeline.depth_publish` from a checked run.

**What we did not do.** Nothing in `web/data/` or `data/processed/` changed and no flag moved. The read is not wired
into `extract`, the sponsorship reader or the new-graduate mark: each is a decision for the data thread, with its own
eval chain. No eval was added for the cache itself; `compare --pilot` is the nearest thing and needs no key.

## The map as two pages: quests one at a time, the tree on its own (`feat/map-quests-tree-pages`, 2026-11-10)

The owner looked at the signed-in map and named four faults: too many words; the read ("What you already bring", the
gaps) above both tabs; "How you work" under the tree, where it makes no sense; quest cards far too wordy, with "Tell
Wally…", "mission" and "Only your choice…" in them. The owner picked a mock ("Option C: one quest at a time") over two
others. This is the first of two pull requests; the second adds the side-project flow and the fields it fills.

**Decisions.**
- **A. Two pages.** `#/map/quests` (the default; `#/map` lands there) and `#/map/tree`, with "Quests · Skill tree"
  under the title. The old `#/map?tab=tree` lands on `#/map/tree`; `?build=1` and `?role=` work as before; `?q=<card>`
  names the quest the now card shows and `?view=list` the tree's list. `MapGate`'s address rule takes the two pages,
  so a sub-page survives the sign-in. E1 and the tree form land on `#/map/quests`. The crumbs read "Explore careers /
  Your map / Quests" (or "Skill tree"); K below revises both.
- **B. The Quests page is Option C.** One now card (the level, the title, one "You ship" line, up to three skill chips
  with the tree's dot, Start), the slim path (a line of numbered dots per level; a dot swaps the now card) and "Up
  next". No legend here. The overworld (`questLayout`, the flags, the zigzag road) is gone, code and tests.
- **C. A quest opens in place.** Before a click: the title, the one line, the chips. Opened: the full `ship` when the
  line cut it, the optional card fields when a card has them (`steps` as a checklist kept in the browser, `prompt`
  with Copy, `build_with`, `live_on`; none is written yet, the second pull request fills them), and one closed "Why
  this quest" with each why line cut to its first sentence and its quote, the classes, users and sources. A story
  card keeps its line, the slots, the live read of a new line and the prompt; what the skill means folds into the why.
  "You ship" is `MapModel.shipLine`: the first sentence, cut at a clause or a word to sixteen words.
- **D. The person marks their own quests, on every map.** Start, then Mark shipped (a link to the live thing is
  required, `Auth.cleanLink`), and a quiet Skip with Undo. The object is `{card, choice, link?, date}` with `choice`
  one of start · shipped · skip · open (open is the undo: the bucket lets a person overwrite, never delete). It goes
  where the choices went, `maps/<uid>/feedback/<card>.json`; the policy checks only the path, so no migration. Old
  files read: build as start, not as skip, change as nothing. A self-marked shipped quest gives its skills the
  shipped look (R30) at once; the owner's `shipped` reads as shipped and `declined` as skipped, `changed` and `reply`
  draw nothing. Why: no one republishes a self-serve map, so "Wally reads it before the next session" was a promise
  the site could not keep.
- **E. The Skill tree page.** The one legend bar on top with "How you work" at its right end (a small popover of the
  behaviours, their states and the quest that practises each); "Tree · List" above the drawing. List is the read: the
  band as its headline, what you bring under its lines, the posting's gaps with the quest that builds each (a link to
  the Quests page); no gaps column when the posting named none. The node panel's "Quests that build it" link there too.
- **F. Words.** "Quest" for "mission" everywhere a person reads; no "Wally" on the map (the tree form's 409 line too);
  the levels are "Level 1 · Fundamentals", "Level 2 · Demos", "Level 3 · One real project" and "Reach · Optional",
  from the copy, since the file's labels carry durations. Copy keys nothing reads went.
- **G. Edge states.** A map with no quest shows one line and a link to the Skill tree (the second pull request puts
  "Start a side project" in that box). The print sheet names the role alone when there is no company (it printed
  "{role} at "). At 390 px the pages stack, the path wraps and the tree scrolls in its box.
- **H. No new flag.** The map screen is replaced for the people who reach it; `MAPS_ENABLED` and `TREE_ENABLED` stay.
- **I. No time estimate shows** (the owner: the estimates are not verified): no window or hours on a card, in up
  next, in the levels or on the print sheet. The file keeps `window`, `hours` and `who`; the screen ignores them.
- **J. Nothing clears** (the owner: no quest is gated, so "clear" means nothing): no "Ship k to clear", no progress
  line, no cleared tag, pips or flags. A dot shows its own state; "you are here" is the first quest neither shipped nor
  skipped. The file keeps `worlds[].clear`; the screen reads past it.

- **K. Build skills is its own section** (the owner, after A: "the fact that this is nested under explore careers, I
  don't like that"; and a person with no résumé should be walked through it and pick roles). The top bar gets "Build
  skills" after Explore careers, at `#/map`; the crumbs read "Build skills / Quests" and "Build skills / Skill tree"
  (they read "Explore careers / Your map / Quests" under A), and the map marks Build skills, never Explore careers.
  `Crumbs` has the section `build` with its address `#/map`; a screen with no crumbs of its own shows the section alone.
  Who sees it: the fit box's rule, now one function, `buildOn` (`TREE_ENABLED`, and accounts on or a session on this
  browser), so a visitor who cannot sign in never sees a door that refuses them; the map stays invite-only while
  accounts are off. It is no home card: home and About keep the four verbs. A click walks through what is missing:
  no session, the sign-in, which now carries even the plain `#/map` as `next` (the code sign-in returns to `next`
  alone), so the page survives it; a session and no map, the tree form as the first step, headed "Build skills" with
  one line on what comes after; a map, Quests. The form reuses a résumé already in the browser (`state.resume`, kept
  by the fit flow); nothing in the form, `/api/tree`, the generator or the matcher changed. **E1 goes**: `#/skills`
  opens the launcher for everyone, `?all=1` is read nowhere, and the launcher's slot keeps one line, the invite, for a
  person with no session while accounts are off (the one who sees no Build skills). The map's "Explore other roles →"
  and the launcher's "← Back to your map" go: the top bar does both jobs. Why one name: "Build skills" named the
  launcher (`#/skills`) until 2026-11-01 ("Explore roles & build skills") and code comments still said so; they now
  say Explore careers for `#/skills`, and Build skills means the map alone.

**What it revises.** Q1 (the overworld) and K1 (the card in the side panel, for quests; the node panel stays) go. F1
(three buttons, a note, Send) becomes D. D1's place moves from above both tabs to the tree page's List. R23's "How you
work" line under the tree moves to the legend bar. Owner-marked shipping is no longer the only way a quest counts.
R28 (a world clears after k of n) and R29 (a declined mission leaves n) no longer show on screen. K revises E1 (Build
skills, then the launcher, opened the map first for an invited person) and A's crumbs.

**A bug the new spec found.** A story card's id (`s1-<skill id>`) carries underscores, which the bucket's policy
refuses in a file name, so no choice on a story card could ever be saved. The file name now writes each underscore
as a hyphen and the object keeps the id (`Auth.feedbackPath`, the contract); no SQL changed.

**Proof.** `tests/ui/map.spec.mjs` draws both pages signed in with no real session: a made-up session in
localStorage and the Supabase project stubbed in the spec, the example map as the file. `tests/web/map.test.mjs`
holds the new pure parts.

## A standards index: what the industry treats as the way into a role (`feat/standards-index`, 2026-11-10)

The quest generator of the apprentice map writes side projects from the role and the posting. It had nothing that
says what employers themselves test for the role. A research thread read programs, published interview loops, the
guides practitioners cite and credentials, per role id, and distilled a "what you must show" list for eight first-cut
roles. This change makes that a tracked file with a refresh command. The generator that reads it is the map thread's.

**Decisions (owner, 2026-11-10).**
- **Grounding only.** The index goes into the generator's prompt. It adds no text to a quest card: no citation line,
  no link. The card already explains itself through the role and the posting.
- **No one-item rule.** A quest need not show one item of the role's list; some quests are foundations for later
  ones. So nothing in code ties a quest to an item, and the check on quests is a judged sample
  (`evals/README.md`, "Evals to build", item 10).
- **Second-hand sources and prep vendors are allowed**, since nothing is shown or linked. The file records
  `publisher_class` and `first_party` so the generator can weigh them. Publishers on the blocked-vendor list of
  `data/raw/build_sources.json` stay out: three draft entries were dropped (Breaking Into Wall Street, Mergers &
  Inquisitions, a Wall Street Oasis thread). `build_sources.json` keeps its own, stricter rule.
- **No quotations.** Every quote in the draft came through a summarising fetch and none was checked word for word, so
  the `quote` field is gone and the eval refuses it. Summaries are in our own words.
- **First cut:** `pm` (also `product_manager`), `software_engineer`, `pmm`, `growth_manager`, `product_designer`,
  `data_scientist` (also `data_analyst`, `product_analyst`), `account_executive`, `bizops`. Sources exist for all 77
  role ids; the other roles get a `shows` list when the cohort picks them.
- **Kept fresh on a schedule**, by a person: the command flags, a person re-reads.

**Why a file and not a table.** 208 records, read by hand, changed a few at a time. A tracked JSON file is reviewed
by diff and needs no key; it follows `data/raw/build_sources.json` and its `verify`.

**The file** (`pipeline/standards.json`; fields in `docs/MODULES.md`). 208 sources: 86 guides, 42 loops, 38
programs, 30 credentials, 12 recorded gaps (a role with no program or published loop; the record says what was looked
for). 169 were opened and say what is recorded, 38 were seen in a search result only, 1 is from memory. 152 are
first-party: the page is published by the party that sets the standard it describes. A prep vendor, a mirror, a review
and a gap are never first-party. `publisher_class` was set by hand in this change (employer 77, practitioner 47,
certification body 34, book 26, prep vendor 24); the draft's `vendor` flag missed Aced (formerly Exponent) and one
RocketBlocks page, which are prep vendors here. `roles` holds 47 items for the eight roles; four carry a `weak` note
(no fetched source other than a prep vendor, or one employer's page).

**`pipeline.standards verify`.** One GET per source, two seconds apart, a generic user agent, no page text stored.
It writes `check`, `read_sha256` and `read_sha256_date` and nothing else. The hash is of the page's words (lower
case, letters and digits), so markup does not count. The first check after a read takes the hash; a later check that
differs is `changed`; a person re-reads, edits the record and `date_read`, and the next check takes the new hash.
A paywalled source, a book, a site that answers 401, 403 or 429 and a page that is an empty shell without a browser
are `needs_signed_in_read`, not failures. The report flags four things: unreachable, changed, read more than 12
months ago, and programs not re-read since the last 1 August (recruiting pages turn over each summer).

**The first run (2026-11-10, a laptop).** 114 ok, 83 need a signed-in read (66 paywalled or books, 10 pages that
need a browser, 7 refusals), 11 unreachable:
- no answer to a script, though the pages open in a browser: `mckinsey_interview`, `mckinsey_solve`,
  `mckinsey_chief_of_staff`, `transformation_gap` (mckinsey.com times out), `general_mills_abm`, `how_brands_grow`;
- gone: `jpmorgan_ib_summer_associate`, `morgan_stanley_ib_summer_associate`, `bank_credit_training_loop`,
  `atlassian_apm` (postings mirrored on The Muse, HTTP 410) and `cma_category_certification` (404). All five were
  search-snippet entries; they want a first-party page or removal at the next re-read.
None of the eleven backs a `shows` item.
**A known limit: some pages hash differently with no real change.** The 114 readable sources were fetched a second
time minutes after the first: 102 hashed the same and 12 did not (careers.bcg.com twice, pgcareers.com five times
including `gap_business_intelligence`, careers.geaerospace.com twice, one Google careers posting,
`stripe_engineering_interview`, `owasp_top_10`). Those pages will be flagged `changed` every month. The flag costs a
person a look and changes nothing by itself; a rule that quiets it (hash twice and keep only stable pages, or hash the
main content alone) is under "Later".

**The eval** (`evals/run_standards.py`, baseline `evals/standards_baseline.md`): structure, `shows`, skill ids,
freshness. CI runs it without freshness, which the date decides; the monthly workflow runs all of it. It found one
error in the draft: `research_design` on a product designer item is an MBA-only skill, removed.

**The workflow** (`.github/workflows/verify-standards.yml`): the 3rd of each month, verify and the full eval, then
an issue with the report when anything is flagged. It has read access to the contents and write access to issues
only, so it cannot commit, open a pull request or merge. Hosted runners are refused by more sites than a laptop, so
its "needs a signed-in read" list will be longer than a local run's.

**What we did not do.** No generator reads the file yet. No summary was re-checked against its page in this change.
The proposal's card-citation check is dropped with the citation line.

## The standards index, second pass: lists for the other roles, a quieter verify, Google first-party (`feat/standards-later`, 2026-11-10)

**Lists past the first eight.** 39 more roles have a `shows` list (47 in all, serving 51 role ids with
`also_serves`; 168 items). Each was written from the role's own source records and nothing else: no new research, no
item from general knowledge. An item is something a person can do before having the job; a credential's outline
gives the work it names, never the exam. 84 of the 168 items carry a `weak` note, 80 of them in the new lists:
outside consulting, product, engineering, design and data, most roles rest on one book, one credential outline or
one employer page. The owner's rule holds: this is grounding, a quest need not match an item, and nothing is shown.

**`no_list`.** 26 roles have no list and say why: their sources (ignoring gap records) do not say what a candidate
must show. Three lists that were drafted were dropped for the same reason (`product_strategy`, `tech_strategy`,
`communications`). `commercial_banking_rm` reads `corporate_banking`'s list; the two drew the same items from the
same sources. The eval now holds the file to it: every role id has a list, is served by one, or is in `no_list`.
A reader gives a `no_list` role no grounding from this file and falls back on the role's postings.

**Verify and pages that move.** When a hash differs from the read, verify fetches once more. Two fetches that agree
are a real change. Two that differ are a page that moves; it is compared by `read_sketch` (the 64 smallest hashes of
the text's five-word runs) and is `changed` only under 0.8 alike. Rejected: comparing every page by sketch, which
would miss a one-line change ("applications have closed") on a stable page. The run of 2026-11-10 quieted ten pages
(BCG, P&G, GE Aerospace, one paywalled) and flagged three whose two fetches agreed: `google_apmm`,
`google_product_data_scientist`, `ctf_competitions`. Known limits: a small edit on a page that moves is missed until
the date rules bring it back; a page that changes daily but not within seconds is still flagged.

**Google APM, first-party.** Google's careers pages put their text in an embedded frame that no fetcher or text
reader reaches; a script sees a title. `google_apm` was re-read from screenshots of the program page and its three
story pages (application process, common APM skills, preparation materials) and is now `fetched`. The pages confirm
the five interview types and the written assignment done at home, and name side projects as resume evidence.
Other Google records (`google_apmm`, the loops) are still second-hand; the same method would upgrade them.

## The invited sign-in takes the emailed code (`fix/invite-signin-code`, 2026-11-11)

The owner signed in with an invited address and the email led with "Your code: ……", while the page said "Check your
email for the link" and had no place to type a code. One GoTrue template serves the invited link and the code of the
open sign-in, and it leads with the code. The invited page now shows the six-digit box once the email is sent and
signs in with `Auth.verifyCode`, landing on the page the person came from; the email's link still works and lands on
`#/map` as before. The button reads "Email me a code". The page's first line names Build skills (quests and a skill
tree), where it still said "apprentice map… a private plan for one role". No Supabase setting changed.

**The way in, the same day (`fix/invite-door`).** Two more snags from the same walk. The top bar showed "Build
skills" only to a session (decision K's rule, so no visitor met a door that refuses them), which left an invited
person with no door at all: the bar now shows it to every visitor while the tree is on (`buildBar`), and a click
with no session lands on the sign-in, which says the section opens by invite and how to ask for one. The fit box's
"Get your tree" keeps `buildOn`. And the welcome screen, which asks for an email and is not the way in, now ends with
"Invited to Build skills? Open it with your invite →" (the door's copy never says "sign in"). The launcher's invite
line names Build skills. This revises K's "who sees it".

## Later

The backlog, pruned on 2026-11-06 (the audit folded duplicates and dropped what the dated sections above record as
done). One line per item; the section that explains it is named where it helps.

**The owner's items**
- The sign-in for everyone (`ACCOUNTS_ENABLED`): a sender domain verified at a mail provider and its SMTP password in
  the catalog project's Auth settings; then "Allow new users to sign up" back on there (off since 2026-11-06, so only
  invited addresses get a session), the rate limits, a code email template that carries `{{ .Token }}` and no link
  (Outlook's Safe Links opens a link first and spends the code with it), and the flip ("The visitor journey", step 2).
- One real sign-in, then the audit of the signed-in state the usability pass could not run (the map, the tree form,
  the hearts' sync, Forget, "Get your tree", the feedback email from a session, Sign out), and
  `tests/ui/.session.json` for the harness.
- Merge the usability stack in order (#172, #177, #178, #179, #180, #181, #183, #182, #184, #185, the guide, the
  docs), then flip `GUIDE_ENABLED` in a one-line pull request.
- A think-aloud test at pre-enrollment on Nov 10: a few students use the site and say aloud what they think; what
  stops them feeds the next pass.
- The Tally forms' settings: the dark door's Submit is purple where the light one is black and the site's buttons
  green, and the forms fail axe's contrast rule inside their iframe in dark theme.
- The Tally door sends a local or preview visitor on to production after the form (a Tally setting); the harness
  passes the door by its return address meanwhile.
- GitHub Actions stopped starting jobs on 2026-11-08 ("recent account payments have failed or your spending limit needs
  to be increased", the job's annotation): the Billing and plans page of the account, then a rerun of the checks on
  the open pull requests.
- A spend cap on the Anthropic key and a rate-limit rule on `/api/infer` (the function has a same-origin check and
  body limits, nothing per visitor).
- `CATALOG_SERVICE_ROLE_KEY` in the local `.env` when a map is next published by hand (`map_publish`,
  `map_feedback`; both send a new-style secret key in `apikey` alone, not yet run against one).
- Retire GradBuddy's `apprentice/` folder and skill, or leave a pointer: superseded by `pipeline/apprentice/`.
- Delete `auth.users` rows by hand when a person asks to be forgotten (the button deletes the three tables only).

**The tech role set** (off behind `TECH_ENABLED`; "A third role set")
- Bands for data and AI, design and legal: ten or more samples each (résumé-site samples downloaded by hand, more
  school guides), and counsel's asks fixed in the taxonomy first (legal practice, not compliance), then
  `calibrate.mjs --roles tech`; the product and MBA bands rerun with the 64 new files as "other field".
- The résumé-title gaps left by "The tech set's last pieces before the switch": an information systems security
  officer (the posting rules leave out every "officer") and a control-systems designer (the designer rule takes
  "system designer"); both are posting-rule changes, made with labelled rows in `titles_tech.json`.
- Tech titles: dispatch refresh-tech once "Bare titles and the employer" has merged, so the 619 stored postings the rule
  now reads differently are re-extracted. The fresh sample's other misses (two security titles worded as "automation"
  and "attack" engineers, an AI power engineer read as ML) wait for new labelled rows.
- The class picker's tech cases: ten known failures are tag problems ("The class picker ranks by one line score"); a reread
  of the under-tagged classes in `pipeline/catalog_tags.mjs` (Advanced OS, Analysis of Algorithms, Advanced ML Systems,
  Privacy in the Digital Age), then `run_classes --baseline`.
- The model read (`/api/infer`, set `"all"`, "The model read for the tech set"): `pivot_phd_hci`'s `real_gaps`
  `stakeholder_mgmt` was tagged in 1 of 3 runs of the same request (tighten the prompt only if it repeats); push
  `data/experiments/infer/` to the caches store so `--reuse` works on another checkout.
- Its checklist items C10 and C11: `skill_audit --roles tech`, then definitions and depth for the 48 tech-only skills.
- A tech wording for the shared product skills that fire on company blurbs (launch, partnerships, growth loops,
  pricing; the golden ceiling is 27% against the MBA set's 16%). Whether `ux_researcher` folds into
  `product_designer`. Law firms on the registry; the full Fortune 500.
- Depth for the 48 tech-only skills: first-round drafts are in the caches store
  (`data/experiments/postings_read/ladders/run_tech.json`; 93 of 229 rungs across both sets pass the critic). Left:
  the redraft round and the swap test, then `pipeline.depth_publish` and the depth eval ("A model read of the backlog").

**The MBA role set**
- Part D of "Adding a role" for the 15 later roles: samples and bands for the `impact` group, game passages,
  `mba_roles.json` credentials; and C10/C11 for their 11 skills (`skill_audit --reuse`, ladders and sub-skills from
  `depth_gen`, both need the OpenRouter key). A sample résumé with a product-engineer line; Texas Instruments' "Product Marketing
  Engineer" postings kept as `pmm`.
- `node evals/rough_fit.mjs` in the checks step of `refresh-mba.yml` (after `store pull evals` and `npm ci`).
- `role_coverage`: a column of each role's top `role_terms` phrases that no pattern matches; `COVERS` for the new roles.
- `evals/skill_path.mjs` and `games/skill-path/README.md`: the example round (Marketing to Product Manager), the board,
  the pool and the role count moved with the 2026-11-06 refresh; retune both together (the mocks too).
- `evals/run_depth.py` has 64 failures on `main` since the 2026-11-05 refresh (20 stale citations, 44 sub-skill shares
  outside 5% to 50%): a `depth_publish` rerun on a `data/` branch with the baseline, and `run_depth` in the refresh checks.
- `product_engineer` reads as engineering (system architecture 86%, APIs 79%): whether it moves to the tech set. The American-spelling rule in `depth_gen` and the
  taxonomy names (the display map `Atlas.us` covers the screens).
- The editorial pass over the data strings `evals/copy_baseline.md` lists (abbreviations, long blurbs, passive lines;
  the Product Marketing Manager blurb in `web/data/role_blurbs.json` says "is described").
- A carrier tie-break that prefers the carrier closer to the behaviour over the postings' order.
- The 11 later-role skills have first-round ladder and sub-skill drafts from the model read
  (`data/experiments/postings_read/ladders/run_mba.json`), made without the OpenRouter key; the redraft, the swap test
  and `depth_publish` are still C11's to do.

**The site**
- The apprentice map's judgment half, self-serve: the build cards and the company research from a model, behind
  a flag, every quote checked by `check` before the map is written; the deterministic half is `/api/tree`
  ("The visitor journey", step 4). Uploads of more context to `maps/<uid>/context/` with a storage policy, read into
  `profile.md`. Missions that cover a whole class's gaps (R16); the layout eval (`evals/README.md`, "Evals to
  build").
- The map's second pull request: "Start a side project" on the Quests page (the empty box first), quests a model
  writes from the person's roles, filling `steps`, `prompt`, `build_with` and `live_on`; saved jobs feeding it once a
  saved-jobs store exists (none today). It needs the spend cap and a flag ("The map as two pages", 2026-11-10).
- Decide whether the generator keeps writing `worlds[].clear`, `worlds[].who`, and a card's `window` and `hours`,
  which the map screen no longer shows (2026-11-10); `check.mjs` and the contract still hold them.
- `pipeline.map_feedback` lists the old note column and not the link of a shipped quest (2026-11-10); a stale answer
  on a rebuilt self-serve map's story card (same id) still reads back.
- An "Open now / Last 12 months" switch on the field and role pages, once the product graph keeps closed postings as
  the MBA graph does.
- An events feed for Networking (the intake promises one).
- The new-graduate mark from a posting's text, not its title alone: the extract has the text, and "new graduates" or a
  start date often sits there ("Sponsorship first, new graduates marked").
- IE New York in Find classes: its catalog file (`web/data/catalog/ienyc.json`) and tags file from
  `catalog_export` run for that campus, `catalog: true` on its entry, then `IENYC_ENABLED`.
- Semantic search on Find jobs, in two steps, each with an eval of labelled queries ("Find jobs reads abbreviations"):
  first query understanding from the atlas's own vocabulary (role labels, skill names and the taxonomy's patterns
  mapped to role and skill boosts), then embeddings of titles and skill names built per refresh with an `/api/embed`
  route (Anthropic has no embeddings endpoint; Voyage or similar needs a key in the Vercel project), blended with the
  word score.
- Form controls drawn with `--border` edges (`.wait input`, `.ctx select`, `.sm-plan select`, `.cls-select`, `.cls-email`,
  `.jsearch input`, `.jsort select`, `.fb textarea`) sit near 1.4:1 against their surface; `--input` holds 3:1. Move
  them to `--input` (some are on frozen screens).
- `tests/ui/resume.spec.mjs`'s "the résumé line names the AI reader only when it answered (200)" fails on `main`:
  the stubbed 200 answers `{}` and the line never says "AI reader". The stub, or the line's rule, wants a look.
- `tests/ui/chrome.spec.mjs`'s "About: a late class count keeps the scroll and the open employer list" fails on
  `main` in most local runs (seen 2026-11-08 on 733401d, both viewports): the page moves about 200px when the count
  lands. CI does not run the UI suite, so nothing flags it; the About screen's late redraw wants a look.
- The Tally door's duplicate submissions end with the native door form under `ACCOUNTS_ENABLED`; until then they stay.

**The pipeline**
- LLM extraction for postings (higher recall, the requirement versus nice-to-have split); the résumé side is the
  model read. A production `evals/infer.mjs --url` baseline is not yet recorded.
- History of postings over time (the backlog's dated snapshots are the raw material).
- One Supabase project for both repositories, or the two kept on purpose; `pipeline/backlog.py` still defaults to the
  GradBuddy project.
- `pipeline/log.py`: record the exit code of a stage that ends with `sys.exit(message)` after no ERROR line.
- The runner trial's results (`evals/runner_trial_2026-10-26.md`) were never written; the refreshes run and merge on
  the hosted runners, so the note and its tooling can go unless a family is ever blocked.
- The first live run of `evals/lines_judged.mjs` (the report file is a placeholder).
- Postings whose title repeats the team name ("…, Amazon Supply Chain Services, Amazon Supply Chain Services"): a
  cleaner rule in `pipeline/extract.py`, with the extraction eval chain of `CLAUDE.md`.
- The model read of the backlog is a cache no stage reads ("A model read of the backlog"). Three uses for the data
  thread to decide, each with its eval chain: the `required` or `nice` split and the quotes in `extract`; the
  sponsorship reader checked against the 95 open US postings it calls a yes and the model a no, and the 2,250 the model
  alone calls a no; the new-graduate mark checked against the 113 unmarked postings the model reads as new-graduate, and
  the firm and category rules the model contradicts (171 of 186, 89 of 243).
- Ids the model made up in that read, as a list of taxonomy candidates (project management, negotiation, competitive
  analysis, account planning; mentoring, distributed systems, incident response, Kubernetes) and a map for the near
  misses of real ids (`executive_communication` to `exec_communication`, `cpp` to `c_cpp`) so a reader keeps them.
- Postings scraped after the snapshots the read used (product and tech 2026-11-06, MBA 2026-11-05) are unread:
  `postings_read submit --roles all --variant haiku`, then `collect` (about $0.60 per thousand postings; needs
  `ANTHROPIC_API_KEY`, and the cap in `CAP_USD` raised past what is spent). No workflow does this.
- An eval for the cache itself (the labelled set through `compare --pilot` as a baseline file) before any stage reads it.
- The standards index (`pipeline/standards.json`): sources for the 26 `no_list` roles and for the 84 `weak` items
  (most MBA-set roles rest on one book or one credential outline); a first-party page for the search-snippet sources
  (five are already gone: the Muse mirrors and `cma_category_certification`); Google's other records re-read from
  screenshots as `google_apm` was; PE has no MBA-route source since the blocked vendor's entry was dropped; a re-read
  of the three sources verify flagged on 2026-11-10 (`google_apmm`, `google_product_data_scientist`,
  `ctf_competitions`); the judged sample of generated quests ("Evals to build", item 10) once the generator reads
  the file. The generator does not read the file yet: that is the map thread's (`feat/map-quests-tree-pages`).
- `pipeline.standards verify`: a page that changes daily but not within seconds is still flagged `changed`.

**Frozen with the fit flow** (2026-10-26): the fit screen, the role rail, Explore, About you and the games get no new
work. Kept for the reasoning, not as work to pick up: the field chart's second axis from `kind`; behaviours in the
score (`BEHAVIOURS=score node evals/calibrate.mjs` on the full set, switch only if neither rank statistic falls;
"Evals to build", item 6).
