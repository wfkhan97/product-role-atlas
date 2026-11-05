"""The tech set samples its postings (pipeline/scrape.py, PLAN.md "A third role set"): US only, at most a cap of open
postings per employer and role, the ones the backlog holds always kept, nothing ever deleted. The Workday adapter
keeps a budget per role at the listing and fetches no detail outside the country or in a count-only run."""
from pipeline import roles_tech
from pipeline.adapters import common, workday
from pipeline.scrape import cap_new, in_country, merge

ENTRY = {"company": "X", "ats": "greenhouse", "group": "startup", "investor": None}
role = roles_tech.family


def job(url, title="Software Engineer", posted="2026-11-01", **more):
    return {"title": title, "url": url, "external_id": url, "description": "d", "posted": posted, **more}


def test_only_a_posting_placed_in_another_country_is_dropped():
    assert in_country("New York, NY") and in_country("Remote") and in_country("") and in_country("3 Locations")
    assert not in_country("London, UK") and not in_country("Bangalore, India")


def test_a_new_employer_keeps_the_newest_up_to_the_cap_per_role_and_counts_the_rest():
    fetched = [job(f"s{i}", posted=f"2026-10-{i + 1:02d}") for i in range(5)] + [job("d1", "Product Designer")]
    kept, sampled = cap_new(None, fetched, role, 3)
    assert sorted(j["url"] for j in kept) == ["d1", "s2", "s3", "s4"], "the three newest engineers, and the designer"
    assert sampled == {"software_engineer": 2}


def test_postings_the_backlog_holds_are_always_kept_and_count_against_the_cap():
    old = {"scraped_at": "2026-10-01T00:00:00", "jobs": [job("h1"), job("h2"), job("gone", closed="2026-10-15")]}
    fetched = [job("h1"), job("h2"), job("n1", posted="2026-11-03"), job("n2", posted="2026-11-02")]
    kept, sampled = cap_new(old, fetched, role, 3)
    assert sorted(j["url"] for j in kept) == ["h1", "h2", "n1"], "two held open + one new reach the cap; a closed one frees its slot"
    assert sampled == {"software_engineer": 1}
    jobs, _ = merge(old, kept, ENTRY, "2026-11-05")
    assert {j["url"] for j in jobs} == {"h1", "h2", "gone", "n1"}, "nothing is deleted"


def test_a_held_posting_over_the_cap_is_still_kept():
    old = {"scraped_at": "2026-10-01T00:00:00", "jobs": [job(f"h{i}") for i in range(4)]}
    kept, sampled = cap_new(old, [job(f"h{i}") for i in range(4)] + [job("n")], role, 3)
    assert len(kept) == 4 and sampled == {"software_engineer": 1}


class FakeWorkday:
    """Answers the Workday listing API with one page of postings and counts the detail fetches."""
    def __init__(self, postings):
        self.postings, self.details = postings, 0

    def post(self, url, listing=False, json=None, headers=None):
        page = self.postings if json["offset"] == 0 else []
        return Resp({"jobPostings": page, "total": len(self.postings)})

    def get(self, url, headers=None):
        self.details += 1
        return Resp({"jobPostingInfo": {"title": "t", "jobDescription": "d", "location": "New York, NY"}})


class Resp:
    status_code = 200

    def __init__(self, body):
        self.body = body

    def json(self):
        return self.body


def run_workday(monkeypatch, cfg, postings):
    fake = FakeWorkday(postings)
    monkeypatch.setattr(workday, "post", fake.post)
    monkeypatch.setattr(workday, "get", fake.get)
    monkeypatch.setattr(workday.time, "sleep", lambda s: None)
    common.start_fetch()
    out = workday.fetch("X", {"host": "h", "tenant": "t", "site": "s", "queries": ["software engineer"], **cfg}, role)
    return out, fake.details


def listing(n, title="Software Engineer", where="New York, NY"):
    return [{"title": title, "externalPath": f"/job/{title}/{i}", "locationsText": where} for i in range(n)]


def test_workday_keeps_a_budget_per_role_and_fetches_nothing_abroad(monkeypatch):
    postings = listing(6) + listing(2, where="London, UK") + listing(3, "Product Designer") + listing(2, "Account Executive")
    out, details = run_workday(monkeypatch, {"per_role": 4, "keep_location": in_country}, postings)
    assert details == len(out) == 7, "four engineers and three designers; no London posting, no account executive"


def test_workday_count_only_fetches_no_detail(monkeypatch):
    out, details = run_workday(monkeypatch, {"count_only": True}, listing(5))
    assert len(out) == 5 and details == 0 and out[0]["location"] == "New York, NY"
