# Feature · sincronizacion-tiempo-real (app)

**Locator:** `odd/tasks/sincronizacion-tiempo-real.md` (Engram mirror `odd/sincronizacion-tiempo-real/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/sincronizacion-tiempo-real` (from `develop` @ `1b36ce2`)
**Sibling:** `findfood-api` → `odd/tasks/sincronizacion-tiempo-real.md` (branch `feat/sincronizacion-tiempo-real` from `Conexion_Front` @ `c0ab0c0`)
**Plan:** `~/.claude/plans/pasted-content-id-a4be-necesito-que-compiled-wall.md`

## Objective
Donors and volunteers see changes made by other users or processes without leaving the screen, signing out or reopening the app, with minimal battery and data cost.

## Problem / Why
Other users' changes only arrive through a foreground push (≤60 s late), state-limited polls (15–60 s), returning to the foreground, or mounting a screen with data older than 30 s. Native tabs stay mounted, so switching tabs never refreshes. Stale today: donor Inicio/Donaciones/detail/assigned-volunteer/delivery/impact and Seguimiento while PUBLICADA; volunteer Inicio/Rutas (new offers only via push; staff route/stop changes missed); Alertas badge/inbox; `GET /me` (volunteer approval, suspension). Without push (denied, simulator, `local` profile) there is no signal at all.

## Approach
Subscribe to the API's new private Supabase Realtime topic `usuario:<auth uid>` (event `sync`, payload contract v1, see the API feature doc) from `SignedInEffects`, only while signed in, foreground and with a Supabase client. One central event → query-keys map (shared with the push foreground handler) feeds a ~300 ms debounced `invalidateQueries` (`cancelRefetch: false`; active queries refetch, inactive ones go stale and refetch on open). Catch-up invalidation on every re-SUBSCRIBED after the first. Event-replaceable polls switch off while connected and remain as fallback; ETA/position polls stay.

## Scope / constraints
- User decisions (2026-11-07): mobile + API only; all missing notices N1–N7 (app handles N1–N4, N6, N7; N5 is staff/web).
- Read the Expo v57 docs (https://docs.expo.dev/versions/v57.0.0/) before writing code (AGENTS.md).
- `src/sync/status` must not import `@/auth/supabase` and must give `useSyncExternalStore` a server snapshot (`scripts/check-render.cjs` runs screens in plain Node).
- `rutas.detail(id)` invalidated with `exact: true` so the nested Google-backed ETA query is not refetched by events.
- Conventional commits without Co-Authored-By trailers; tests ship with code; stage only task files (never `.claude/settings.json`, `.env.example`, `docs/MANUAL DE USUARIO FIND FOOD.*`, `docs/capturas-manual/`, `.codegraph/`).

## Acceptance criteria
- With the channel connected, a change by another user refreshes the visible screen in ~1–2 s and marks other modules stale so they show fresh data on open.
- No channel in background, after sign-out, or without a Supabase client; reconnect/resume triggers exactly one catch-up; malformed events are ignored.
- While connected, espera-voluntario (15 s), offers (15 s) and the 60 s idle tracking poll are off; when disconnected they keep today's intervals.
- Push foreground handling and tap routing use the shared map; tapped pushes refetch their target; impact refreshes after create/cancel.

## Checks
`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:render`.

## Delivery
- Forecast ~1,050 authored changed lines (exceeds 400). Strategy `ask-on-risk`; chain strategy asked before any PR is created. Push/PR/merge are the user's decision.
- RDD: on (global). Review boundary starts at the branch point `1b36ce2`.

## Tasks
| ID | Task | Route | Status | Commit | Review |
|---|---|---|---|---|---|
| APP-1 | `src/sync/sync-event.ts` + `src/sync/sync-keys.ts` (shared map, push mappers moved), push handler + tap invalidation, impact invalidation fix, tests | delegated writer (2+ non-trivial files) | [x] | `65f3efa` | medium · slice_budget_reached (709 lines) · native review unavailable (see Review) |
| APP-2 | `src/sync/status.ts`, `src/sync/use-realtime-sync.ts`, mount in `SignedInEffects`, `src/test-utils/realtime.ts` (migrate `tracking-screens.test.tsx`), tests | delegated writer | [x] | `409d8a5` | medium · slice_budget_reached (1,469 lines) · native review unavailable |
| APP-3 | Gate event-replaceable polls on connection status, `scripts/check-render.cjs` stub, seed `focusManager` from `AppState.currentState` (background launches must not join the channel), tests | delegated writer | [x] | `0cce5a6` | medium · slice_budget_reached (1,652 lines) · native review unavailable |
| APP-4 | New notice types (API codes `DONACION_CANCELADA_BANCO`, `DONACION_REPUBLICADA`, `RECOGIDA_FALLIDA`, `ASIGNACION_TOMADA`, `ASIGNACION_RETIRADA`, `INCIDENCIA_EN_REVISION`, `INCIDENCIA_RESUELTA`): tap routing, keys, "Importantes"; `docs/integracion-backend.md` | delegated writer | [x] | `46150bb` | medium · slice_budget_reached (1,842 lines) · native review unavailable |

## Progress
- 2026-11-07: plan approved; branch created; feature document created.
- 2026-11-07: APP-1 `65f3efa` (writer; RED observed: 4 suites failing on missing modules + 2 impact assertions). Evidence: `npm run lint` exit 0; `npm run typecheck` exit 0; APP-1 suites 4/4, 73/73 (parent re-ran: 73/73); `npm test` 103/104 suites, 1761/1762; `npm run test:render` exit 1. Deviations: null optional payload fields count as absent; `DONACION_CANCELADA` push keeps the `rutas.all` prefix (no `ruta_id` in push data); prefix wins over exact in dedupe.
- 2026-11-07: APP-2 `409d8a5` (writer; RED: 3 suites failing on missing modules, then the SignedInEffects mount case; fake extraction kept `tracking-screens` 24/24 with unchanged assertions). Evidence: lint exit 0, typecheck exit 0, focused suites 6/6, 106/106 (parent re-ran: 106/106), `npm test` 105/106 suites, 1784/1785 (only the known `problem-messages` failure), `test:render` exit 1 at the known `check-render.cjs:532`. API: `useRealtimeSync(enabled)`, `SYNC_FLUSH_MS = 300`; status store `idle|connecting|connected|error` with `useRealtimeConnected()` (server snapshot `false`, no `@/auth` imports). Deviation: rejoin waits for the previous `removeChannel` promise (realtime-js returns the leaving channel for the same topic and its `subscribe()` is a no-op). Notes: a server-initiated `CLOSED` is not rejoined until the next background/foreground cycle (fallback polls keep running); `focusManager.isFocused()` reports true until the first AppState change (fixed in APP-3).
- 2026-11-07: APP-3 `0cce5a6` (writer; RED: 5 assertions — detail/history/offers 15000, tracking idle 60000, focus seeding true; the 30 s live-tracking case passed from the start as a guard). Evidence: lint exit 0, typecheck exit 0, focused suites 5/5, 125/125 (parent re-ran donation-queries/asignaciones/query-client 95/95), `npm test` 105/106 suites, 1790/1791 (only the known `problem-messages` failure), `test:render` exit 1 at the known copy assert (now `:536`; with soft asserts only `:536`/`:664` fail and all 30 screens PASS). `check-render.cjs` now stubs `@/sync/status` (needed: `RatingScreen` is called as a plain function). In jest suites importing `src/app/_layout.tsx` the focus manager now starts unfocused (full suite green).
- 2026-11-07: APP-4 `46150bb` (writer; RED: 14/76 failing — routing per new code, Inicio without ids, `IMPORTANT_CODES`, offer keys). Routing: donor codes → `/donante/detalle-donacion?id=` (Alertas without id/donor view); `ASIGNACION_TOMADA`/`ASIGNACION_RETIRADA` → `/voluntario`; incident codes → the current view's donation detail, else Alertas; `INCIDENCIA_REPORTADA`/unknown → existing fallback. Keys: only TOMADA/RETIRADA needed a case (offers + `rutas.lists()`, not `rutas.all`); donation keys already follow any `donacion_id`. "Importantes" adds `DONACION_CANCELADA_BANCO`, `RECOGIDA_FALLIDA`. Evidence: lint exit 0, typecheck exit 0, focused 76/76 (parent re-ran routes + `src/sync` 125/125), `npm test` 105/106 suites, 1822/1823 (only the known `problem-messages` failure), `test:render` exit 1 at the known `:536`. Docs: `docs/integracion-backend.md` documents the channel, lifecycle, paused/kept polls, fallbacks, new codes and the deploy prerequisite.
- 2026-11-07: closure. Branch total vs `1b36ce2`: 28 files, +1,681/−161. All tasks done; native review unavailable for every slice (gentle-ai defect, user chose to continue without reporting); RDD-off path: medium tier → writer self-verification + parent spot checks (all recorded above).

## Known environmental failures (pre-existing on base `1b36ce2`, untouched by this feature)
- `src/api/problem-messages.test.ts › problemMessages › has a message for every problem type, and only for those`: `problemMessages` has `fuera-de-radio` and `ubicacion-requerida`, which the test list lacks.
- `npm run test:render`: `scripts/check-render.cjs:532` (address-picker hint copy "Ubica la dirección escrita, usa tu ubicación o mueve el mapa" no longer exists) and `:660` (volunteer form "Documento (frente)" / "Enviar solicitud" copy). After APP-3's 4-line stub these are `:536` and `:664`.

## Review
- gentle-ai 4.0.0: the `intended_untracked_selection` collect submission (`--contract … --projection=workspace --intended-untracked-selection=…`) drops `--base-ref/--committed-only`; for this repo the re-entry targeted the user's uncommitted `.claude/settings.json` + `.env.example` instead of the APP-1 commit, so START was not run. User decision (2026-11-07): continue without reporting; affected slices record native review as unavailable and follow the RDD-off tier path (assess tier → writer self-verification + parent spot check; independent verifier for high).

## Next step
User: apply the API migrations (`supabase db push`, `20261108000000`–`20261108000003`) on a project with the v3 schema, deploy the API, build a development build with the `real` profile, and run the device checklist from the plan (two volunteers + donor + web staff). Push/PR on request; the chain strategy (`stacked-to-main` or `feature-branch-chain`) is asked before the first PR. Follow-ups: rejoin after a server-initiated `CLOSED`; pre-existing `problem-messages` test and `check-render.cjs:536/:664` copy asserts; web panel migration to `usuario:<uuid>`.
