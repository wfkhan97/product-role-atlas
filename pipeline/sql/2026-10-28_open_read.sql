-- Sign-in paused behind a flag (PLAN.md, 2026-10-28): the eight catalog tables of the gradbuddy-catalog project read
-- by anyone with the publishable key, so CONFIG.CATALOG_OPEN (web/config.js) can pause every sign-in gate on the page
-- while the owner tests the whole flow. The existing "catalog read" policy for authenticated stays; this adds a second
-- policy for anon, select only (anon already holds the table grants Supabase gives by default; RLS was the gate).
-- `syllabi` and its bucket stay service-role only. The owner applies it in the Supabase SQL editor of the catalog
-- project (ref qqkzbzwmpkrmlicoxijy); a thread may not (the auto-mode classifier refuses a policy that widens reads).
--
-- What this exposes while it is on: the roster, the professor profiles (`professors.profile_md`, the compiled
-- identity and networking notes), the prior-term grading summaries and `classes.roster_syllabus_md` to anyone holding
-- the publishable key, with no session. Close it again before the site is launched (the block at the bottom).

create policy "open read" on public.classes          for select to anon using (true);
create policy "open read" on public.class_crosslists for select to anon using (true);
create policy "open read" on public.sections         for select to anon using (true);
create policy "open read" on public.meetings         for select to anon using (true);
create policy "open read" on public.class_instructors for select to anon using (true);
create policy "open read" on public.prior_offerings  for select to anon using (true);
create policy "open read" on public.rescrape_log     for select to anon using (true);
create policy "open read" on public.professors       for select to anon using (true);

-- To close the gates again (and set CATALOG_OPEN: false in web/config.js in the same change):
-- drop policy if exists "open read" on public.classes;
-- drop policy if exists "open read" on public.class_crosslists;
-- drop policy if exists "open read" on public.sections;
-- drop policy if exists "open read" on public.meetings;
-- drop policy if exists "open read" on public.class_instructors;
-- drop policy if exists "open read" on public.prior_offerings;
-- drop policy if exists "open read" on public.rescrape_log;
-- drop policy if exists "open read" on public.professors;
