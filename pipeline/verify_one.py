"""Verify one ATS config with the real adapter: python -m pipeline.verify_one <company> <ats> '<config json>'"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.adapters import ADAPTERS
from pipeline.roles import title_ok

company, ats, cfg = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
if ats not in ADAPTERS:
    print(json.dumps({"ok": False, "error": f"no adapter for {ats}; adapters: {sorted(ADAPTERS)}"})); sys.exit(1)
cfg = dict(cfg); cfg.setdefault("queries", ["product manager", "product management", "product owner"])
kw = {"max_pages": 2} if ats not in ("greenhouse", "lever", "ashby", "smartrecruiters") else {}
try:
    jobs = ADAPTERS[ats](company, cfg, title_ok, **kw)
except Exception as e:
    print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"})); sys.exit(1)
print(json.dumps({"ok": bool(jobs), "n": len(jobs), "sample_title": jobs[0]["title"] if jobs else None, "description_chars": len(jobs[0]["description"]) if jobs else 0, "url": jobs[0]["url"] if jobs else None}))
