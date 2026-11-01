# What GradBuddy reads from the atlas

One page for another program (GradBuddy, its jobs back end, an agent) that reads the atlas's files and functions
(PLAN.md v16, step 10). The frame: **the atlas states facts and matches; GradBuddy synthesizes and acts.** Everything
below is a fact or a match. Nothing here runs a model at runtime, and nothing a person types or drops leaves their
browser except what the privacy rule at the end names.

## Stable and not

**Stable** (a change is a new version and a PLAN.md section): skill ids, sub-skill ids, role ids, field (group) ids,
the kinds table and the forms table, the row statuses, the tier names, the band names, the file paths below, the
function signatures below, the column order and the flag bits of a posting row in `jobs_open.json`, the class and
professor columns of the catalog file. **Not stable** (they move with every data refresh and every editorial pass):
shares and counts, the generated dates, the postings in a role file, the rows of the open postings file, the roster
rows, the tag lists, the editorial strings (`what`, `reads_as`, `line`, ladders, build steps, blurbs), the patterns,
the band cut points. Read ids and statuses as keys; read numbers and sentences as today's values.

## The MBA index: `web/data/graph_mba.json`

Always loaded, about 2 MB. Keys: `meta`, `clusters`, `families`, `levels`, `level_labels`, `ladders`, `groups`,
`roles`, `skills`, `edges`, `skill_ids`, `sub_ids`, `sectors`, `funds`; `jobs` is empty (the postings are in the role
files). US postings only; a closed posting stays in the statistics for a year and carries `open: false`.

- `meta`: `generated` (date), `country`, `n_jobs`, `n_open`, `n_companies`, `companies`, `kinds` (the kinds table:
  `method`, `practice`, `behaviour`, `technical`, `knowledge`, `tool`, `credential`, each with `label`, `form`,
  `meaning`, `how`), `forms`, `entry` (the words of the entry mark), `evidence` (the path of the evidence sentences file).
- `groups`: the 11 fields, `{ id, label, families: [role ids] }`. The field named `product` opens the product set.
- `roles.<role id>`: `label`, `group`, `n`, `n_open`, `n_companies`, `small`, `file` (the role file's path), `ladder`
  (`corporate` · `bank` · `consulting`), `by_level`, `by_ladder`, `defining` (`[{ id, share, elsewhere }]`: on most of
  the role's postings and rare elsewhere), `asks` (`[{ id, share }]`, the rest, most asked first, credentials apart),
  `credentials`, `entry` (per ladder: `mba`, `mba_intern`, `pre_mba`, `pre_mba_intern`, each `{ n, posted }`),
  `sponsorship` (`{ yes, no, silent }`, postings that say they sponsor a visa, say they do not, say nothing; present once
  the data carries the fact), `covers`, `covered_by`, `depth` (per ladder: `asks`, the licences and degrees five
  employers name at entry, and `build`).
- `skills[]`: `id`, `name`, `cluster` (the skill area), `kind`, `share`, `n`, `by_family` (share per role),
  `by_level`, `by_ladder`, `by_group` (per employer group), `what` (one sentence), `subskills` (`[{ id, name, example,
  share }]`), `ladder` (rungs keyed by industry ladder then level; a rung the postings do not support is absent),
  `build` (steps per ladder, each `{ kind, text, source_title, url, grounding }`), `how_shown` (the evidence entry:
  `form`, `artefacts`, `counterparts`, `measures`, `verbs`, `shown_by`), `fields` (per field id, and per role as
  `role:<role id>` where the role has an override: `reads_as`, `shown_by`, `line`, plus the postings' side `share`, `n`,
  `with`, `subs`), `signals` (the product skills' hand-written lines, a fallback), `axes`.
- `edges[]`: `{ source, target, n, lift, jaccard }`, skills asked for together.
- `skill_ids`, `sub_ids`: the arrays a role file's integer lists index into.

## A role's postings: `web/data/graph_mba/<role id>.json`

`{ family, label, generated, n_jobs, jobs }`. Each posting: `id`, `company`, `group` (employer group), `title`,
`family`, `level` (one scale: `associate` · `mid` · `senior` · `staff` · `group` · `director` · `vp` · `cpo`),
`ladder`, `entry` (`mba` · `pre_mba` · null), `intern`, `entry_src`, `w` (the company-balanced weight: one employer is
at most 5% of a role), `open`, `location`, `country`, `remote`, `sector`, `industry`, `category`, `url`, `yoe`,
`sponsorship` (`yes` · `no` · null, once the data carries it), `skills` (integers into `skill_ids`), `sub` (integers into
`sub_ids`), `snippet`. `graph_mba/_evidence.json` holds example sentences per skill and level group, quoted from
postings as the employer wrote them (never through the spelling map).

## The product set: `web/data/graph.json`

One file with the same shape as the index plus its `jobs` inline (worldwide, decoded the same way through `skill_ids`
and `sub_ids`). Six families (`pm`, `tpm`, `pmm`, `product_owner`, `product_analyst`, `product_ops`); in the atlas
they are addressed as `product.<family>`. Its skills carry `evidence` inline and `signals`. Its field entries are the
`product` key only.

## The taxonomy and the sub-skills: `web/data/taxonomy_mba.json`, `taxonomy.json`, `subskills_mba.json`, `subskills.json`

`taxonomy*.json`: `{ clusters, skills: [{ id, name, cluster, kind, patterns }] }`, the part of `pipeline/taxonomy.json`
each role set tags with; the patterns are case-insensitive regular expressions, the same ones the pipeline runs.
`subskills*.json`: `{ <skill id>: [{ id, name, patterns, example }] }`. The web files are written by the graph build;
`pipeline/taxonomy.json`, `evidence.json` and `fields.json` are the sources.

## The matcher in node: `web/match.js`

```js
const Matcher = require("web/match.js");
const m = Matcher.createMatcher({ taxonomy, subskills, graph, roles, distinct, behaviours });
```
`graph` is the index with the role's postings in `jobs` (skills decoded to ids); `roles` is `web/data/roles_mba.json`
for the MBA set (omit for the product set); `distinct` and `behaviours` come from the bands file's `scoring` so the
bands hold. Then:

- `m.match(resumeText, { jobs, familyJobs, label }, { level, ladder })` → `{ overall, core, common, breadth, depth,
  rows, gaps, whatIf, whatIfSkills, creds, industries, behaviours, targetLevel, standing, profile, parsed, unmapped,
  covered, subs, ai, req }`. `overall` is a score in [0, 1] that is **never shown as a percentage**; show
  `Matcher.bandOf(overall, bands, group)` instead.
- A row of `rows`: `id`, `slot` (the id, or `__domain` · `__ai` for the two grouped asks), `name`, `slotName`, `kind`,
  `tier` (`core` · `common` · `diff`), `w` (the share that weighs it), `status`, `strength`, `credit`, `depth`, `subs`,
  `lines` (the resume lines that showed it), `carriers`, `through`, `throughName`, `carriersFallback`, `build`,
  `signals`. **Statuses**: `evidenced` (a line of work shows it) · `transferable` (shown in another field's words) ·
  `presumed` (from a role the person held at or above the level; part credit) · `thin` (named, not shown) · `through`
  (a behaviour, shown through a carrier the resume evidences) · `gap`.
- `m.tag(m.parseResume(text))` → `{ <skill id>: { strength, lines, subs, via, direct } }`, the raw read of a resume.
- `m.tagPosting(text)` → `{ found: { <skill id>: hits }, subs, lines }`, a posting read as the pipeline reads one.
- `Matcher.pickCarriers(skill, jobs, keys, isCarrier)` → `{ ids, shares, fallback, source }`, the carriers of a
  behaviour or a practice on a set of postings; `keys` is `["role:<role id>", <group id>]`.
- `Matcher.bandOf(score, bands, group)` → `different` · `related` · `in_range` · `strong` · `null` (a group with no bands).

**The bands**: `web/data/bands_mba.json`, `bands.json`, written by `evals/calibrate.mjs`: `scoring` (`distinct`,
`behaviours`), `in_range` and `strong` (two lines shared by every role), `related` (one line per group), `no_bands`,
`group_of`. On screen the bands read New to the field · Relevant foundation · Qualified for the role · Strong match.

## The sentences: `web/evidence_text.js`

```js
const T = require("web/evidence_text.js").create({ kinds });   // kinds: meta.kinds of the index
T.line(skill, keys)   // { text, source: "field" | "signals" | "template", field, role }
T.reads(skill, keys)  // what the skill means in the field, or null
T.gap(row, skill, { shown, nameOf })   // what to do about a gap, by kind
T.thin(skill)         // "add a number"
T.summary(skill)      // one sentence for a skill with no field entry
T.how(kind)           // the kind's one rule
```
`keys` is `["role:<role id>", <group id>]`: the role's override first, then its field. Every sentence is built from the
data; none is written in a screen.

## The readers in the browser: `web/atlas.js`

`Atlas.index()`, `Atlas.product()`, `Atlas.role(id)` (one role: `{ role, set, jobs, skills, skillById, subs, edges,
ladders, kinds, evidence }`), `Atlas.grid(R, jobs)` (rows by share tier: over half, a quarter to a half, one in ten to
a quarter; two columns, asked at every level or more at senior levels), `Atlas.areas(R, jobs)` (the grid by skill
area with the behaviours in one last panel), `Atlas.carriers(R, jobs, skillId)`, `Atlas.readCourse(text)` and
`Atlas.readPosting(text)` → `{ found, teaches, named, other, subs, lines }` (by kind: only `method`, `technical`,
`knowledge` and `tool` skills can be taught or covered; a `behaviour` or a `practice` the text names is `named`),
`Atlas.roughFit(text)` (a resume against every role from the index alone), `Atlas.us(text)` (American spelling on
screen; `web/data/spelling_us.json`), `Atlas.fieldKeys(R)`. In node: `require("web/atlas.js")({ load, Matcher })`.

## The open postings: `web/data/jobs_open.json`, `jobs_meta.json`

Every open US posting of both role sets in one file, for Find jobs (`#/jobs`; PLAN.md v19, step B4). Written by
`.venv/bin/python -m pipeline.jobs_open` from the committed graphs after `build_graph`; `run_all.sh` and the refresh
workflows run it. No network, no model: the same graphs give the same bytes. Only `#/jobs` loads the file (7.4 MB
raw, 1.8 MB gzipped); home reads `jobs_meta.json`, the counts alone.

**What is in it.** Every product posting is open: `graph.json` drops closed ones. A product posting is in when its
country is `United States`. An MBA posting is in when its row in `graph_mba/<role id>.json` has `open` true and the
country of the index's `meta`. At the Oct 25 graphs: 31,965 rows (6,015 product, 25,950 MBA), 1,508 companies, 56
roles. No pay (no posting carries one), no posting date, no snippet, no sub-skills, no years of experience.

**The shape.** Column-oriented. The tables are lists, and a row indexes into them:

- `companies[]`: `{ name, group, sector, url_prefix }` (`url_prefix` is the longest common prefix of the company's
  URLs, cut at a `/`; `""` when there is none).
- `locations[]`, `titles[]`: strings. `roles[]`: the site's role ids (`product.<family>` for the product set);
  `role_labels` names each one.
- `skill_ids[]`: the union of both sets' ids, sorted, so a row's skills decode without the graphs.
- `levels` (`product`, `mba`: the eight level ids of each set), `level_labels` (the same, with words), `flags` (the bit
  names below), `generated`, `country`.
- `rows[]`, sorted by set then by number. Each row is, in this order:
  `[num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, flags, skills, url, firstSeen]`. `levelIdx` indexes
  `levels[<set>]`; `skills` are indexes into `skill_ids`, sorted; `url` is the posting's URL after its company's
  `url_prefix`; `firstSeen` is a date or null.
- The flag bits: `1` MBA set (clear for the product set), `2` internship, `4` remote, `8` MBA entry, `16` bachelor's
  entry (`pre_mba`), `32` says it sponsors a visa, `64` says it does not.

`Jobs.rowsOf(file)` (`web/jobs.js`; `require("web/jobs.js")` in node) expands the file once into row objects:
`{ id, set, role, title, company, group, sector, level, entry, intern, location, remote, sponsorship, url, skills,
first_seen }`. The id is `p<num>` for a product posting, where `num` is its index into `graph.json` `jobs`. It is
`m<num>` for an MBA posting, where `num` is its row id in the role file. So a row joins back to the graphs. `set` is
`product` or `mba`; `entry` is `mba` · `pre_mba` · null; `sponsorship` is `yes` · `no` · null; `url` is whole again;
`skills` stay indexes into `file.skill_ids`. `first_seen` is null on every row today: `build_graph` carries it into
the MBA role rows from v19 on, but the graphs on disk predate that. It fills once `build_graph` runs for both sets and
`jobs_open` runs after them. There is no "newest" order until then.

`jobs_meta.json`: `{ generated, n_open, n_companies, by_set: { product: { n_open, n_companies }, mba: { … } }, n_roles }`.

**Stable**: the two paths, the key names of both files, the order of a row's ten columns, the flag bits and their
names, the id forms `p<n>` and `m<n>`, the keys of a `rowsOf` row. **Not stable**: the counts, the order of the tables
(first-seen order), `generated`, the strings in `titles` and `locations`, and `first_seen`, which turns from null to a
date at the next rebuild.

## The catalog as public files: `web/data/catalog/cornell_tech.json`, `cornell_tech_tags.json`

The Spring 2027 roster the class picker reads (`#/classes`; PLAN.md v19, step B3). Two static files, committed; no
database, no session. The campus entry in `sp27_campus.json` names them (`catalog_file`, `tags_file`). A second
campus is a second pair of files, never a code change.

**`cornell_tech.json`** (about 660 KB): `_note`, `campus`, `term`, `generated`, `rosterDate` (the last rescrape), and
the tables:

- `classes[]`, one row per class code, with the columns the picker selects (`Catalog.CLASS_COLS`), in this order:
  `code`, `subject`, `catalog_nbr`, `title`, `career`, `description`, `outcomes`, `prereq`, `credits`,
  `grading_basis`, `location_scope`, `eligibility_category`, `enrollment_limited_to`, `also_in_ithaca`, `roster_url`,
  `roster_syllabus_read`, `sp27_instructor_matches_syllabus`, `grading_summary`, `last_scraped`.
- `crosslists[]`: `{ code, other_code }` (an `other_code` outside the file can occur; the picker drops it).
- `sections[]`: `class_nbr`, `class_code`, `component`, `section`, `location`, `instruction_mode`, `topic`,
  `open_status`, `start_dt`, `end_dt`, `session`, `credits`, `notes`. `meetings[]`: `id`, `class_nbr`, `pattern`,
  `time_start`, `time_end`, `facility`.
- `instructors[]`: `{ class_code, instructor_name, professor_slug, term }` (`professor_slug` null when the person has no
  profile). `priors[]`: `{ class_code, term, title, instructors, locations, sections }`, the earlier offerings.
- `professors[]` (`Catalog.PROF_COLS`): `slug`, `name`, `identity`, `title`, `affiliation`, `expertise`,
  `official_profile_url`, `personal_site_url`, `scholar_url`, `linkedin_url`, `profile_md`.

**Never in it**: `roster_syllabus_md` (the prior-term syllabus digest, matcher input only) and `research_note_md`. The
export asserts that neither name appears in the public text, and `tests/web/catalog_files.test.mjs` checks it again.
The digest lives only in `web/data/local/catalog_full.json`, gitignored, on the machine that ran the export.

**`cornell_tech_tags.json`** (about 40 KB): `_note`, `campus`, `term`, `generated`, `rule`, `taxonomy_sha256`,
`taxonomy_product_sha256`, and `tags`: per class code, `{ found: [skill ids], teaches: [skill ids] }`. `found` is every
skill the class text (description, outcomes and the digest) names outright. `teaches` is the subset of a kind a class
can teach: `method`, `technical`, `knowledge`, `tool`, as `Atlas.readCourse` splits them. So a behaviour or a practice
the text names is in `found` and never in `teaches`. The strength rule: a skill stays only when the text names it
(strength 1 or more); a sub-skill hint alone does not count. The two hashes are the sha256 of `web/data/taxonomy_mba.json`
and `web/data/taxonomy.json` at the time of the tags run. A mismatch with the files on disk means the taxonomy changed
after that run. The test then fails ("stale tags: rerun node pipeline/catalog_tags.mjs"). A reader should treat the
tag lists as stale, since an id may have moved or gone.

**Rebuilt by** two commands, in this order, never by hand (CLAUDE.md). `.venv/bin/python -m pipeline.catalog_export
[path to SP27_cornell_tech]` runs the catalog's own loader in its dry-run mode on the research folder and writes both
catalog files. Then `node pipeline/catalog_tags.mjs` reads the local copy and writes the tags. The tags also need a
rerun after any taxonomy change.

**Stable**: the two paths, the table names, the class, section, meeting, instructor, prior and professor columns, class
codes as keys, `found` and `teaches`, the two hash keys. **Not stable**: the rows (a rescrape), `rosterDate`,
`generated`, the tag lists (a taxonomy change), the hashes, the text of `profile_md`.

## The classes: `web/catalog.js`, `web/data/sp27_campus.json`

`sp27_campus.json` is a list under `campuses`; each campus has `id`, `label`, `term`, `term_label`, `pre_enrollment`,
`programs` (each with its v15 group), `eligibility` (the words per category), `relevance` (the thresholds `high` and
`medium`: the share of the chosen roles' core and common asks a class names; 0.270 and 0.083 for Cornell Tech),
`field_subjects` (per field id, the roster subjects whose classes belong to that field: the sorts' tie-break, data not
code), `catalog` (true once its files exist), `catalog_file` and `tags_file` (the two public files above). There is no
`signin_domains` any more: the classes path has no sign-in, no Supabase and no row-level security. The picker reads the
two files and nothing else; `CONFIG.CATALOG_SOURCE` is `"files"`, and the Supabase URL and key in `web/config.js` serve
`capture.js` alone.

The pure functions load in node with `require("web/catalog.js")({})`:

- `Catalog.relevanceScore(found, rows, generic)` → `{ score, matched }`: the share of the roles' core and common asks
  (`rows`, `[{ id, name, tier, w }]`) that the tags' `found` names, the generic skills (`Atlas.genericSkills`) at half
  weight. The screen shows the score as a band, never as a number.
- `relevanceBand(score, thresholds)` → `low` · `medium` · `high`, by the campus entry's `relevance`.
- `gapsCovered(teaches, gaps, generic)` → the gap rows the class's `teaches` covers, generic skills left out, core
  first, then by share.
- `combineRoles(fits)` → `{ gaps, rows, labels }` for "Match to roles" with several roles: a skill is a gap when any
  role leaves it open, its weight the sum of those roles' shares over the number of roles, core when core for any;
  `gaps` is null with no résumé on file.
- `inField(card, subjects)` and `fieldSubjects(campus, groupIds)`: the field tie-break from `field_subjects`.
- `sortCards(cards, mode, info, subjects)`: `code` (the roster's order); `relevance` (band, score, field, code); `gaps`
  (the share of the gaps covered, score, field, code; by score alone when no card covers a gap).
- `topCovering(cards, info, n, subjects)`: the n classes covering the most gap weight, none that covers nothing.
- Also `collapse` (cross-lists into one card), `cardTags`, `gradingChip`, `eligibilityLabel`, `matchField`,
  `instructorList`, `instructorCards`, `instructorGaps`, `meetingLines` and `matcherText`.

The ratings, the roles chosen and the campus stay in the browser.

## Consumers

The first consumer is the apprentice map generator in `gradbuddy/` (PLAN.md v18; its brief is
`../GradBuddy Project/discovery&research/handoffs/2026-10-26_apprentice_map_generator_brief.md`): an atlas-grounded
"shadow apprentice map", a five-level project ladder for one student and one role. It reads these files by path:

- `web/data/roles_mba.json`: the 50 roles with their labels, groups, title rules and ladders, to name the role and
  its grades.
- `web/data/taxonomy_mba.json`: the skills the postings are tagged with (id, name, area, kind, patterns), the
  vocabulary every level of the ladder is written in.
- `web/data/graph_mba/<role>.json`: one role's postings with their skills, levels and employers, the evidence of what
  the role asks for at each grade.
- `web/data/subskills_mba.json`: the sub-skills per skill, so a project can be aimed at the specific part postings
  name.
- `web/data/sp27_campus.json`: the campuses, their programs and pre-enrollment dates, so a ladder can point at the
  term's classes.

A consumer reads ids and statuses as keys and numbers and sentences as today's values ("Stable and not" above), and
inherits the privacy rule below.

## What the atlas reads from GradBuddy: the apprentice map

The one thing that flows the other way (PLAN.md v20). GradBuddy's generator (`gradbuddy/apprentice/`, the
`/apprentice-map` skill) writes one `map.json` per student, by hand and offline; the owner publishes it to the
private bucket `maps` under the person's user id (`pipeline.map_publish`); the atlas reads it with the person's own
session on `#/map` (`web/auth.js`, `web/map.js`) and draws it. The atlas never writes to it. A map is never in a
repository: it quotes one person's résumé.

**The file, version 2.** The keys the atlas reads; anything else is the generator's and ignored.

- `version` (2), `published`, `atlas_generated` (dates).
- `student`: `slug`, `name_on_page` (made up; the only name on a page), `campus`, `program`, `fictional` (the
  example only).
- `role_class`: `id`, `label`, `field`, `roles[]` (`id`, `label`, `first`). `role` (`id`, `label`), `company`
  (`name`, `url`), `posting` (`url`, `title`, `names`: the skill ids the posting names), `gap_sentence`.
- `tree`: `nodes[]` (`id`, `name`, `area`, `place` trunk · shared · own, `roles`, `state` one of `shows` ·
  `shows in other words` · `must evidence better` · `must build`, `line` (the résumé line that showed it, or
  absent), `through`, `grows`, `posting_names`), `behaviours[]` (the same shape), `more[]` (`id`, `name`, `state`).
- `read`: `band` (the matcher's band id), `band_label` (its words), `brings[]` (`id`, `name`, `state`, `line`),
  `marked_gaps` (skill ids, at most eight).
- `worlds[]`: `n` (1, 2, 3 or `"reach"`), `label`, `release`, `who`, `clear` (k), `missions` (card ids).
- `cards[]`: `id`, `level` (1, 2, 3 or `"reach"`), `track`, `title`, `ship`, `hours`, `window`, `why_role` (`text`,
  `posting_quote`), `why_company` (`text`, `research_file`, `url`), `why_person` (`text`, `profile_quote`),
  `atlas_skills` (skill ids), `classes` (roster codes), `users`, `sources[]` (`title`, `url`, `read`), and, set by the
  owner at a republish, `shipped` (a date), `changed` (a date), `declined` (true), `reply` (`text`, `date`).

The atlas resolves a skill's `what` and what it means in the field, an area's label and a class's title from its
own index by id; a node carries `name` so an id the taxonomy no longer has still draws.

**Stable**: the key names above, the four states, the three places, the world ids, the card id form (lower-case
letters, digits and hyphens), the bucket path `maps/<uid>/map.json` and the feedback path
`maps/<uid>/feedback/<card id>.json`, the feedback object (`card`, `choice` one of `build` · `not` · `change`, `note`
at most 500 characters, `date`). **Not stable**: every value, the k defaults, the example's cards.

**The privacy rule for maps.** A map quotes one person's résumé and names their target company; only that person
reads it, with their own session, from their own folder; the owner writes it with the service role. What goes up
from the atlas is one feedback file per card: the card id, the choice, the note, the date. Never the résumé, a skill
list or a file. The policies are `pipeline/sql/2026-11-03_maps.sql`; the two scripts need the service-role key of the
project the site points at and never run without it.

## The privacy rule

What never leaves a browser: the résumé, the syllabus, the pasted posting, every skill list and skill id, every file
name, the person's ratings, the roles chosen, the networking list and its drafts. Nothing uploaded leaves the browser.
No screen asks for a password, and the email is routing, never a credential.

What leaves it, and only this (`web/capture.js`; the tables in `pipeline/sql/2026-10-25_capture.sql`,
`2026-10-26_cohort.sql` and `2026-10-31_doors.sql`):

- **The door email and the intake email**, one `waitlist` row each: the email, the `source` (where the box was:
  `door` for the door at `#/`; `intake_skills`, `intake_classes` and `intake_network` for the coming-soon box at a
  verb's foot; the six sources of before, `show` · `build` · `ways` · `fit` · `start` · `classes`, for the box on the
  rail, the fit screen and the picker), the `surface` (`door` · `jobs` · `skills` · `classes` · `network`), the role
  on screen (`role_id`) and, when the screen knows them, the stage and the program group (the door's "What are you
  studying?" answer rides as the program). The sentence box of v18 ("the role you want, in your words") is on no
  screen any more; its `note` column stays for the old rows. A second click with the same email and source is not a
  second row.
- **Anonymous funnel events**, one `events` row each: a name from the closed list in `capture.js` (the nineteen of
  before, then `door`, `door_passed`, `home_jobs`, `home_skills`, `home_classes`, `home_network`, `intake_skills`,
  `intake_classes`, `intake_network`), a random id made once per browser session (`sessionStorage`, never written
  elsewhere and never joined to an email), the stage, the program group, a role or field id and the surface. An event
  is a count: it carries no text and no skill id.
- **The Tally forms** (`web/doors.js`, the ids in `CONFIG.TALLY`): once the owner sets an id, the door and the intake
  boxes are Tally embeds, and the answer posts to Tally, never through the atlas. The embed carries four hidden fields
  and nothing more: `surface`, `source`, `role`, `email` (pre-filled from the door). The door's form returns to
  `#/home?email=…&where=…`, which the screen reads once and removes from the URL. With no id, or when the embed has not
  loaded in three seconds, the native form sends the same row through `Capture.waitlist`.

Neither path ever sends a résumé, a syllabus, posting text, a skill id or a file name. A program that reads the atlas
inherits the rule: nothing it builds on these files may send a person's text anywhere the atlas does not. The one
private thing on the site, the apprentice map, has its own rule above: read by its person alone, written by the owner,
and only a feedback file goes back.
