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

## Later

- ~~Recalibrate both bands files on the full 304-résumé set after `fix/transfer-reach`; decide whether a transferable
  row should earn less than an evidenced one~~: done 2026-11-02 (`data/bands-recal`), 0.75.
- After v20 (2026-10-31): missions that cover a whole class's gaps, not the first role's (the generator's
  rule R16, once a map has been run for a real student); the quest map's one-world view (the round-2 Q2) as the view a
  world opens into; the layout eval (`evals/README.md`); the IE New York roster (`IENYC_ENABLED`); an events feed for
  Networking (the intake promises it); the graphs rebuilt for both sets so `first_seen` fills `jobs_open.json` and
  Find jobs gains a Newest sort (`build_graph`, then `jobs_open`, on a `data/` branch with the baselines).
- Owner steps v20 left open (2026-10-31): ~~commit the B1 files in `gradbuddy/apprentice/`~~ (the generator moved into
  the atlas on 2026-11-04; GradBuddy's `apprentice/` folder and `/apprentice-map` skill are superseded by `pipeline/apprentice/`,
  and the owner decides whether to retire them or leave a pointer there); the four steps in
  `pipeline/sql/2026-11-03_maps.sql` (sign-ups off, the bucket and policies, the invite, the publish) on the
  gradbuddy-catalog project; `CATALOG_SERVICE_ROLE_KEY` in `.env`.
- Owner steps the four verbs left open (2026-10-31): apply `pipeline/sql/2026-10-31_doors.sql` on the catalog
  project before #125 merges; create the Vercel project (README, "Hosting"). The two Tally form ids went into
  `web/config.js` on 2026-10-31 (`chore/four-verbs-close`); the native forms stay as the fallback behind them.
- The Supabase URL and key stay in `web/config.js` for `capture.js` alone (v19 B3 removed the client); if capture
  moves to Tally's own counts, both can go.
- The editorial pass over the data strings (`evals/copy_baseline.md` lists them): role and skill names with abbreviations (PRDs, OKRs, P&L), long blurbs, passive lines.
- The class matching's next lever (2026-10-31): five known failures in `evals/classes/` share one shape, one small gap carrying a class the role does not need. Try a per-line score or a cap on how much a single small gap counts; a floor on the relevance band sank a right answer and is not it.
- An "Open now / Last 12 months" switch on the field page and the role page; first the product graph keeps its
  closed postings the way the MBA graph does (a `data/` branch).
- ~~v14 step 6, `chore/adaptive-6-signals`~~: dropped for good on 2026-10-25 (v16, decision 3). `signals` stay as the
  fallback for the 98 product skills; a reader-judged line per skill is GradBuddy's synthesis, not an atlas fact.
- `evals/run_depth.py` has 28 failures on `main` since the 2026-10-25 refresh (sub-skill shares outside the 5% to 50%
  band on the new postings): a `pipeline.depth_publish` rerun on a `data/` branch, with the baseline.
- ~~The application boxes are the cohort application (v18 step 1)~~: since v19 B5 they are the coming-soon intake
  ("GradBuddy is coming soon.", an email, Notify me); the journeys behind them are GradBuddy's.
- American spelling in the data: the display-time map (`Atlas.us`, v16 step 5) is on; the regeneration with an
  American rule in `depth_gen` and the taxonomy names (`run_depth.py`, `extraction_baseline_mba.md`) is still a
  `data/` branch.
- LLM-based extraction (Claude) for the postings: higher-recall skill tagging and the requirement vs nice-to-have split. The résumé side landed on 2026-11-01 (v21, the model read); the first live `evals/infer.mjs --url` baseline, a rate-limit rule on `/api/infer` and a spend cap on the key are open.
- History of postings over time (the backlog's dated snapshots are the raw material).
- One Supabase project for both repositories: move the backlog, `atlas-store` and `runs` into gradbuddy-catalog, or the
  catalog the other way, and drop the second `SUPABASE_DB_URL` secret (v17 found two projects where the brief assumed one).
- `pipeline/log.py`: record the exit code of a stage that ends with `sys.exit(message)` after no ERROR line (v17).
- The runner trial's results (`evals/runner_trial_2026-10-26.md`, "Results"): the owner dispatches it; then the schedule
  variables, and the self-hosted runner only if a family is blocked.
- A tie-break between carriers the resume shows equally strongly that prefers the one closer to the behaviour (user
  research over discovery for customer obsession), instead of the postings' order (2026-11-01 product refresh).
- More families (design, engineering) and more companies (full Fortune 500). The product engineer and AI transformation
  roles landed on 2026-10-30; once they hold postings: a sample resume with a product engineer line in `evals/resumes/`,
  `calibrate.mjs --roles mba` for `ai_transformation`'s bands, and Texas Instruments' eleven "Product Marketing
  Engineer" postings (semiconductor marketing, kept as `pmm` because software firms post technical PMMs under the title).
- IE New York in the picker (v18, step 3): before `catalog: true` for `ienyc`, `Catalog.loadCatalog` must read
  `classes` filtered on the new `campus` column (one line; the campus id is in the campus file), or both campuses'
  rows show in one picker. Then the owner applies `db/schema_ienyc.sql`, runs the loader and flips the flag.
- ~~IE New York sign-in~~: sign-in is gone (v19 B3); the IE roster opens with its catalog file, no domain needed.
- ~~The price on the cohort application box~~: the box is gone (v19 B5).
- Frozen with the fit flow (2026-10-26): the fit screen, the role rail, Explore, About you and the games get no new
  work (v18); these stay listed so the reasoning is not lost, not as work to pick up.
  - The field chart's lanes with a resume read as two skew lines (the share orders both); a better second axis now that
    every skill has a kind and the shared skills a field reading (v13, v14); the lanes without a resume can read `kind`
    instead of the measured fallback.
  - Behaviours in the score: rerun `BEHAVIOURS=score node evals/calibrate.mjs --roles mba` (and the product set) on the
    full 304-resume calibration set; switch both bands files to `"score"` only if neither rank statistic falls and no
    group loses its bands, moving the six samples' `score_band` in the same commit. Measured on 48 files on 2026-10-25:
    no fall (v14).
