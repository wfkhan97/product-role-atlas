-- The visitor journey, step 1: logging (PLAN.md, "The visitor journey: accounts, saved state, logging", step 1).
-- Project: gradbuddy-catalog (qqkzbzwmpkrmlicoxijy), the one web/config.js points at. Applied by the owner in the SQL
-- editor after 2026-11-01_positioning.sql; never from a thread. pipeline/funnel.py reads the new columns only when
-- they exist (information_schema), so it runs before and after.

-- Every screen is an event now, and the names of later steps (the hearts, the sign-in, the tree) arrive without a
-- migration each: the closed list lives in web/capture.js (EVENTS, tested), and the table keeps only the shape, which
-- cannot carry a sentence. The names of before pass it.
alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name ~ '^[a-z][a-z0-9_]{1,39}$');

-- The visitor: one random id per browser (localStorage capture.visitor), so a return visit reads as one. Before this
-- migration a session id lived only for the browser session and nothing joined two visits; the About page says so
-- (web/copy.js, about.privacyEvents). Null for rows of before.
alter table public.events add column if not exists visitor text check (visitor is null or visitor ~ '^[0-9a-f]{24}$');
comment on column public.events.visitor is 'A random id per browser (localStorage), so a return visit reads as one; null for rows of before 2026-11-05.';

-- The signed-in person, once sign-in exists for everyone (step 2): auth.users.id, sent by the browser from its own
-- session; the anonymous insert policy stays, so the column is a claim, read as one (the funnel joins visitors first).
alter table public.events add column if not exists user_id uuid;
comment on column public.events.user_id is 'The signed-in person (auth.users.id) when the browser held a session; null for an anonymous visit.';

-- The screen the event belongs to (the route name: home, jobs, role, fit, map, …), on every event, so drop-off reads
-- per screen without a name per screen.
alter table public.events add column if not exists screen text check (screen is null or screen ~ '^[a-z][a-z_]{1,23}$');
comment on column public.events.screen is 'The route the event fired on (home, jobs, skills, role, fit, classes, network, map, …); null when the screen gave none.';

-- A call to action, for cta_shown · cta_click · cta_done: its id (door, intake_skills, heart, save_read, get_tree, …).
alter table public.events add column if not exists cta text check (cta is null or cta ~ '^[a-z][a-z0-9_]{1,31}$');
comment on column public.events.cta is 'The call to action a cta_* event is about (door, intake_<surface>, heart, save_read, get_tree, …).';

-- Visible time on a screen, in milliseconds, on a heartbeat event (web/capture.js sends one every thirty seconds of
-- visible, active time, capped at a minute, so a tab left open counts nothing).
alter table public.events add column if not exists ms integer check (ms is null or (ms >= 0 and ms <= 120000));
comment on column public.events.ms is 'Visible, active milliseconds since the last heartbeat (at most 120000); set on heartbeat events only.';

create index if not exists events_visitor_idx on public.events (visitor, created_at);
create index if not exists events_user_idx on public.events (user_id, created_at) where user_id is not null;
