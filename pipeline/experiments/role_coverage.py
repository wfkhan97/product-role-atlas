"""How well does the taxonomy describe each role of a role set? Writes evals/extraction_baseline_<roles>.md.

    .venv/bin/python -m pipeline.experiments.role_coverage --roles mba [--country "United States"]

Reads data/processed/jobs_<roles>.json (run pipeline.extract --roles <roles> first). Per role: postings, skills
tagged per posting, the skills that define the role and the skills asked for most. Per skill: overall share and
the roles that ask for it most, with the skills no role asks for often enough to be worth keeping listed at the end.

Shares are company-balanced: one employer counts for at most CAP of a role's postings, so one large employer's
template (a quarter of operations-manager postings are Amazon's) does not set the role's profile.
"""
import argparse
import collections
import json
import os
import statistics
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from pipeline import roles_mba, tax

LABELS = {"mba": roles_mba.FAMILY_LABELS}
FLOOR = 0.03  # a skill no role asks for in at least this share of postings is a candidate to drop
CAP = 0.05    # the most one employer may weigh in a role's shares
SMALL = 60    # roles with fewer postings are marked: their shares move on a few postings
# A skill defines a role when nearly every posting has it and other roles mostly do not: the role's own
# field ("banking" for a banker), which a reader takes as given, as opposed to what the role then asks for.
DEFINING_SHARE, DEFINING_LIFT = 0.8, 2.5


def weights(js):
    """Posting weights that hold each company to CAP of the role (never below three postings' worth)."""
    n = collections.Counter(j["company"] for j in js)
    cap = max(3.0, CAP * len(js))
    return [min(1.0, cap / n[j["company"]]) for j in js]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--country", default="United States")
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()
    t = tax.for_roles(args.roles)
    name = {s["id"]: s["name"] for s in t["skills"]}
    cluster = {s["id"]: s["cluster"] for s in t["skills"]}
    new = {s["id"] for s in t["skills"] if s.get("only")}
    jobs = [j for j in json.load(open(os.path.join(ROOT, "data", "processed", f"jobs_{args.roles}.json")))
            if not args.country or j["country"] == args.country]
    labels = LABELS[args.roles]
    by_role = collections.defaultdict(list)
    for j in jobs:
        by_role[j["family"]].append(j)
    share, total_w = {}, {}
    for f, js in by_role.items():
        c = collections.Counter()
        ws = weights(js)
        for j, w in zip(js, ws):
            for k in j["skills"]:
                if not k.startswith("yoe_"):
                    c[k] += w
        share[f], total_w[f] = c, sum(ws)
    def sh(f, k):
        return share[f][k] / total_w[f]
    def elsewhere(f, k):
        num = sum(share[g][k] for g in share if g != f)
        return num / sum(total_w[g] for g in share if g != f)
    out = [f"# Extraction baseline: the {args.roles.upper()} role set", "",
           f"Produced by `pipeline/experiments/role_coverage.py` on {time.strftime('%Y-%m-%d')} from `data/processed/jobs_{args.roles}.json`"
           f" ({len(jobs):,} postings{', ' + args.country if args.country else ''}; {len(t['skills'])} skills, {len(new)} of them specific to this role set)."
           " Shares are the fraction of a role's postings whose title or cleaned description matches a skill's patterns, with each employer held to"
           f" {CAP:.0%} of a role. \"Defines the role\" lists skills on at least {DEFINING_SHARE:.0%} of the role's postings and at least {DEFINING_LIFT:g} times as common"
           f" as in other roles: the role's own field. Roles marked * have fewer than {SMALL} postings. Regenerate after any taxonomy change.", "",
           "## Per role", "",
           "| # | role | postings | employers | skills per posting (median) | role-set skills per posting (median) | defines the role | most asked beyond that |", "|---|---|---|---|---|---|---|---|"]
    for i, (f, label) in enumerate(labels.items(), 1):
        js = by_role.get(f, [])
        if not js:
            out.append(f"| {i} | {label} | 0 | | | | | |"); continue
        med = statistics.median(len([k for k in j["skills"] if not k.startswith("yoe_")]) for j in js)
        med_new = statistics.median(len([k for k in j["skills"] if k in new]) for j in js)
        defining = [k for k, _ in share[f].most_common() if k in name and sh(f, k) >= DEFINING_SHARE and sh(f, k) >= DEFINING_LIFT * elsewhere(f, k)]
        top = ", ".join(f"{name[k]} {sh(f, k):.0%}" for k, _ in [x for x in share[f].most_common() if x[0] in name and x[0] not in defining][:args.top])
        out.append(f"| {i} | {label}{'*' if len(js) < SMALL else ''} | {len(js):,} | {len({j['company'] for j in js})} | {med:g} | {med_new:g} | "
                   + (", ".join(f"{name[k]} {sh(f, k):.0%}" for k in defining) or "–") + f" | {top} |")
    out += ["", "## Per skill", "", "| skill | cluster | all postings | asked most by |", "|---|---|---|---|"]
    total = collections.Counter(k for j in jobs for k in j["skills"])
    weak = []
    for s in t["skills"]:
        k = s["id"]
        if k.startswith("yoe_"):
            continue
        tops = sorted(((sh(f, k), f) for f, js in by_role.items() if len(js) >= 15), reverse=True)[:4]
        if not tops or tops[0][0] < FLOOR:
            weak.append(name[k])
        mark = "" if k in new else " (shared)"
        out.append(f"| {name[k]}{mark} | {cluster[k]} | {total[k] / len(jobs):.1%} | " + ", ".join(f"{labels[f]} {v:.0%}" for v, f in tops if v > 0) + " |")
    out += ["", f"## Skills no role asks for in {FLOOR:.0%} of its postings", "", ", ".join(weak) or "None.", ""]
    path = os.path.join(ROOT, "evals", f"extraction_baseline_{args.roles}.md")
    with open(path, "w") as f:
        f.write("\n".join(out))
    print("wrote", path, "|", len(jobs), "postings |", len(weak), "weak skills")


if __name__ == "__main__":
    main()
