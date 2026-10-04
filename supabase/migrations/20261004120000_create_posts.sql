-- posts table + RLS + one-active-per-user index + private posts bucket.
-- Paste into the Supabase SQL Editor (Dashboard -> SQL Editor -> Run),
-- or apply later with `supabase db push` once the CLI is adopted.

create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  image_url   text not null,
  description text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  is_active   boolean not null default true
);

create index posts_feed_idx
  on public.posts (created_at desc)
  where is_active;

-- One active post per user is a database guarantee, not an app convention:
-- the app deactivates the previous post before inserting, and this index
-- rejects any insert that would leave two active rows for the same user.
create unique index posts_one_active_per_user
  on public.posts (user_id)
  where is_active;

alter table public.posts enable row level security;

-- The feed shows everyone's posts, so reads are open to any signed-in user.
-- Expiration is a query filter (README), not a policy.
create policy "read posts"
  on public.posts for select
  to authenticated
  using (true);

create policy "insert own post"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Required for the deactivation step: a new post must be able to flip the
-- previous active row of the same user to is_active = false.
create policy "update own posts"
  on public.posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Private bucket for post images ({userId}/{timestamp}.{ext}).
-- Reads are open to signed-in users because the feed renders other people's
-- photos; writes stay locked to the owner's leading folder.
insert into storage.buckets (id, name, public)
values ('posts', 'posts', false)
on conflict (id) do nothing;

create policy "upload own post image"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "update own post image"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'posts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "read post images"
  on storage.objects for select to authenticated
  using (bucket_id = 'posts');
