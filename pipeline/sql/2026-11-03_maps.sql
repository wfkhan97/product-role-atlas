-- The apprentice maps (the build plan's B2): a private bucket `maps`, one folder per invited person, read with the
-- person's own session from #/signin and #/map (web/auth.js). Project: gradbuddy-catalog (qqkzbzwmpkrmlicoxijy), the
-- one web/config.js points at. Applied by the owner in the SQL editor; never from a thread.
--
-- The owner's four steps, in order:
--   1. Authentication. Providers > Email: "Allow new users to sign up" off, magic link on (the invite list is the
--      Users table). URL Configuration: the Site URL is the site's address, and the redirect allow list holds the
--      site's address and http://localhost:8002/** for a local check (two stars: one star stops at a slash, and the
--      link lands on <site>/#/map). Sign-ups off is what makes "This email has no invite." true.
--   2. This file, in the SQL editor.
--   3. The invite. Authentication > Users > Invite user, the student's email. Supabase's invite email can be ignored:
--      the student signs in from #/signin, which sends a magic link to an existing user only (create_user: false).
--   4. The publish. `.venv/bin/python -m pipeline.map_publish <slug> <email>` uploads the student's map.json to
--      maps/<user id>/map.json (CATALOG_SERVICE_ROLE_KEY in .env). `pipeline.map_feedback` lists what came back.
--
-- What a person can do here: read the objects of their own folder (<uid>/map.json and <uid>/feedback/*), and write
-- one file per card under <uid>/feedback/. Nothing else: no listing of another folder, no write to map.json (the
-- owner's script writes it with the service role, which bypasses these policies), no delete, nothing for anon.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maps', 'maps', false, 2097152, array['application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- read: the objects of the person's own folder, the map and their feedback files
drop policy if exists "maps: read own folder" on storage.objects;
create policy "maps: read own folder" on storage.objects for select to authenticated
    using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);

-- write: a feedback file of the person's own folder, <uid>/feedback/<card id>.json and nothing deeper
drop policy if exists "maps: write own feedback" on storage.objects;
create policy "maps: write own feedback" on storage.objects for insert to authenticated
    with check (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'feedback' and array_length(storage.foldername(name), 1) = 2
        and name ~ '^[0-9a-f-]+/feedback/[a-z0-9-]+\.json$');

-- overwrite: the same file again (x-upsert), the latest answer wins
drop policy if exists "maps: update own feedback" on storage.objects;
create policy "maps: update own feedback" on storage.objects for update to authenticated
    using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'feedback')
    with check (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] = 'feedback' and array_length(storage.foldername(name), 1) = 2
        and name ~ '^[0-9a-f-]+/feedback/[a-z0-9-]+\.json$');
