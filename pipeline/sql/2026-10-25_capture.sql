-- Capture for the atlas (PLAN.md, "The demand-gen pass", step 1): the GradBuddy waitlist and anonymous funnel events.
-- Project: gradbuddy-catalog (qqkzbzwmpkrmlicoxijy), the one web/config.js points at. Applied by the owner in the SQL
-- editor; never from a thread. Both tables take anonymous inserts and nothing else: no select, update or delete for
-- anon or authenticated; the service role reads them (pipeline/funnel.py).

-- The waitlist: an email, where the person clicked (source), the role they were looking at, and what they had told
-- us (stage, program, fields). Nothing a person typed or dropped: no resume, no syllabus, no posting, no skill list.
create table if not exists public.waitlist (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz not null default now(),
  email text not null check (length(email) between 3 and 320 and position('@' in email) > 1),
  source text not null check (source in ('show', 'build', 'ways', 'fit', 'start')),
  role_id text,
  stage text check (stage is null or stage in ('looking', 'targeting', 'curious')),
  program text,
  fields text[],
  -- lower(email) as a column, so the browser's insert can name the conflict target (PostgREST's on_conflict takes
  -- columns, not expressions); the unique index below is the brief's "(lower(email), source)"
  email_key text generated always as (lower(email)) stored
);
create unique index if not exists waitlist_email_source on public.waitlist (email_key, source);
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon;
drop policy if exists "anyone may join" on public.waitlist;
create policy "anyone may join" on public.waitlist for insert to anon with check (true);

-- Funnel events: one row per screen reached or action taken, keyed by a per-browser-session random id that is written
-- nowhere else and never joined to an email. Names are the closed list below; no skill ids, no text, no file names.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (name in (
    'start', 'start_stage', 'you_done', 'resume_read', 'explore', 'field', 'role', 'fit', 'course_read', 'event_prep',
    'classes', 'posting_link', 'waitlist_show', 'waitlist_build', 'waitlist_ways', 'waitlist_fit', 'waitlist_start', 'play')),
  session text not null check (length(session) between 8 and 64),
  stage text check (stage is null or stage in ('looking', 'targeting', 'curious')),
  program text,
  role_id text,
  field_id text
);
create index if not exists events_created_at on public.events (created_at);
create index if not exists events_session on public.events (session);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant insert on public.events to anon;
drop policy if exists "anyone may count" on public.events;
create policy "anyone may count" on public.events for insert to anon with check (true);
