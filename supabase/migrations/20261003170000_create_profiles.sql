-- profiles table + RLS + signup trigger + backfill.
-- Paste into the Supabase SQL Editor (Dashboard -> SQL Editor -> Run),
-- or apply later with `supabase db push` once the CLI is adopted.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  username    text unique,
  profile_image_url text,
  onboarding_completed boolean not null default false
);

-- name and username stay nullable: the row is created at signup, but the
-- user only fills them in during onboarding. NOT NULL here would break the
-- trigger below on every signup.

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Every auth.users row needs a matching profiles row: posts.user_id
-- references profiles.id, so a missing row would fail the first post.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts that existed before this migration never fired the trigger.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
