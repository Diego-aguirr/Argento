# Argento — BeReal Clone

A BeReal-style social app: users share **one photo per day** that **automatically expires after 24 hours**. The core concept encourages authentic, in-the-moment sharing.

> **Status:** spec/planned. The repository currently holds the Expo starter; implementation follows the roadmap below.

## Features

- Email/password authentication with session persistence
- User onboarding (name, username, profile image)
- Photo posts from camera or photo library (cropped to 1:1)
- 24-hour post expiration with countdown timers
- One active post per user at a time (a new post replaces the old one)
- Pull-to-refresh feed
- Profile management (edit image, view details)
- Database seeding script for development

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.88 + Expo SDK 58 |
| Language | TypeScript (strict) |
| Navigation | Expo Router (file-based) |
| Backend | Supabase (Auth + PostgreSQL + Storage) |
| State | React Context API |
| Images | expo-image + expo-image-picker |
| Session storage | AsyncStorage |
| Package manager | pnpm |

> Course references target Expo SDK 55 / RN 0.83. This project runs **SDK 58** — always verify APIs against the [versioned docs](https://docs.expo.dev/versions/v58.0.0/) before using them.

## App Architecture

```
Root Layout (_layout.tsx)
        │
    RouteGuard
   ┌────┴─────┐
No user     Has user
   │           │
   ▼           ▼
(auth)     Onboarding complete?
group        No → /onboarding
login        Yes → (tabs)
signup            │
onboarding        ▼
              (tabs): Home + Profile
```

## Database Schema

### `profiles` table

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | References `auth.users.id` |
| name | text | Display name |
| username | text (unique) | Unique username |
| profile_image_url | text | URL to profile image in storage |
| onboarding_completed | boolean | Whether user finished onboarding |

### `posts` table

| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID (FK) | References `profiles.id` |
| image_url | text | URL to post image in storage |
| description | text (nullable) | Optional post caption |
| created_at | timestamp | When the post was created |
| expires_at | timestamp | `created_at` + 24h |
| is_active | boolean | Whether the post is currently active |

### Storage buckets

- `profiles` — profile images at `{userId}/profile.{ext}`
- `posts` — post images at `{userId}/{timestamp}.{ext}`

## Authentication Flow

1. App starts → `AuthProvider` checks for an existing Supabase session
2. No session → `RouteGuard` redirects to `/login`
3. Sign up → account created in Supabase Auth, row created in `profiles`
4. Onboarding check → if `onboarding_completed` is false, redirect to `/onboarding`
5. Onboarding → user sets name, username, and profile image
6. Authenticated → redirected to the main `(tabs)` group
7. Session persists via AsyncStorage

## Posts System

### Creating a post

1. Tap the FAB on the home screen → choose camera or photo library
2. Crop to 1:1 → preview + optional description
3. On submit: deactivate any existing active post → upload image to Supabase Storage → insert post row with `expires_at = created_at + 24h`
4. Feed refreshes to show the new post

### Feed loading

```sql
SELECT * FROM posts
WHERE is_active = true AND expires_at > now()
-- joined with profiles for user info
ORDER BY created_at DESC;
```

Expiration is a **query filter, not a background job**: expired posts are simply never returned. Each visible post shows a countdown badge ("5h 30m left").

## Route Protection

All navigation logic lives in one place — the `RouteGuard` component in the root layout. It runs on every auth/state change, so users can never reach screens they should not be on.

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up Supabase ([supabase.com](https://supabase.com)):
   - Authentication → enable email/password sign-ups
   - Database → create `profiles` and `posts` tables (schema above)
   - Storage → create `profiles` and `posts` buckets

3. Create `.env` in the project root (never committed):

   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here   # dev scripts ONLY — never enters the app bundle
   ```

4. Seed the database (optional): `pnpm run seed`
5. Start the app: `npx expo start` — scan the QR with Expo Go, or press `i` / `a` for simulators.

## Project File Structure

```
src/
├── app/
│   ├── _layout.tsx               # Root layout + RouteGuard
│   ├── (auth)/
│   │   ├── _layout.tsx           # Auth stack navigator
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── onboarding.tsx        # Profile setup
│   └── (tabs)/
│       ├── _layout.tsx           # Home + Profile tabs
│       ├── index.tsx             # Home feed
│       └── profile.tsx
├── context/AuthContext.tsx       # Auth state
├── hooks/usePosts.ts             # Post CRUD
├── lib/
│   ├── date-helper.ts            # Time formatting
│   └── supabase/                 # Client + storage utils
└── scripts/seed.ts               # Dev seeding
```

## Conventions & AI Assistant Rules

- Agent rules, security constraints, and workflow permissions live in [AGENTS.md](./AGENTS.md).
- The AI skill arsenal for this project (React Native best practices, Expo Router, architecture, testing) is indexed in `.atl/skill-registry.md`.
- Security baseline: the JS bundle is public — secrets never ship in the app; `SUPABASE_SERVICE_ROLE_KEY` is for local dev scripts only.
