"""The tech set samples its postings (pipeline/scrape.py, PLAN.md "A third role set"): US only, at most a cap of open
postings per employer and role, the ones the backlog holds always kept, nothing ever deleted. The Workday adapter
keeps a budget per role at the listing and fetches no detail outside the country or in a count-only run."""
from pipeline import roles_tech, scrape
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


# --- a posting the backlog holds keeps its text: no request for it (common.Held, scrape.fresh_texts) ---

def held_job(i, title="Software Engineer", **kw):
    return dict(common.job("X", title, f"https://h/en-US/s/job/{title}/{i}", "the stored text", external_id=f"R{i}"),
                first_seen="2026-10-01", last_seen="2026-11-08", **kw)


def test_workday_reads_no_detail_for_a_posting_held_under_the_same_path_and_title(monkeypatch):
    held = common.Held([held_job(0), held_job(1), held_job(2, title="Software Engineer II")])
    out, details = run_workday(monkeypatch, {"held": held}, listing(4))
    assert details == 2, "0 and 1 are held; 2 is held under another title and 3 is new"
    assert [j["description"] for j in out] == ["the stored text", "the stored text", "d", "d"]
    assert out[0]["first_seen"] == "2026-10-01" and out[0] is not held.by_id["R0"], "a copy of the stored posting"
    assert common.texts_reused() == 2


def test_a_text_is_due_again_between_half_and_one_and_a_half_times_the_days():
    keys = [f"R{i}" for i in range(400)]
    assert not any(scrape.text_due(k, "2026-11-01", "2026-11-14", 28) for k in keys), "13 days: none"
    assert all(scrape.text_due(k, "2026-10-01", "2026-11-12", 28) for k in keys), "42 days: all"
    at_28 = sum(scrape.text_due(k, "2026-10-18", "2026-11-15", 28) for k in keys)
    assert 140 < at_28 < 260, "about half at the middle, so one run's postings spread over the later runs"
    assert scrape.text_due("R1", "2026-10-18", "2026-11-15", 28) == scrape.text_due("R1", "2026-10-18", "2026-11-15", 28)


def test_the_held_texts_are_the_open_ones_with_a_text_that_is_not_due():
    old = {"jobs": [held_job(0), held_job(1, closed="2026-11-08"), dict(held_job(2), description=""),
                    held_job(3, text_seen="2026-08-01"), held_job(4, text_seen="2026-11-07")]}
    fresh = scrape.fresh_texts(old, "2026-11-15")
    assert [j["external_id"] for j in fresh] == ["R0", "R4"], "not the closed one, the one without text, the old text"
    assert fresh[0]["text_seen"] == "2026-11-08", "before text_seen existed the text was read when the posting was seen"
    assert "text_seen" not in old["jobs"][0] and scrape.fresh_texts(old, "2026-11-15", 0) == []


def test_oracle_successfactors_and_apple_ask_the_backlog_before_the_posting(monkeypatch):
    from pipeline.adapters import apple, oracle_hcm, successfactors

    class Page:
        status_code = 200

        def __init__(self, body=None, text=""):
            self.body, self.text = body, text

        def json(self):
            return self.body
    stored = dict(common.job("X", "Product Manager", "u", "the stored text"), last_seen="2026-11-08")
    asked = []

    def oracle(url, headers=None, listing=False):
        if listing:
            return Page({"items": [{"requisitionList": [{"Id": "7", "Title": "Product Manager"}, {"Id": "8", "Title": "Product Manager"}]}]})
        asked.append(url)
        return Page({"items": [{"Title": "Product Manager", "ExternalDescriptionStr": "read"}]})
    monkeypatch.setattr(oracle_hcm, "get", oracle)
    monkeypatch.setattr(oracle_hcm.time, "sleep", lambda s: None)
    cfg = {"host": "h", "queries": ["q"], "held": common.Held([dict(stored, external_id="7")])}
    out = oracle_hcm.fetch("X", cfg, lambda t: True)
    assert [j["description"].strip() for j in out] == ["the stored text", "read"] and len(asked) == 1 and "%228%22" in asked[0]

    def sf(url, listing=False):
        if listing:
            return Page(text='<a class="jobTitle-link" href="/job/a/1">Product Manager</a><a class="jobTitle-link" href="/job/b/2">Product Manager</a>')
        asked.append(url)
        return Page(text='<span class="jobdescription">' + "read " * 80 + "</span></div>")
    del asked[:]
    monkeypatch.setattr(successfactors, "get", sf)
    cfg = {"host": "h", "queries": ["q"], "held": common.Held([dict(stored, url="https://h/job/a/1")])}
    out = successfactors.fetch("X", cfg, lambda t: True)
    assert out[0]["description"] == "the stored text" and asked == ["https://h/job/b/2"] and len(out) == 2

    def apple_get(url, headers=None):
        asked.append(url)
        return Page({"res": {"description": "read"}})
    del asked[:]
    rows = [{"positionId": "200", "postingTitle": "Product Manager"}, {"positionId": "201", "postingTitle": "Product Manager"}]
    monkeypatch.setattr(apple, "post", lambda url, listing=False, json=None, headers=None: Page({"res": {"searchResults": rows, "totalRecords": 2}}))
    monkeypatch.setattr(apple, "get", apple_get)
    monkeypatch.setattr(apple.time, "sleep", lambda s: None)
    out = apple.fetch("X", {"queries": ["q"], "held": common.Held([dict(stored, external_id="200")])}, lambda t: True)
    assert out[0]["description"] == "the stored text" and out[1]["description"].startswith("read") and len(asked) == 1 and "/201" in asked[0]
