#!/usr/bin/env bash
# Sweep interim artifacts at the end of a thread (CLAUDE.md, "Two kinds of writing").
#   ./sweep_scratch.sh            list what would move
#   ./sweep_scratch.sh --go       move data/experiments/scratch/* to data/experiments/_trash/<today>/ and empty
#                                     any _trash/<date>/ older than 14 days
#   ./sweep_scratch.sh --go NAME  move only data/experiments/scratch/NAME
# Pipeline caches elsewhere under data/experiments/ are never touched.
set -euo pipefail
cd "$(dirname "$0")"
SCRATCH=data/experiments/scratch; TRASH=data/experiments/_trash; TODAY=$(date +%Y-%m-%d)
mode=${1:-}; only=${2:-}
shopt -s nullglob
items=("$SCRATCH"/*)
[ -n "$only" ] && items=("$SCRATCH/$only")
if [ "$mode" != "--go" ]; then
  echo "Would move to $TRASH/$TODAY/:"; for d in "${items[@]}"; do [ -e "$d" ] && echo "  $d ($(du -sh "$d" | cut -f1))"; done
  echo "Run with --go to move them. Trash folders older than 14 days would be deleted:"
  find "$TRASH" -mindepth 1 -maxdepth 1 -type d -mtime +14 2>/dev/null | sed 's/^/  /' || true
  exit 0
fi
mkdir -p "$TRASH/$TODAY"
for d in "${items[@]}"; do [ -e "$d" ] || continue; mv "$d" "$TRASH/$TODAY/"; echo "moved $d -> $TRASH/$TODAY/"; done
find "$TRASH" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print -exec rm -rf {} + 2>/dev/null | sed 's/^/deleted /' || true
echo "done. Lasting decisions belong in PLAN.md; anything new to run in README.md."
