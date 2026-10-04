-- Feed visibility: a signed-in user must be able to read other users'
-- profile basics (name, username, avatar) to render the feed.
-- Two layers, both required:
--   1. the profiles table  -> the posts->profiles join returns null otherwise
--   2. the profiles bucket -> avatars are private objects
-- Paste into the Supabase SQL Editor (Dashboard -> SQL Editor -> Run).

-- Table: the existing "read own profile" policy stays; this one ORs with it
-- and exposes only profile rows, which carry name, username, avatar path and
-- onboarding_completed. No auth data (email, etc.) lives in this table.
create policy "read any profile"
  on public.profiles for select
  to authenticated
  using (true);

-- Storage: replace owner-only avatar reads with signed-in reads.
-- Still private: anonymous requests keep getting denied.
drop policy if exists "read own avatar" on storage.objects;

create policy "read avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profiles');
