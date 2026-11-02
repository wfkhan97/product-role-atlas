-- The positioning intake (owner's feedback on the live site, 2026-11-01): a gap row on the role rail now offers two
-- links, "Help me build this skill" (the skills box, source intake_skills, as before) and "Help me improve my
-- positioning", a box of its own whose native fallback sends the source `intake_positioning`, the event of the same
-- name and the surface `positioning` (web/doors.js SURFACES, web/capture.js). Project: gradbuddy-catalog, the one
-- web/config.js points at. Applied by the owner in the SQL editor after 2026-10-31_doors.sql; never from a thread.
-- Until it is applied, a positioning row is refused by the check and the box says it could not send.

alter table public.waitlist drop constraint if exists waitlist_source_check;
alter table public.waitlist add constraint waitlist_source_check check (source in (
    'show', 'build', 'ways', 'fit', 'start', 'classes', 'door', 'intake_skills', 'intake_classes', 'intake_network',
    'intake_positioning'));

alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
    'start', 'start_stage', 'you_done', 'resume_read', 'explore', 'field', 'role', 'fit', 'course_read', 'event_prep',
    'classes', 'posting_link', 'waitlist_show', 'waitlist_build', 'waitlist_ways', 'waitlist_fit', 'waitlist_start',
    'waitlist_classes', 'play',
    'door', 'door_passed', 'home_jobs', 'home_skills', 'home_classes', 'home_network',
    'intake_skills', 'intake_classes', 'intake_network', 'intake_positioning'));

-- The surface column's check (an inline check in 2026-10-31_doors.sql, so Postgres named it <table>_surface_check)
-- gains `positioning`.
alter table public.waitlist drop constraint if exists waitlist_surface_check;
alter table public.waitlist add constraint waitlist_surface_check
    check (surface is null or surface in ('door', 'jobs', 'skills', 'classes', 'network', 'positioning'));
alter table public.events drop constraint if exists events_surface_check;
alter table public.events add constraint events_surface_check
    check (surface is null or surface in ('door', 'jobs', 'skills', 'classes', 'network', 'positioning'));
comment on column public.waitlist.surface is 'The surface the row belongs to (door, jobs, skills, classes, network, positioning); null for rows from before 2026-10-31.';
comment on column public.events.surface is 'The surface the event belongs to (door, jobs, skills, classes, network, positioning); null when the screen gave none.';
