---
name: apprentice-map
description: Build one student's apprentice map (/apprentice-map <slug>): three levels and an optional Reach of what to build in public before applying for a role at one company, on the class tree of the roles they picked, grounded in the job atlas, the student's coursework and deep research on the company. Use when the owner runs a student of the cohort through pipeline/apprentice/.
---

# /apprentice-map <slug>

The procedure for one student. Read `pipeline/apprentice/README.md` first if this is your first run: the frame, the
schema and the rules live there. The folder is `data/apprentice/students/<slug>/` (gitignored; a real person's
material never enters git) or, for the tracked example, `pipeline/apprentice/examples/<slug>/`. A new student's folder
comes from `node pipeline/apprentice/new.mjs <slug>`; a student whose intake was taken in GradBuddy comes over once with
`node pipeline/apprentice/new.mjs <slug> --import`. Every script runs from the repo root. Rules that bind
every step: never fabricate (every fact about the company has a URL and a date read; a number you cannot source is
left out); never contact anyone and never draft a message to a named real person; the student's real name is not on
the page; a card that cannot be tied to the role, the company and the person is cut, not padded.

The division of labor: the scripts do everything deterministic (the atlas's read, the class tree, the worlds, the
check, the page); you write the research and the cards. You never edit `tree`, `read`, `role_class` or `worlds` in
`map.json` by hand; `assemble.mjs` writes them.

## 1. Read the student, ground the class

1. Read `intake.md`, `posting.md` and `profile.md`. If `posting.md` or `profile.md` is empty, fill it from the intake
   (the posting text with its URL and title; the résumé text plus sections 4 and 6) or let `ground.mjs` do the split.
   `roles:` holds one to three atlas role ids of one field; the first is the map's role. An old intake with a lone
   `role:` reads as a class of one.
2. Run `node pipeline/apprentice/ground.mjs <slug>`. It writes `grounding.json` and `grounding.md` from the atlas. For the
   first role: the postings and employers, the core and common skills with what each means in this field, the tracks,
   the matcher's read of the profile in its four states (shows, shows in other words, must evidence better, must
   build), the posting's named skills, and the Spring 2027 classes that cover a gap. For the class: each role's core
   and common skills and read, the class tree (trunk, shared and own nodes, each in its best state across the roles;
   the behaviors apart as "How you work"; the first role's common tier as "more"), and the read the map leads with
   (the band, what the person already brings, the posting's gaps on the tree). Nothing in it came from a model.
3. Read `grounding.md` in full. The tracks are fixed from here on; the marked gaps are what the cards aim at first.

## 2. Research the company: four subagents in parallel, then one synthesis

Launch four research subagents at once, each writing one file into `research/` with a `## Sources` list (`N. Title —
URL — read YYYY-MM-DD`), 500 to 900 words, facts only, short verbatim quotes allowed, "not found" where nothing was
found:

1. `product_and_launches.md`: what the product does, every launch of the last twelve months with its date, pricing
   and packaging as far as public, customers and proof, funding, what the company says is next.
2. `role_and_team.md`: how the company talks about this role and this team: the posting in its own words, sibling
   postings, the careers page, the engineering or product blog, talks, and the hiring manager's public writing if the
   posting names a team. Names only as public pages show them, with the URL; never guess a title.
3. `build_surfaces.md`: what a student could build against in public: APIs, docs, SDKs, datasets, a free tier, an
   open community, public content to analyze or rewrite; where the company exposes little, the adjacent public
   surfaces; and what is not public.
4. `values_and_bets.md`: the company's stated values, principles or constitution, what its investors said, and the
   bets its leadership says it is making, each with "evidence so far" and "not yet shown in public".

Then write `research/synthesis.md`: one paragraph answering Michael Raspuzzi's question, *what is this company
betting on that nobody has shown working yet?*, and its one-line answer. That line is `gap_sentence` in the map and
the gap every card aims at. If the paragraph reads like a list of things to learn, the research has not found the gap
yet; read more before writing cards. On a card, a source title names a show or a publication, not a person.

## 3. Write the cards

You write these parts of `map.json` and nothing else: `student`, `company`, `posting.url` and `posting.title`,
`gap_sentence`, `tracks` (from `grounding.json`, in its order, four to six) and `cards`. The levels:

- **Level 1, Fundamentals.** One card per track that holds a core skill the person must build or evidence
  better. Skip a track whose core skills all show, and skip "Other areas". Six cards at most, a few hours each, built
  from the role's core skills in that area and the company's own pages, product and values. You write no story card:
  `assemble.mjs` writes up to two (`kind: "story"`, ids `s1-<skill>`) from the grounding, one line of the résumé each,
  and puts them first in World 1. If one reads wrong, the owner declines it in `map.json`; never edit its text.
- **Level 2, Three demos in a day.** Exactly three. Each takes one day and ends in an artifact a team member
  at the company could forward tomorrow. Each builds at least two marked gaps. Put the three on three different tracks
  when the gaps allow.
- **Level 3, One project, real users.** Exactly one, four to eight weeks. It builds the highest-share gap the
  demos did not close, in the form the strangest fit gives it. Name its users as a kind of person and a place to find
  them, never a named individual.
- **The Reach (optional, at most one, `"level": "reach"`).** A product-sized project with no deadline. Write it only
  when the gap sentence names a thing nobody has built and the person has more than one term left. Otherwise the map
  has none.
- **Cut, never pad.** A card you cannot tie to the role, the company and the person goes. There is no level 4 or 5.

Every card carries the three why lines, each pointing at its evidence: `why_role.posting_quote` occurs in `posting.md`
word for word; `why_company.research_file` is a file in `research/` and `why_company.url` one of its sources;
`why_person.profile_quote` occurs in `profile.md` word for word.

**The write rule for the three why lines.** Every sentence has 20 words or fewer. Use the active voice and plain
American English. Never write a percentage: say "most postings" (half or more) or "many postings" (a quarter or
more), the way the atlas says it. The quotes and the `ship` text are exempt, and you never change a quote to fit.

`atlas_skills` are taxonomy ids, the marked gaps first; a skill off the tree should sit in "How you work" or in "more"
(the check prints a note otherwise). `classes` are roster codes from `grounding.json`, the student's own plan first;
say in `ship` or `why_person` which class the card grows out of. `users` on Level 3 and the Reach. `sources` on every
card, each `{ title, url, read }`. `student.fictional: true` only on the tracked example.

## 4. Assemble, check, render, and write the two short files

1. `node pipeline/apprentice/assemble.mjs <slug>`. It copies the class tree, the read, the role class and the posting's names
   from `grounding.json` into `map.json` and writes the worlds from your cards: World 1 clears at 2 missions, World 2
   at 2, World 3 at 1, the Reach never. It keeps everything you wrote, and any `clear`, `shipped`, `changed`,
   `declined` or `reply` the owner set by hand.
2. `node pipeline/apprentice/check.mjs <slug>`; fix every FAIL line until it passes. Fix the card, not the rule. Read the
   notes; a skill off the tree is allowed but worth a second look.
3. `node pipeline/apprentice/render.mjs <slug>` writes `map.html`, the owner's check view.
4. Write `opening_line.md`: the one sentence the student leads with when a Level 2 card goes somewhere
   ("<Company> has shown X. I want to help it Y, so I built Z."), one per Level 2 card.
5. Write `who_sees_it.md`: for each card, the kinds of people and the public venues (the hiring manager's team, the
   product's community, the fellowship showcase). No named individuals.

## 5. Report

The path of `map.html`; the card count per level and the Reach; the three cards you are least sure of and why.
Nothing is sent anywhere; the owner opens the page and publishes the map with `pipeline.map_publish`. A student who
signed in on the site may already hold a self-serve map there (`student.self_serve`, from `/api/tree`); publishing
replaces it, and the site never overwrites a map with a build card.

## After the student's feedback

The owner reads the student's feedback in the atlas, then edits `map.json` by hand: `shipped` (a date), `changed` (a
date), `declined: true`, `reply: { text, date }`, or a world's `clear`. When a card is rewritten or replaced, run
step 3 for that card only, then step 4 again; the owner republishes.
