-- The cohort application (PLAN.md, "The cohort hook (v18)", step 1): the waitlist box becomes the application for
-- Cohort 1. Project: gradbuddy-catalog (qqkzbzwmpkrmlicoxijy), the one web/config.js points at. Applied by the owner in
-- the SQL editor after 2026-10-25_capture.sql; never from a thread.

-- The one free-text field in the whole capture: "the role you want, in your words", typed knowingly into the
-- application box, at most 200 characters, shown to no one but the owner (pipeline.funnel prints it only under --notes).
alter table public.waitlist add column if not exists note text check (char_length(note) <= 200);
comment on column public.waitlist.note is 'The one free-text field: the role the applicant wants, in their words, typed knowingly; at most 200 characters; shown to no one but the owner.';

-- The class picker's foot is a sixth place to apply from: source gains `classes`, and the matching event name
-- `waitlist_classes` (the 2026-10-25 migration named the constraints by Postgres's default, <table>_<column>_check).
alter table public.waitlist drop constraint if exists waitlist_source_check;
alter table public.waitlist add constraint waitlist_source_check check (source in ('show', 'build', 'ways', 'fit', 'start', 'classes'));
alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
    'start', 'start_stage', 'you_done', 'resume_read', 'explore', 'field', 'role', 'fit', 'course_read', 'event_prep',
    'classes', 'posting_link', 'waitlist_show', 'waitlist_build', 'waitlist_ways', 'waitlist_fit', 'waitlist_start',
    'waitlist_classes', 'play'));
