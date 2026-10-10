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
- Permanent documentation lives in `README.md`, `PLAN.md`, `evals/README.md` and `evals/NOTES.md`. Interim
  planning or scratch files are welcome while working, but they go in the session scratchpad or under
  `data/experiments/` (gitignored), not in the tree. Delete what is no longer needed before opening the PR.
- Secrets go in `.env` (gitignored), never in code, docs or chat.
