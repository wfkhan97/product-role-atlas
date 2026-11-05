"""pipeline/funnel.py, the pure parts of the journey reports (2026-11-05): drop-off by day and screen, the calls to action
with the door and intake aliases, the returns by visitor and by signed-in person, the visible time. Plain rows, no
database."""
import datetime

from pipeline import funnel

D = lambda day, h=12: datetime.datetime(2026, 11, day, h, 0)


def row(day, session, name, visitor=None, user_id=None, screen=None, cta=None, ms=None, h=12):
    return {"created_at": D(day, h), "session": session, "name": name, "visitor": visitor, "user_id": user_id, "screen": screen, "cta": cta, "ms": ms}


def test_dropoff_counts_sessions_per_screen_per_day_from_screen_column_or_screen_named_event():
    rows = [row(5, "s1", "door", screen="door"), row(5, "s1", "home", screen="home"), row(5, "s1", "role", screen="role"),
            row(5, "s2", "home", screen="home"), row(5, "s2", "heartbeat", screen="home", ms=30000),
            row(6, "s3", "explore"),                       # before the migration: no screen column, the name says the screen
            row(6, "s3", "posting_link")]                  # not a screen
    out = funnel.dropoff(rows)
    assert [(d.isoformat(), n) for d, n, _ in out] == [("2026-11-05", 2), ("2026-11-06", 1)]
    assert out[0][2] == {"door": 1, "home": 2, "role": 1}
    assert out[1][2] == {"explore": 1}


def test_ctas_reads_cta_events_and_the_door_and_intake_aliases_by_session():
    rows = [row(5, "s1", "door"), row(5, "s1", "door_passed"), row(5, "s2", "door"),
            row(5, "s1", "cta_shown", cta="intake_skills"), row(5, "s1", "cta_shown", cta="intake_skills"), row(5, "s1", "intake_skills"),
            row(5, "s3", "cta_shown", cta="heart"), row(5, "s3", "cta_click", cta="heart"), row(5, "s3", "cta_done", cta="heart"),
            row(5, "s4", "cta_shown", cta="heart"), row(5, "s4", "cta_shown")]   # a cta_* row without a cta is ignored
    out = funnel.ctas(rows)
    assert out == [("door", 2, 0, 1), ("heart", 2, 1, 1), ("intake_skills", 1, 0, 1)]


def test_returns_counts_distinct_days_per_visitor_and_per_person_with_the_gaps():
    rows = [row(1, "a", "home", visitor="v1"), row(1, "a2", "role", visitor="v1"), row(4, "b", "home", visitor="v1"),
            row(2, "c", "home", visitor="v2"),
            row(2, "d", "home", visitor="v3", user_id="u1"), row(9, "e", "map", visitor="v4", user_id="u1"),
            row(3, "f", "home")]                            # no visitor and no person: counted nowhere
    out = funnel.returns(rows)
    assert (out["visitors"], out["returning"]) == (4, 1)
    assert (out["people"], out["people_returning"]) == (1, 1)
    assert out["gaps"] == [3, 7]


def test_time_on_sums_heartbeats_per_screen_in_seconds():
    rows = [row(5, "s1", "heartbeat", screen="role", ms=30000), row(5, "s1", "heartbeat", screen="role", ms=45000),
            row(5, "s2", "heartbeat", screen="fit", ms=30000), row(5, "s2", "role", screen="role"), row(5, "s3", "heartbeat", ms=1000)]
    secs, sessions = funnel.time_on(rows)
    assert secs == {"role": 75, "fit": 30, "(none)": 1}
    assert sessions == 3
