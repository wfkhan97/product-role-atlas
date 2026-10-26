# What GradBuddy reads from the atlas

One page for another program (GradBuddy, its jobs back end, an agent) that reads the atlas's files and functions
(PLAN.md v16, step 10). The frame: **the atlas states facts and matches; GradBuddy synthesizes and acts.** Everything
below is a fact or a match. Nothing here runs a model at runtime, and nothing a person types or drops leaves their
browser except what the privacy rule at the end names.

## Stable and not

**Stable** (a change is a new version and a PLAN.md section): skill ids, sub-skill ids, role ids, field (group) ids,
the kinds table and the forms table, the row statuses, the tier names, the band names, the file paths below, the
function signatures below. **Not stable** (they move with every data refresh and every editorial pass): shares and
counts, the generated dates, the postings in a role file, the editorial strings (`what`, `reads_as`, `line`, ladders,
build steps, blurbs), the patterns, the band cut points. Read ids and statuses as keys; read numbers and sentences as
today's values.

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

## The classes: `web/catalog.js`, `web/data/sp27_campus.json`

`sp27_campus.json` is a list under `campuses`; each campus has `id`, `label`, `term`, `term_label`, `programs` (each
with its v15 group), `relevance` (the thresholds: `high`, `medium`, the share of a role's core and common asks a course
text names), `signin_domains`, `catalog`. The picker's pure functions (`Catalog.relevanceScore`, `relevanceBand`,
`gapsCovered`, `sortCards`, `topCovering`) load in node with `require("web/catalog.js")({})`. The roster itself is in
the `gradbuddy-catalog` Supabase project behind row-level security.

## The privacy rule

What never leaves a browser: the resume, the syllabus, the pasted posting, every skill list, every file name, the
person's ratings. What leaves it: an email a person types into a waitlist box, with the source, the role on screen, the
stage, the program group and the fields picked (`pipeline/sql/2026-10-25_capture.sql`, `waitlist`); and anonymous
funnel events, a name from a closed list of eighteen with a per-browser-session random id, the stage, the program
group and a role or field id (`events`). A program that reads the atlas inherits the rule: nothing it builds on these
files may send a person's text anywhere the atlas does not.
