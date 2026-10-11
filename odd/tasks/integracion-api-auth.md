# Feature · integracion-api-auth

**Locator:** `odd/tasks/integracion-api-auth.md` · Engram `odd/integracion-api-auth/tasks` · project `findfood-app-mobile`
**Branch:** `feat/integracion-api-auth` (app, from `develop`) · `feat/unidades-ml-g` (findfood-api, from `Conexion_Front`)
**Plan:** `~/.claude/plans/necesito-que-realizes-un-sorted-ullman.md`

## Objective
Connect the Expo app to `findfood-api` (`/v1`, Supabase Auth): Phase 1 foundations (env config, HTTP client, session, data layer, role navigation, mappers, shared states, EAS dev build) and Phase 2 authentication (login, register, OTP, password recovery, account menu, Google native).

## Problem / Why
The app is a demo shell: fixtures in `src/data/mobile.ts`, local role toggle, static forms, no HTTP/session/tests. It cannot be used against the real backend.

## Scope / constraints
- User decisions: Google native sign-in; expo-router NativeTabs per role; TanStack Query; units ML/G added in the API.
- API facts: field validation is 400 `validacion` + `errores: string[]`; `datos:prueba` emits no token (app mints dev HS256 JWT); `/me` `roles[]` + `pendientes[]` drive navigation; `fecha_vencimiento` must not be TZ-converted; Google users lack `apellidos`.
- Dev token lives only in `.env.development.local`, read under `__DEV__`.
- Conventional commits, no AI attribution. Tests ship with code. Read Expo v57 docs before using each library.
- Out of scope: Phase 3 per-screen business flows (create/publish donation, offers, routes, evidence upload, push registration).

## Acceptance criteria
- Switching env profile needs no code change; dev token absent from release bundle.
- 400/422 errors render in their fields; 401 refreshes once, then goes to login.
- Session survives app restart; token never stored in plaintext.
- No screen imports `src/data/mobile.ts`; each mutation invalidates affected queries.
- Donor without VOLUNTARIO cannot open volunteer screens, even via deep link.
- Unit tests for each mapper, including windows crossing midnight.
- All remote-data screens use shared loading/empty/error components.
- Development APK installable on Android with native modules.

## Checks
`npm test` · `npm run typecheck` · `npm run lint` · `npm run test:render` · API: `npm run test:e2e`

## Delivery
- Forecast: ~3,000+ authored changed lines (exceeds 400) → strategy `ask-on-risk`; chain strategy: `feature-branch-chain` (slices PR into `feat/integracion-api-auth`; final PR to `develop`).
- RDD: on (global). Review boundary starts at branch point `e839b90`.

## Tasks
| ID | Task | Route | Status | Commit | Review |
|---|---|---|---|---|---|
| API-U1 | Migration ML/G units + e2e assertion + CLAUDE.md (findfood-api) | inline (3 mechanical files) | [x] | findfood-api `a910a73` | high (filename heuristic) → granted → approved, burned; 2 advisory suggestions (assert factor_a_kg; header note on ON CONFLICT) |
| DOC-SB | Supabase dashboard checklist in `docs/integracion-backend.md` | inline | [x] | `611c88d` | docs-only; assess flagged high on filename heuristic → skipped per trivial passive-doc rule, then covered by the F1-01 review range |
| F1-01 | Env config module, profiles, dev token script **+ Jest setup** (moved from F1-02 to enable test-first) | delegated writer (2+ non-trivial files) | [x] | `c66b1e6` | high → granted → approved, burned (range e839b90..c66b1e6); 1 warning + 5 suggestions → Follow-ups |
| F1-02 | HTTP client + problem+json errors + jest setupFiles with test env | delegated writer (2+ non-trivial files) | [x] | `9f320ef` | high → granted → approved, burned (range c66b1e6..9f320ef); 3 warnings (refresh without timeout, transient refresh failure signs out, repeated onUnauthorized) → folded into F1-03 |
| F1-03 | Supabase client + chunked SecureStore + client hardening (F1-02 review warnings) | delegated writer (2+ non-trivial files) | [x] | `c9c5d5e` | high → granted → approved, burned (range 9f320ef..c9c5d5e); 2 lenses: shared refresh never expires if it hangs (WARNING) → folded into F1-04 |
| F1-04 | QueryClient + SessionProvider + resolveAccess + shared-refresh deadline | delegated writer (2+ non-trivial files) | [x] | `ab1dd45` | high → granted → approved, burned (range c9c5d5e..ab1dd45); 3 warnings → F1-04b |
| F1-04b | Session hardening from F1-04 review: explicit storage key removal on sign-out, offline startup, Supabase fetch timeout | delegated writer (2+ non-trivial files) | [x] | `6985029` | high → granted → approved, burned (range ab1dd45..6985029); 5 suggestions |
| F1-05 | Per-module services + query keys + DTO types | delegated writer (2+ non-trivial files) | [x] | `f25eeb3` + `cc19f97` | high → granted → approved, burned (6985029..f25eeb3); 3 warnings fixed inline in `cc19f97` → granted → approved, burned (f25eeb3..cc19f97) |
| F1-06 | Mappers (dates, units, refrigeration, statuses, donation view) + tests | delegated writer (2+ non-trivial files) | [x] | `e1055a5` | high → granted → approved, burned (cc19f97..e1055a5); 1 warning (one bad row throws for the whole list) → F1-10 |
| F1-07 | Feedback components, problem messages, Field/Button, useZodForm | delegated writer (2+ non-trivial files) | [x] | `1e8385b` + `11bc9e6` | high → granted → approved, burned (e1055a5..1e8385b); 2 warnings fixed inline in `11bc9e6` → granted → approved, burned (1e8385b..11bc9e6) |
| F1-08 | Root layout guards + splash + import-safe config | delegated writer (2+ non-trivial files) | [x] | `2d7c31e` | high → granted → approved, burned (11bc9e6..2d7c31e); 2 warnings → F2-06 / tests follow-up |
| F1-09 | Donor + volunteer segments with NativeTabs, role guards, remove BottomNav (merged a/b: one coherent route move) | delegated writer (2+ non-trivial files) | [x] | `f0caaea` | high → granted → approved, burned (2d7c31e..f0caaea); README warning fixed in docs commit; login links → F2-01; dismissTo test → F1-10 |
| F1-10 | Wire existing screens to services; delete mobile.ts | delegated writer | [ ] | | |
| F1-11 | EAS dev build config | delegated writer | [ ] | | |
| F2-01 | Login | delegated writer | [ ] | | |
| F2-02 | Register | delegated writer | [ ] | | |
| F2-03 | OTP verification | delegated writer | [ ] | | |
| F2-04 | Forgot / reset password (PKCE deep link) | delegated writer | [ ] | | |
| F2-05 | Complete profile / change password | delegated writer | [ ] | | |
| F2-06 | Account menu (switch view, logout) | delegated writer | [ ] | | |
| F2-07 | Google native sign-in | delegated writer | [ ] | | |

## Progress / evidence
- 2026-10-09: plan approved; branches created; feature document created.
- API-U1: API `npm run typecheck` passed. `npm run test:e2e` **unavailable** (no docker/podman on this machine) — pending on a machine with a container runtime.
- DOC-SB: structural readback only (passive docs).
- F1-01: RED 22/22 (`Cannot find module ./env`) → GREEN 22/22; `npm run typecheck` ok (parent re-ran); `npm run lint` ok; `npm run test:render` ok; dev token verified against the API `jose` `jwtVerify` (HS256, iss, aud). `.env.example` copied by the user (tool writes to `.env*` are denied by permissions). ~666 authored lines (260 tests) + generated lockfile.
- F1-02: RED (missing modules + env import ConfigError) → GREEN 87/87; typecheck, lint, test:render ok (parent re-ran `npm test`: 87/87). ~1,180 authored lines (≈687 tests). New slug `respuesta-invalida` for unparseable 2xx JSON.
- F1-03: RED (missing auth modules, 11 new client tests) → GREEN 139/139; typecheck, lint, test:render ok (parent re-ran `npm test`: 139/139). Storage uses two alternating chunk slots so a failed write keeps the previous session readable; keys escaped without collisions. No URL polyfill: Expo 57 installs a WHATWG `URL` global (`expo/src/winter/runtime.native.ts:21`). Refresh rejection = transient (no sign-out); `null` = invalid session.
- F1-04: RED (4 missing modules + 5 client tests) → GREEN 230/230; typecheck, lint, test:render ok (parent re-ran `npm test` 230/230 and typecheck). `resolveAccess` keeps cached `me` usable when a background refetch fails; `useAccess` stays `loading` until the stored role is read. RNTL 14 (+ `test-renderer` peer) added for provider tests.
- F1-04b: RED 8 tests/5 suites → GREEN 259/259; typecheck, lint, test:render ok (parent re-ran `npm test` 259/259). Explicit storage key `findfood.auth`; `signOutLocally()` removes `K`, `K-user`, `K-code-verifier`, `K-flows-code-verifier`, `K-flow-<id>-code-verifier` (auth-js `GoTrueClient.js:4429-4433`, `lib/helpers.js:241-365`). Supabase fetch timeout 10 s (`createSupabaseFetch`). `me` query uses `networkMode: "always"` + explicit `refetchOnReconnect` (TanStack defaults it to false under `always`).
- F1-05: RED 8 suites → GREEN 339/339 (services 80/80); typecheck, lint, test:render ok (parent re-ran `npm test` 339/339 + typecheck). DTOs typed from the API source; one `invalidates` map per module; invalidation not awaited (mutations settle on server answer). Unread count = `no_leidas` of `GET /me/notificaciones?solo_no_leidas=true&limite=1` (no count endpoint).
- F1-05 fix (inline, mechanical): rechazar also invalidates `donaciones.historiales()`; abandonar also `rutas.lists()`; device registration rolls back (DELETE) when its id cannot be stored (`deviceIdStorage.save` now rejects). RED: asignaciones suite TypeError + perfil rollback test → GREEN 340/340; typecheck, lint ok.
- F1-06: RED 5 suites → GREEN 494/494 (154 new); TZ independence proven under Asia/Tokyo and America/Bogota via PowerShell `$env:TZ` (Git Bash strips `TZ`) + a test that makes local-time `Date` getters throw (parent re-ran Tokyo: 154/154). `DonationView extends Donation` adds `code`, `estado`, `statusTone`; `id` is now the UUID.
- F1-07: RED 4 suites → GREEN 683/683; typecheck, lint, test:render (3 PASS) ok (parent re-ran tests + render). zod `^4.6.5` direct dep. `jest.setup.ts` mocks `react-native-worklets` so component tests can load reanimated. Schemas must carry their own Spanish messages (no global zod locale). Nested server field paths (e.g. `items.0.cantidad`) go to `formError`.
- F1-07 fix (inline): `useZodForm` gets `submitting` + a re-entry guard and touched-based blur validation; `messageFor` uses own-property lookups. RED (blur + in-flight + prototype tests) → GREEN 686/686; typecheck, lint, test:render ok.
- F1-08: RED 6 suites → GREEN 746/746; typecheck, lint, test:render ok (parent re-ran tests + typecheck). `renderRouter` drives `Stack.Protected` (mutation check: guard forced true → exactly 2 deep-link/session-end tests fail). `env` import never throws (`configResult`); invalid config renders `ConfigErrorScreen`. `ROUTE_GROUPS` test enforces every route file is in exactly one guard group. Removed template animated-icon + its orphan assets.
- F1-09: RED (16 access-route failures + missing layouts) → GREEN 768/768; typecheck (typed routes regenerated), lint, test:render ok; no stale `inicio-donante|mis-donaciones|/pantallas|BottomNav|viewRole` refs (parent re-ran tests + typecheck). NativeTabs render under jest-expo. Mutation checks: opening role guards → 4 tests fail. Stacked→tab links use `dismissTo` (plain navigate pushes a second `(tabs)`). Added `voluntario/detalle-donacion`. Removed template leftovers, tab icon assets and the preview gallery; README navigation section updated.

## Follow-ups
- API: assert `factor_a_kg` of ML/G in e2e; note in migration header that ON CONFLICT never corrects pre-existing rows.
- scripts/dev-env.mjs: `\uFEFF` escape (written as text) instead of a literal BOM character; reject TTL that yields exp <= iat + 60; reject positional args for `real`; add `node --test` coverage for marker/role/postman parsing (R3-dev-env-untested, WARNING).

- Done: env.test.ts typed `require` cast (F1-02); client refresh hardening (F1-03); shared-refresh deadline, late abort check, supabase wiring tests (F1-04).
- F2-06: StartupError "Cerrar sesión" must show busy/disabled (`signingOut`) and `useSignOut` needs a re-entry guard (R3-001, F1-08 review).
- Tests: font-load error branch of RootNavigator (R3-002); release builds should report invalid config to a crash reporter once one exists (R4).
- F2-06: offline sign-out with an expired session can take ~25-30 s (auth-js retries the refresh inside `signOut`); give `signOutLocally` an overall deadline (then remove keys anyway) and show a blocking "Cerrando sesión…" state; add an end-to-end offline sign-out test. Old `sb-*` SecureStore entries from earlier dev builds stay orphaned (users sign in once more) — optional one-time cleanup.
- Push registration (F3): log a failed rollback DELETE, reword the `registrarDispositivo` comment (it cannot guarantee no orphan when the DELETE also fails), test DELETE-also-fails, and route `deviceIdStorage.save` through a shared throwing write helper.
- F1-10: map list rows tolerantly — a `MappingError` in one row (bad/inverted window) must not fail the whole list (R4-donation-row-throws); rename `baseView` param to `fallbackCategory`; fix tone comment; share the `errorCode` test helper; make `fromFechaVencimiento` reject malformed suffixes.
- F1-10: show `d.code` (not `d.id`); filter by `estado`, not labels (`DonationsScreen` compares `status === "Completada"`); list rows have no `expiresOn` (endpoint lacks it).
- Device check pending: iOS scroll behind native tab bar, Android bottom insets; consider expo-router `ThemeProvider` to avoid white flash between tabs (iOS 26 ignores tab bar backgroundColor).
- `docs/pantallas.md` still describes the old flat routes/gallery — refresh after F1-10.
- F2-01: login buttons still point at app routes their phase blocks (R2, F1-09 review).
- F1-10: add a `renderRouter` test that a stacked screen link with `dismissTo` returns to the existing `(tabs)` instead of pushing a second one (R3-dismissto-untested); rename RatingScreen `donor` prop to a role-named prop.
- Narrow `DraftProduct.coldChain` from `string` to `ColdChain`.
- `.expo/types/router.d.ts` only regenerates on `expo start`; new route files fail `tsc` until then.
- Retrying `/me` from the error phase briefly returns the phase to `loading` (TanStack resets a data-less query to pending); acceptable, but the Stack remounts.
- Tests to add: rejected `onValid` clears `submitting`; AuthError code naming a prototype member; `touched` comment should say "changed via setValue".
- Intermittent "SessionProvider … not wrapped in act" warning seen once in a full run (session.test.tsx); investigate if it recurs.
- F3 screens: signed URLs (`url_lectura`, `foto_url`) expire after 5 min; add refetch/expiry handling where shown.
- Readability nits (F1-04b review): reword the fake `signOut` mock comment in supabase.test.ts; unify the two `ignore()` helpers.
- Web build stores the session in localStorage (preview only); revisit if web ever ships to users.

## Next step
F1-10 wire screens to services. Review boundary: `2d7c31e`.
