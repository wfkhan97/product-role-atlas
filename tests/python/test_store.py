"""pipeline/store.py: push skips what the manifest already has, never deletes, pull keeps a newer local file,
bootstrap runs the backlog first. The bucket is a dict; no network."""
import json
import os
import time

import pytest

from pipeline import store


class FakeBucket:
    def __init__(self):
        self.objects = {}
        self.puts = []

    def ensure(self):
        pass

    def get(self, path):
        return self.objects.get(path)

    def put(self, path, data, content_type=None):
        self.objects[path] = bytes(data)
        self.puts.append(path)


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "ROOT", str(tmp_path))
    return tmp_path


def write(root, rel, text, mtime=None):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
    if mtime is not None:
        os.utime(p, (mtime, mtime))
    return p


def manifest(bucket, store_name):
    return json.loads(bucket.objects[f"{store_name}/manifest.json"])["files"]


def test_push_uploads_once_and_skips_an_unchanged_file(root):
    write(root, "evals/resumes/external/a.txt", "resume a")
    write(root, "evals/resumes/private/b.txt", "resume b")
    write(root, "evals/resumes/external/.DS_Store", "noise")
    b = FakeBucket()
    assert store.push("evals", b) == (2, 0, 0)
    assert sorted(manifest(b, "evals")) == ["external/a.txt", "private/b.txt"], "each root under its prefix; hidden files left out"
    assert b.objects["evals/files/external/a.txt"] == b"resume a"
    n = len(b.puts)
    assert store.push("evals", b) == (0, 2, 0)
    assert len(b.puts) == n, "a second push with the same hashes uploads nothing, not even the manifest"
    write(root, "evals/resumes/external/a.txt", "resume a, revised")
    assert store.push("evals", b) == (1, 1, 0)
    assert b.objects["evals/files/external/a.txt"] == b"resume a, revised"


def test_push_never_removes_a_remote_file(root):
    write(root, "logs/run_1.log", "one")
    b = FakeBucket()
    store.push("logs", b)
    os.remove(root / "logs" / "run_1.log")
    write(root, "logs/run_2.log", "two")
    store.push("logs", b)
    assert sorted(manifest(b, "logs")) == ["run_1.log", "run_2.log"]
    assert b.objects["logs/files/run_1.log"] == b"one"


def test_caches_leave_scratch_and_trash_out(root):
    write(root, "data/experiments/depth/x.json", "{}")
    write(root, "data/experiments/corpus_mba.jsonl", "{}")
    write(root, "data/experiments/scratch/topic/plan.md", "interim")
    write(root, "data/experiments/_trash/2026-10-01/old.md", "gone")
    assert sorted(store.local_files("caches")) == ["corpus_mba.jsonl", "depth/x.json"]


def test_only_takes_a_repository_path_or_a_store_path(root):
    assert store.only_prefix("evals", "evals/resumes/private") == "private"
    assert store.only_prefix("evals", "evals/resumes/external/a.pdf") == "external/a.pdf"
    assert store.only_prefix("caches", "data/experiments/depth") == "depth"
    assert store.only_prefix("caches", "depth/x.json") == "depth/x.json"
    write(root, "data/experiments/depth/x.json", "{}")
    write(root, "data/experiments/corpus_mba.jsonl", "{}")
    b = FakeBucket()
    assert store.push("caches", b, only="data/experiments/depth") == (1, 0, 0)
    assert list(manifest(b, "caches")) == ["depth/x.json"]


def test_pull_writes_what_differs_and_keeps_a_newer_local_file(root, capsys):
    old = time.time() - 3600
    write(root, "evals/resumes/external/a.txt", "resume a", mtime=old)
    write(root, "evals/resumes/external/same.txt", "same", mtime=old)
    write(root, "evals/resumes/private/edited.txt", "first draft", mtime=old)
    b = FakeBucket()
    store.push("evals", b)
    # another machine: a new file, a changed file, and this machine edits one after the push
    store.ROOT, other = str(root / "other"), store.ROOT
    write(root / "other", "evals/resumes/external/a.txt", "resume a, revised", mtime=old + 10)
    write(root / "other", "evals/resumes/external/new.txt", "new", mtime=old + 10)
    store.push("evals", b)
    store.ROOT = other
    write(root, "evals/resumes/private/edited.txt", "second draft")  # now, newer than the manifest
    os.remove(root / "evals/resumes/external/same.txt")
    assert store.pull("evals", b) == (3, 0, 1)
    assert (root / "evals/resumes/external/a.txt").read_text() == "resume a, revised"
    assert (root / "evals/resumes/external/new.txt").read_text() == "new"
    assert (root / "evals/resumes/external/same.txt").read_text() == "same", "a deleted local file comes back"
    assert (root / "evals/resumes/private/edited.txt").read_text() == "second draft", "the newer local file is kept"
    assert "[keep] private/edited.txt" in capsys.readouterr().out
    assert abs(os.path.getmtime(root / "evals/resumes/external/a.txt") - (old + 10)) < 1, "a pulled file carries the manifest's mtime"
    assert store.pull("evals", b) == (0, 3, 1), "a second pull changes nothing"


def test_pull_checks_the_bytes_against_the_manifest(root):
    write(root, "logs/run.log", "one")
    b = FakeBucket()
    store.push("logs", b)
    b.objects["logs/files/run.log"] = b"tampered"
    os.remove(root / "logs" / "run.log")
    with pytest.raises(RuntimeError):
        store.pull("logs", b)


def test_status_counts_each_side(root):
    old = time.time() - 3600
    write(root, "logs/pushed.log", "a", mtime=old)
    write(root, "logs/changed.log", "b", mtime=old)
    b = FakeBucket()
    store.push("logs", b)
    write(root, "logs/changed.log", "b2", mtime=old + 10)
    write(root, "logs/local_only.log", "c")
    os.remove(root / "logs" / "pushed.log")
    s = store.status("logs", b)
    assert (s["local_only"], s["remote_only"], s["differ"], s["same"]) == (["local_only.log"], ["pushed.log"], ["changed.log"], 0)
    assert s["newer"] == 1


def test_bootstrap_pulls_the_backlog_first_then_evals_then_caches(root, monkeypatch):
    calls = []
    monkeypatch.setattr(store.backlog, "configured", lambda: True)
    monkeypatch.setattr(store.backlog, "pull", lambda rs, *a, **k: calls.append(("backlog", rs)))
    monkeypatch.setattr(store, "pull", lambda s, bucket, only=None: calls.append(("store", s)))
    store.bootstrap(FakeBucket())
    assert calls == [("backlog", "product"), ("backlog", "mba"), ("store", "evals"), ("store", "caches")]


def test_bootstrap_without_the_database_still_pulls_the_stores(root, monkeypatch, capsys):
    calls = []
    monkeypatch.setattr(store.backlog, "configured", lambda: False)
    monkeypatch.setattr(store, "pull", lambda s, bucket, only=None: calls.append(s))
    store.bootstrap(FakeBucket())
    assert calls == ["evals", "caches"]
    assert "SUPABASE_DB_URL is not set" in capsys.readouterr().out


def test_without_the_key_every_command_says_so_and_exits_zero(monkeypatch, capsys):
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setattr(store, "load_env", lambda path=None: None)
    monkeypatch.setattr("sys.argv", ["store", "push", "evals"])
    with pytest.raises(SystemExit) as e:
        store.main()
    assert e.value.code == 0
    assert "SUPABASE_SERVICE_ROLE_KEY is not set" in capsys.readouterr().out


def test_push_leaves_links_out_even_a_dead_one(root):
    write(root, "data/experiments/a.json", "{}")
    target = write(root, "elsewhere/b.json", "{}")
    os.symlink(target, root / "data/experiments/b.json")
    os.symlink(root / "gone", root / "data/experiments/tokens")
    b = FakeBucket()
    assert store.push("caches", b) == (1, 0, 0)
    assert sorted(manifest(b, "caches")) == ["a.json"]


def test_a_push_that_fails_still_records_what_it_uploaded(root):
    write(root, "logs/a.log", "a")
    write(root, "logs/b.log", "b")

    class FailingBucket(FakeBucket):
        def put(self, path, data, content_type=None):
            if path.endswith("b.log"):
                raise RuntimeError("network")
            super().put(path, data, content_type)

    b = FailingBucket()
    with pytest.raises(RuntimeError):
        store.push("logs", b)
    assert sorted(manifest(b, "logs")) == ["a.log"]
