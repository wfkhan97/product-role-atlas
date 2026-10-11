"""The skill taxonomy (pipeline/taxonomy.json) and the part of it each role set uses.

One vocabulary serves every role set. A skill with "only": [role sets] belongs to those sets alone; a skill
without it is shared. The product map keeps its original skills until its interface is redesigned for more.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "pipeline", "taxonomy.json")


def load():
    with open(PATH) as f:
        return json.load(f)


def for_roles(roleset, tax=None):
    """The taxonomy as one role set sees it: its skills, and the clusters those skills use."""
    tax = tax or load()
    skills = [s for s in tax["skills"] if roleset in s.get("only", [roleset])]
    used = {s["cluster"] for s in skills}
    return {"clusters": {c: v for c, v in tax["clusters"].items() if c in used}, "skills": skills}


def dump(tax, path=PATH):
    with open(path, "w") as f:
        f.write(json.dumps(tax, indent=1, ensure_ascii=False) + "\n")
