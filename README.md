# Argento — one photo a day, gone in 24 hours

Argento is a BeReal-style photo-sharing app: every user shares **one photo per day**, and every post **expires 24 hours after it was created**. It is an Expo SDK 57 / React Native 0.86.3 app written in strict TypeScript, with Expo Router navigation and a Supabase backend (Auth, Postgres with Row Level Security, Storage).

> **Status:** implemented end to end — auth, onboarding, feed, post creation, and profile editing all work against a real Supabase project, and `pnpm seed` fills a dev project with demo data. This document explains how the whole system works, flow by flow, so a new contributor can contribute without reverse-engineering the code.

## How it works in 60 seconds

The new-user happy path, from first launch to first post. Each step names the file that owns it.

1. **Sign up** — `src/app/(auth)/signup.tsx` creates the Supabase Auth account; the `on_auth_user_created` trigger inserts an empty `profiles` row (see `supabase/migrations/20261003170000_create_profiles.sql`).
2. **Onboarding** — RouteGuard (root layout) sees `onboarding_completed !== true` and shows `src/app/(auth)/onboarding.tsx`: name, username, and an optional photo that stays a **local draft** until *Continue* uploads it and saves the row.
3. **Feed** — saving flips `onboarding_completed` to true; RouteGuard moves the user to `src/app/(tabs)/index.tsx`, which loads active, unexpired posts joined with their authors and renders a live countdown badge on every card.
4. **Create a post** — the **+** FAB opens camera or library → 1:1 crop → review modal with an optional description → publish: deactivate the previous active post → upload the image → insert the row → the feed reloads with the new post.
5. **Profile** — `src/app/(tabs)/profile.tsx` edits name and username, replaces the avatar (upload happens on pick; text fields wait for *Save*), and signs out — RouteGuard reacts to the session change and returns to login.

Two rules hold everywhere in the app:

- **Screens never navigate on success.** After a successful sign-in, sign-up, onboarding save, or sign-out, the screen stays put — RouteGuard reacts to the session/profile change and is what moves users between login, onboarding, and the tabs.
- **Raw backend messages never reach the user.** Every failure is mapped to a `PresentedError { title, message }` and shown via `Alert.alert`.

### What works today

- [x] Email/password authentication with persisted sessions (AsyncStorage)
- [x] Onboarding: name, username, optional avatar
- [x] Photo posts from camera or library, cropped 1:1
- [x] 24-hour expiration with countdown badges; one active post per user (DB-enforced)
- [x] Pull-to-refresh feed with error-retry and empty states
- [x] Profile editing (name, username, avatar) and sign out
- [x] Dev seeding script (`pnpm seed`) with 3 demo accounts

## Tech stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.86.3 + Expo SDK 57 (`expo ~57.0.26`) |
| Language | TypeScript ~6.0, `strict: true` |
| Navigation | Expo Router (file-based, typed routes enabled) |
| State | React Context (`AuthContext`) + screen-level hooks |
| Backend | Supabase: Auth + PostgreSQL (RLS) + Storage, via `@supabase/supabase-js` v2 |
| Images | `expo-image` (render), `expo-image-picker` (1:1 crop, base64 output) |
| Session storage | AsyncStorage (DOM-guarded so web SSR does not throw) |
| Styling | `StyleSheet` + design tokens in `src/constants/theme.ts` |
| Compiler | React Compiler enabled (`experiments.reactCompiler`) |
| Package manager | pnpm |

> Expo APIs change on every SDK release. This project runs **SDK 57 / RN 0.86.3** — verify any Expo or RN API against the [v57 versioned docs](https://docs.expo.dev/versions/v57.0.0/) before using it.

## Architecture

What routes the user where, and how a request travels from a screen to Supabase and back.

### RouteGuard: the single routing decision point

```
RootLayout (src/app/_layout.tsx)
  └─ AuthProvider        restores the persisted session (AsyncStorage),
  │                      then loads the signed-in user's profile row
  └─ RouteGuard          re-runs on every session / profile / route change
       │
       ├─ session not read yet (loading) ──────────── wait, do not route
       ├─ no session ───────────────────────────────→ (auth)/login
       ├─ profile row not read yet (profileLoading) ─ wait, do not route
       ├─ onboarding_completed !== true ────────────→ (auth)/onboarding
       ├─ signed in, onboarding done, in (auth) ────→ (tabs)
       └─ signed in, already in (tabs) ────────────── stay
```

The two "wait" branches matter: routing before the session is read would flash the login screen on every cold start, and routing before the profile row is read would bounce a signed-in user before the app knows whether onboarding is done.

### Request lifecycle: screen → data layer → Supabase

```
screen / hook ──► src/lib/supabase/* ──► supabase-js ──► PostgREST / Storage
     ▲                  │ row mapping                        │
     │                  │ FeedRow → FeedPost (snake_case →    │
     │                  │ camelCase happens HERE, once)       │
     └── PresentedError ◄── describePostgrestError /          │
                            describeAuthError ◄── error ──────┘
```

1. A screen calls a hook (`usePosts`, `useCreatePost`, `useProfileEdit`), which calls a function in `src/lib/supabase/`.
2. That module is the **only** code that talks to Supabase. It maps PostgREST rows to camelCase domain types (`FeedRow` → `FeedPost`); components never see snake_case columns.
3. Storage paths are resolved to **signed URLs** (1 hour) on the way out; a signing failure downgrades that one image to `null` instead of failing the whole payload.
4. Errors come back as `PostgrestError` / `AuthError` and are mapped by `describePostgrestError` / `describeAuthError` into a `PresentedError`. Unmapped codes fall back to generic copy; the raw detail is logged with `console.warn` only in `__DEV__`. Storage failures are reshaped into the PostgREST error shape (`asPostgrestError`) before they leave the data layer, so the UI has exactly one error pipeline.

### Modules at a glance

| Folder | Responsibility | Key files |
|---|---|---|
| `src/app/` | Routes: every file is a screen, every `_layout.tsx` is a navigator | `_layout.tsx` (RouteGuard), `(auth)/`, `(tabs)/` |
| `src/context/` | Auth state: session, profile row, sign-in/up/out | `AuthContext.tsx` |
| `src/hooks/` | Screen-level flow logic and reusable state | `usePosts`, `useCreatePost`, `useProfileEdit` |
| `src/components/` | Presentational UI shared between screens | `PostCard`, `Avatar`, `CreatePostModal`, `AppTabs` |
| `src/lib/` | Platform helpers and error mapping | `image-picker.ts`, `base64.ts`, `auth-errors.ts`, `db-errors.ts` |
| `src/lib/supabase/` | The data layer — the ONLY place that talks to Supabase | `client.ts`, `posts.ts`, `profiles.ts`, `storage.ts` |
| `src/constants/` | Design tokens (colors, spacing, fonts) | `theme.ts` |
| `supabase/migrations/` | Schema source of truth (SQL) | 4 migration files |
| `scripts/` | Dev-only tooling (never imported by app code) | `seed.ts` (`pnpm seed`) |

## Project structure

Every top-level entry under `src/`, plus the paths outside it that matter:

```
src/
├── app/                     # Expo Router routes — every file is a screen
│   ├── _layout.tsx          # Root layout: AuthProvider + RouteGuard + Stack
│   ├── (auth)/              # Headerless stack: login, signup, onboarding
│   └── (tabs)/              # Native tabs: index (Home feed), profile
├── components/              # PostCard, Avatar, CreatePostModal, AppTabs, themed primitives
├── constants/
│   └── theme.ts             # Colors / Spacing / Fonts tokens (imports global.css)
├── context/
│   └── AuthContext.tsx      # Session + profile row + signIn / signUp / signOut
├── hooks/                   # usePosts, useCreatePost, useProfileEdit (+ theme hooks)
├── lib/                     # Error mappers, base64 decoder, image picker
│   └── supabase/            # Data layer: client, posts, profiles, storage
└── global.css               # Web font variables, imported by theme.ts

scripts/seed.ts              # Dev seed (pnpm seed)
supabase/migrations/         # SQL source of truth, run in filename order
assets/                      # Icons, splash, tab icons; assets/post/imag/ = local seed photos
```

Path aliases come from `tsconfig.json`: `@/*` → `src/*`, `@/assets/*` → `assets/*`.

## Auth & routing

How a cold start decides between login, onboarding, and the tabs — and how sign-in/sign-up failures become readable messages.

1. **Restore the session.** `AuthProvider` (`src/context/AuthContext.tsx`) calls `supabase.auth.getSession()`; `loading` stays true until the persisted session has been read, and RouteGuard refuses to route during that window. A failed read (first launch, offline) starts signed out.
2. **Load the profile row.** Once a user id exists, a second effect fetches `profiles` (`profileLoading` is deliberately separate so the profile round-trip never holds the splash screen). A failed read leaves `profile = null` rather than blocking routing forever.
3. **Route.** RouteGuard applies the decision logic in [RouteGuard: the single routing decision point](#routeguard-the-single-routing-decision-point) on every session/profile/segment change.
4. **Sign in** (`src/app/(auth)/login.tsx`): trims the email, rejects empty fields, calls `signIn`, and shows `describeAuthError(error)` if it fails. On success the screen navigates nowhere — the session change makes RouteGuard switch to `(tabs)`.
5. **Sign up** (`src/app/(auth)/signup.tsx`): three outcomes, all mapped in the screen:
   - error → mapped `PresentedError` alert;
   - account created but no session (`needsEmailConfirmation`) → "confirm your email" alert, then `router.replace('/login')` — RouteGuard cannot move a user who has no session yet;
   - immediate session → RouteGuard takes over and routes onward (usually onboarding).
6. **Sign out** (Profile tab): `signOut()` clears the session; RouteGuard sends the user back to `(auth)/login`.

| Auth failure (examples) | What the user sees |
|---|---|
| `invalid_credentials` | "Email or password is incorrect." |
| `user_already_exists` / `email_exists` | "Sign in instead, or use a different email." |
| `email_not_confirmed` | "Open the link we sent you, then sign in again." |
| HTTP status 0 (fetch never reached Supabase) | "No connection" |
| any unmapped code | Generic "Something went wrong" |

The full code → copy table lives in `src/lib/auth-errors.ts`; database/storage codes are mapped in `src/lib/db-errors.ts` (including `posts_one_active_per_user` conflicts → "Your previous post is still active. Try posting again.").

## Posts System

The two halves of the daily-photo loop: publishing one post, and reading everyone else's.

### Creating a post

1. **Pick a source.** The FAB on the Home tab opens a camera/library choice (`src/app/(tabs)/index.tsx`).
2. **Pick + crop.** `pickCroppedImage` (`src/lib/image-picker.ts`) requests permission, launches the picker with `aspect: [1, 1]`, `allowsEditing`, `base64: true`, and decodes the result to bytes. Cancel returns `null`; failures return mapped copy.
3. **Review.** The draft opens `CreatePostModal` (`src/components/create-post-modal.tsx`): cropped preview, optional description, *Cancel* / *Post*. The draft (bytes) lives in `useCreatePost`.
4. **Publish.** `createPost` (`src/lib/supabase/posts.ts`) runs in a fixed order — the order is not arbitrary:

   | Step | Operation | If it fails |
   |---|---|---|
   | 1 | `UPDATE posts SET is_active = false WHERE user_id = … AND is_active = true … RETURNING id` | Nothing was touched; return the error |
   | 2 | Upload bytes to `posts/{userId}/{epochMs}.{ext}` | Previous post is re-activated, then the error returns |
   | 3 | `INSERT` the row: `expires_at = created_at + 24h`, `is_active = true` | Previous post is re-activated, then the error returns |

   Step 1 must precede the insert because the partial unique index **`posts_one_active_per_user`** rejects a second active row for the same user. It runs before the upload so any later failure can restore the deactivated post (`restorePreviousActive`, best effort — a restore failure is only logged).
5. **Settle.** Success closes the modal and refreshes the feed; failure keeps the draft so the user can retry without re-picking the photo.

> Known limitation: if the upload succeeds but the insert fails, the uploaded object stays orphaned in storage — nothing references it and no cleanup job exists.

### Feed

1. **Query.** `fetchFeed` (`src/lib/supabase/posts.ts`) selects the newest 50 posts that are active and unexpired, with the author's profile embedded:

   ```sql
   select id, user_id, image_url, description, created_at, expires_at,
          profiles:user_id(name, username, profile_image_url)
   from posts
   where is_active and expires_at > now()
   order by created_at desc
   limit 50;
   ```

   **Expiration is a query filter, not a background job** — expired rows are simply never returned.
2. **Resolve images.** `image_url` and the avatar path store storage *paths*; each becomes a signed URL (1 h TTL). A signing failure nulls that one URL — one missing image must not hide the feed.
3. **Render.** `usePosts` (`src/hooks/usePosts.ts`) hands the list to `src/app/(tabs)/index.tsx`:

   | Screen state | Shown when |
   |---|---|
   | Spinner | First load, nothing on screen yet |
   | Error + *Retry* | Load failed and the list is empty |
   | "No posts yet" | Load succeeded with zero rows |
   | `FlatList` + pull-to-refresh | Posts exist |

4. **Concurrency.** A single `inFlight` ref is shared by the initial load and `refresh()` — a pull-to-refresh fired while the first response is still open becomes a no-op, so a slow response can never overwrite fresher posts. A failed refresh keeps the posts already on screen.
5. **Countdown.** `CountdownBadge` (`src/components/post-card.tsx`) ticks every 15 s inside the card, so only the badge re-renders: `5h 30m left`, `12m left`, or `Expired`.

## Profile & avatar

Editing your identity — and the display fallbacks that keep the UI intact when an image is missing.

### Editing

1. **Fields.** `useProfileEdit` seeds drafts from the profile row. *Save* is disabled until the trimmed drafts differ, and saving rejects an empty name/username or a username containing spaces (`src/hooks/useProfileEdit.ts`, driven by `src/app/(tabs)/profile.tsx`).
2. **Avatar pick.** Tapping the avatar opens the same camera/library picker with 1:1 crop as the post flow.
3. **Avatar upload happens immediately on pick**, not on *Save*:
   - upload to the fixed path `profiles/{userId}/profile.{ext}` with `upsert: true` (a fixed path would otherwise 409 on retry);
   - `saveProfile` writes only `profile_image_url`, alongside the row's **existing** name/username — unsaved field edits are never written behind the user's back;
   - `refreshProfile()` reloads the row.
   A failure keeps the picked photo as a draft; it rides along with the next *Save*, so a retry never forces a re-pick.
4. **Save.** Validates the fields, uploads a pending avatar draft if one exists, upserts the row (`saveProfile` writes `onboarding_completed = true` — harmless here, the screen only renders for users who already finished onboarding), then normalizes drafts to the trimmed values and refreshes.
5. **Sign out.** Clears the session; RouteGuard redirects to login.

### Avatar display ladder

`avatarUri` (what the screen passes in) prefers, in order: **unsaved pick → just-uploaded photo → signed URL of the stored path**.

`Avatar` (`src/components/avatar.tsx`) then renders, in order:

| Condition | Shown |
|---|---|
| URL present and loads | The photo |
| URL present but fails (expired signature, offline) | Placeholder asset |
| No URL, name/username available | Upper-case initial letter |
| Nothing derivable | Placeholder asset |

The placeholder is an **error fallback**, not the default look — feed and profile follow the same ladder.

## Image pipeline

Dependency-free by design: photo bytes travel from the picker to Supabase Storage without any native filesystem library.

```
expo-image-picker (base64: true)
        │  base64 string (Hermes has no atob)
        ▼
base64ToBytes()  — src/lib/base64.ts, hand-rolled decoder
        │  Uint8Array
        ▼
supabase.storage.upload(path, bytes, { contentType })
        │  path convention
        ▼
posts bucket      {userId}/{epochMs}.{ext}   (timestamped, one object per post)
profiles bucket   {userId}/profile.{ext}     (fixed path, upsert overwrites)
```

- MIME → extension mapping lives in `EXTENSION_BY_MIME` (`src/lib/supabase/storage.ts`); unknown types fall back to `jpg`.
- On web the picker can return a `File` instead of base64; that branch reads `arrayBuffer()` instead.
- Do **not** add `react-native-fs`, blob, or fetch helpers for uploads — storage-js accepts typed arrays directly.

## Database schema

Source of truth: `supabase/migrations/*.sql`. Applied in filename order.

### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users.id` (cascade delete); created by the signup trigger |
| `name` | text | Nullable until onboarding |
| `username` | text, unique | Nullable until onboarding |
| `profile_image_url` | text | Storage **path**, not an HTTP URL |
| `onboarding_completed` | boolean, not null | Default `false` |

### `posts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid, not null | References `profiles.id` (cascade delete) |
| `image_url` | text, not null | Storage path in the `posts` bucket |
| `description` | text | Optional caption |
| `created_at` | timestamptz | Default `now()` |
| `expires_at` | timestamptz | Default `now() + 24 hours`; the app writes it explicitly |
| `is_active` | boolean, not null | Default `true` |

### Enforced in the database

| Object | Guarantees |
|---|---|
| `posts_one_active_per_user` (partial unique index) | One active post per user — the app deactivates first, the index rejects races |
| `posts_feed_idx` (index on `created_at desc where is_active`) | The feed query stays cheap |
| `on_auth_user_created` trigger | Every auth user gets a `profiles` row (plus a backfill for older accounts) |

### RLS at a glance

| Resource | Who can do what |
|---|---|
| `profiles` rows | Read/write your own row; any signed-in user can read rows (needed for the feed's author join) |
| `posts` rows | Any signed-in user reads; insert/update/delete only your own (update is required by the deactivation step) |
| `profiles` bucket (private) | Writes only under your own `{userId}/` folder; reads for any signed-in user |
| `posts` bucket (private) | Writes only under your own `{userId}/` folder; reads for any signed-in user |

### Storage buckets

- `profiles` — avatar at `{userId}/profile.{ext}` (fixed path + `upsert`)
- `posts` — post image at `{userId}/{timestamp}.{ext}` (one object per post)

Both buckets are **private**; the app renders images through signed URLs (1 h TTL). Anonymous requests are denied.

## Getting started

From zero to a running app against your own Supabase project.

### Database setup

Run the files in `supabase/migrations/` in **filename order**:

| File | Creates |
|---|---|
| `supabase/migrations/20261003170000_create_profiles.sql` | `profiles` table, its three RLS policies, the signup trigger, and a backfill for pre-existing accounts |
| `supabase/migrations/20261003170100_storage_profiles_bucket.sql` | The private `profiles` storage bucket and its owner-only access policies |
| `supabase/migrations/20261004120000_create_posts.sql` | `posts` table, its RLS policies, the `posts_one_active_per_user` index, and the private `posts` storage bucket |
| `supabase/migrations/20261004150000_feed_profile_visibility.sql` | Signed-in read access to other users' profile rows and avatars (needed by the feed) |

Until the Supabase CLI is adopted, open **Dashboard → SQL Editor**, paste the contents of each file, and press **Run** — one file at a time, in the order above. The folder layout already matches the CLI convention, so `supabase db push` will work unchanged once the CLI is set up.

**Verify** by running this in the SQL Editor:

```sql
select id, name, username, onboarding_completed from public.profiles;
```

Expected result: the query succeeds and lists the profiles that exist — `0` rows on a brand-new project, `3` demo users after `pnpm seed`.

### Steps

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up Supabase ([supabase.com](https://supabase.com)):
   - Authentication → enable email/password sign-ups
   - Database → run the migrations (see [Database setup](#database-setup))

3. Create `.env` in the project root (gitignored, never committed):

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here   # dev scripts ONLY — never enters the app bundle
   ```

4. Start the app:

   ```bash
   npx expo start
   ```

   Scan the QR code with Expo Go, or press `i` / `a` for the simulators.

### Seeding (dev)

`pnpm seed` (runs `scripts/seed.ts` with `.env` loaded) populates the project with realistic data: **3 demo users**, each with an avatar, **1 recent active post** (created ~1.5 h ago, visible in the feed) and **3 expired posts** (`is_active = false`, excluded by the feed filter). Re-running replaces the demo data instead of duplicating it.

| Email | Password | Username | Name |
|---|---|---|---|
| demo1@argento.dev | `argento-demo-123` | alex | Alex Rivera |
| demo2@argento.dev | `argento-demo-123` | maya | Maya Chen |
| demo3@argento.dev | `argento-demo-123` | leo | Leo Torres |

- Images come from `assets/post/imag/` (local only — not committed — deduplicated by content hash before use).
- Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env` (see [Steps](#steps)).

> **Warning:** dev-only — the service role key **bypasses all RLS**. It lives in `.env` (gitignored), is read only by `scripts/seed.ts`, and must never ship in the app bundle or use the `EXPO_PUBLIC_` prefix.

## Conventions & rules

- Binding rules for every change — TypeScript strictness, clean code, performance, accessibility, security, workflow — live in [AGENTS.md](./AGENTS.md). Read it before your first commit.
- The skill index for this project (React Native best practices, Expo Router, architecture, testing) is `.atl/skill-registry.md`.
- Security baseline: the JS bundle is public — secrets never ship in the app. `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are public by design; safety comes from RLS. `SUPABASE_SERVICE_ROLE_KEY` is for local dev scripts only.

## Where to go next

| You want to… | Read |
|---|---|
| Change or add a screen | [AGENTS.md](./AGENTS.md) → Navigation & Routing, then `src/app/` |
| Touch data access | `src/lib/supabase/` — keep row mapping inside the data layer |
| Follow a repo convention | [AGENTS.md](./AGENTS.md) (rules outrank generic advice) |
| Load a skill before coding | `.atl/skill-registry.md` |
| Verify an Expo API | [docs.expo.dev/versions/v57.0.0](https://docs.expo.dev/versions/v57.0.0/) |
