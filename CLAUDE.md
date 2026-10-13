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
  Expectation files in `evals/resumes/*.json` are the spec; change them only with a reason in the commit.
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
- The raw posting files are a backlog. Never replace one with a fresh scrape and never delete postings from it:
  `pipeline.scrape --refresh` merges. A change to `pipeline.scrape.merge` needs `evals/run_pipeline.py --only backlog`.
- Every eval that exists for the product roles gets its counterpart for a new role set before that role set is
  shown in the interface. New kinds of evals are listed in `evals/README.md` under "Evals to build".
- Permanent documentation lives in `README.md`, `PLAN.md`, `evals/README.md` and `evals/NOTES.md`. Interim
  planning or scratch files are welcome while working, but they go in the session scratchpad or under
  `data/experiments/` (gitignored), not in the tree. Delete what is no longer needed before opening the PR.
- Secrets go in `.env` (gitignored), never in code, docs or chat.
