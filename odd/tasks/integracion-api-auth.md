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
| F1-04 | QueryClient + SessionProvider + resolveAccess + shared-refresh deadline | delegated writer (2+ non-trivial files) | [x] | see log | |
| F1-05 | Per-module services + query keys + DTO types | delegated writer | [ ] | | |
| F1-06 | Mappers (dates, units, refrigeration, statuses) + tests | delegated writer | [ ] | | |
| F1-07 | Feedback components, problem messages, Field/Button, useZodForm | delegated writer | [ ] | | |
| F1-08 | Root layout guards + splash | delegated writer | [ ] | | |
| F1-09a | Donor segment + NativeTabs | delegated writer | [ ] | | |
| F1-09b | Volunteer segment + NativeTabs, remove BottomNav | delegated writer | [ ] | | |
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

## Follow-ups
- API: assert `factor_a_kg` of ML/G in e2e; note in migration header that ON CONFLICT never corrects pre-existing rows.
- F1-08: catch `ConfigError` at the root and render a configuration error screen instead of crashing on splash (R4-env-import-time-throw).
- scripts/dev-env.mjs: `\uFEFF` escape (written as text) instead of a literal BOM character; reject TTL that yields exp <= iat + 60; reject positional args for `real`; add `node --test` coverage for marker/role/postman parsing (R3-dev-env-untested, WARNING).

- Done: env.test.ts typed `require` cast (F1-02); client refresh hardening (F1-03).
- F1-04: give the shared refresh its own deadline so a hung refresh frees the single-flight slot; re-check `signal.aborted` after registering the abort listener; unit-test `src/auth/supabase.ts` wiring (null client, null refresh, AppState start/stop).
- F2-06: after `signOut({ scope: "local" })`, also remove the Supabase storage key explicitly — auth-js 2.117.3 skips removal when reading the current session fails first (expired + offline), so the session could reappear on restart.
- Web build stores the session in localStorage (preview only); revisit if web ever ships to users.

## Next step
F1-05 services per module. Review boundary: `c9c5d5e`.
