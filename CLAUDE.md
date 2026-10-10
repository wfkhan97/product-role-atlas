# Working agreements

- `main` is protected by convention: never commit to it directly. Every change goes on a branch
  (`feat/…`, `fix/…`, `data/…`, `chore/…`) and lands through a pull request.
- Open the PR with the GitHub CLI in `tools/bin/gh` (not in git; see README). Merge only when the
  user says so.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Data refreshes (`./run_all.sh`) are code-free and can land as `data/` branches.
