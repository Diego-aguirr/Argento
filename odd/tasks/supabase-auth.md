# Feature: Supabase auth + onboarding

**Branch:** `feat/supabase-auth` (remaining tasks T12/T13/T15 continue on
`feat/profile-and-seed` from `b45e506`)
**Created:** 2026-10-03
**Route:** delegated direct (writer delegation for migrations/README and onboarding batches)

## Objective

Ship real authentication against the user's Supabase project (signup, login,
logout, session persistence, route protection), then the onboarding flow that
fills `profiles` (name, username, profile image).

## Problem / Why

The app had static login/signup screens with no backend. The README's setup
steps described the schema but shipped no executable SQL, so the DDL had no
source of truth in the repo.

## Constraints

- Never commit or push to `main`; every `main` operation needs explicit human approval.
- No push to a remote unless the human asks in that moment.
- Never install or remove a dependency without an explicit yes.
- `.env` is never committed; `SUPABASE_SERVICE_ROLE_KEY` never enters app code.
- Errors shown to users are always mapped through `describeAuthError` /
  `describePostgrestError` — raw backend messages never reach the UI.
- All generated artifacts in English; reply to the human in Rioplatense Spanish.

## Checklist

- [x] **T1** Supabase, AsyncStorage and expo-image-picker dependencies — `0099f9a`
- [x] **T2** Supabase client, `AuthContext`, `describeAuthError`, `.env.example` + `.gitignore` fix — `5f9c3b3`
- [x] **T3** `AuthProvider` in root layout, RouteGuard with loading gate, login + signup wired — `c21d48e`
- [x] **T4** Hide the Expo-starter top bar on web without breaking tab routing — `83dac19`
- [x] **T5** Versioned `supabase/migrations/` + README `Database setup` section — `f6bca90`
- [x] **T6** *(human)* Run the migrations — done; verified live via REST: `profiles`
      returns all 5 columns (`limit=0` probe → 200), and bucket `profiles` exists
      (`/object/profiles/x` → `NoSuchKey`, not `NoSuchBucket`)
- [x] **T7** Onboarding screen: name + username → persist to `profiles` — `426f628`
      (profile image deferred to T15; **not yet run in Expo Go**)
- [x] **T8** Migration: `posts` table + `posts` storage bucket + RLS — shipped in
      `odd/tasks/posts-and-feed.md` (human ran it, live-verified)
- [x] **T9** Feed with pull-to-refresh — shipped in `posts-and-feed.md`
      (runtime pass pending there, on migration `20261004150000`)
- [x] **T10** Camera / photo library, crop 1:1, upload to storage — shipped in
      `posts-and-feed.md`
- [x] **T11** 24h expiration + countdown, one active post per user — shipped in
      `posts-and-feed.md` (review follow-ups T16/T17 tracked there)
- [ ] **T12** Profile screen (edit image, view details)
- [ ] **T13** Dev seeding script (`scripts/seed.ts` — README promises it, it does not exist)
- [x] **T14** `app.json` photo/camera permission strings before store submission —
      shipped in `posts-and-feed.md`
- [ ] **T15** Profile image in onboarding (bucket `profiles` already exists)

## Scope notes / accepted decisions

- **Prisma rejected.** It does support React Native (`runtime = "react-native"`),
  but Prisma Client needs a direct Postgres connection, which would ship DB
  credentials in the public JS bundle. Supabase's model is PostgREST + RLS.
  Prisma also cannot express RLS policies or storage buckets.
- **Supabase CLI not installed yet.** `supabase/migrations/` follows the CLI
  layout so `supabase db push` works unchanged later. Pasting into the SQL
  Editor bypasses migration history — adopting the CLI will need
  `supabase migration repair --status applied <timestamp>` for T6's files.
- **RouteGuard risk RESOLVED in T7.** `onboarding` lives inside `(auth)`, so the
  guard now returns early on `profileLoading`, branches on
  `onboarding_completed !== true`, and only redirects to tabs from inside the
  auth group. Each branch `return`s so conditions cannot stack.
- **Two loading flags are deliberate.** `loading` = persisted session read
  (splash gate, cold-start flash fix); `profileLoading` = profile row read.
  Merging them would hold the app on the splash for a network round-trip.
- **Domain types have a home now.** `Profile`, `fetchProfile`, `saveProfile`
  live in `src/lib/supabase/profiles.ts`; `PresentedError` stays in
  `src/lib/auth-errors.ts`; PostgREST errors map through
  `src/lib/db-errors.ts` (`describePostgrestError`).
- **Screens never navigate.** Onboarding saves and calls `refreshProfile()`;
  the RouteGuard is the single redirect decision point.

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint .` | exit 0, no output |
| Runtime harness | **N/A** — project has no `test` script in `package.json` |

Run after every task closure before committing.

**Gotcha found in T7:** typed routes were stale — `.expo/types/router.d.ts`
had been generated before `onboarding.tsx` existed, so `tsc` reported
`TS2367`/`TS2345` on the new route. Fixed by regenerating with a short
`CI=1 npx expo start`. Any newly added route file needs this before `tsc`.

## Progress & evidence

- Authored diff since branch point `7979c22`: **19 files, +995 / −102**
  (`pnpm-lock.yaml` accounts for 125 of the additions).
- **Delivery decision still open:** well over the ~400 authored-line heuristic,
  so when a PR is requested this needs `ask-on-risk` → chained PRs, or an
  explicit `size:exception`. Nothing has been pushed.
- Live backend verified: `GET /auth/v1/health` → 200 (GoTrue v2.197.0);
  `POST /auth/v1/token` with invented credentials → 400 `invalid_credentials`.
- Pasted in chat: the Postgres password. **Human must rotate it.**
- **Open collateral damage:** the human's `formatOnSave` prettier run rewrote
  quotes in `src/lib/supabase/client.ts` and `src/components/app-tabs.web.tsx`
  (single → double), against the project's single-quote convention. Revert
  pending; both left uncommitted. `.vscode/settings.json` also carries an
  unreviewed Prisma formatter line.

## Next step

Batch in order on `feat/profile-and-seed`, all **delegated direct** (each
task touches 2+ non-trivial files; one mapper explores first — 4-file rule):
**T15** profile image in onboarding → **T12** profile screen → **T13** seed
script (at T13 the human provides the README seeding details, by their
request). Route declaration per task is logged in Progress & evidence as it
closes. The human runtime pass for `posts-and-feed` (migration
`20261004150000_feed_profile_visibility.sql` + Expo Go) stays pending in
parallel.

## Rationale

Recorded per-commit reasons live in the Conventional Commit messages; this
file only carries the decisions a diff cannot show (Prisma rejection, CLI
deferred, RouteGuard resolution, two-flag loading design).
