"""pipeline/processed.py: the processed posting files, plain JSON or gzipped above a size, read through one door.
The gzip threshold is lowered by monkeypatching GZIP_ABOVE: nothing near 50 MB is written."""
import gzip
import json
import os

import pytest

from pipeline import processed

JOBS = [{"id": "X::1", "title": "Analyst", "skills": {"excel": 2}}, {"id": "Y::2", "title": "Manager", "skills": {}}]


@pytest.fixture
def tmp_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(processed, "DIR", str(tmp_path))
    return str(tmp_path)


def test_names_follow_the_role_set():
    assert processed.name("product") == "jobs.json"
    assert processed.name("mba") == "jobs_mba.json"


def test_a_small_file_is_plain_json_and_round_trips(tmp_dir):
    out = processed.dump("mba", JOBS)
    assert out == os.path.join(tmp_dir, "jobs_mba.json")
    assert processed.path("mba") == out
    assert processed.load("mba") == JOBS
    assert json.load(open(out)) == JOBS, "a plain file any tool can read"


def test_a_file_above_the_threshold_is_gzipped_and_round_trips(tmp_dir, monkeypatch):
    monkeypatch.setattr(processed, "GZIP_ABOVE", 10)
    out = processed.dump("mba", JOBS)
    assert out == os.path.join(tmp_dir, "jobs_mba.json.gz")
    assert processed.path("mba") == out
    assert processed.load("mba") == JOBS
    with gzip.open(out, "rt", encoding="utf-8") as f:
        assert json.load(f) == JOBS


def test_dump_removes_the_other_form_so_a_checkout_never_holds_both(tmp_dir, monkeypatch):
    plain = processed.dump("mba", JOBS)
    monkeypatch.setattr(processed, "GZIP_ABOVE", 10)
    gz = processed.dump("mba", JOBS)
    assert os.path.exists(gz) and not os.path.exists(plain)
    monkeypatch.setattr(processed, "GZIP_ABOVE", 50_000_000)
    plain = processed.dump("mba", JOBS)
    assert os.path.exists(plain) and not os.path.exists(gz)


def test_load_reads_whichever_form_exists_and_prefers_the_plain_one(tmp_dir):
    plain = os.path.join(tmp_dir, "jobs.json")
    with gzip.open(plain + ".gz", "wt", encoding="utf-8") as f:
        json.dump([{"from": "gz"}], f)
    assert processed.path("product") == plain + ".gz" and processed.load("product") == [{"from": "gz"}]
    with open(plain, "w") as f:
        json.dump([{"from": "plain"}], f)
    assert processed.path("product") == plain and processed.load("product") == [{"from": "plain"}]


def test_path_of_a_role_set_with_no_file_is_the_plain_path(tmp_dir):
    assert processed.path("mba") == os.path.join(tmp_dir, "jobs_mba.json")
