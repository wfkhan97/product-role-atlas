# Working agreements

- `main` is protected by convention: never commit to it directly. Every change goes on a branch
  (`feat/…`, `fix/…`, `data/…`, `chore/…`) and lands through a pull request.
- Open the PR with the GitHub CLI in `tools/bin/gh` (not in git; see README). Merge only when the
  user says so.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Data refreshes (`./run_all.sh`) are code-free and can land as `data/` branches.
- Touching the matcher (`web/match.js`, `web/app.js` match panel) or the taxonomy (`pipeline/taxonomy.json`)
  means running `node evals/run.mjs --baseline` and committing the updated `evals/baseline.md`; a taxonomy
  change also means re-extracting (`.venv/bin/python -m pipeline.extract && .venv/bin/python -m pipeline.build_graph`)
  and regenerating `evals/extraction_baseline.md` with the reuse mode described in `evals/README.md`.
- Touching the model read (`web/api/infer.js`: the prompt, the model, the validation; `web/infer.js`; the `inferred`
  status or its credit in `web/match.js`) means running it over the WHOLE résumé set, never the eight samples alone:
  `.venv/bin/python -m pipeline.store pull evals` first (the external set lives in the `atlas-store` bucket; a
  checkout without the key holds only what was copied by hand), then `node evals/infer.mjs --baseline --url
  <deploy>/api/infer` (a preview deploy needs `INFER_COOKIE` from its share link; `--reuse` reruns from the saved
  answers without a call), and committing `evals/infer_baseline.md`. The baseline's header says how many of the
  external files were present; a run on a partial set is a draft, say so in the commit.
  Expectation files in `evals/resumes/*.json` are the spec; change them only with a reason in the commit.
- Every skill in `pipeline/taxonomy.json` has a `kind` (`pipeline/tax.py`, `KINDS`), an entry in
  `pipeline/evidence.json` and, when four or more fields ask for it, an entry per asking field in
  `pipeline/fields.json`. Adding or renaming a skill, or touching either file, means `.venv/bin/python -m pytest
  tests/python/test_taxonomy.py`, `.venv/bin/python evals/run_taxonomy.py --baseline` and committing `evals/taxonomy_baseline.md`;
  a carrier a field entry names must co-occur with the skill in the field's postings, so when the eval fails, change the
  carrier, not the threshold. The kind says nothing to extraction: a change to kinds, evidence or fields alone needs no
  re-extraction, only `pipeline.build_graph` for both role sets.
- The taxonomy serves every role set (`product`, `mba`). A change to a shared skill, to an MBA skill, to the
  cleaner in `pipeline/extract.py` or to the title rules in `pipeline/roles_mba.py` also means
  `.venv/bin/python -m pipeline.extract --roles mba`, then `pipeline.experiments.role_corpus --roles mba` and
  `pipeline.experiments.role_coverage --roles mba`, and committing the updated `evals/extraction_baseline_mba.md`;
  when model answers exist, `pipeline.experiments.skill_audit --roles mba --reuse` as well. Steps are in
  `evals/README.md`.
- A change to the title rules or levels (`pipeline/roles_mba.py`), to the country reader (`pipeline/geo.py`), to the
  MBA path of `pipeline/extract.py` or to the role-set part of `pipeline/build_graph.py` also means
  `.venv/bin/python -m pipeline.build_graph --roles mba`, then `.venv/bin/python evals/run_pipeline.py --baseline`, and
  committing `web/data/*mba*` and `evals/pipeline_baseline_mba.md`. Labels in `evals/titles_mba.json`,
  `evals/countries.json` and `evals/golden_mba.json` are the spec; change one only with the reason in its note.
- The MBA depth files (`pipeline/depth/mba_*.json`) are written by `pipeline.depth_publish` from checked runs, never by
  hand. A change to them, to `pipeline/build_steps.py`, to `pipeline/build_lexicon.json` or to
  `data/raw/build_sources.json` means `.venv/bin/python evals/run_depth.py --baseline` and committing
  `evals/depth_baseline_mba.md`; a change to the sub-skills also means the MBA extract chain above (sub-skills are
  tagged at extraction). A source record changes only through `pipeline.build_sources verify` (hashes) or by hand
  with its `date_read` and `terms_note` updated.
- The raw posting files are a backlog. Never replace one with a fresh scrape and never delete postings from it:
  `pipeline.scrape --refresh` merges. A change to `pipeline.scrape.merge` needs `evals/run_pipeline.py --only backlog`.
  The files are not in git: the Supabase backlog (`pipeline/backlog.py`) is the store, and a fresh checkout runs
  `pipeline.backlog pull` before `extract` or a scrape. Never delete rows from
  `backlog_files` or `postings`, run `verify` after a change to push or pull, and never run a scrape with a
  `data/raw/jobs*/` that is behind the database (`pull` first).
- Every eval that exists for the product roles gets its counterpart for a new role set before that role set is
  shown in the interface. New kinds of evals are listed in `evals/README.md` under "Evals to build".
- Two kinds of writing, kept apart. **Lasting documentation** is what a future session needs to understand the
  project: `README.md` (what exists and how to run it), `PLAN.md` (the decisions and why, one dated section per
  change), `evals/README.md`, `evals/NOTES.md`, `tests/README.md`, `games/README.md`. **Interim artifacts** are what one
  thread needs while it works: plans under review, mockups, audits, scratch scripts, notes to self. They never go in
  the tree: put them in the session scratchpad or under `data/experiments/scratch/<topic>/` (gitignored), and name
  them so another session can tell what they were for.
- When a thread ends (the PR is open, or the work is dropped): move what lasts into the documentation above (a PLAN.md
  section for the decisions, README lines for anything new to run or a layout change, a backlog line under "Later" in
  PLAN.md for what was deferred), then run `./sweep_scratch.sh` to move the thread's scratch folder to
  `data/experiments/_trash/<date>/` (deleted by the next sweep). Nothing interim survives in the tree, the scratchpad
  or `data/experiments/scratch/` after the thread. Pipeline caches under `data/experiments/` (model answers, corpora)
  are not scratch and are never swept.
- The catalog rows in `web/data/catalog/cornell_tech.json` change only by rerunning `.venv/bin/python -m pipeline.catalog_export`
  from the research folder, never by hand. A change to either taxonomy file (`web/data/taxonomy.json`, `web/data/taxonomy_mba.json`)
  also means `node pipeline/catalog_tags.mjs` and committing `web/data/catalog/cornell_tech_tags.json`.
- Secrets go in `.env` (gitignored), never in code, docs or chat.
