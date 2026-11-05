# The apprentice map

```
node pipeline/apprentice/new.mjs <slug>            # a folder for one student, with the intake to fill in a week-0 session
node pipeline/apprentice/new.mjs <slug> --import   # or: copy a student's folder from GradBuddy, once
/apprentice-map <slug>                             # the Claude Code skill: ground, research, write the cards, assemble, check, render
open data/apprentice/students/<slug>/map.html
.venv/bin/python -m pipeline.map_publish <slug> <email>   # the checked map to the student's private folder
```

This folder generates a map of what a student should build in public, before applying, for one role at one company.
The student picks one to three roles in one field (a class); the map is built on the first role at the first company.
It holds the class tree (the class's core skills, each in the state the atlas reads off the résumé), the read (the
band, what the person already brings, the posting's gaps) and the quests in three levels and an optional Reach:
fundamentals; three one-day demos; one project with real users; a product-sized project with no deadline. Every card
is tied to the role, the company and the person, with its evidence one click away. The owner runs it by hand for each
student of the first paid cohort. This folder writes the map; the atlas's `#/map` shows it to the signed-in student.

**Where it lives (2026-11-04).** The generator moved here from GradBuddy (`gradbuddy/apprentice/`), so a map is made
and published from this repository alone. GradBuddy's folder stays as a read-only source: `new.mjs <slug> --import`
copies an existing student's folder from it once.

**The frame.** On 2026-10-25 the fellowship's mentors said the résumé-and-fit flow GradBuddy led with was
undifferentiated and pointed at Michael Raspuzzi's "Shadow Apprentice" method
([michaelsmemos.substack.com/p/the-shadow-apprentice-stop-applying](https://michaelsmemos.substack.com/p/the-shadow-apprentice-stop-applying),
2026-10-23): instead of applying, do a small public version of the job before anyone hires you. Inputs: a job
description, the person, the company; deep research on the company first; one page, every card relevant to all three
or cut. GradBuddy adopts the method as the engine of its Portfolio proxy (concept v3: the outcome is landing the pivot
role; the proxies are conversations with people who can hire you, and proof you can point to) and adds three things
the raw method does not have:

1. **Grounding in the atlas.** The role's skills, how often postings ask for each, what each means in this field and
   which Spring 2027 classes teach it come from the job atlas (this repository's `web/data/`), not from the
   model's memory. Level 1 is built from the role's skills; the tracks are the role's skill areas.
2. **Coursework as raw material.** The student's current and Spring classes are inputs; cards say which class a project
   grows out of or which class covers a fundamental.
3. **Gradual release.** Levels are labelled by who does the work: Level 1 "I do" (the agent explains), Level 2 "we
   do" (the student builds with the agent beside them), Level 3 and the Reach "you do" (real users; the agent
   recedes). This is the product's pedagogy, and it shows on the page.

This is deliberately thin: no rail, no accounts, no server, no model call in any script. The deterministic parts are
scripts; the judgment is the skill, run in Claude Code.

## Layout

```
pipeline/apprentice/
  README.md            this file
  INTAKE.md            the questionnaire the owner works through with a student (week 0)
  config.json          where the class roster and GradBuddy's student folders are (paths relative to the repo root)
  _lib.mjs             shared by the scripts: paths, the intake reader (roles: or a lone role:), the atlas loader
  new.mjs              new.mjs <slug> [--import]  -> data/apprentice/students/<slug>/, from the intake or from GradBuddy
  ground.mjs           ground.mjs <slug>    -> grounding.{json,md}
  assemble.mjs         assemble.mjs <slug>  -> map.json version 2: the deterministic parts and the worlds
  check.mjs            check.mjs <slug>     -> validates map.json; one line per failure; exit 1 on any
  render.mjs           render.mjs <slug>    -> map.html, the owner's check view
  template.html        the page: inline CSS and JS, no external assets, light mode only
  examples/pmm-nyc/    the one tracked example: a fictional person, a real posting and company (its README says which)
data/apprentice/students/   gitignored; one folder per real student
.claude/skills/apprentice-map/SKILL.md   the procedure Claude Code follows for /apprentice-map <slug>
tests/web/apprentice.test.mjs            the intake reader, assemble's pure part, the check on the example and six broken copies
```

Every script runs from the repo root (`node pipeline/apprentice/<script>.mjs <slug>`) and takes a slug. A slug
resolves to `data/apprentice/students/<slug>/` if that exists, else to `pipeline/apprentice/examples/<slug>/`. Node
only, ES modules by extension (`.mjs`), no dependencies, no build. The order for one map: `ground`, then the skill
writes the research and the cards, then `assemble`, `check`, `render`. The atlas root is this repository, found from
the scripts' own path; `config.json` names only what sits outside it: the Spring 2027 roster folder (`catalogPath`,
`rosterFile`, `campusId`, `term`) and GradBuddy's apprentice folder (`gradbuddyPath`, for `--import`). Each is looked
for beside the repository, then under the home folder, since a worktree sits deeper. Without the roster, `ground`
writes "no roster" for the classes, and `check` and `render` read the codes and titles from the public catalog file
`web/data/catalog/cornell_tech.json`.

## The student folder

| File | Written by | What it is |
|---|---|---|
| `intake.md` | the owner, with the student | the answers to `INTAKE.md`: a yaml block of short answers the scripts read (`roles:`, campus, program, companies, posting URL and title, course codes, hours, the clock, the name on the page) and eight prose sections |
| `posting.md`, `profile.md` | the owner, or `ground.mjs` from the intake when left empty | the posting as published, with its URL and title; the résumé or LinkedIn text plus what the student has built and the strangest fit. `check.mjs` looks for every card's quotes in these two files |
| `grounding.json`, `grounding.md` | `ground.mjs` | what the atlas knows (below) |
| `research/*.md` | the skill's four subagents, then its synthesis | company research, one file per theme, each with a Sources list (URL, date read); `synthesis.md` answers "what is this company betting on that nobody has shown working yet?" |
| `map.json` | the skill (the cards), then `assemble.mjs` (the rest) | the map (schema below) |
| `map.html` | `render.mjs` | the owner's check view of the map |
| `opening_line.md` | the skill | the sentence the student leads with when a Level 2 card goes somewhere: "<Company> has shown X. I want to help it Y, so I built Z." |
| `who_sees_it.md` | the skill | kinds of people and public venues for each card; no named individuals in this version (that is the Tell surface, later) |

## What `ground.mjs` reads from the atlas

Everything comes from this repository, through the atlas's own modules loaded the way its tests load them (`web/atlas.js`, `web/match.js`, `web/catalog.js`, `web/evidence_text.js`); what
is stable and what moves with each data refresh is in `docs/GRADBUDDY_CONTRACT.md`. Nothing is
re-implemented and nothing calls a model.

- **The class:** `roles:` in the intake, one to three atlas role ids of one field (`ground.mjs` refuses a role of
  another field and accepts four at most, so the example can hold its whole field). The first is the map's role. A
  lone `role:` from an older intake is a class of one.
- **The first role:** id, label, number of postings and employers, the share at startups, large companies and firms,
  and the skills that set it apart.
- **The skills:** every core skill (asked by half or more of the postings) and common skill (a quarter or more): id,
  label, kind, share, whether leadership postings ask for it more, the data-built sentence on what it means in this
  field, and its skill area. The **tracks** are the skill areas that hold a core skill, in the order the atlas's role
  screen uses, four to six of them.
- **The person's read:** the atlas matcher on `profile.md`, the way the fit page runs it on a résumé; the band (New to
  the field, Relevant foundation, Qualified for the role, Strong match; never a score) and each core and common skill
  in the atlas's four states: *shows* (evidenced, or shown through a way of working), *shows in other words*
  (transferable), *must evidence better* (named, not shown; presumed from a role held), *must build* (a gap).
- **The posting**, read as the pipeline reads one: which skills it names (`posting.names`).
- **The classes:** every class in the Spring 2027 Cornell Tech roster (`config.json`, `catalogPath`) that the atlas
  course reader says covers one of the person's gap skills: code, title, instructors, eligibility, the gaps covered
  and the relevance band; plus the student's own current and planned course codes resolved to titles. A campus of
  "IE New York" gets "no roster loaded for IE New York" and nothing else.
- **Per role of the class** (`role_class.roles`): its core and common skills (credentials out) and the matcher's read
  of the same profile, with its band.
- **The class tree** (`tree`): the nodes are the union of the roles' core skills, credentials out. A node sits on the
  `trunk` when every role asks for it, on a `shared` branch when two or more do, on a role's `own` branch when one
  does. Its state is the best state across the roles that ask for it. Behaviors leave the nodes for one "How you
  work" line (`tree.behaviours`). The first role's common tier sits off the tree (`tree.more`).
- **The read** (`read`): the band and its words; `brings`, every skill the first role's read found, with the résumé
  line that showed it; `marked_gaps`, the posting's gaps on the tree, at most eight; `how_you_work`, the behaviors
  that show and the rest.

## The map: `map.json`, version 2

The atlas reads this file (`docs/GRADBUDDY_CONTRACT.md`, "The apprentice map"). The skill writes
`student`, `company`, `posting.url` and `posting.title`, `gap_sentence`, `tracks` and `cards`. `assemble.mjs` writes
the rest and keeps every part the skill or the owner wrote.

```
{ "version": 2, "published": "2026-11-03", "atlas_generated": "2026-10-30",           // assemble
  "student": { "slug", "name_on_page", "campus", "program", "fictional"? },             // skill
  "role_class": { "id", "label", "field", "roles": [ { "id", "label", "first" } ] },    // assemble
  "role": { "id", "label", "postings_n" },                                              // assemble: the first role
  "company": { "name", "url" },                                                         // skill
  "posting": { "url", "title", "names": [skill ids] },                                  // skill; names by assemble
  "gap_sentence": "...",                                                                // skill: the synthesis's one line
  "tree": { "nodes": [ { "id", "name", "area", "place": "trunk"|"shared"|"own", "roles", "state", "line"?, "through"?,
                         "grows", "posting_names" } ],
            "behaviours": [ same shape ], "more": [ { "id", "name", "state" } ] },      // assemble
  "read": { "band", "band_label", "brings": [ { "id", "name", "state", "line" } ], "marked_gaps": [ids],
            "how_you_work": { "shows": [ids], "rest": [ids] } },                        // assemble
  "tracks": [ { "id", "label", "atlas_area" } ],                                        // skill
  "worlds": [ { "n": 1|2|3|"reach", "label", "release", "who", "clear": k, "optional"?, "missions": [card ids] } ],  // assemble
  "cards": [ { "id", "level": 1|2|3|"reach", "track", "title", "ship", "hours", "window",
               "why_role": { "text", "posting_quote" }, "why_company": { "text", "research_file", "url" },
               "why_person": { "text", "profile_quote" }, "atlas_skills": [ids], "classes": [codes], "users"?,
               "sources": [ { "title", "url", "read" } ],
               "shipped"?: date, "changed"?: date, "declined"?: true, "reply"?: { "text", "date" } } ] }   // skill; the last four by the owner
```

The worlds are the levels in order. A world clears after k of its n missions: World 1 at 2, World 2 at 2, World 3 at
1; the Reach is optional and never clears or blocks. `assemble.mjs` writes these defaults, never above the count; a
`clear` the owner set by hand stays. A declined card leaves its world's n.

## The rules `check.mjs` holds

It prints one line per failure and exits 1 on any; a note does not fail. It fails on:

- a map that is not version 2, or that misses `role_class`, `tree`, `read` or `worlds`;
- a card level other than 1, 2, 3 or `"reach"`; Level 1 with other than one to six cards; Level 2 with other than
  three; Level 3 with other than one; more than one Reach card;
- a world list other than 1, 2, 3 (and the Reach when it has a card); a mission that is not a card of that level; a
  `clear` above the world's missions;
- a tree, read or posting id that is not in the role set's taxonomy; more than eight marked gaps, or one off the tree;
- a card missing any of the three why lines, or whose quotes do not occur in `posting.md` or `profile.md`;
- a sentence of more than 20 words in a why line, or a percentage in one (the quotes and the `ship` text are exempt);
- an `atlas_skills` id not in the taxonomy (a skill off the tree, outside "How you work" and "more", prints a note);
- a `classes` code not in the roster (or any class at all when no roster is loaded);
- a card with no source, or a source without a URL or a read date; a Level 3 or Reach card with no users;
- fewer than four or more than six tracks (a track with no Level 1 card is a note, not a failure: R15 lets a track whose core skills all show go without one);
- a `name_on_page` that appears in the intake's background section (section 3), by full name or first name.

`node pipeline/apprentice/check.mjs <slug> <map file>` checks another map file against the folder's posting, profile
and research. It exists for checking a draft by hand, never for a real map. The tests import `checkMap` and
`assembleMap` instead (`tests/web/apprentice.test.mjs`).

## The page: `render.mjs` and `template.html`

One self-contained HTML file, light mode only, no external fonts or scripts: the owner's check view, not the atlas's
drawing. The header carries the name on the page, the role, the company, the posting, the gap sentence, and the line
that the name is made up (and, on the example, that the person is fictional). The grid has the worlds across (Level 1,
2, 3 and the Reach), each with its release label and its "Ship k of these n to clear" line, and the tracks down. A card
shows its title and window closed; open, it shows what ships, the three why lines with their evidence, the skills
(atlas labels, resolved at render time), the classes (roster titles, resolved at render time), the users and the
sources as links. One card is open at a time; the arrow keys move, Enter opens, Escape closes. Under the grid, the
class tree is a plain list by place (trunk, shared, each role's own branch, How you work, more) with each skill's state,
after the read. "Print" lays the worlds out as a one-page summary. The footer reads "Grounded in <postings_n> postings
for <role label> · product-role-atlas · <date>".

## Publishing

`.venv/bin/python -m pipeline.map_publish <slug> <email>` uploads a checked map to the student's private folder
(`maps/<user id>/map.json`); `pipeline.map_feedback` lists the student's feedback. Both read the map from
`data/apprentice/students/<slug>/`, else `pipeline/apprentice/examples/<slug>/`. After the student's feedback, the
owner sets `shipped`, `changed`, `declined`, `reply` or a world's `clear` in `map.json` by hand, runs `assemble`,
`check` and `render`, and publishes again.

## Rules

- **Student data never in the repo**: `data/apprentice/` is gitignored; never `git add -f` it. The example under
  `examples/` is a fictional person and says so on every page.
- **Never fabricate.** Every fact about a company carries a URL and the date it was read; a number without a source is
  left out; "not found" is written down as such. The person's real name is not on the page, and a source title names
  a show or a publication, not a person.
- **Never contact anyone.** The skill drafts no message to a named real person and sends nothing; `who_sees_it.md` names
  kinds of people and public venues only.
- **How to write**, for the why lines and every string the scripts and the page print: sentences of at most 20 words,
  active voice, plain words, American spelling, no percentage.
- **Campus facts in data, not logic**: the roster path, the campus id and the term are in `config.json`.
- **GradBuddy is read, never written.** `new.mjs --import` copies from it and refuses to overwrite a folder here.

## Verify

```
node --check pipeline/apprentice/*.mjs && node --test tests/web/apprentice.test.mjs
node pipeline/apprentice/ground.mjs pmm-nyc && node pipeline/apprentice/assemble.mjs pmm-nyc && node pipeline/apprentice/check.mjs pmm-nyc && node pipeline/apprentice/render.mjs pmm-nyc
git status --porcelain --ignored data/apprentice/     # only "!!" lines: ignored, never tracked
```
