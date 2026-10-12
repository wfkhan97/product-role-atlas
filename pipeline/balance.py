"""Company-balanced shares for a role's postings, and the skills that define a role.

One employer counts for at most CAP of a role's postings, so one large employer's template (a quarter of
operations-manager postings are Amazon's) does not set the role's profile. Used by the graph build of a role set
and by pipeline/experiments/role_coverage.py, so the map and the extraction baseline show the same numbers.
"""
import collections

CAP = 0.05    # the most one employer may weigh in a role's shares
SMALL = 60    # roles with fewer postings are marked: their shares move on a few postings
# A skill defines a role when nearly every posting has it and other roles mostly do not: the role's own
# field ("banking" for a banker), which a reader takes as given, as opposed to what the role then asks for.
DEFINING_SHARE, DEFINING_LIFT = 0.8, 2.5


def weights(js):
    """Posting weights that hold each company to CAP of the role's total weight (never below three postings' worth).

    Cutting a large employer lowers the total, so the limit is found by repeating: an employer may weigh
    t postings, where t is CAP of the total after the cut. A role with fewer than 1/CAP employers cannot meet
    the cap; there every employer is cut to the same weight, down to three postings.
    """
    n = collections.Counter(j["company"] for j in js)
    t = float(len(js))
    for _ in range(200):
        nxt = max(3.0, CAP * sum(min(c, t) for c in n.values()))
        if abs(nxt - t) < 1e-9:
            break
        t = nxt
    return [min(1.0, t / n[j["company"]]) for j in js]


def role_shares(by_role):
    """{role: [postings]} -> (share(role, skill), elsewhere(role, skill), weighted counts, total weight per role)."""
    count, total_w = {}, {}
    for f, js in by_role.items():
        c = collections.Counter()
        ws = weights(js)
        for j, w in zip(js, ws):
            for k in j["skills"]:
                if not k.startswith("yoe_"):
                    c[k] += w
        count[f], total_w[f] = c, sum(ws)

    def share(f, k):
        return count[f][k] / total_w[f]

    def elsewhere(f, k):
        num = sum(count[g][k] for g in count if g != f)
        return num / sum(total_w[g] for g in count if g != f)

    return share, elsewhere, count, total_w


def defining(f, share, elsewhere, count, known):
    """Skills of the taxonomy (`known`) that define role f, most common first."""
    return [k for k, _ in count[f].most_common()
            if k in known and share(f, k) >= DEFINING_SHARE and share(f, k) >= DEFINING_LIFT * elsewhere(f, k)]
