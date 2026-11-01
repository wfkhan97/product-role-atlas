"""List the feedback the students wrote on their apprentice maps (the build plan's B2, section 5).

usage: python -m pipeline.map_feedback [<email>]

For every user of the gradbuddy-catalog project (or the one with this email, any case), the files under
`maps/<user id>/feedback/` in the private `maps` bucket: one per card, the latest answer, each with its date, choice
(build, not, change) and note. The owner acts on them by editing the student's map.json and publishing again
(pipeline/map_publish.py); nothing here writes.

.env: the same two keys as pipeline/map_publish.py (CATALOG_SERVICE_ROLE_KEY, CATALOG_URL). Without the key it says
so and exits 0.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.env import load_env
from pipeline.map_publish import NO_KEY, all_users, client_from_env, find_user

NOTE_SHOWN = 500


def feedback_of(client, uid):
    """The feedback files of one user, oldest first: [{card, choice, note, date}]."""
    out = []
    for entry in client.list(f"{uid}/feedback"):
        name = entry.get("name") or ""
        if not name.endswith(".json"):
            continue
        raw = client.get(f"{uid}/feedback/{name}")
        if raw is None:
            continue
        try:
            obj = json.loads(raw)
        except ValueError:
            obj = {"note": "(not JSON)"}
        out.append({"card": obj.get("card") or name[:-5], "choice": obj.get("choice", ""), "note": obj.get("note", ""), "date": obj.get("date", "")})
    return sorted(out, key=lambda x: (x["date"], x["card"]))


def collect(client, email=None):
    """[{email, uid, items}] for every user, or the one with this email; None when that email has no user."""
    if email:
        u = find_user(client, email)
        if not u:
            return None
        users = [u]
    else:
        users = all_users(client)
    return [{"email": u.get("email", ""), "uid": u["id"], "items": feedback_of(client, u["id"])} for u in users]


def report(rows):
    lines = []
    for r in rows:
        lines.append(f"{r['email']} ({r['uid']}): {len(r['items'])} feedback file{'s' if len(r['items']) != 1 else ''}")
        for it in r["items"]:
            note = str(it["note"] or "").replace("\n", " ")[:NOTE_SHOWN]
            lines.append(f"  {it['date'] or '—':10}  {it['choice'] or '—':6}  {it['card']}" + (f"  {note}" if note else ""))
    return "\n".join(lines)


def main(argv=None, client=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) > 1:
        print(__doc__.strip().splitlines()[2])
        return 2
    load_env()
    if not os.environ.get("CATALOG_SERVICE_ROLE_KEY"):
        print(f"[map_feedback] {NO_KEY}")
        return 0
    client = client or client_from_env()
    rows = collect(client, args[0] if args else None)
    if rows is None:
        print(f"[map_feedback] no user with the email {args[0]}")
        return 1
    print(report(rows) if rows else "[map_feedback] no users yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
