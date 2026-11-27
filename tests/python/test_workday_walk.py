"""The Workday adapter walks a small board whole instead of searching it once per query (pipeline/adapters/workday.py,
WALK_UNDER; PLAN.md "Workday from a home address, in a tenth of the requests"): which boards are walked, what a walk
that fails leaves, and that the sampling set and a board narrowed by its own search text keep their searches."""
from pipeline.adapters import common, workday

CFG = {"host": "h", "tenant": "t", "site": "s", "queries": [f"q{i}" for i in range(20)]}


class Board:
    """A Workday listing of n postings titled "Analyst <i>"; `total` overrides what page 0 reports, `dry_from` makes
    pages from that one come back empty, `status` answers every request with that code."""
    def __init__(self, n, total=None, dry_from=None, status=200):
        self.n, self.total, self.dry_from, self.status, self.asked = n, total, dry_from, status, []

    def post(self, url, listing=False, json=None, headers=None):
        self.asked.append((json["searchText"], json["offset"] // 20))
        if self.status != 200:
            common.listing_failed(f"POST {url}: HTTP {self.status}")
            return Resp({}, self.status)
        page = json["offset"] // 20
        ids = [] if self.dry_from is not None and page >= self.dry_from else range(json["offset"], min(self.n, json["offset"] + 20))
        return Resp({"jobPostings": [{"externalPath": f"/job/{i}", "title": f"Analyst {i}", "locationsText": "New York, NY"} for i in ids],
                     "total": (self.total or self.n) if page == 0 else 0})

    def get(self, url, headers=None):
        return Resp({"jobPostingInfo": {"title": "t", "jobDescription": "d"}})


class Resp:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def json(self):
        return self.body


def fetch(monkeypatch, board, cfg=None, title_ok=lambda t: True):
    monkeypatch.setattr(workday, "post", board.post)
    monkeypatch.setattr(workday, "get", board.get)
    monkeypatch.setattr(workday.time, "sleep", lambda s: None)
    common.start_fetch()
    return workday.fetch("X", {**CFG, **(cfg or {})}, title_ok), common.listing_failures()


def test_a_small_board_is_walked_once_and_no_search_is_made(monkeypatch):
    board = Board(45)
    out, failed = fetch(monkeypatch, board)
    assert board.asked == [("", 0), ("", 1), ("", 2)], "three pages with no search text, page 0 read once"
    assert len(out) == 45 and not failed, "every posting, and the fetch is complete"


def test_the_walk_keeps_only_the_titles_the_role_set_wants(monkeypatch):
    out, _ = fetch(monkeypatch, Board(45), title_ok=lambda t: t.endswith("7"))
    assert len(out) == 4   # Analyst 7, 17, 27, 37


def test_a_board_at_the_counting_limit_or_over_is_searched(monkeypatch):
    board = Board(40, total=workday.WALK_UNDER)
    fetch(monkeypatch, board)
    assert board.asked[0] == ("", 0) and {q for q, _ in board.asked[1:]} == set(CFG["queries"]), "one question, then the searches"


def test_a_board_with_more_pages_than_twice_its_searches_is_searched(monkeypatch):
    board = Board(40, total=900)   # 45 pages against 20 searches: under the 2x rule
    fetch(monkeypatch, board, {"queries": ["a", "b"]})   # 45 pages against 2 searches (floor 25): searched
    assert {q for q, _ in board.asked[1:]} == {"a", "b"}


def test_a_walk_that_runs_dry_before_the_total_is_an_incomplete_fetch(monkeypatch):
    board = Board(100, dry_from=2)
    out, failed = fetch(monkeypatch, board)
    assert len(out) == 40 and len(failed) == 1 and "ran dry" in failed[0]
    assert all(q == "" for q, _ in board.asked), "no search is made after a failed walk"


def test_a_board_that_does_not_answer_is_not_searched_either(monkeypatch):
    board = Board(100, status=429)
    out, failed = fetch(monkeypatch, board)
    assert out == [] and board.asked == [("", 0)] and len(failed) == 1


def test_the_sampling_set_and_a_board_with_its_own_search_text_keep_their_searches(monkeypatch):
    for cfg in ({"max_pages": 2}, {"per_role": 5}, {"keep_queries": True}):
        board = Board(45)
        fetch(monkeypatch, board, cfg)
        assert ("", 0) not in board.asked and {q for q, _ in board.asked} == set(CFG["queries"]), cfg
