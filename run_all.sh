#!/bin/zsh
# Full refresh: merge registry -> scrape -> extract -> build graph
set -e
cd "$(dirname "$0")"
.venv/bin/python -m pipeline.merge_registry
.venv/bin/python -m pipeline.scrape "$@"
.venv/bin/python -m pipeline.extract
.venv/bin/python -m pipeline.build_graph
.venv/bin/python -m pipeline.build_artifact
