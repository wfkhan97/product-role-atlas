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
    common._answers.clear()
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


def test_a_5xx_is_waited_on_like_a_429(monkeypatch, no_sleep):
    request, calls = fake_request([503, 502, 200])
    monkeypatch.setattr(common.SESSION, "request", request)
    assert common.get("https://board.example/jobs").status_code == 200
    assert no_sleep == [5, 10] and common.STATS["5xx"] == 2


def test_a_listing_page_that_fails_is_recorded_and_a_detail_page_is_not(monkeypatch, no_sleep):
    common.start_fetch()
    request, _ = fake_request([404, 500, 500, 500, 200])
    monkeypatch.setattr(common.SESSION, "request", request)
    common.get("https://board.example/job/1")                      # a detail page: its 404 decides nothing
    common.post("https://board.example/search", listing=True)      # three 500s: the page is not read
    common.get("https://board.example/search?page=2", listing=True)
    assert common.listing_failures() == ["POST https://board.example/search: HTTP 500"]
    common.listing_failed("phenom: no jobs key for 'analyst'")
    assert len(common.listing_failures()) == 2
    common.start_fetch()
    assert common.listing_failures() == [], "each employer's fetch starts clean"


def test_listing_failures_are_kept_per_thread():
    import threading
    common.start_fetch()
    common.listing_failed("this thread")
    seen = []
    t = threading.Thread(target=lambda: (common.start_fetch(), seen.append(common.listing_failures())))
    t.start(); t.join()
    assert seen == [[]] and common.listing_failures() == ["this thread"]


# ---------- a site that refuses this address ----------
def test_a_site_that_answers_429_to_most_requests_is_refused_and_no_longer_asked(monkeypatch, no_sleep):
    request, calls = fake_request([429] * 200)
    monkeypatch.setattr(common.SESSION, "request", request)
    for _ in range(16):   # three tries each: 48 answers, all 429, under REFUSE_MIN
        assert common.get("https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/jobs").status_code == 429
    assert not common.refused("acme.wd5.myworkdayjobs.com")
    with pytest.raises(common.Refused):   # the 50th answer tips it: the third try is not made
        common.get("https://other.wd1.myworkdayjobs.com/wday/cxs/other/jobs")
    assert len(calls) == 50 and common.refused("https://third.wd3.myworkdayjobs.com/x")
    with pytest.raises(common.Refused):
        common.post("https://third.wd3.myworkdayjobs.com/x")
    assert len(calls) == 50, "a refused site is not asked again"
    assert common.refusals() == {"myworkdayjobs.com": (50, 50)}
    assert not common.refused("https://boards.greenhouse.io/acme"), "another site is not touched"


def test_a_site_with_some_429s_among_many_answers_is_not_refused(monkeypatch, no_sleep):
    request, _ = fake_request(([429] + [200] * 9) * 30)   # one in ten, as a home address meets on a long run
    monkeypatch.setattr(common.SESSION, "request", request)
    for _ in range(200):
        common.get("https://acme.wd5.myworkdayjobs.com/jobs")
    assert not common.refused("https://acme.wd5.myworkdayjobs.com/jobs") and common.refusals() == {}


def test_site_of_is_the_last_two_labels_of_the_host():
    assert common.site_of("https://acme.wd5.myworkdayjobs.com/wday/cxs") == "myworkdayjobs.com"
    assert common.site_of("acme.wd5.myworkdayjobs.com") == "myworkdayjobs.com"
    assert common.site_of("https://Boards.Greenhouse.io:443/x") == "greenhouse.io"
    assert common.site_of("") == ""

