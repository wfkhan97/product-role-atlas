# Lines judged (not yet run)

`node evals/lines_judged.mjs` has not run live on this checkout: `OPENROUTER_API_KEY` is not in `.env` on the build
machine of 2026-10-25. The dry run of that day draws, with seed 7, 50 sentences from a pool of 897 distinct ones over
56 roles of both sets (499 gap sentences, 249 field lines, 149 templates): 17 field lines, 17 templates, 16 gap
sentences, one from each kind-by-field cell in a seeded order, about 19,000 tokens to `anthropic/claude-haiku-5.5`. The
first live run overwrites this file with the table per type (artefact named, a number where asked, in the field's
words), the sentences the reader did not accept by skill and field, and every sentence judged; `fields.json` or
`evidence.json` is then fixed and the run repeated until the runner exits 0.
