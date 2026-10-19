"""pipeline/depth_gen.py: the model call, with requests.post replaced. No request leaves the test.

The bug fixed with these tests: when every attempt of `Models.ask` raised, the reply variable `d` was never bound
and the method crashed with UnboundLocalError instead of reporting the failure.
"""
import logging
import os

import pytest
import requests

from pipeline import depth_gen, log

KEY = "sk-or-v1-SENTINEL0123456789abcdef"


@pytest.fixture
def models(monkeypatch, tmp_path):
    monkeypatch.setattr(depth_gen, "OUT", str(tmp_path))
    monkeypatch.setattr(depth_gen.time, "sleep", lambda s: None)
    M = depth_gen.Models(dry=True)   # built dry so no .env is needed, then switched to live with a sentinel key
    M.dry = False
    M.key = KEY
    return M


def test_a_dry_run_sends_nothing_and_counts_the_request(models):
    models.dry = True
    assert models.ask("m", "prompt", "draft") is None
    assert models.sent == {"draft": 1}


def test_every_attempt_raising_is_reported_as_an_error_answer_not_a_crash(models, monkeypatch, caplog):
    calls = []

    def post(url, **kw):
        calls.append(url)
        raise requests.ConnectionError("connection reset by peer")
    monkeypatch.setattr(requests, "post", post)
    caplog.set_level(logging.WARNING, logger="pipeline")
    answer = models.ask("openai/test", "prompt", "draft")
    assert answer == {"_error": "ConnectionError: connection reset by peer"}
    assert len(calls) == 4, "four attempts, like a bad reply"
    assert models.cache == {} and not os.path.exists(models.path), "a failure is not cached: a rerun sends the request again"
    assert [r.levelname for r in caplog.records] == ["WARNING"] * 4 + ["ERROR"]
    assert "connection reset by peer" in caplog.records[-1].message


def test_a_bad_reply_then_a_good_one_is_the_good_answer_and_is_cached(models, monkeypatch):
    class Reply:
        def __init__(self, d):
            self.d = d

        def json(self):
            return self.d
    replies = iter([Reply({"error": "overloaded"}), Reply({"choices": [{"message": {"content": 'Sure: {"rungs": {}}'}}], "usage": {"cost": 0.01}})])
    monkeypatch.setattr(requests, "post", lambda url, **kw: next(replies))
    assert models.ask("openai/test", "prompt", "draft") == {"rungs": {}}
    assert len(models.cache) == 1 and os.path.exists(models.path)
    assert models.cost() == 0.01


def test_the_api_key_never_reaches_a_log_line(models, monkeypatch, pipeline_log):
    """The code path: the request failure is logged with the exception text, which a library may fill with the request.
    The formatter: the key is registered as a secret, so even an exception that quotes the header is masked."""
    log.hide(KEY)

    def post(url, **kw):
        raise requests.ConnectionError(f"request to {url} with headers {kw['headers']} failed")
    monkeypatch.setattr(requests, "post", post)
    models.ask("openai/test", "prompt", "draft")
    text = pipeline_log.getvalue()
    assert "request failed" in text and "no answer after 4 attempts" in text
    assert KEY not in text
    assert "Bearer ***" in text, "the header is quoted by the exception; its value is masked"
