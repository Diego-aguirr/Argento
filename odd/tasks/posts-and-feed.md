# Feature: posts + feed (BeReal core)

**Branch:** `feat/posts-and-feed` (from `dbbc581`, tip of `feat/supabase-auth`)
**Created:** 2026-10-04
**Route:** delegated direct; T8 migration written inline (single well-understood file from the README spec)

## Objective

Ship the BeReal core: create one daily post per user (camera/library, 1:1 crop,
24h expiration) and show everyone's active posts in a feed.

## Problem / Why

Auth and onboarding exist (branch `feat/supabase-auth`), but there is no
`posts` table, no `posts` bucket, and no feed. README already specifies the
schema and queries; `supabase/migrations/` is the source of truth and is
missing the posts half.

## Constraints

- Never commit or push to `main`; push a branch only when the human asks in
  that moment.
- Never install or remove a dependency without an explicit yes.
- Errors reach the UI only through `describeAuthError` / `describePostgrestError`.
- Generated artifacts in English; reply to the human in Rioplatense Spanish.
- Expiration is a query filter, not a background job (README `Posts System`).
- **Reminder from the human:** onboarding still cannot load a profile photo
  (T15 in `odd/tasks/supabase-auth.md`) — out of scope here, do not forget it.

## Checklist

- [x] **T8** Migration: `posts` table + `posts` bucket + RLS — human ran it;
      verified live (both buckets `NoSuchKey`, both tables answer `[]` under RLS)
- [x] **T9** Feed with pull-to-refresh — code landed (4 files), `tsc` and
      `eslint` exit 0 (writer run + parent spot check). **Runtime check still
      pending:** human runs migration `20261004150000_feed_profile_visibility`
      and exercises the feed in Expo Go
- [x] **T10** Camera / photo library, crop 1:1, upload to the `posts` bucket
- [x] **T11** 24h expiration + one active post per user (deactivate previous
      before insert; unique index backs it in the DB)
- [x] **T14** `app.json` photo/camera permission strings (the checklist entry
      lives in supabase-auth.md as T14; checked off here because the create
      flow in this feature ships it)
- [x] **T16** Restore the previous active post when `createPost` fails after
      deactivating it (native review finding R3-001 — transient upload/insert
      failure currently unpublishes the old post with no recovery path)
- [x] **T17** Guard the initial load in `usePosts` with the `inFlight` ref so a
      concurrent `refresh()` cannot be clobbered by a late first-load response
      (native review finding R3-002)

## Scope notes / accepted decisions

- **One active post per user is enforced in the DB** with a partial unique
  index (`where is_active`), not only by app convention.
- **`posts` bucket is private with read-open-to-authenticated**: the feed shows
  other people's photos, so storage reads must be allowed for signed-in users;
  writes stay locked to the owner's folder (`{userId}/...`).
- **Avatar read policy RESOLVED in T9's extra migration.** The `profiles`
  bucket was owner-read-only, so feed avatars of other users would fail;
  `20261004150000_feed_profile_visibility.sql` drops `read own avatar` and
  grants `read avatars` to authenticated users (still private — anonymous
  stays denied). Not effective until the human runs it.
- **The create flow is an in-screen modal, not a route.** The FAB opens a
  source alert, the picker crops 1:1, and a React Native `Modal`
  (`src/components/create-post-modal.tsx`) shows preview + description. No new
  file under `src/app/` means no router type regeneration and nothing to
  deep-link — a transient review overlay never needs a URL.
- **Open follow-up from review (R3-003):** `created_at`/`expires_at` are
  derived from the device clock and override the DB defaults. Decide with the
  human whether to let Postgres apply `now()` instead — if so, keep the local
  `createdAtMs` only for the storage object path, which must not drift from
  the inserted `created_at`.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pending per task |
| `npx eslint .` | pending per task |
| Runtime harness | N/A — project has no `test` script |
| SQL migration | human runs it in the Supabase SQL Editor, then verifies live |

## Progress & evidence

- **2026-10-04 — T8:** `20261004120000_create_posts.sql` applied by the human;
  live probes confirmed table + both buckets. Earlier "NoSuchBucket" reading
  was a false alarm: the probe request lacked the `apikey` header.
- **2026-10-04 — T9:** delegated to one writer (4 files):
  `src/lib/supabase/posts.ts`, `src/hooks/usePosts.ts`,
  `src/components/post-card.tsx`, rewritten `src/app/(tabs)/index.tsx`.
  Extra migration `20261004150000_feed_profile_visibility.sql` (human-approved):
  feed join needs `profiles` rows readable, avatars readable, by authenticated.
  Verification: `npx tsc --noEmit` exit 0, `npx eslint .` exit 0 (writer + parent).
  Engram mirror of this document: saved (updated after every batch, topic
  `odd/posts-and-feed/tasks`).
- **Gotchas found:** supabase-js infers to-one embeds as arrays without
  generated DB types (handled with an `Array.isArray` branch, no `any`);
  `eslint-plugin-react-hooks` v7 treats `set-state-in-effect` /
  `set-state-in-render` as errors — countdown keeps `now` in state.
- **2026-10-06 — T10 + T11 + T14:** create-post flow — FAB on the home
  screen → source alert (camera / photo library) → `expo-image-picker` with
  1:1 crop → review modal (preview + optional description) → deactivate the
  active post → upload to `posts` at `{userId}/{createdAtMs}.{ext}` → insert
  with `expires_at = created_at + 24h`, `is_active = true` → feed refresh —
  plus the permission strings in `app.json`.
  Files touched: `src/lib/base64.ts` (new), `src/lib/supabase/posts.ts`
  (`createPost` + storage-error adapter), `src/lib/db-errors.ts`,
  `src/hooks/useCreatePost.ts` (new),
  `src/components/create-post-modal.tsx` (new),
  `src/app/(tabs)/index.tsx` (FAB + wiring), `app.json`
  (expo-image-picker plugin: `photosPermission` → `NSPhotoLibraryUsageDescription`,
  `cameraPermission` → `NSCameraUsageDescription`; on Android the CAMERA /
  storage permissions merge from the library manifest — Android has no
  usage-string equivalent).
  Verification: `npx tsc --noEmit` → **exit 0**; `npx eslint .` → **exit 0**.
  Runtime harness: **N/A** — no `test` script in `package.json`; the human
  runtime pass (Expo Go) is still pending, same as T9.
  Gotchas found in this slice:
  - storage-js documents that `Blob`/`FormData` "do not work as intended" in
    React Native and asks for an `ArrayBuffer`/typed-array body; Hermes ships
    no `atob`, so the picker's `base64: true` payload is decoded by the new
    dependency-free `src/lib/base64.ts` and uploaded as `Uint8Array` (RN's
    XHR sends views as binary). Decoder verified empirically against Node's
    `Buffer` — 505 cases, 0 failures.
  - `PostgrestError` in supabase-js v2.117 is a class (`toJSON`, `name`), so
    storage failures are adapted with `new PostgrestError({...})`; a plain
    object literal fails `tsc` with TS2739.
  - SQLSTATE 23505 is shared by the username constraint and
    `posts_one_active_per_user`, and the default mapping said "Username
    taken"; `describePostgrestError` now reads the constraint name out of the
    message to separate them, and storage `403` maps to the existing
    "Not allowed" copy.
  - T14's checklist entry lives in `supabase-auth.md` (as do T8–T11); all of
    them are now checked there with a pointer to this feature, which is where
    the code actually landed.

- **2026-10-06 — native review of `5b64137`: APPROVED.** Lineage
  `review-f0d1a62f9f663afe`, lens `review-reliability`, medium tier; authority
  burned via `review.acknowledge-approved`. Three advisory findings, none
  blocking: R3-001 and R3-002 became tasks T16/T17 above; R3-003 is the
  clock-source follow-up in Scope notes. Reviewer output initially starved
  three times on `mimo-v2.6-flash-free` (32k output cap exhausted by reasoning
  on the 61KB payload); resolved by switching `agent.review-reliability` to
  `opencode/fledge-alpha-free` + `mode: all` (details in Engram topic
  `rdd/reviewer-model-fix`).

- **2026-10-06 — T16 + T17:** review follow-up fixes, delegated to one writer
  (2 files). T16: the deactivation UPDATE now chains `.select('id')` (single
  atomic `UPDATE ... RETURNING id`); new `restorePreviousActive()` helper runs
  on the upload-error and insert-error paths, scoped by `user_id`, never
  throws — `createPost` always returns the original error. Deactivation stays
  before insert (partial unique index constraint). Known limitation: an
  upload that succeeds before a failed insert leaves one orphaned object.
  T17: the initial-load effect takes the same `inFlight` lock `refresh()`
  checks (`[]` deps, so it only races StrictMode re-runs); the lock is
  released in `finally` only when `!cancelled`, so a cancelled run never
  unlocks while a replacement run still owns it; a refresh fired mid-first-
  load is an intentional no-op. No public API change.
  Verification: `npx tsc --noEmit` → exit 0 (writer + parent spot check);
  `npx eslint .` → exit 0 (writer).

## Next step

T16 + T17 (review follow-up fixes), then the human runs migration
`20261004150000_feed_profile_visibility.sql` and exercises feed + create-post
in Expo Go. After this feature closes: T15 avatar in onboarding, T12 profile
screen, T13 seed script (all in `odd/tasks/supabase-auth.md`).

## Rationale

Decisions a diff cannot show (DB-enforced one-active-post, private bucket with
authenticated reads, avatar read policy shipped inside the feed-visibility
migration) live here.
