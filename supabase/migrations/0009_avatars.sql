-- Profile pictures. Files live in the public "avatars" Storage bucket under <user_id>/<timestamp>.webp;
-- uploads go through /api/profile/avatar with the service role, so the bucket needs no RLS policies.
-- Run in Supabase → SQL Editor. Safe to re-run.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
