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


def test_feedback_counts_rows_prompted_emails_and_by_screen_without_the_text():
    rows = [{"created_at": D(5), "screen": "role", "prompted": True, "has_email": False},
            {"created_at": D(5), "screen": "fit", "prompted": False, "has_email": True},
            {"created_at": D(6), "screen": "role", "prompted": False, "has_email": True},
            {"created_at": D(6), "screen": None, "prompted": True, "has_email": False}]
    fb = funnel.feedback_counts(rows)
    assert fb == {"rows": 4, "prompted": 2, "with_email": 2, "by_screen": [("role", 2), ("(none)", 1), ("fit", 1)]}
    assert funnel.feedback_counts([]) == {"rows": 0, "prompted": 0, "with_email": 0, "by_screen": []}


def test_guide_counts_sessions_shown_completed_and_skipped_per_screen():
    rows = [row(5, "s1", "cta_shown", cta="guide_home", screen="home"), row(5, "s1", "cta_click", cta="guide_home", screen="home"),
            row(5, "s1", "cta_done", cta="guide_home", screen="home"),
            row(5, "s2", "cta_shown", cta="guide_home", screen="home"), row(5, "s2", "cta_done", cta="guide_skip", screen="home"),
            row(5, "s3", "cta_shown", cta="guide_home", screen="home"),                       # left the screen: abandoned
            row(5, "s3", "cta_shown", cta="guide_home", screen="home"),                       # a relaunch in the same session counts once
            row(5, "s3", "cta_click", cta="guide_relaunch", screen="home"),                   # the link is not a screen
            row(5, "s4", "cta_shown", cta="guide_classes", screen="classes"), row(5, "s4", "cta_done", cta="guide_skip", screen="classes"),
            row(5, "s5", "cta_done", cta="guide_skip"),                                       # a skip without a screen counts nowhere
            row(5, "s6", "cta_shown", cta="heart")]                                           # another call to action
    assert funnel.guide(rows) == [("home", 3, 1, 1), ("classes", 1, 0, 1)]
    assert funnel.guide([]) == []
