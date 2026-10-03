# Feature: Supabase auth + onboarding

**Branch:** `feat/supabase-auth`
**Created:** 2026-10-03
**Route:** delegated direct (writer delegation for migrations/README batch)

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
- Errors shown to users are always mapped through `describeAuthError`
  (`src/lib/auth-errors.ts`) — raw backend messages never reach the UI.
- All generated artifacts in English; reply to the human in Rioplatense Spanish.

## Checklist

- [x] **T1** Supabase, AsyncStorage and expo-image-picker dependencies — `0099f9a`
- [x] **T2** Supabase client, `AuthContext`, `describeAuthError`, `.env.example` + `.gitignore` fix — `5f9c3b3`
- [x] **T3** `AuthProvider` in root layout, RouteGuard with loading gate, login + signup wired — `c21d48e`
- [x] **T4** Hide the Expo-starter top bar on web without breaking tab routing — `83dac19`
- [x] **T5** Versioned `supabase/migrations/` + README `Database setup` section — `f6bca90`
- [ ] **T6** *(human)* Run both migrations in Dashboard → SQL Editor, then the verification query
- [ ] **T7** Onboarding screen: name, username, profile image → persist to `profiles`
- [ ] **T8** Migration: `posts` table + `posts` storage bucket + RLS
- [ ] **T9** Feed with pull-to-refresh
- [ ] **T10** Camera / photo library, crop 1:1, upload to storage
- [ ] **T11** 24h expiration + countdown, one active post per user
- [ ] **T12** Profile screen (edit image, view details)
- [ ] **T13** Dev seeding script (`scripts/seed.ts` — README promises it, it does not exist)
- [ ] **T14** `app.json` photo/camera permission strings before store submission

## Scope notes / accepted decisions

- **Prisma rejected.** It does support React Native (`runtime = "react-native"`),
  but Prisma Client needs a direct Postgres connection, which would ship DB
  credentials in the public JS bundle. Supabase's model is PostgREST + RLS.
  Prisma also cannot express RLS policies or storage buckets.
- **Supabase CLI not installed yet.** `supabase/migrations/` follows the CLI
  layout so `supabase db push` works unchanged later. Pasting into the SQL
  Editor bypasses migration history — adopting the CLI will need
  `supabase migration repair --status applied <timestamp>` for T6's two files.
- **RouteGuard risk (deferred):** `onboarding` lives inside `(auth)`, and the
  `user && inAuthGroup → replace('/(tabs)')` branch would eject a logged-in
  user from it. Must be revisited in T7.
- **Profile type deferred.** README defines no home for `Profile`/`PresentedError`
  domain types; decide with the human when posts land.

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npx eslint .` | exit 0, no output |
| Runtime harness | **N/A** — project has no `test` script in `package.json` |

Run after every task closure before committing.

## Progress & evidence

- Authored diff since branch point `7979c22`: **14 files, +629 / −97**
  (`pnpm-lock.yaml` accounts for 125 of the additions).
- **Delivery decision still open:** over the ~400 authored-line heuristic, so
  when a PR is requested this needs `ask-on-risk` → chained PRs, or an explicit
  `size:exception`. Nothing has been pushed.
- Live backend verified: `GET /auth/v1/health` → 200 (GoTrue v2.197.0);
  `POST /auth/v1/token` with invented credentials → 400 `invalid_credentials`,
  confirming the `describeAuthError` key is correct.
- Pasted in chat: the Postgres password. **Human must rotate it.**

## Next step

T6 — human runs both migrations and reports the `Run` result plus
`select id, name, username, onboarding_completed from public.profiles;`
(expected: exactly 1 row). Then T7 (onboarding).

## Rationale

Recorded per-commit reasons live in the Conventional Commit messages; this
file only carries the decisions a diff cannot show (Prisma rejection, CLI
deferred, RouteGuard risk).
