# pmm-nyc · the tracked example

**What is fictional:** the person. Priya Natarajan does not exist. Her background (three years of business development at
an unnamed B2B logistics-software reseller in Mumbai, the partner program, the 4,000-member WhatsApp community and its
weekly brief, the Johnson Cornell Tech MBA class of 2027, twelve hours a week) was invented on 2026-10-26 for this
example, so the repository can be public and the Oct 31 demo has a map before a real student's exists. `intake.md`,
`profile.md` and the page itself say so.

**What is not fictional:** the company (Agentio, New York), the posting ("Product Marketing Manager, Narrative",
published on Agentio's Ashby board on 2026-10-20 and quoted in `posting.md` as published), every source in
`research/` and on every card (each with its URL and the date it was read, 2026-10-26), the Spring 2027 Cornell Tech
roster the classes come from, and the job atlas the role's skills and the person's read come from (postings as of
2026-10-25).

This example is held to every rule in `pipeline/apprentice/check.mjs`, and `tests/web/apprentice.test.mjs` checks it
in CI. Rebuild it from the repo root with
`node pipeline/apprentice/ground.mjs pmm-nyc && node pipeline/apprentice/assemble.mjs pmm-nyc && node pipeline/apprentice/check.mjs pmm-nyc && node pipeline/apprentice/render.mjs pmm-nyc`.

Date: 2026-10-26.

**Round 2 (2026-10-31), the map as a skill tree and a quest map.** The intake now names a class of four marketing
roles (`roles: pmm, marketing_manager, growth_manager, brand_manager`), Product Marketing Manager first. `map.json` is
version 2. The cards were edited by hand: the Level 4 card (Claimkeeper) became the Reach, the Level 5 card (a public
measurement standard) left the map, and every why line was rewritten to sentences of 20 words or fewer with no
percentage, keeping its meaning and every quote. One source title that named a person became "The CPG Guys podcast,
the Agentio episode". `assemble.mjs` wrote the rest from `grounding.json`: the class tree (19 nodes: 3 trunk, 6
shared, 10 own), the read, and the worlds. `who_sees_it.md` follows the cut.

**Moved into the atlas (2026-11-04).** The example came over from GradBuddy's `apprentice/examples/pmm-nyc/` with
the generator, every file as it was, and was regrounded on the atlas after the transferable reach (#133) and the
recalibrated bands (#140). No card changed. The read now finds six more skills: positioning and messaging, market
research and customer-facing engagement show in other words (the objection sheet, the discovery calls, the trade
shows), and so does content (the community); communication and adaptability show. The marked gaps went from eight to six, and the band stays "Relevant foundation".
