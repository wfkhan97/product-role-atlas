# Spot the real ask

```json
{ "slug": "spot-the-real-ask", "title": "Spot the real ask", "tagline": "Mark what a posting really asks for", "cover": "img/games/spot-the-real-ask.png", "status": "soon" }
```

A short excerpt from a real posting appears. The player marks the phrases that are real requirements and lets the
filler pass ("fast-paced environment", "a passion for our brands", the benefits line). Then the atlas shows how it
read the same lines: what it tagged as skills (found, missed, false alarms), one number about a missed ask, the
filler the player rightly skipped, and a link into the role. The game teaches a student to read a posting the way
the atlas does.

Of the eight games this one has the biggest data question: it needs posting text, which the site does not ship
today. The answer is below under [Data sources](#data-sources). It is also the biggest build; see
[Effort](#effort).

Mocks: `mocks/01-how-it-works.html`, `02-highlight.html`, `03-reveal.html`, `04-run-end.html`, with a PNG of each,
and `cover.png` (the reveal screen). The passage in the mocks is a real excerpt from a Keurig Dr Pepper posting
in `data/raw/jobs_mba/keurig-dr-pepper.json`. Its tags come from running the real MBA patterns over it (method under
[Answer key](#the-answer-key)). Anything that could not be computed is labelled "illustrative" on the screen.

---

## Pitch

Most students read a posting from top to bottom and come away with "they want someone great". Recruiters and
the atlas read it differently: they skip the culture paragraph and the benefits, and pull out the five or six
things the job asks for. This game trains that habit in about three minutes. Each round ends with the atlas's own
reading of the text, and the player sees why a role page can say "21% of Brand Manager postings ask for the office
suite": it reads tens of thousands of postings this way.

## Why it is fun

What works on infisical.com/403, and how this game uses it:

| 403 | Here |
|---|---|
| One verb, one rule | Mark the asks. Skip the filler. |
| Short rounds | Three postings, a soft 45 seconds each, about 3 minutes in all |
| Lasting stakes | Your best rank stays in this browser |
| A rank title, not a number | Skimmer · Keyword spotter · Careful reader · Recruiter's eye · Reads like the atlas |
| Personal leaderboard | Your best rank and your last five runs, kept on this device only |
| An ending that makes the product's point | "The atlas reads 26,887 postings this way, so you don't have to." |

There are two more pleasures. The first is the gotcha: "a passion for our brands" sounds like a requirement and
is not. The second is the reveal: you see the machine's reading line by line, including where it is wrong. The
game does not hide the atlas's misses. A phrase the player marks that the atlas has no rule for ("Strong
analytical aptitude") is shown as "not on the atlas's list" and does not count against them. Being honest here is
part of the fun, and it is cheap trust.

## Rules

1. You get three excerpts from real open postings, one at a time. Each is 4 to 8 lines, under about 700
   characters, cut into short phrases ("chunks").
2. Mark the phrases that are real asks: a skill, a tool, a degree, years of experience, a licence. Click a phrase
   to mark it and click again to unmark it. Drag across several phrases to mark them all. A drag that starts on a
   marked phrase unmarks instead.
3. Leave the filler: talk about the company or its culture, benefits and pay lines, legal lines, and stock phrases
   that describe a temperament rather than something you can show ("fast-paced", "self-starter", "team player",
   "a passion for").
4. Press "Check my read" (or Enter) when you are done. The 45-second clock is a guide. When it runs out the bar
   turns amber and says "Over time. Finish when you are ready." It never ends the round and never changes the
   score.
5. Each posting's reveal shows how the atlas read it. After three postings you get a rank.

## A round, step by step

1. **How it works** (`01`). The one rule, a worked example (a real line, with "cross-functional" found and
   "fast-paced environment" skipped), three rule cards, a "Postings from" field filter (All fields, or one of the
   11 fields), your best rank, and "Start reading".
2. **Posting 1 of 3** (`02`). Eyebrow: "Posting 1 of 3 · Brand Manager". The role is shown and the employer is
   hidden until the check, so the brand name is not a hint. The passage card shows the section heading the excerpt
   came from ("Requirements"). An excerpt with two fragments shows a "…" line where text was left out. Under the
   card: the count of marks, the keys, "Clear marks", and "Check my read".
3. **Reveal** (`03`). Every phrase is restyled:
   - **found**: an ask you marked (green, solid underline, with the atlas's skill name after it in mono);
   - **missed**: an ask you left (amber, dashed outline, with the skill name);
   - **false alarm**: filler you marked (amber tint, struck through);
   - **skipped filler**: filler you rightly left (subtle, struck through, labelled "filler" or "benefits");
   - **not on the atlas's list**: something you marked that the atlas has no rule for (dotted underline, neutral;
     it does not count);
   - everything else is plain text.
   Under the passage are the source line, in the same `.quote .src` style the skill card uses for evidence ("Keurig
   Dr Pepper · <posting title>", linked to the posting), and a legend. In the side panel: the score in words, **one
   fact** about one missed ask (in blue: the share of this role's postings that ask for that skill), a filler note
   (with the atlas's own count when the atlas tags that filler, see [Filler the atlas counts](#filler-the-atlas-counts)),
   the punchline, then "Next posting →" and "Open Brand Manager →" (`#/role/brand_manager`).
4. Postings 2 and 3 work the same way and get harder (see [Difficulty](#difficulty)).
5. **Run end** (`04`). The rank title, large; the five-step rank bar; the run in words; "A new best in this browser"
   when it is one; the punchline; "The roles you read" (one row per posting: role, employer and title, what you
   missed, open postings in blue, "Open →"); then "Play again", "All games" and "Explore the roles".

## Scoring

Each chunk carries one label from the answer key: **ask**, **filler** or **other**.

- **Found**: ask chunks you marked. **Missed**: ask chunks you did not mark.
- **False alarms**: filler chunks you marked.
- **Not on the list**: "other" chunks you marked. They are shown, never counted.

- **Let pass**: filler chunks you did not mark.

A posting's read weighs the two halves of the job equally:

    read = ½ · (found / asks) + ½ · (filler let pass / filler)

A read with no found asks is 0. Every passage has at least one ask and one filler chunk (`evals/game_passages.mjs`
and `evals/game_spot_scoring.mjs` check it), so neither half divides by zero. "Other" chunks stay neutral: a mark
on one is shown as "not on the atlas's list" and changes nothing.

In plain words, as the screen says them:

- the asks half: "You caught 4 of the 5 things this posting asks for";
- the filler half: "You let 2 of the 3 filler lines pass", or "You let all 3 filler lines pass", or "You marked all
  3 filler lines as asks" ("both" for two; with one filler chunk: "You let the one filler line pass" / "You marked
  the one filler line as an ask").

What the rule gives (simulated over today's passages by `evals/game_spot_scoring.mjs`, 4,000 runs per reader):

| Reader | Marks | Mean run read |
|---|---|---|
| Perfect | every ask, no filler | 1.00 |
| Careful first read | each ask with p 0.85, each filler chunk with p 0.20 | 0.83 |
| Keyword reader | each ask with p 0.60, each filler chunk with p 0.50 | 0.55 |
| Mark everything | every chunk | 0.50 exactly |
| Mark nothing | nothing | 0 |

Marking everything catches every ask and lets no filler pass, so it reads 0.5 and lands on the lowest rank.
Marking nothing scores zero.

The run's read is the mean over its three postings. The number is never shown. It picks the rank, with the
thresholds in one place, `RANKS` in `web/games/spot-the-real-ask.js`:

| Rank | Run read |
|---|---|
| Skimmer | below 0.51 |
| Keyword spotter | 0.51 to below 0.64 |
| Careful reader | 0.64 to below 0.80 |
| Recruiter's eye | 0.80 to below 0.98 |
| Reads like the atlas | 0.98 and up |

Where the simulated readers land:

| Reader | Skimmer | Keyword spotter | Careful reader | Recruiter's eye | Reads like the atlas |
|---|---|---|---|---|---|
| Perfect | | | | | 100% |
| Careful first read | 0.6% | 5.0% | 31.2% | 59.7% | 3.5% |
| Keyword reader | 39.4% | 34.6% | 23.4% | 2.5% | |
| Mark everything | 100% | | | | |
| Mark nothing | 100% | | | | |

Keyword spotter starts just above 0.5 so that marking everything stays on Skimmer. Two limits follow from the rule,
not from the thresholds. A careful reader's worst runs read below 0.5: most easy passages have one filler chunk,
so one false alarm there empties that posting's filler half. And a keyword reader reads 0.5 or less in about 4 runs
of 10, so it lands on Skimmer that often. The eval checks the limits as they are (careful on Skimmer in at most 2% of
runs, keyword on Keyword spotter or Careful reader in at least half) and fails when a data refresh moves a reader off
its band; retune `RANKS` and this table together.

The run-end mock is consistent with the thresholds. Its three postings: 4 of 5 asks found and 2 of 3 filler lines
let pass (0.73, the reveal mock); 4 of 5 and 2 of 2 (0.90); 5 of 5 and 2 of 2 (1.00). The mean is 0.88, Recruiter's
eye: "You caught 13 of 15 asks. You let 6 of the 7 filler lines pass." The second and third postings' numbers are
illustrative.

An ask chunk counts once, however many skills it matches. "Proficiency in Excel and PowerPoint" matches Office
suite (twice) and Financial modeling & analysis ("Excel"), and it is one ask. Its **primary skill**, the one named
on screen and used for the fact, is the skill with the most matched characters in the chunk. A tie goes to the skill
with the lower share in the role, the more specific one. Here that is Office suite.

## Difficulty

The build script gives every passage a difficulty from things it can measure:

- **Easy**: a bulleted requirements block ("Requirements", "Qualifications", "What you'll bring"); 3 to 5 ask
  chunks, at least 2 of them outside the generic skills; 1 or 2 filler chunks; 12 chunks or fewer.
- **Medium**: as easy, plus a second fragment from the same posting with filler (a culture sentence or a benefits
  line); up to 18 chunks.
- **Hard**: prose (a "What you'll do" paragraph), filler mixed into the same sentences as asks, or an ask that is
  mostly generic skills; up to 25 chunks.

A run is easy, then medium, then hard, each from a different role and employer (from the chosen field when one is
picked). "Generic skills" are the ones `Atlas.genericSkills()` returns: core in at least half of the 50 MBA roles.
Today that is collaboration, communication, cross-functional leadership, execution, influence, ownership,
structured problem solving and stakeholder management (computed from `web/data/graph_mba.json`).

## End screen and punchline

- The rank title in green (it is the player's own result). The bar shows earlier ranks dimmed and the current
  rank lit.
- The run in words, both halves summed over the three postings: "You caught 13 of 15 asks. You let 6 of the 7
  filler lines pass."
- A new best in this browser says so, with the previous best.
- The punchline: "You read three postings. The atlas reads **26,887** this way, so you don't have to." The number
  is `meta.n_jobs` of `web/data/graph_mba.json` (US postings of the 50 MBA roles, generated 2026-10-14), read at
  run time, so it follows each refresh. Shown in blue because it is the postings' number.
- On each reveal, the shorter form: "The atlas reads 26,887 postings this way, so you don't have to."

## How it sends people into the atlas

- Every reveal has "Open <role> →" to `#/role/<id>`: an MBA role id (`brand_manager`), or a product family id
  (`pm`, `pmm`, `tpm`, `product_ops`, `product_analyst`, `product_owner`) for passages from the Product field.
- The run end lists the three roles with their open postings and "Open →".
- The fact names the skill as the role screen names it ("Office suite (Excel, PowerPoint, Google Workspace)"),
  so the player can find it on the role's skill grid.
- The source line links to the employer's own posting, as the skill card's evidence quotes do.

---

## Data sources

### Where posting text lives (measured 2026-10-18)

| File | What it holds | Size | Text? |
|---|---|---|---|
| `data/raw/jobs/*.json`, `data/raw/jobs_mba/*.json` | raw postings per employer, with the full `description` | 3,423 files, 55,238 postings; 64 MB and 292 MB on disk | **Full text.** 55,212 descriptions of 300 characters or more, median 5,670 characters, 327 million characters in all |
| `data/processed/jobs_mba.json.gz`, `data/processed/jobs.json` | tagged postings (skills, level, country, open) | 16 MB gz (46,567 postings, 26,887 US, 26,213 open US); 16 MB | a 400-character `snippet` only |
| `data/processed/evidence_mba.json` → `web/data/graph_mba/_evidence.json` | example sentences per skill and level group | 1.6 MB; 273 skills, 4,347 sentences | single sentences, 50 to 260 characters |
| `web/data/graph_mba/<role>.json`, `web/data/graph.json` `jobs` | postings shown on the role screen | 31 MB folder; 9.4 MB | `snippet` cut to 180 characters |

So the full text exists only in `data/raw/`, which is far too big to ship (356 MB). The site ships 180-character
snippets and evidence sentences. Evidence sentences cannot make passages. `extract.sentences()` keeps only sentences
that match a skill and drops every one that matches the boilerplate rule, so they hold no filler by construction,
and they are single sentences out of context.

### Recommendation: a pre-built passage file

A new build script, `pipeline/game_passages.py`, reads the raw postings through the same code the atlas uses and
writes one small file, `web/data/game_passages.json`. The browser loads it and does no tagging.

Why pre-built rather than tagging in the browser:

- The text has to be cut out of the raw files anyway. No ship-the-raw-text option exists: 356 MB is about 25
  times the whole `web/data/` folder.
- The answer key is then exactly what `pipeline/extract.py` does: the same `tax.for_roles()` patterns (including
  `patterns_for`), the same `years_required()`, the same `BOILER_RE` and `ABOUT_RE`. Nothing is re-implemented.
- Chunking and the filler labels need a review pass before a passage goes in front of players (see
  [Precision issues](#precision-issues-found-on-real-passages)). A file is reviewable. A runtime result is not.
- Facts for product roles would otherwise mean loading `web/data/graph.json` (9.4 MB) for one number. The script
  writes the share into the passage instead.

The browser could run the patterns, and that is checked. All 2,227 patterns in `pipeline/taxonomy.json` (base and
`patterns_for`) compile as JavaScript `RegExp` with the `gi` flags. On the nine sampled passages (75 spans), Python
`finditer` and JavaScript `matchAll` gave identical spans. Caveats if anyone takes that route later: Python `\w`
and `\b` are Unicode-aware and JavaScript's are ASCII without the `u` flag, and offsets are code points in Python
and UTF-16 units in JavaScript. Neither affected this sample. Keep the browser route for a later "paste your own
posting" mode, which is out of scope here.

### What the file holds

```json
{
  "generated": "2026-10-18",
  "n_jobs": 26887,
  "passages": [
    {
      "id": "Keurig Dr Pepper::1305714505445",
      "set": "mba", "role": "brand_manager", "group": "marketing", "difficulty": "medium",
      "company": "Keurig Dr Pepper",
      "title": "Summer 2027 Intern - Associate Brand Manager - MBA (Emeryville, CA)",
      "url": "https://app.eightfold.ai/careers/job/1305714505445",
      "section": "Requirements",
      "blocks": [
        { "kind": "list", "chunks": [ ["Currently enrolled in a two-year", "o"], [", ", null], ["full-time MBA program", "a", ["masters_mba"], 0.4009] ] },
        { "kind": "gap" },
        { "kind": "para", "chunks": [ ["We offer robust benefits to support your health and wellness as well as your personal and financial well-being.", "f", "benefits"] ] }
      ]
    }
  ]
}
```

A chunk is `[text, label, skills | filler kind, share of the primary skill in this role]`, with label `a` (ask),
`f` (filler) or `o` (other). Separators (`", "`, `"; "`, `" — "`) have a `null` label and cannot be focused. Each block also carries its
full `text`, so a check can confirm the chunks join back to it. The
first skill id is the primary. Skill names come from `web/data/taxonomy_mba.json` / `taxonomy.json`, which the
game loads (44 KB and 177 KB), so names follow the taxonomy.

**Size.** A passage is about 1.2 to 1.8 KB. Twelve per role at most, over 56 roles, is at most 672 passages, about
1 MB, and less in practice (see [Data gaps](#data-gaps)). Target: under 1 MB, loaded only on `#/play/spot-the-real-ask`.

### How passages are sampled and kept short

For each role set (`mba`, then `product`):

1. Iterate `extract.postings(roleset)`: same title rules, same repost dedupe, same registry. Keep postings whose
   processed row says US (`country == "United States"`) and open (`open` is true for the MBA set; the product
   set drops closed postings already).
2. Work on the **raw** description, not `extract.clean()`. The cleaner deletes the boilerplate lines this game
   needs. Normalise whitespace (U+202F, U+00A0, runs of spaces). Skip a posting with mojibake (`â€`, `Ã`): 115 of
   the 26,213 open US MBA postings. Skip one with letters split by the scraper ("L earn", "plu s"), seen on
   Eightfold boards. A heuristic for this: a single letter other than "a" or "I" followed by a space and a
   lowercase run.
3. Find the first headed block: a line matching the section heads (`Requirements`, `Qualifications`,
   `Basic/Minimum/Preferred qualifications`, `What you'll bring/do/need`, `About you`, `Who you are`, `What we're
   looking for`). Take the next 4 to 6 lines and stop at the next head, at any line that looks like a heading, or at
   a line over 260 characters. Keep 300 to 650 characters.
4. For medium and hard passages, append one fragment from the same posting, with a "…" gap: a line that
   `BOILER_RE` or `ABOUT_RE` matches, or one that matches the filler list. Cut it to its first sentence, at most 200
   characters.
5. Chunk (rules under [Chunking](#chunking)), label, and keep the passage if it has 3 or more ask chunks (at least
   2 outside the generic skills), at least 1 filler chunk, at most 25 chunks and at most 700 characters.
6. Pick at most 12 per role, one per employer, with a seeded shuffle (seed 7, as the repo's audits use), and an
   even split of difficulties where the pool allows.
7. Drop any passage id listed in `pipeline/game_passages_deny.json`, a hand-kept veto list with a reason per id.
   Write a review sheet to `data/experiments/game_passages_review.md` (gitignored): every passage with its labels,
   for a person to read before a release.

The pool is large. Over all 26,213 open US MBA postings, 6,132 have a headed block of 4 to 6 lines and 300 to 800
characters with 3 or more tagged skills outside the generic ones. All 50 roles have some; the thinnest are VC
associate (4), M&A integration (4), real-estate asset manager (7) and real-estate acquisitions (8). The filler
requirement lowers these counts; the build script reports the final count per role.

### Chunking

1. Split at `, ; : — – ( )` and at sentence ends. Keep the punctuation as separator chunks.
2. Inside a piece, split again around a tagged or filler span when 3 or more untagged words sit on one side of it.
   Keep a leading preposition with the span ("in a cross-functional").
3. Merge a one-word piece into its neighbour unless that would put an ask and a filler span in one chunk.
4. Never cut through a tagged span. If a span crosses a punctuation split, merge the pieces.
5. A whole sentence that `BOILER_RE` matches (benefits, EEO, pay range) is one filler chunk.

The mock passage follows these rules. Its chunks are the ones the rules give.

## The answer key

**Asks.** Every match of the role set's patterns (`tax.for_roles(set)`, the same compile as
`extract.skills_for()`), minus `yoe_*` skills, plus the `years_required()` span from `YOE_RE` / `YOE_WORD_RE`, which
is labelled as the `yoe_*` bucket that extraction would give. A chunk that overlaps any match is an ask chunk. The
exception is filler that wins, below.

**Filler.** Three sources, in order:

1. Sentences that `extract.BOILER_RE` matches (benefits, EEO, pay, legal, privacy) or `ABOUT_RE` / the employer
   self-description rule. These rules exist and were reviewed for the atlas. The atlas deletes these lines before
   tagging, which is exactly what "boilerplate" means here.
2. A small hand-written filler list, kept in the build script as data (`FILLER`), for phrases inside requirement
   lines that the cleaner does not touch. Starting list, with the share of open US MBA postings (26,213, after
   cleaning) that contain each:

   | Phrase pattern | Share |
   |---|---|
   | `fast[- ]paced` | 22.3% |
   | `passion(ate)?` | 20.3% |
   | `dynamic (environment\|team)` | 4.8% |
   | `self[- ]?starter` | 4.9% |
   | `team ?player` | 3.1% |
   | `growth mindset` | 2.2% |
   | `work ethic` | 2.1% |
   | `wear (many\|multiple) hats` | 0.2% |

   Measured but **not** filler: "attention to detail / detail-oriented" (16.0%), "excellent / strong communication
   skills" (15.2%) and "ambiguity" (12.6%). The first two are asks a student can show, and communication is a
   tagged skill. Treating them as filler would teach the wrong thing. "Ambiguity" is tagged as adaptability (see
   below) and stays an ask unless the owner decides otherwise.
3. The review sheet. A person can move a chunk to filler or to other in the deny or override file.

**Other.** Everything else.

### Filler the atlas counts

Three filler phrases are skills in the atlas. `adaptability` (Adaptability & fast-paced environments) matches
`fast[- ]paced`, `dynamic environment` and `wear (many|multiple) hats`. `ownership` matches `self[- ]starter` (and
`self-motivated`, `hustle`). `collaboration` matches `team ?player`. The game teaches that these are filler. The
recommendation (open question 2): **filler wins** for the stoplist phrases, and the reveal says so honestly. In
the mock: "41% of Brand Manager postings use a phrase like 'fast-paced' or 'navigate ambiguity'. The atlas counts
them, as Adaptability & fast-paced environments; they tell you little." That 41% is the `adaptability` share for
Brand Manager in `graph_mba.json`, which counts all of that skill's patterns, so the wording says "a phrase like".

### Precision issues found on real passages

Script: the MBA patterns, run over requirement blocks of 9 sampled US postings (3 each from Corporate Strategy
Analyst, FP&A Manager and Brand Manager, seed 7). Three of them, with what they show:

**1. Keurig Dr Pepper, "Summer 2027 Intern - Associate Brand Manager - MBA" (Requirements, 515 characters).** The
mock passage. Tags: `MBA` → Master's / MBA; `3–6 years` → 3+ years; `translate findings into` → Insights,
synthesis & recommendations; `Excel` → Office suite **and** Financial modeling & analysis; `PowerPoint` → Office
suite; `cross-functional` → Cross-functional leadership; `fast-paced` → Adaptability.
- One word, two skills: "Excel" also tags financial modelling, which a proficiency line does not ask for. The
  primary-skill rule above names Office suite. The second tag is not shown.
- Recall gap: "Strong analytical aptitude" and "manage multiple priorities" are real asks with no tag (the
  `prioriti[sz]` pattern does not match "priorities"). Hence the neutral "not on the atlas's list".
- Filler the atlas counts: "fast-paced".

**2. AbbVie, "Associate Director, R&D Portfolio FP&A" (Qualifications, 653 characters).**
`Self-starter` → Ownership; `communicat`, `verbal and written` → Communication; `influenc` → Influence; `Workiva`
→ ERP & finance systems **and** GRC platforms; `Power BI` → Analytics tools; `CPA`, `MBA`, `Bachelor`,
`degree in Finance or Accounting`.
- Patterns match word stems ("communicat", "influenc", "problem-solv"). Chunks must grow to whole words, which the
  chunker does.
- One tool, two skill areas (Workiva). Same primary rule.
- Mojibake in the raw text ("Bachelorâs"). This posting is skipped by step 2 of sampling.

**3. West Monroe, "Senior Manager, CFO Advisory - EPM & FP&A Modernization" (What you'll bring, 704 characters).**
`performance management` (inside "enterprise performance management") → People management & coaching, a **false
positive**; `computer science` → CS degree **and** Technical fluency; `financial consolidation` → Financial &
management reporting; `consulting` → Consulting / banking background.
- A false positive in the key would make a careful player's correct skip a "missed ask". The review sheet is where
  this is caught, and the passage is vetoed or the chunk set to "other". The taxonomy is not changed by this game.
- Recall gap: "five full-lifecycle EPM implementations" is the strongest ask in the block and carries no tag.

Other things the sample showed. One PNC block was a comma list of competencies with no sentences; skip blocks
whose lines have no verb or are a single comma list. Headings inside a block ("Preferred qualifications:",
"Physical Requirements", "Work Authorization:") have to stop the block. Across the 6,132 eligible blocks, 79% of
lines (30,302 of 38,556) carry at least one tag. The other 21% are where "not on the atlas's list" will come up.

## Data gaps

- **Thin roles.** VC associate and M&A integration have 4 eligible blocks each before the filler requirement, so
  they may get fewer than 12 passages or none. The field filter must cope with a field that has few passages: it
  fills a run from the field's other roles and says nothing.
- **Recall.** About 1 in 5 requirement lines has no tag. The neutral "other" label keeps this from punishing the
  player, but a passage where most of the real asks are untagged is a bad round. The review pass vetoes those.
- **False positives** in the key, as in example 3. Review, veto, never patch the taxonomy from here.
- **Product set** passages use the product taxonomy (98 shared skills, product wording), so a product round has a
  thinner vocabulary than an MBA round. The facts come from `graph.json` `by_family`.
- **Stale postings.** A passage's posting can close after the build. The weekly refresh drops it on the next build.
  Until then the link may 404. The source line says "posted by <employer>" and links out; it makes no claim that
  the job is open.
- **Fonts in the mocks.** The PNGs were rendered offline, so Geist fell back to the system font. The live site
  loads Geist from Google Fonts.

## Edge cases

- **No found asks** (nothing marked, or only filler and "other" chunks): read 0, and the reveal says "You did not
  mark any of the asks" rather than showing 0%.
- **Marking everything** reads 0.5 on every posting (all asks found, no filler let pass): Skimmer.
- **An ask that is only generic skills** ("excellent communication skills") is still an ask: the atlas counts it.
  The reveal may say "Asked for nearly everywhere: it counts, but it will not set you apart."
- **Work authorisation** ("must be authorized to work in the US without sponsorship") is not a skill and not
  filler for a student on a visa. Label it "other" (neutral) and never use it as filler. A later version could
  give it its own note.
- **Two fragments** from one posting: never more than two, always with a visible "…" gap and a screen-reader
  label "text left out".
- **The same employer twice** in a run: not allowed. **The same passage twice** within a person's last 10 runs: avoid
  it, using a short history of played passage ids in `localStorage`.
- **Drag across a separator**: separators are not chunks; a drag marks the chunks it crosses.
- **Window too narrow**: the site is desktop only (owner's decision 2026-10-13); the passage wraps and nothing else
  changes.
- **Data file fails to load**: the play route falls back to the "Coming soon" page that `play()` shows today.

## Keyboard and accessibility

- Every chunk is a focusable element in reading order: `tabindex="0"`, `role="checkbox"`, `aria-checked`, and an
  accessible name equal to its text. Separators and gaps are not focusable.
- **Tab / Shift+Tab** move between chunks. **Space** marks or unmarks. **Enter** checks the read (from any chunk
  or the button). **Escape** clears the focus ring. Arrow keys **Left / Right** also move one chunk, for people who
  prefer not to use Tab.
- The passage is a `role="group"` with the label "Posting excerpt: mark the real asks". A live region announces
  "5 marked" after each change, and at the check "4 of 5 asks found; 2 of 3 filler lines let pass".
- At the reveal each chunk's state is in its accessible name ("full-time MBA program, found: Master's / MBA";
  "Proficiency in Excel and PowerPoint, missed: Office suite"). The meaning is never colour alone: found has a
  solid underline, missed a dashed outline, a false alarm and skipped filler are struck through, "not on the list"
  has a dotted underline, and each carries a text label.
- The timer is text ("0:27") and a bar, with `aria-hidden` on the bar. It announces nothing while it runs, and once
  at 0 ("Over time. Finish when you are ready."). `prefers-reduced-motion` stops the bar animating; the text stays.
- The focus ring is the site's `:focus-visible` style (`--ring`).
- Contrast: the game uses only the site's tokens (`--primary`, `--warning`, `--secondary`, `--subtle-foreground`)
  in both themes. Labels are `--text-sm` (13 px), the readable floor of the tokens.

## Persistence

- `localStorage` key `game:spot-the-real-ask`, holding `{ rule: 2, best: { rank, read, date }, runs: [last 5 { rank,
  read, found, asks, passed, filler, date, roles }], seen: [last 30 passage ids] }`. `rule` is the scoring rule the
  best and the runs were ranked under. A record without `rule: 2` (saved under the first rule, the F1 of precision
  and recall) keeps its `seen` list and drops its best and runs, which were on another scale; a shape the code does
  not know is read as empty and never throws.
- Every read and write is in `try/catch`, like `store` in `web/app.js`. With storage blocked the game plays the same
  and simply forgets.
- Nothing is sent anywhere. No accounts, no global leaderboard.

## Out of scope

- A global leaderboard, sharing, accounts.
- Pasting your own posting (it would need the patterns in the browser; see the recommendation above).
- Phone layout (the site is desktop only).
- Any change to the matcher, the taxonomy, the cleaner, `extract.py`, or the existing data files.
- Model-labelled filler (see open question 3).
- Timed pressure. The clock never ends a round.

## Open questions for the owner

**1. Showing posting text in a public game.** The excerpts are copied from employers' careers sites. The role
screen already shows single sentences with the employer and a link (`.quote` on the skill card). This game shows
up to about 700 characters, including filler lines.
- **A. Short excerpts with the employer and a link (recommended).** At most 700 characters from one posting, at
  most two fragments, shown with the employer and a link to the posting, as the evidence quotes do. Open postings
  only, refreshed weekly. It is close to what the site does today, a bit longer.
- B. Excerpts with the employer hidden at play time and shown at the reveal. Same as A for display rights. This is
  what the mocks do, for game reasons; it can sit on top of A or C.
- C. Evidence sentences only (already published in `_evidence.json`). No new display question, but those
  sentences hold no filler by construction, so the game loses its rule. Not viable without A.
- D. Ask a lawyer before shipping. Slowest. Worth it if the site is going to be promoted widely.

**2. Filler that the atlas tags as a skill** ("fast-paced" → Adaptability, "self-starter" → Ownership, "team
player" → Collaboration).
- **A. Filler wins, and the reveal says the atlas counts it, with its share (recommended).** The game teaches the
  useful habit and is honest that the atlas counts these phrases.
- B. The atlas wins: these are asks. Consistent with the role screen, but it teaches that "fast-paced" is a
  requirement.
- C. Neutral: those chunks do not count either way. Safe, but the best teaching moment is lost.

**3. Where filler labels come from.**
- **A. The cleaner's rules (`BOILER_RE`, `ABOUT_RE`) for sentences, a hand-kept phrase list for in-line filler,
  and a human read of the review sheet before each release (recommended).** No cost, reviewable, and it uses rules
  the atlas already trusts.
- B. A heuristic: any sentence with no skill match is filler. Cheap, but wrong about 1 time in 5 (21% of
  requirement lines have no tag yet are often real asks).
- C. A model pass with the existing audit tooling (`pipeline/experiments/skill_audit.py` and `decisions_audit.py`
  need `OPENAI_API_KEY`; the depth tools use `OPENROUTER_API_KEY`), labelling chunks ask / filler / other and caching
  answers in `data/experiments/`. Better recall, but paid and one more thing to evaluate. Not run for this package.
  Worth it later if a "Hard" tier needs prose passages at scale.

**4. Overlap with "What does it ask for" (`games/what-it-asks/`, "tap the real asks, let filler pass").**
- **A. Keep both and share `game_passages.json` (recommended).** That game is the 403 reflex format, phrases one
  at a time. This one is reading a whole excerpt in context. Whichever ships second reuses the file and the filler
  list.
- B. Merge them into one game with two modes.
- C. Build only one. If so, build this one second, because its data work is the bigger part.

## Effort

**The biggest of the eight games.** About 4 to 6 focused days for one builder:

| Part | Days |
|---|---|
| `pipeline/game_passages.py`: sampling, normalising, chunking, labelling, shares, deny list, review sheet | 1.5 to 2 |
| Reading the review sheet, tuning the filler list and the chunker, vetoing passages | 0.5 to 1 (needs the owner or a careful reader) |
| `web/games/spot-the-real-ask.js`: four screens, click and drag, keyboard, live region, scoring, persistence | 1.5 to 2 |
| Styles, both themes, focus and reduced motion | 0.5 |
| Checks: a node script that validates `game_passages.json` (labels, offsets, sizes); the repo's evals | 0.5 |
