"""Which words and phrases set one role's postings apart from the rest of its role set?

    .venv/bin/python -m pipeline.experiments.role_terms --roles mba --role fpa [--n 80]

Ranks 1- to 3-word phrases by how much more often postings of the role use them than postings of every
other role (log-odds of document frequency), so skills are drafted from the postings' own vocabulary.
Needs the corpus from role_corpus.py.
"""
import argparse
import collections
import math
import re

from pipeline.experiments import role_corpus

WORD_RE = re.compile(r"[a-z][a-z0-9&+/#.'-]*[a-z0-9+#]|[a-z]")
STOP = set("a an the and or of to in for with on at by from as is are be will you your our we us this that it its their they have has can may must all any other including such etc who what which more than into across within through per about up out not no if when while both each also well new work working role team teams job position company ability able strong excellent experience years required preferred requirements qualifications responsibilities skills knowledge related equivalent degree minimum plus".split())


def phrases(text):
    words = WORD_RE.findall(text.lower())
    out = set()
    for n in (1, 2, 3):
        for i in range(len(words) - n + 1):
            g = words[i:i + n]
            if g[0] in STOP or g[-1] in STOP:
                continue
            out.add(" ".join(g))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--roles", default="mba")
    ap.add_argument("--role", required=True, help="family id, or several separated by commas")
    ap.add_argument("--n", type=int, default=80)
    ap.add_argument("--min-share", type=float, default=0.04)
    args = ap.parse_args()
    want = set(args.role.split(","))
    inside, outside = collections.Counter(), collections.Counter()
    n_in = n_out = 0
    for row in role_corpus.load(args.roles):
        if row["family"] in want:
            inside.update(phrases(row["text"])); n_in += 1
        else:
            outside.update(phrases(row["text"])); n_out += 1
    scored = []
    for g, c in inside.items():
        if c / n_in < args.min_share:
            continue
        a, b = (c + 0.5) / (n_in + 1), (outside[g] + 0.5) / (n_out + 1)
        scored.append((math.log(a / (1 - a)) - math.log(b / (1 - b)), g, c / n_in, outside[g] / n_out))
    print(f"{n_in} postings in {sorted(want)}; {n_out} others\n{'phrase':40s} {'in role':>8s} {'others':>8s}")
    for _, g, a, b in sorted(scored, reverse=True)[:args.n]:
        print(f"{g:40s} {a:8.0%} {b:8.1%}")


if __name__ == "__main__":
    main()
