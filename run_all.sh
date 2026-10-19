#!/bin/zsh
# Full refresh: merge registry -> scrape -> extract -> build graph
# Every stage logs to stderr and to logs/run_<date>.log (pipeline/log.py reads PIPELINE_LOG).
set -e
cd "$(dirname "$0")"
mkdir -p logs
export PIPELINE_LOG="logs/run_$(date +%Y-%m-%d_%H%M%S).log"
.venv/bin/python -m pipeline.merge_registry
.venv/bin/python -m pipeline.scrape "$@"
.venv/bin/python -m pipeline.extract
.venv/bin/python -m pipeline.build_graph
.venv/bin/python -m pipeline.build_artifact
echo "log: $PIPELINE_LOG"
