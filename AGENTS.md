This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

Project: a **BeReal-style photo-sharing app** (one post per day, 24h expiration, Supabase backend). The full spec — features, schema, architecture, flows — lives in `README.md`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present). This project uses **pnpm** (`pnpm-lock.yaml`) for installing; `npx expo install` still resolves SDK-compatible versions regardless of the package manager.

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## TypeScript

`tsconfig.json` extends `expo/tsconfig.base` with `strict: true` (TypeScript ~6.0). These rules are binding for every `.ts`/`.tsx` file:

- **No `any`, no `@ts-ignore`/`@ts-expect-error`.** Model the type instead. Genuinely unknown external input is `unknown` + narrowing (`describePostgrestError` is the reference pattern).
- **No non-null assertions (`!`).** Absence belongs in the type (`| null`): narrow with a guard or early return. The only exception is inside `if (x)`-guarded blocks where the guard already proved presence — prefer restructuring over `!`.
- **Type-only imports are explicit:** `import type { X }` or inline `import { type X }`. Values that are used at runtime (`new PostgrestError(...)`) stay normal imports.
- **Catch and map, never leak:** `catch (cause)` → narrow (`cause instanceof Error`) → map through `describeAuthError`/`describePostgrestError` → UI shows the `PresentedError`. Raw backend/picker messages never reach the user.
- **Discriminated unions and plain types; no `enum`, no `namespace`.**
- **PostgREST rows are mapped explicitly at the lib boundary** (snake_case row type → camelCase domain type, see `FeedRow` → `FeedPost` in `src/lib/supabase/posts.ts`). Components never see snake_case columns.
- **Named types for API shapes:** never inline object literals as parameter/return types across layers; declare the type where its owner lives (`src/lib/supabase/*`, `src/hooks/*`).
- **No lazy casts:** `x as Y` only when the value's origin guarantees `Y` and a comment says why (e.g. `cause as PostgrestError` before mapping — the mapper validates codes anyway). Casting to silence the compiler is forbidden.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Security & Data Handling

- The JS bundle ships to the user and can be decompiled — anything inside the app is PUBLIC. Never treat in-app values as secrets.
- Secrets, API credentials, tokens, and payment keys live only on the backend. They are never hardcoded in the app or its config.
- Environment variables: only `EXPO_PUBLIC_*` prefixed vars are exposed to the app, and only for values that are public by design (e.g. map or error-tracking keys). Everything else must be read from the backend.
- `.env` files are gitignored and never committed; `.env.example` documents the required keys with placeholders.
- Validate and sanitize any user or API input before use; store the minimum personal data necessary and never log tokens, credentials, or PII.

### Supabase rules

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are public by design (they ship in the bundle). That is expected — safety comes from Row Level Security, not from hiding them.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses ALL security rules. It is for local dev scripts only (e.g. `scripts/seed.ts`). Never read it with `process.env.EXPO_PUBLIC_*`, never import it from app code, never log it.
- Enable RLS on every table; write the policies for `profiles` and `posts` before exposing reads/writes.
- Storage buckets: default to private with signed URLs in production; public buckets mean anyone with the URL sees the image.

## AI Skill Arsenal

- The skill index lives in `.atl/skill-registry.md`. Before writing or reviewing code, load the matching skill(s) and follow them:
  - `react-native-best-practices` — lists, animations, images, platform variants, re-renders.
  - `expo-router-architecture` — routes, layouts, params, deep links, typedRoutes.
  - `react-native-architecture` — feature-first structure, container/presentational, state-management gate, API layer.
  - `react-native-testing` — test command detection, jest-expo, native mocks, TDD gates.
- Skills are instructions, not inspiration: their Hard Rules are binding for this project.
- Project conventions in this file (AGENTS.md) and README.md outrank generic skill advice on conflict; report the conflict instead of silently choosing.

## Workflow & Permission

- The assistant drives routine work autonomously on the active feature branch: writing code, local dependency installs, lint/typecheck, and local commits — then reports what it did. **Never push to the remote unless the human explicitly asks for it in that moment.** Ask the human only for: pushes, destructive actions (deleting branches/history, force-push), merges to `main`, credential/account operations, and product scope changes.
- Dependency and tooling decisions: the human asks about a package/tool, and the assistant verifies its real state (`package.json`, `node_modules`, versioned docs) before answering with an explicit verdict — **yes / no / not yet** — plus the technical reason. Never install or remove anything on your own initiative.
- Open every file you create or modify in VS Code (`code <path>`) after the change, so the human can inspect it visually in the same turn.
- Daily work happens on a branch: create a feature branch from `main` at the start of a work session. Never commit directly to `main`.
- Use Conventional Commits (e.g. `feat:`, `fix:`, `chore:`) and never add AI attribution or `Co-Authored-By` trailers.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
