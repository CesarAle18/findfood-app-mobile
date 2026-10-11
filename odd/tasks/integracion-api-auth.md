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
| F1-10 | Wire existing screens to services; delete mobile.ts | delegated writer (2+ non-trivial files) | [x] | `1b7c697` | high → granted → approved, burned (f0caaea..1b7c697); 5 warnings → F1-10b |
| F1-10b | F1-10 review fixes: tolerant detail mapping, dedupe paged rows, filter auto-paging, rating copy | delegated writer (2+ non-trivial files) | [x] | `a67df98` + `0a2c6c8` | high → granted → approved, burned (1b7c697..a67df98); 2 readability warnings fixed in `0a2c6c8` → granted → approved, burned (a67df98..0a2c6c8) |
| F1-11 | EAS dev build config | inline (config files + 1 test) | [x] | `60d581e` + `6fbe77d` + fix | high → granted → approved (0a2c6c8..60d581e); README overclaim fixed + automated release check in `6fbe77d` → approved (60d581e..6fbe77d); temp-dir leak on failure fixed in `ebab8f6` → approved (6fbe77d..ebab8f6) |
| F2-01..03 | Login + register + OTP verification (one coherent email sign-in/sign-up flow) | delegated writer (2+ non-trivial files) | [x] | `ac9bbbd` + `8177d04` | high → granted → approved (ebab8f6..ac9bbbd); 3 warnings fixed in `8177d04` → approved (ac9bbbd..8177d04) |
| F2-04+05 | Forgot/reset password (PKCE deep link) + complete profile + change password (shared new-password form; replace gate interim notices) | delegated writer (2+ non-trivial files) | [x] | see log | |
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
- F1-10: GREEN 841/841; typecheck, lint, test:render ok; no `data/mobile|mobile-repository|demoRepository|useMobile().data` refs (parent re-ran tests + typecheck). RED observed for mapper changes (9 failing) and new profile mapper; screen tests written alongside code (no RED). FlashList 2.0.2 (its jestSetup is broken; only `measureLayout` mocked). Donations list uses `useInfiniteQuery` + tolerant row mapping. Remaining fixtures marked TODO(F3): donor activity (`/donaciones/:id/historial`), volunteer activity + active route (`/rutas`), notifications (`/me/notificaciones`), rating submit (`POST /asignaciones/:id/calificacion`), availability toggle (`PATCH /voluntario/estado`).
- F1-10b: RED 13 new tests (incl. the reported auto-paging bug: offsets [0,20] instead of [0]) → GREEN 860/860; typecheck, lint, test:render ok (parent re-ran tests). Tolerant `donationViewFromDetalle`, deduped `selectPages`, filter loads only via "Cargar más", honest rating copy.
- F1-10b fix (inline): rename tolerant detail mapper to `tolerantDonationFromDetalle`; auto-paging tied to an `UNFILTERED` constant; rethrow test now throws inside the fallback wrapper (mutation check: swallowing every error → test fails). GREEN 860/860; typecheck, lint ok.
- F1-11: `expo-dev-client` ~57.0.19; `app.json` package/bundleIdentifier `co.findfood.app` (user decision); `eas.json` development (dev client APK), preview (APK), production (AAB, autoIncrement). RED (`eas.json` missing) → GREEN 867/867; typecheck, lint, test:render ok. **Release bundle check**: `expo export --platform android --no-bytecode` with `EXPO_PUBLIC_DEV_TOKEN=DEVTOKEN_SENTINEL_9f3a` in the environment → 0 hits; control `api.example.com` inlined. Hermes bytecode step fails locally (`spawn UNKNOWN`, Windows env), so the check ran on the JS bundle. **Pending (user, needs Expo account)**: `eas init`, EAS env variables, `eas build --profile development --platform android`, install on a device.
- F1-11 fix: `npm run check:release-token` (export with `--clear --no-bytecode` + sentinel; control variable must be inlined). PASS on current code; mutation (token read without `__DEV__`) → FAIL. README/test header now say the test only covers `eas.json` and remote EAS env must be checked with `eas env:list`.
- F1-11 fix 2: `check:release-token` returns an exit code instead of `process.exit` inside `try`, so the export dir is always removed; prints `result.error`. Verified: PASS exit 0, mutation FAIL exit 1, 0 leftover temp dirs.
- F2-01..03: RED 23 tests → GREEN; follow-up (user decision: neutral sign-up, no account enumeration) RED 7 → GREEN; full 940/940; typecheck, lint, test:render ok (parent re-ran tests + typecheck). Existing addresses get the same response as new ones (`origen=registro` note with links). OTP screen falls back to the session email in the `verify-email` phase and invalidates `me` after `verifyOtp`. Phone required (avoids TELEFONO pending). No auto-submit on the 6th digit.
- F2-01..03 fix: login navigates immediately with `enviar=1`; the verify screen sends once on mount and starts the cooldown only after a successful send; session-fallback/bare email = resend enabled now; `otpSchema` derives from `OTP_LENGTH`; shared `editableIf`; FormMessage uses tokens. RED 7 → GREEN 945/945; typecheck, lint, test:render ok.
- F2-04+05: RED 8 suites/43 tests → GREEN 1009/1009; typecheck, lint, test:render (26 screens) ok (parent re-ran tests + typecheck). Mutation: removing `setRecovering(true)` → 9 tests fail. Reset uses `exchangeCodeForSession(code, { flowId })` with `sb_flow_id` when present; **decision: keep `experimental.appendPkceFlowIdToRedirects` off** (experimental) — the most recent reset link on the device works. `enviar`/`code` params cleared after the async step (setParams in a mount effect throws before the root layout mounts). `me` refetched on `SIGNED_IN`/`USER_UPDATED`.

## Follow-ups
- API: assert `factor_a_kg` of ML/G in e2e; note in migration header that ON CONFLICT never corrects pre-existing rows.
- scripts/dev-env.mjs: `\uFEFF` escape (written as text) instead of a literal BOM character; reject TTL that yields exp <= iat + 60; reject positional args for `real`; add `node --test` coverage for marker/role/postman parsing (R3-dev-env-untested, WARNING).

- Done: env.test.ts typed `require` cast (F1-02); client refresh hardening (F1-03); shared-refresh deadline, late abort check, supabase wiring tests (F1-04).
- F2-06: StartupError "Cerrar sesión" must show busy/disabled (`signingOut`) and `useSignOut` needs a re-entry guard (R3-001, F1-08 review).
- Tests: font-load error branch of RootNavigator (R3-002); release builds should report invalid config to a crash reporter once one exists (R4).
- F2-06: offline sign-out with an expired session can take ~25-30 s (auth-js retries the refresh inside `signOut`); give `signOutLocally` an overall deadline (then remove keys anyway) and show a blocking "Cerrando sesión…" state; add an end-to-end offline sign-out test. Old `sb-*` SecureStore entries from earlier dev builds stay orphaned (users sign in once more) — optional one-time cleanup.
- Push registration (F3): log a failed rollback DELETE, reword the `registrarDispositivo` comment (it cannot guarantee no orphan when the DELETE also fails), test DELETE-also-fails, and route `deviceIdStorage.save` through a shared throwing write helper.
- Done in F1-10: tolerant list rows, `fallbackCategory`, tone comment, shared `errorCode` helper, strict `fromFechaVencimiento`, `dismissTo` test, RatingScreen `rater` prop.
- Device check pending: iOS scroll behind native tab bar, Android bottom insets; consider expo-router `ThemeProvider` to avoid white flash between tabs (iOS 26 ignores tab bar backgroundColor).
- `docs/pantallas.md` still describes the old flat routes/gallery — refresh after F1-10.
- F2-01: login buttons still point at app routes their phase blocks (R2, F1-09 review).
- Narrow `DraftProduct.coldChain` from `string` to `ColdChain`.
- `.expo/types/router.d.ts` only regenerates on `expo start`; new route files fail `tsc` until then.
- Retrying `/me` from the error phase briefly returns the phase to `loading` (TanStack resets a data-less query to pending); acceptable, but the Stack remounts.
- Tests to add: rejected `onValid` clears `submitting`; AuthError code naming a prototype member; `touched` comment should say "changed via setValue".
- Unverified: Supabase response to `resend({type:"signup"})` for an already confirmed address.
- Device checks: reset link end to end (another phone → "mismo teléfono" message); `recovering` is memory-only — app killed between exchange and new password opens the app with the recovery session; keep Supabase *Secure password change* off.
- Intermittent "SessionProvider … not wrapped in act" warning seen once in a full run (session.test.tsx); investigate if it recurs.
- F3 screens: signed URLs (`url_lectura`, `foto_url`) expire after 5 min; add refetch/expiry handling where shown.
- Readability nits (F1-04b review): reword the fake `signOut` mock comment in supabase.test.ts; unify the two `ignore()` helpers.
- Web build stores the session in localStorage (preview only); revisit if web ever ships to users.

## Next step
F2-06 account menu + logout. Review boundary: `8177d04`.
