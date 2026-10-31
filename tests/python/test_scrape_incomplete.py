"""pipeline/scrape.py: an employer whose listing pages could not all be read closes nothing; a complete fetch closes
what did not come back. The adapter is a fake; no network, no database."""
import json
import sys

from pipeline import scrape
from pipeline.adapters import common


def _run(tmp_path, monkeypatch, adapter):
    (tmp_path / "data" / "raw" / "jobs").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data" / "registry.json").write_text(json.dumps([{"company": "Acme", "ats": "fake", "config": {}}]))
    path = tmp_path / "data" / "raw" / "jobs" / "acme.json"
    if not path.exists():
        old = [{"company": "Acme", "title": f"Product Manager {k}", "url": f"https://x/{k}", "external_id": k,
                "description": "", "first_seen": "2026-10-01", "last_seen": "2026-10-20"} for k in "abcdefghijkl"]
        path.write_text(json.dumps({"company": "Acme", "scraped_at": "2026-10-20T00:00:00", "jobs": old}))
    monkeypatch.setattr(scrape, "ROOT", str(tmp_path))
    monkeypatch.setitem(scrape.ADAPTERS, "fake", adapter)
    monkeypatch.setattr(sys, "argv", ["scrape", "--refresh", "--no-db", "--only", "Acme", "--workers", "1"])
    scrape.main()
    return json.loads(path.read_text())


def _jobs(keys):
    return [common.job("Acme", f"Product Manager {k}", f"https://x/{k}", "", external_id=k) for k in keys]


def test_an_unread_listing_page_closes_nothing(tmp_path, monkeypatch):
    def adapter(name, cfg, ok):
        common.listing_failed("fake: page 2 HTTP 500")
        return _jobs("abcdefgh")  # four of twelve missing: page 2 was not read
    blob = _run(tmp_path, monkeypatch, adapter)
    assert not any(j.get("closed") for j in blob["jobs"])
    assert blob["partial"].startswith("1 listing page(s) not read (fake: page 2 HTTP 500)")


def test_a_complete_fetch_closes_what_did_not_come_back(tmp_path, monkeypatch):
    blob = _run(tmp_path, monkeypatch, lambda name, cfg, ok: _jobs("abcdefgh"))
    assert sorted(j["external_id"] for j in blob["jobs"] if j.get("closed")) == list("ijkl")
    assert "partial" not in blob
