-- The visitor journey, step 6: feedback (PLAN.md, "The visitor journey", decision 6). Project: gradbuddy-catalog
-- (qqkzbzwmpkrmlicoxijy), the one web/config.js points at. Applied after 2026-11-05_state.sql, by the owner.
--
-- One table, written from the browser with the publishable key (web/feedback.js) by anyone, signed in or not: the
-- sentence typed into the box (at most 500 characters), the email only when typed, the screen the box opened on,
-- whether the prompt opened it or the Feedback link did, the session and visitor ids of capture, the person's id
-- when the browser holds a session. Nothing is readable from the browser: anon and authenticated may insert one row,
-- never select. The owner reads it in the SQL editor; pipeline.funnel prints the counts.
-- Until this is applied, CONFIG.FEEDBACK_ENABLED stays false (PostgREST refuses a row for a table it lacks).

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  text text not null check (char_length(text) between 1 and 500),
  email text check (email is null or (char_length(email) <= 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  screen text check (screen is null or screen ~ '^[a-z][a-z_]{1,23}$'),
  prompted boolean not null default false,
  session text check (session is null or session ~ '^[0-9a-f]{24}$'),
  visitor text check (visitor is null or visitor ~ '^[0-9a-f]{24}$'),
  user_id uuid
);
comment on table public.feedback is 'What a visitor typed into the feedback box: the sentence, the email if typed, the screen, whether prompted. Insert only from the browser.';

alter table public.feedback enable row level security;

drop policy if exists "feedback: anyone may insert" on public.feedback;
create policy "feedback: anyone may insert" on public.feedback for insert to anon, authenticated with check (true);

revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;
