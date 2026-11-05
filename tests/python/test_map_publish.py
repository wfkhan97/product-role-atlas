"""pipeline/map_publish.py and pipeline/map_feedback.py against a fake client: the user found by email across pages and
in any case, the upload path, the listing of feedback per user, and that neither script runs without the key. No
network."""
import json
import os

import pytest

from pipeline import map_feedback, map_publish

UID_A = "11111111-aaaa-4aaa-8aaa-111111111111"
UID_B = "22222222-bbbb-4bbb-8bbb-222222222222"


class FakeClient:
    def __init__(self, users, objects=None, per_page=None):
        self.users = users
        self.objects = dict(objects or {})
        self.uploads = []
        self.pages = []
        self.calls = 0

    def list_users(self, page, per_page=map_publish.PER_PAGE):
        self.calls += 1
        self.pages.append(page)
        return self.users[(page - 1) * per_page: page * per_page]

    def upload(self, path, data, content_type="application/json"):
        self.calls += 1
        self.uploads.append((path, content_type))
        self.objects[path] = bytes(data)

    def list(self, prefix):
        self.calls += 1
        pre = prefix.rstrip("/") + "/"
        return [{"name": k[len(pre):]} for k in sorted(self.objects) if k.startswith(pre) and "/" not in k[len(pre):]]

    def get(self, path):
        self.calls += 1
        return self.objects.get(path)


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("CATALOG_SERVICE_ROLE_KEY", "test-key")


@pytest.fixture
def no_key(monkeypatch):
    # set to empty so pipeline/env.py's setdefault cannot fill it from a real .env
    monkeypatch.setenv("CATALOG_SERVICE_ROLE_KEY", "")


@pytest.fixture
def apprentice(tmp_path):
    """A repository root in miniature: the example's map, and no student folder yet."""
    (tmp_path / "pipeline" / "apprentice" / "examples" / "pmm-nyc").mkdir(parents=True)
    (tmp_path / "pipeline" / "apprentice" / "examples" / "pmm-nyc" / "map.json").write_text(json.dumps({"version": 2, "student": {"slug": "pmm-nyc"}}))
    return [str(p) for p in map_publish.apprentice_dirs(str(tmp_path))]


def many_users(n, extra):
    return [{"id": f"00000000-0000-4000-8000-{i:012d}", "email": f"person{i}@example.com"} for i in range(n)] + extra


def test_find_user_pages_through_and_matches_any_case():
    c = FakeClient(many_users(450, [{"id": UID_A, "email": "Student@Example.com"}]))
    u = map_publish.find_user(c, "  student@EXAMPLE.com ")
    assert u["id"] == UID_A
    assert c.pages == [1, 2, 3], "the third page holds the match"
    assert map_publish.find_user(FakeClient(many_users(3, [])), "nobody@example.com") is None


def test_map_path_prefers_the_students_folder_then_the_examples(apprentice, tmp_path):
    assert map_publish.map_path("pmm-nyc", apprentice).endswith("pipeline/apprentice/examples/pmm-nyc/map.json")
    (tmp_path / "data" / "apprentice" / "students" / "pmm-nyc").mkdir(parents=True)
    (tmp_path / "data" / "apprentice" / "students" / "pmm-nyc" / "map.json").write_text("{}")
    assert map_publish.map_path("pmm-nyc", apprentice).endswith("data/apprentice/students/pmm-nyc/map.json")
    assert map_publish.map_path("nobody", apprentice) is None
    with pytest.raises(ValueError):
        map_publish.map_path("../etc", apprentice)


def test_the_default_folders_are_in_this_repository():
    dirs = [os.path.relpath(d, map_publish.ROOT) for d in map_publish.apprentice_dirs()]
    assert dirs == [os.path.join("data", "apprentice", "students"), os.path.join("pipeline", "apprentice", "examples")]
    assert map_publish.map_path("pmm-nyc").endswith(os.path.join("pmm-nyc", "map.json")), "the tracked example is always there"


def test_publish_uploads_to_the_users_folder(apprentice, capsys):
    c = FakeClient([{"id": UID_B, "email": "other@example.com"}, {"id": UID_A, "email": "student@example.com"}])
    out = map_publish.publish("pmm-nyc", "STUDENT@example.com", c, apprentice)
    assert out == (f"maps/{UID_A}/map.json", UID_A)
    assert c.uploads == [(f"{UID_A}/map.json", "application/json")]
    assert json.loads(c.objects[f"{UID_A}/map.json"])["version"] == 2
    printed = capsys.readouterr().out
    assert f"maps/{UID_A}/map.json" in printed and UID_A in printed


def test_publish_refuses_an_unknown_email_and_a_missing_map(apprentice, capsys):
    c = FakeClient([{"id": UID_A, "email": "student@example.com"}])
    assert map_publish.publish("pmm-nyc", "stranger@example.com", c, apprentice) is None
    assert map_publish.publish("no-such", "student@example.com", c, apprentice) is None
    assert c.uploads == []
    assert "invite them first" in capsys.readouterr().out


def test_main_publishes_with_the_key(key, apprentice, monkeypatch):
    monkeypatch.setattr(map_publish, "apprentice_dirs", lambda root=None: apprentice)
    c = FakeClient([{"id": UID_A, "email": "student@example.com"}])
    assert map_publish.main(["pmm-nyc", "student@example.com"], client=c) == 0
    assert c.uploads == [(f"{UID_A}/map.json", "application/json")]


def feedback(card, choice, note, date):
    return json.dumps({"card": card, "choice": choice, "note": note, "date": date}).encode()


def test_feedback_lists_per_user_with_date_choice_and_note(capsys):
    objects = {
        f"{UID_A}/map.json": b"{}",
        f"{UID_A}/feedback/l2-battlecard.json": feedback("l2-battlecard", "change", "Shorter, please.", "2026-11-05"),
        f"{UID_A}/feedback/l1-gtm.json": feedback("l1-gtm", "build", "", "2026-11-04"),
        f"{UID_B}/feedback/notes.txt": b"ignored",
    }
    c = FakeClient([{"id": UID_A, "email": "a@example.com"}, {"id": UID_B, "email": "b@example.com"}], objects)
    rows = map_feedback.collect(c)
    assert [r["email"] for r in rows] == ["a@example.com", "b@example.com"]
    assert rows[0]["items"] == [
        {"card": "l1-gtm", "choice": "build", "note": "", "date": "2026-11-04"},
        {"card": "l2-battlecard", "choice": "change", "note": "Shorter, please.", "date": "2026-11-05"},
    ], "oldest first; map.json is not feedback"
    assert rows[1]["items"] == [], "only .json files under feedback/ count"
    one = map_feedback.collect(c, "B@EXAMPLE.COM")
    assert [r["uid"] for r in one] == [UID_B]
    assert map_feedback.collect(c, "nobody@example.com") is None
    text = map_feedback.report(rows)
    assert "2026-11-05  change  l2-battlecard  Shorter, please." in text
    assert "b@example.com" in text and "0 feedback files" in text


def test_feedback_main_with_the_key(key, capsys):
    c = FakeClient([{"id": UID_A, "email": "a@example.com"}], {f"{UID_A}/feedback/l1-gtm.json": feedback("l1-gtm", "not", "Not now.", "2026-11-04")})
    assert map_feedback.main(["a@example.com"], client=c) == 0
    assert "l1-gtm" in capsys.readouterr().out
    assert map_feedback.main(["nobody@example.com"], client=c) == 1


def test_neither_script_runs_without_the_key(no_key, apprentice, capsys):
    c = FakeClient([{"id": UID_A, "email": "student@example.com"}])
    assert map_publish.main(["pmm-nyc", "student@example.com"], client=c) == 0
    assert map_feedback.main([], client=c) == 0
    assert c.calls == 0, "no call reaches the client"
    out = capsys.readouterr().out
    assert out.count("CATALOG_SERVICE_ROLE_KEY is not set") == 2
    assert "test-key" not in out


def test_the_default_url_is_web_config():
    assert map_publish.config_url() == "https://qqkzbzwmpkrmlicoxijy.supabase.co"
