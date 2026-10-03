-- Private storage bucket for profile images.
-- Path convention (README): {userId}/profile.{ext}
-- Paste into the Supabase SQL Editor (Dashboard -> SQL Editor -> Run).

insert into storage.buckets (id, name, public)
values ('profiles', 'profiles', false)
on conflict (id) do nothing;

-- The leading folder of every object must be the owner's user id, so a
-- user can only write under their own path.
create policy "upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "read own avatar"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
