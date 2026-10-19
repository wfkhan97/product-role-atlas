"""pipeline/adapters/common.py: the HTML stripper every adapter uses, and the retry loop around every request.
No network: the session's request method is replaced by a fake."""
import logging

import pytest
import requests

from pipeline.adapters import common
from pipeline.adapters.common import strip_html


# ---------- strip_html ----------
def test_strip_html_decodes_entities_and_drops_nested_tags():
    assert strip_html("<p>Hello &amp; <b>welcome</b> to <a href='x'>Acme</a></p>") == "Hello & welcome to Acme"


def test_strip_html_turns_breaks_and_list_items_into_lines():
    assert strip_html("one<br>two<br/>three") == "one\ntwo\nthree"
    assert strip_html("<ul><li>one</li><li>two</li></ul>") == "- one\n- two"
    assert strip_html("<p>a</p><p>b</p><div>c</div>") == "a\nb\nc"


def test_strip_html_drops_script_and_style_with_their_content():
    assert strip_html("start<script type='text/javascript'>alert(1)</script> middle <STYLE>p { color: red }</style>end") == "start middle end"


def test_strip_html_decodes_a_doubly_encoded_posting():
    assert strip_html("&lt;p&gt;double &amp;amp; encoded&lt;/p&gt;") == "double & encoded"


def test_strip_html_collapses_blank_lines_and_spaces():
    assert strip_html("  a   b \n\n\n\n c  ") == "a b\n\nc"


def test_strip_html_of_nothing_is_an_empty_string():
    assert strip_html(None) == "" and strip_html("") == ""


# ---------- get and post: retries, 429s, what is logged ----------
class Answer:
    def __init__(self, status):
        self.status_code = status


@pytest.fixture
def no_sleep(monkeypatch):
    waits = []
    monkeypatch.setattr(common.time, "sleep", waits.append)
    common.STATS.clear()
    return waits


def fake_request(script):
    """A session method that plays `script` in order: an int is a status code, an exception class is raised."""
    calls = []

    def request(method, url, **kw):
        calls.append((method, url, kw))
        step = script[len(calls) - 1]
        if isinstance(step, type) and issubclass(step, Exception):
            raise step("connection reset")
        return Answer(step)
    return request, calls


def test_get_waits_on_429_twice_then_returns_the_answer(monkeypatch, no_sleep):
    request, calls = fake_request([429, 429, 200])
    monkeypatch.setattr(common.SESSION, "request", request)
    assert common.get("https://board.example/jobs").status_code == 200
    assert len(calls) == 3 and no_sleep == [5, 10], "5 seconds, then 10"
    assert common.STATS["429"] == 2 and common.STATS["requests"] == 3 and common.STATS["retries"] == 0


def test_get_returns_the_third_429_rather_than_wait_again(monkeypatch, no_sleep):
    request, calls = fake_request([429, 429, 429])
    monkeypatch.setattr(common.SESSION, "request", request)
    assert common.get("https://board.example/jobs").status_code == 429
    assert len(calls) == 3 and common.STATS["429"] == 2


def test_post_retries_a_network_error_twice_then_raises(monkeypatch, no_sleep):
    request, calls = fake_request([requests.ConnectionError, requests.ConnectionError, 200])
    monkeypatch.setattr(common.SESSION, "request", request)
    assert common.post("https://board.example/search", json={"q": "x"}).status_code == 200
    assert calls[0][0] == "POST" and calls[0][2]["json"] == {"q": "x"} and calls[0][2]["timeout"] == 30
    assert common.STATS["retries"] == 2 and no_sleep == [2, 2]
    request, calls = fake_request([requests.ConnectionError] * 3)
    monkeypatch.setattr(common.SESSION, "request", request)
    with pytest.raises(requests.ConnectionError):
        common.get("https://board.example/jobs")
    assert len(calls) == 3


def test_retry_warnings_name_the_url_and_never_the_headers(monkeypatch, no_sleep, caplog):
    request, _ = fake_request([429, requests.ConnectionError, 200])
    monkeypatch.setattr(common.SESSION, "request", request)
    caplog.set_level(logging.WARNING, logger="pipeline")
    common.get("https://board.example/jobs", headers={"Authorization": "Bearer SECRET-TOKEN-VALUE", "X-Api-Key": "SECRET-KEY-VALUE"})
    assert [r.levelname for r in caplog.records] == ["WARNING", "WARNING"]
    assert "https://board.example/jobs" in caplog.text
    assert "SECRET" not in caplog.text and "Authorization" not in caplog.text
