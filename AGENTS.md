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
pnpm seed                   # dev seed (requires SUPABASE_SERVICE_ROLE_KEY in .env — see README)
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

## Clean Code

Goal: code a new contributor (human or AI) understands on first read. Rules for every change:

- **Guard clauses and early returns** over nested `if`/ternary pyramids. A function that needs a comment to explain a block should have that block extracted into a function with an intention-revealing name.
- **DRY with the rule of three:** duplication is tolerated twice; extract on the third occurrence. Never abstract speculatively ("a pattern just in case") — wrong abstractions cost more than duplication.
- **No magic:** repeated numbers/strings become named constants (`POST_TTL_MS`, not `24 * 60 * 60 * 1000` inlined in three places). Booleans read as predicates (`isLoggedIn`, not `flag`).
- **No dead code:** commented-out code, unreachable branches, unused imports, `TODO` without an issue. Delete instead of disabling.
- **Composition over inheritance:** shared behavior lives in custom hooks; no super-components and no new HOCs.
- **Small files with one reason to change:** when a file grows past ~300 lines, look for the seam (logic vs. presentation vs. data) and split along it.

## Performance & Memory (React Native)

Verified against react.dev, reactnative.dev and 2026 market guidance. This project runs **React Compiler 1.0** (`experiments.reactCompiler: true`) — that changes the classic advice:

- **Compiler-first memoization.** Do NOT write `useMemo`/`useCallback`/`React.memo` by reflex. The compiler memoizes automatically and more precisely (it even handles early returns). Manual hooks remain only as **escape hatches**: identity load-bearing effect dependencies, interior-mutability libraries (e.g. form `watch()`), or third-party SDKs keyed on function reference — and every one that stays **carries a comment saying why**.
- **Follow the Rules of React** or the compiler silently skips the component (no error): no side effects during render, no direct props/state mutation. `eslint-plugin-react-compiler` is the planned lint gate once it leaves RC — until then, profile instead of assuming coverage.
- **Lists:** `FlatList` with stable `keyExtractor` is fine for small feeds. For lists over ~200 rows, use **FlashList v2** (`@shopify/flash-list`, requires New Architecture — this project is RN 0.86 so it qualifies): it recycles cells instead of remounting, cutting memory and blank-cell flicker. Never `ScrollView` + `map` for data lists.
- **Re-renders:** colocate state where it's used; keep context values `useMemo`'d; profile with React DevTools before adding any optimization. Memoization without a measured hotspot is noise.
- **Memory:** every `setInterval`/`setTimeout`/subscription/listener started in an effect is torn down in that effect's cleanup. Large payloads (image bytes) live in state only until upload, then are cleared. Bounded caches only — never an unbounded module-level map that grows forever.
- **Images:** `expo-image` with fixed dimensions and `contentFit` (fast-image is unmaintained for the New Architecture). Thumbnails in lists, full-size only in detail views.
- **Animations run on the UI thread** (Reanimated 4 worklets). Never animate via a `setState` loop.
- **Styles:** `StyleSheet.create`; zero inline style objects in list rows or animated nodes.
- **Platform divergence** gets a file variant (`.web.tsx`, `.ios.tsx`) over a runtime `Platform.OS` branch — except trivial one-liners.

## Accessibility (a11y)

Accessibility is part of "done", not a polish pass — it is what lets the app grow without rework:

- Every interactive element (`Pressable`, `TextInput`, image-buttons) gets `accessibilityRole` + `accessibilityLabel` describing the action ("Add profile photo", not "button").
- Announce state: `accessibilityState` for disabled/selected/loading; errors that appear after an action are announced (`AccessibilityInfo.announceForAccessibility`) or tied to the focused element.
- Respect Dynamic Type: never disable `allowFontScaling` globally; cap with `maxFontSizeMultiplier` only where layout would break, and re-test the screen at the largest size.
- Color is never the only signal (pair with icon/text); contrast must hold in both themes.
- Touch targets ≥ 44×44 pt; keep primary actions in thumb reach.
- Respect reduced-motion (`AccessibilityInfo.isReduceMotionEnabled`) for decorative animation.
- Test with VoiceOver (iOS) / TalkBack (Android) on every new screen before calling it done.

## Definition of Done

A task is done only when **all** hold:

- `npx expo lint` and `npx tsc --noEmit` exit 0; no new warnings introduced.
- The touched path was smoke-tested at runtime (Expo Go or dev build) — typecheck alone is not a test.
- No `console.log` in production paths (diagnostics go through the mapped `console.warn` helpers, gated by `__DEV__` where they could leak data).
- New/changed screens pass the Accessibility checklist above.
- Dead code and stale comments from the change are removed.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

### Production readiness (verified against docs.expo.dev)

- **Three build profiles** in `eas.json`: `development` (dev client, internal), `preview` (internal, production-like), `production` (store). Each profile points to its own **channel** (`production`, `staging`).
- **OTA updates only ship JS/assets.** Anything touching native code (new config plugin, native dependency) requires a **new build** — `eas update` can never deliver it. The **runtime version** enforces this: an update only lands on binaries with a matching runtime.
- **Promote what you tested:** publish to `staging` first, verify, then `eas update:republish --destination-channel production` so production runs the exact bundle that passed QA. Use per-update rollouts (`--rollout-percentage`) for risky hotfixes.
- **Store checklist before first submit:** app icons + splash, permission strings in `app.json`, `android.package` / `ios.bundleIdentifier`, version/build numbers, privacy policy URL, screenshots/descriptions.
- **Crash monitoring** (Sentry, `sentry-expo` or `@sentry/react-native`) is required for a real production launch — it is a dependency decision: propose it, never install it unprompted.
- Secrets in EAS live in EAS environment variables / `eas.json` `env`, never committed. Same public/private split as local: only `EXPO_PUBLIC_*` reaches the bundle.

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
- **Image uploads are dependency-free:** read bytes in JS — `expo-image-picker` with `base64: true` → `base64ToBytes` (`src/lib/base64.ts`) → `supabase.storage.upload()` with a `Uint8Array`. Do NOT add native deps (react-native-fs, blob/fetch helpers) for this; storage-js accepts bytes directly. Fixed-path uploads (avatar at `{uid}/profile.{ext}`) need `upsert: true` or a retry gets 409.

## AI Skill Arsenal

- The skill index lives in `.atl/skill-registry.md`. Before writing or reviewing code, load the matching skill(s) and follow them:
  - `react-native-best-practices` — lists, animations, images, platform variants, re-renders.
  - `expo-router-architecture` — routes, layouts, params, deep links, typedRoutes.
  - `react-native-architecture` — feature-first structure, container/presentational, state-management gate, API layer.
  - `react-native-testing` — test command detection, jest-expo, native mocks, TDD gates (note: no test runner is installed in this project yet — installing one is the human's call).
  - `supabase-server` (project skill, `.claude/skills/supabase-server/SKILL.md`) — server-side Supabase code: Edge Functions, `@supabase/server`, inbound auth validation. Load before touching anything under `supabase/functions/`.
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
