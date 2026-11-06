-- The visitor journey, step 3: saved state (PLAN.md, "The visitor journey", step 3). Project: gradbuddy-catalog
-- (qqkzbzwmpkrmlicoxijy), the one web/config.js points at. Applied after 2026-11-05_journey.sql.
--
-- Three tables, every row a signed-in person's own (auth.uid()), read and written from the browser with the
-- person's token (web/state.js) under row-level security; nothing for anon; the service role for the owner's scripts.
--   profiles  one row per person: the About-you answers (where, stage, fields) as the browser keeps them, the campus
--             flag read off the verified address, the hash of the résumé on file (never its text)
--   hearts    the roles a person hearts (one list: the card's heart and the open role's are the same)
--   reads     one row per résumé (a SHA-256 of its normalized text, computed in the browser) per role: the band, the
--             core and common skills with their state and the one résumé line that showed each, the gaps, the model
--             read's inferred ids. The text itself never leaves the browser but for the model read, as before.
-- Forgetting (the button on About you) deletes the person's rows in all three; auth.users stays until the owner deletes it.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  you jsonb not null default '{}'::jsonb,
  campus text check (campus is null or campus ~ '^[a-z][a-z_]{1,23}$'),
  resume_hash text check (resume_hash is null or resume_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per signed-in person: About-you answers, campus flag, the hash of the résumé on file (never its text).';

create table if not exists public.hearts (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id text not null check (role_id ~ '^[a-z][a-z0-9_.]{1,63}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
comment on table public.hearts is 'The roles a person hearts; one list for the card and the open role.';

create table if not exists public.reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_hash text not null check (resume_hash ~ '^[0-9a-f]{64}$'),
  role_id text not null check (role_id ~ '^[a-z][a-z0-9_.]{1,63}$'),
  band text check (band is null or band ~ '^[a-z_]{1,24}$'),
  skills jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  inferred jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, resume_hash, role_id),
  check (pg_column_size(skills) <= 65536 and pg_column_size(gaps) <= 8192 and pg_column_size(inferred) <= 8192)
);
comment on table public.reads is 'One row per résumé (its hash) per role: the band, the skills with state and showing line, the gaps, the inferred ids.';

alter table public.profiles enable row level security;
alter table public.hearts enable row level security;
alter table public.reads enable row level security;

-- own rows only, for every verb; nothing for anon
drop policy if exists "profiles: own" on public.profiles;
create policy "profiles: own" on public.profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "hearts: own" on public.hearts;
create policy "hearts: own" on public.hearts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "reads: own" on public.reads;
create policy "reads: own" on public.reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles, public.hearts, public.reads from anon;
grant select, insert, update, delete on public.profiles, public.hearts, public.reads to authenticated;

create index if not exists reads_user_created_idx on public.reads (user_id, created_at desc);
