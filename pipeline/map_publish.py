"""Publish one student's apprentice map to the private `maps` bucket (the build plan's B2).

usage: python -m pipeline.map_publish <slug> <email>

Reads the student's map.json from this repository: `data/apprentice/students/<slug>/map.json` (gitignored, written by
pipeline/apprentice/), else the tracked example's `pipeline/apprentice/examples/<slug>/map.json`. Finds the invited user by email among the gradbuddy-catalog project's users (/auth/v1/admin/users, paged, any case), then
uploads the file to `maps/<user id>/map.json` with upsert and prints the path and the user id. The owner invites the
student first (pipeline/sql/2026-11-03_maps.sql, the four steps); this script never creates a user.

.env: CATALOG_SERVICE_ROLE_KEY (the gradbuddy-catalog project's service-role key) and CATALOG_URL (default: the
SUPABASE_URL in web/config.js). Without the key it says so and exits 0. `Client` is the one thing that talks to the
network; pipeline/map_feedback.py uses it too, and the tests pass a fake.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline.env import load_env

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUCKET = "maps"
SLUG_RE = re.compile(r"^[a-z0-9-]+$")
PER_PAGE = 200
TIMEOUT = 60


def config_url(root=None):
    """The SUPABASE_URL web/config.js names, read from the file."""
    with open(os.path.join(root or ROOT, "web", "config.js")) as f:
        m = re.search(r'SUPABASE_URL:\s*"([^"]+)"', f.read())
    return m.group(1) if m else None


def apprentice_dirs(root=None):
    """Where a map lives, in order: the real students (data/apprentice/students/), then the tracked examples."""
    root = root or ROOT
    return [os.path.join(root, "data", "apprentice", "students"), os.path.join(root, "pipeline", "apprentice", "examples")]


def map_path(slug, dirs=None):
    """The student's map.json: <slug>/map.json in the first of the folders that has it."""
    if not SLUG_RE.match(slug or ""):
        raise ValueError(f"not a slug: {slug!r} (lower-case letters, digits and hyphens)")
    dirs = dirs if dirs is not None else apprentice_dirs()
    for d in dirs:
        p = os.path.join(d, slug, "map.json")
        if os.path.isfile(p):
            return os.path.normpath(p)
    return None


class Client:
    """The gradbuddy-catalog project with the service role: the users (GoTrue admin) and the `maps` bucket."""

    def __init__(self, base, key, bucket=BUCKET):
        import requests
        self.http = requests.Session()
        self.base = base.rstrip("/")
        self.bucket = bucket
        self.http.headers["apikey"] = key
        if not key.startswith("sb_secret_"):  # a legacy service_role JWT goes in both headers; the new keys are not JWTs
            self.http.headers["Authorization"] = f"Bearer {key}"

    def _check(self, r, what):
        if r.status_code >= 400:
            raise RuntimeError(f"{what}: HTTP {r.status_code} {r.text[:300]}")
        return r

    def list_users(self, page, per_page=PER_PAGE):
        r = self._check(self.http.get(f"{self.base}/auth/v1/admin/users", params={"page": page, "per_page": per_page}, timeout=TIMEOUT), "users")
        body = r.json()
        return body.get("users", []) if isinstance(body, dict) else body

    def upload(self, path, data, content_type="application/json"):
        self._check(self.http.post(f"{self.base}/storage/v1/object/{self.bucket}/{path}", data=data,
                                   headers={"Content-Type": content_type, "x-upsert": "true"}, timeout=TIMEOUT), f"upload {path}")

    def list(self, prefix):
        """The objects directly under a folder: [{name, ...}], names relative to the folder."""
        r = self._check(self.http.post(f"{self.base}/storage/v1/object/list/{self.bucket}",
                                       json={"prefix": prefix, "limit": 1000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}},
                                       timeout=TIMEOUT), f"list {prefix}")
        return r.json()

    def get(self, path):
        """The object's bytes, or None when there is none."""
        r = self.http.get(f"{self.base}/storage/v1/object/{self.bucket}/{path}", timeout=TIMEOUT)
        if r.status_code in (400, 404) and "not" in r.text.lower() and "found" in r.text.lower():
            return None
        return self._check(r, f"get {path}").content


def all_users(client, per_page=PER_PAGE):
    """Every user, page by page, until a short page."""
    page, out = 1, []
    while True:
        users = client.list_users(page, per_page)
        out.extend(users)
        if len(users) < per_page:
            return out
        page += 1


def find_user(client, email, per_page=PER_PAGE):
    """The user whose email is this one, any case; None when nobody has it."""
    want = (email or "").strip().lower()
    page = 1
    while True:
        users = client.list_users(page, per_page)
        for u in users:
            if (u.get("email") or "").strip().lower() == want:
                return u
        if len(users) < per_page:
            return None
        page += 1


def publish(slug, email, client, dirs=None):
    """Upload the student's map.json to maps/<uid>/map.json. Returns (object path, user id), or None with a message."""
    path = map_path(slug, dirs)
    if not path:
        print(f"[map_publish] no map.json for {slug} in {', '.join(os.path.relpath(d, ROOT) for d in (dirs if dirs is not None else apprentice_dirs()))}")
        return None
    with open(path, "rb") as f:
        data = f.read()
    json.loads(data)  # a file that is not JSON stops here, before anything is sent
    user = find_user(client, email)
    if not user:
        print(f"[map_publish] no user with the email {email}: invite them first (Authentication > Users > Invite user)")
        return None
    uid = user["id"]
    obj = f"{uid}/map.json"
    client.upload(obj, data, "application/json")
    print(f"[map_publish] {path} -> {BUCKET}/{obj}")
    print(f"[map_publish] user id {uid}")
    return f"{BUCKET}/{obj}", uid


def client_from_env():
    """A Client from .env, or None when CATALOG_SERVICE_ROLE_KEY is not set."""
    load_env()
    key = os.environ.get("CATALOG_SERVICE_ROLE_KEY")
    if not key:
        return None
    return Client(os.environ.get("CATALOG_URL") or config_url(), key)


NO_KEY = "CATALOG_SERVICE_ROLE_KEY is not set: put the gradbuddy-catalog project's service-role key in .env (see .env.example); nothing done"


def main(argv=None, client=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2:
        print(__doc__.strip().splitlines()[2])
        return 2
    load_env()
    if not os.environ.get("CATALOG_SERVICE_ROLE_KEY"):
        print(f"[map_publish] {NO_KEY}")
        return 0
    client = client or client_from_env()
    return 0 if publish(args[0], args[1], client) else 1


if __name__ == "__main__":
    sys.exit(main())
