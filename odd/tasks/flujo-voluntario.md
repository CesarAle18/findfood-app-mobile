# Feature · flujo-voluntario

**Locator:** `odd/tasks/flujo-voluntario.md` (Engram mirror `odd/flujo-voluntario/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/flujo-voluntario` (app, from `develop` @ `e2f469a`) · `feat/flujo-voluntario` (findfood-api, from `Conexion_Front` @ `594fe6e`)
**Plan:** `~/.claude/plans/necesito-que-realizes-la-quizzical-coral.md`

## Objective
Phase 5 · volunteer flow (MOV-40 … MOV-46) end to end against the real `findfood-api` contract, plus API-10 (product condition at pickup) in the API.

## Problem / Why
Volunteer screens exist but mostly render preview data. Home summary/activity, active route stops, pickup, delivery and donor rating are not wired. Accepting an offer never produces a route because the API requires `POST /rutas` (API-09 open) while the UI promises an automatic route.

## Scope / constraints
- User decisions: "Armar ruta" step in the Rutas tab (accepted-without-route list, preselected, `POST /rutas`); abandon link in the accepted offer, accepted-without-route rows and pending stop card; implement API-10 in the API (`estado_producto` BUENO/REGULAR/MALO on `parada_ruta`); single branch per repo with work-unit commits; push/PR are the user's decision.
- API facts: problem+json slugs; `forbidNonWhitelisted` (extra body fields → 400); `GET /asignaciones/ofertas` returns live OFRECIDA + all own ACEPTADA (with `ruta_id`, `donacion_id`); `POST /rutas` max 5 stops (`MAX_PARADAS_POR_RUTA`), ENTREGA stop added automatically; `cancelar` only PLANIFICADA, no body; `fallida` uses `tipo_incidencia_id` + `descripcion` (5–2000), RECOGIDA only; `confirmar` needs ≥1 evidence with `parada_id`, `precision_m ≤ 50` or `confirmacion_manual:true`, `confirmada_en_dispositivo` required; ENTREGA confirmation closes the route (409 `recogidas-pendientes`); stops lack `asignacion_id`/items → `GET /donaciones/:id`; rating only when asignación COMPLETADA, idempotent; no DONANTE rating aspects seeded; no realtime (push or polling).
- Conventional commits without Co-Authored-By trailers (user, 2026-10-17); user asked to review every change (consent granted for each candidate in this feature); tests ship with code; read Expo v57 docs before using each library; apply `vercel-react-native-skills` rules.
- Out of scope: API-09, API-05, websocket realtime, seeding DONANTE aspects, failed-stop donation state fix (API), bank web display of `estado_producto`, offline confirmation queue.

## Acceptance criteria
- MOV-40: home summary, next route, pending-offer banner and recent activity read the API; availability toggle unchanged.
- MOV-41: live countdown from `expira_at`, accept disabled at expiry, focused polling, capacity from `/me`, corrected copy.
- MOV-42: accepted-without-route selection + create route; planned route start/cancel; in-progress next stop with arrival, contact (`tel:`), detail, failed-stop report.
- MOV-43: pickup confirmation with evidence, per-item weights, total, `estado_producto`, location/manual confirmation, observations.
- MOV-44: ENTREGA confirmation with evidence closes the route; completed summary.
- MOV-45: abandon with ABANDONO_ASIGNACION reason in the three agreed places.
- MOV-46: volunteer rates donor after completion.
- API-10: optional `estado_producto` on `POST /paradas/:id/confirmar` (RECOGIDA only), persisted and returned.

## Checks
- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:render`.
- API: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` (needs local DB).

## Delivery
- Forecast: ~2,800 app + ~250 API authored changed lines (exceeds 400). User chose a single branch per repo with work-unit commits.
- RDD: on (global). Review boundary starts at branch point (`e2f469a` app, `594fe6e` API).

## Tasks
| ID | Task | Route | Status | Commit | Review |
|---|---|---|---|---|---|
| V1 | Shared foundation (current fix, countdown, call button, route mappers, `useCurrentRoute`, push invalidation, problem messages, fixtures) | delegated writer (2+ non-trivial files) | [x] | `b2e2da2` | medium · granted · approved (1 lens, 2 WARNING follow-ups → V3) |
| V2 | MOV-40 Home | delegated writer | [ ] | | |
| V3 | MOV-41 Offer | delegated writer | [ ] | | |
| V4 | MOV-42 Rutas: build/create/start/cancel route, stop list | delegated writer | [ ] | | |
| V5 | MOV-42 In-progress stop: arrival, contact, failed stop | delegated writer | [ ] | | |
| V6 | MOV-45 Abandon in three places | delegated writer | [ ] | | |
| V7 | API-10 in findfood-api | delegated writer (API repo) | [x] | API `2b43516` | medium · under_budget (161 lines) · pending; review at close |
| V8 | MOV-43 Register pickup | delegated writer | [ ] | | |
| V9 | MOV-44 Delivery and route close | delegated writer | [ ] | | |
| V10 | MOV-46 Rate donor, docs, final checks | delegated writer | [ ] | | |

## External prerequisites (user)
- findfood-api: `supabase db push` + `npm run db:pull` for the API-10 migration; run the API locally.
- Development build for device-only checks (camera, GPS, push).

## Progress / evidence
- Branches created; RDD status read: on (global).
- V1: RED observed first (missing modules for routes mappers, current fix, countdown, call button; `volunteerKeysForPush` / `useTiposIncidencia` not functions; route mutations not caching the detail), then GREEN. Checks: typecheck, lint, `npm test` (89 suites, 1524 tests) and `test:render` pass. `iniciar`/`cancelar` no longer invalidate the detail they cache. All listed problem slugs already existed; only `demasiadas-paradas` copy changed.
- V1 review (lineage review-bdff40f21cba2b67): reliability lens approved and acknowledged. Follow-ups fixed in V3: countdown does not resync `now` when `expiresAt` changes; `getCurrentFix` timeout also covers the permission prompt.
- V7 (API `2b43516`): DTO spec RED 3/7 → GREEN 7/7; typecheck, lint (oxlint), `npm test` 69/69, `prisma validate` pass; `test:e2e` not run (no local DB on 127.0.0.1:54329). Also records `estado_producto` in trazabilidad metadata. Commits amended to drop the Co-Authored-By trailer (trees unchanged).

## Follow-ups
- API-09, API-05, DONANTE rating aspects seed, failed stop leaves donation EN_RECOLECCION, bank web `estado_producto`, offline confirmation queue.

## Next step
V2 (MOV-40 Home) + V3 (MOV-41 Offer, plus V1 review follow-ups).
