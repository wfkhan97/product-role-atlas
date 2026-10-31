-- The doors (PLAN.md, "The four verbs (v19)", step B7): the door at #/ and the intake box at each verb's foot become
-- Tally forms with the native form as the fallback (web/doors.js). Project: gradbuddy-catalog (qqkzbzwmpkrmlicoxijy),
-- the one web/config.js points at. Applied by the owner in the SQL editor after 2026-10-26_cohort.sql; never from a
-- thread. No A/B column anywhere: that test was dropped (PLAN.md v19, decision 1).

-- Where a waitlist row came from gains the native fallback's places: `door` for the door's own form and
-- `intake_<surface>` for the intake box of a verb. A Tally form posts to Tally, never here; these rows are the
-- fallback's. The six sources of v18 stay so the old rows keep passing the check.
alter table public.waitlist drop constraint if exists waitlist_source_check;
alter table public.waitlist add constraint waitlist_source_check check (source in (
    'show', 'build', 'ways', 'fit', 'start', 'classes', 'door', 'intake_skills', 'intake_classes', 'intake_network'));

-- The door funnel: `door` when the door is drawn, `door_passed` on Continue, Skip for now or the Tally return,
-- `home_<verb>` when a card on home is clicked, and `intake_<surface>` when an intake box takes an email (the Tally
-- form or the native one). The names of before stay.
alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
    'start', 'start_stage', 'you_done', 'resume_read', 'explore', 'field', 'role', 'fit', 'course_read', 'event_prep',
    'classes', 'posting_link', 'waitlist_show', 'waitlist_build', 'waitlist_ways', 'waitlist_fit', 'waitlist_start',
    'waitlist_classes', 'play',
    'door', 'door_passed', 'home_jobs', 'home_skills', 'home_classes', 'home_network',
    'intake_skills', 'intake_classes', 'intake_network'));

-- The surface a row belongs to: door, jobs, skills, classes or network. web/capture.js sends the key only when the
-- screen gives one, so every row of before this migration reads null, and pipeline/funnel.py runs before and after.
alter table public.waitlist add column if not exists surface text
    check (surface is null or surface in ('door', 'jobs', 'skills', 'classes', 'network'));
comment on column public.waitlist.surface is 'The surface the row belongs to (door, jobs, skills, classes, network); null for rows from before 2026-10-31.';
alter table public.events add column if not exists surface text
    check (surface is null or surface in ('door', 'jobs', 'skills', 'classes', 'network'));
comment on column public.events.surface is 'The surface the event belongs to (door, jobs, skills, classes, network); null when the screen gave none.';
