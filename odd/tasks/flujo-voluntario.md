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
| V2 | MOV-40 Home | delegated writer | [x] | `71715b7` (+ fix `b918d08`) | medium · granted · approved `review-102d43f64ae567dd` (2 WARNING follow-ups → V10) |
| V3 | MOV-41 Offer | delegated writer | [x] | `2aa8fb4` + render fix | medium · granted · approved `review-102d43f64ae567dd` (2 WARNING follow-ups → V10) |
| V4 | MOV-42 Rutas: build/create/start/cancel route, stop list | delegated writer | [x] | `a86dca7` | medium · granted · approved `review-fca5d35c40b5d97b` (follow-ups fixed in `a50853d`) |
| V5 | MOV-42 In-progress stop: arrival, contact, failed stop | delegated writer | [x] | `e82d13b` | medium · granted · approved `review-fca5d35c40b5d97b` (follow-ups fixed in `a50853d`) |
| V6 | MOV-45 Abandon in three places | delegated writer | [x] | `43a28ee` | medium · granted · approved `review-fca5d35c40b5d97b` (follow-ups fixed in `a50853d`) |
| V7 | API-10 in findfood-api | delegated writer (API repo) | [x] | API `2b43516` + `76809e2` | medium · granted · approved `review-afa1df84ec1ed762`; null-guard fix approved `review-88a38d62f29f45f0` |
| V8 | MOV-43 Register pickup | delegated writer (2+ non-trivial files) | [x] | `9b8a274` | medium · granted · approved `review-dc72dd99c86e7cd9` (follow-up fixed in `aa05c1c`, reviewed `review-bc208b074e6feb43`) |
| V9 | MOV-44 Delivery and route close | delegated writer | [x] | `8fbcab5` | medium · granted · approved `review-dc72dd99c86e7cd9` (follow-up fixed in `aa05c1c`, reviewed `review-bc208b074e6feb43`) |
| V10 | MOV-46 Rate donor, docs, final checks (+ review follow-ups) | delegated writer | [x] | `a50853d` + `8187524` | medium · granted · approved `review-dc72dd99c86e7cd9` (follow-up fixed in `aa05c1c`, reviewed `review-bc208b074e6feb43`) |

## External prerequisites (user)
- findfood-api: `supabase db push` + `npm run db:pull` for the API-10 migration; run the API locally.
- Development build for device-only checks (camera, GPS, push).

## Progress / evidence
- Branches created; RDD status read: on (global).
- V1: RED observed first (missing modules for routes mappers, current fix, countdown, call button; `volunteerKeysForPush` / `useTiposIncidencia` not functions; route mutations not caching the detail), then GREEN. Checks: typecheck, lint, `npm test` (89 suites, 1524 tests) and `test:render` pass. `iniciar`/`cancelar` no longer invalidate the detail they cache. All listed problem slugs already existed; only `demasiadas-paradas` copy changed.
- V1 review (lineage review-bdff40f21cba2b67): reliability lens approved and acknowledged. Follow-ups fixed in V3: countdown does not resync `now` when `expiresAt` changes; `getCurrentFix` timeout also covers the permission prompt.
- V7 (API `2b43516`): DTO spec RED 3/7 → GREEN 7/7; typecheck, lint (oxlint), `npm test` 69/69, `prisma validate` pass; `test:e2e` not run (no local DB on 127.0.0.1:54329). Also records `estado_producto` in trazabilidad metadata. Commits amended to drop the Co-Authored-By trailer (trees unchanged).

- V1 follow-ups (own `fix(voluntario)` commit): RED 3 tests (countdown deadline changed after mount to a past / later deadline; permission prompt answered after the timeout) → GREEN. `useCountdown` resets `now` during render when the deadline changes (state updater, React Compiler purity rules forbid `Date.now()` in render and setState in effects); `getCurrentFix` times only the position read.
- V2: `volunteer-home-screen.test.tsx` RED 6/6 → GREEN 6/6. Summary (EN_CURSO + PLANIFICADA totals, pending stops of the current route, dash while loading), next route from `useCurrentRoute`, "Armar ruta" CTA from accepted-without-route, live offer banner, five newest notifications opened with `useOpenNotification` (marks read + `routeForNotification`). `src/data/preview.ts` removed (no other importer). The inbox icon mapping lives in `notifications.tsx` (outside V2 surface): mirrored as `activityIcon` in home.
- V3: mapper (+`expiresAtIso`, `weightKg`, `donacionId`, `contactName`, `contactPhone`) and `pollWhileOffered` RED 4 → GREEN; `volunteer-offer-screen.test.tsx` RED 6/6 → GREEN 6/6 (countdown, expiry disables Aceptar + "Esta oferta venció" + invalidation, 15 s polling, capacity text/warning, accepted contact, copy). `useOfertas({ live })` polls while the offer screen is mounted and an offer is OFRECIDA, paused in the background. Not gated by `useIsFocused`: `scripts/check-render.cjs` stubs `expo-router` without it (outside the V3 surface); the offer screen is a stack leaf, so mounted means visible. `capacidad_carga_kg` already existed in `MeVoluntarioDto`. Abandon placeholder comment left for V6. catalog-screens offer tests now mock the session and pin `Date.now` before `expira_at`. Checks: typecheck, lint, `npm test` (91 suites, 1542 tests) pass; `test:render` FAILS on `scripts/check-render.cjs:392`, which still asserts the removed static badge `"Vence 15:10"` (outside the V3 surface; needs updating to the countdown, e.g. assert `DON-1048` and `15:10`).

- V3 render check: parent fixed `scripts/check-render.cjs` (static "Vence 15:10" badge replaced by the live countdown; now asserts the "Responde antes de" time). `test:render` passes. Offer polling is gated on OFRECIDA + mounted + foreground (no `useIsFocused`; the render stub lacks it).
- V4 (`a86dca7`): `route-screen.test.tsx` RED 8/8 (no `ActiveRouteScreen` behavior) → GREEN 8/8: accepted pickups preselected, create sends exactly `{ donacion_ids }`, unchecked rows left out, >5 and mixed warehouses blocked client-side, empty state links to the offers, planned route start and confirmed cancel, "Aceptadas sin ruta" below a route. New `pickupWindowLabel` mapper (tolerant of unreadable windows; written with its test, no separate RED). `useCurrentRoute` now exposes `error`. Preview data and the TODO removed.
- V5 (`e82d13b`): RED 7 → GREEN 15/15: "Llegué al punto" posts llegada with `ubicacion` only when `getCurrentFix` returns a fix; EN_SITIO links to `registrar-recogida` / `entrega-voluntario` with `{ paradaId, rutaId }`; ENTREGA arrival "Llegué al banco"; "Ver detalle" opens `detalle-donacion?id=`; failed stop blocks descriptions under 5 characters and sends `{ tipo_incidencia_id, descripcion }` after a native confirm. The next pickup's donation detail is prefetched. `scripts/check-render.cjs` stubs `@/location/current-fix` (expo-location has no Node build).
- V6: RED 3 (route) + 1 (offer) → GREEN: `AbandonAssignment` sends `{ motivo_id }` behind a native confirm and reports "Liberaste la recogida. La donación volvió a publicarse." / "Liberaste la recogida." via the Rutas notice; placed in the accepted offer (then `dismissTo("/voluntario")`), each accepted-without-route row and the next pickup card (hidden without a matching assignment). Fixture motivo 45 (ABANDONO_ASIGNACION without comment) added. Checks: typecheck, lint, `npm test` (92 suites, 1564 tests), `test:render` pass.

- V2/V3 review follow-ups (fix in V10): offer `expiredId` never clears when the server still lists the offer or its `expira_at` moves; Home treats an ofertas fetch error as "Sin rutas programadas" (no CTA/banner, no error).

- V8 (`9b8a274`): `collection.test.ts` written first (RED: module missing) → GREEN 10/10; `collection-screen.test.tsx` RED 10/10 against the previous screen → GREEN 10/10 (legacy `?id=` empty state, completed/not-in-progress states, prefilled estimates + live total, confirm disabled without evidence, product condition required, exact body with precise fix, weak fix → native confirm + `confirmacion_manual: true`, server `precision-insuficiente` → manual retry, `evidencia-requerida` message). Shared `useConfirmStop` in `route-actions.tsx` captures `confirmada_en_dispositivo` on press, sends `precision_m` only when measured. "Calificar donante" link removed. The current fix is not attached to the evidence registration: `PhotoField` has no `ubicacion` prop and `photo-field.tsx` is outside the V8 surface. `scripts/check-render.cjs` answers the route detail and evidence lists and asserts the collection form.
- V9 (`8fbcab5`): `delivery-screen.test.tsx` RED 5/5 → GREEN 5/5 (empty state, warehouse + pickup outcomes + kg, confirm body without pickup fields then COMPLETADA summary with duration and "Calificar donantes" link to `calificar-donante?id=`, summary survives reopening, `recogidas-pendientes` → "Volver a la ruta"). Stop helpers (`useStopParams`, `useStopRoute`, `StopUnavailable`) moved to `route-actions.tsx`. Location tracking check: `useVolunteerLocationTracking` derives tracking from `rutas.list(ROUTES_IN_PROGRESS).total`, and the confirm mutation invalidates `rutas.lists()`, so tracking stops once no route is EN_CURSO and the volunteer is not available (no change needed).
- Review follow-ups (`a50853d`): offer expiry keyed by `id@expira_at` (RED 2 → GREEN: a later deadline for the same offer re-enables Aceptar; the new deadline expires again); Home offers error → "No pudimos cargar tus ofertas" with retry (RED 1 → GREEN); `ArrivalButton` wraps `getCurrentFix` in try/finally (RED: rejecting fix → GREEN posts llegada `{}` and stops loading); next-stop actions keyed by `parada.id`, failed-stop form and abandon form close on success (RED: form carried over → GREEN closed and empty on the next stop); route tests wait for the delivery content and the ofertas query before asserting absences; offer test restores spies in `afterEach`.
- V10: `rating-screen.test.tsx` RED 3 → GREEN 14/14 (volunteer sends `{ puntaje, comentario }` to `/asignaciones/:id/calificacion` and returns to `/voluntario/rutas`; blocked with "Podrás calificar cuando la entrega se confirme en el banco." until the assignment is COMPLETADA; `calificada_por_mi` shows the done state). The aspects-hidden test passed before the change (the section already rendered only with catalog rows); kept as a regression test. Docs: `docs/integracion-backend.md` (volunteer flow endpoints, API-10, remaining API follow-ups) and `docs/pantallas.md` (`/ruta-activa` = Rutas tab; stop screens take `paradaId`/`rutaId`). Checks: typecheck, lint, `npm test`, `test:render` pass.

- Close: final app slice review approved (WARNING: over-limit total said "mayor que 0" → fixed in `aa05c1c`, test RED→GREEN). API review approved (WARNING: explicit `estado_producto: null` on ENTREGA rejected → guard `!= null` in `76809e2`; covered by the e2e case, RED not observable without a local DB). Final app checks: typecheck pass, lint pass, `npm test` 1598/1598, `test:render` 3/3 PASS. API: typecheck, lint, `npm test` 69/69 pass; `test:e2e` not run (no local DB).

## Follow-ups
- API-09, API-05, DONANTE rating aspects seed, failed stop leaves donation EN_RECOLECCION, bank web `estado_producto`, offline confirmation queue.
- Attach the confirmation fix to the stop evidence (`PhotoField` needs a `ubicacion` input).

## Next step
Feature complete and reviewed. User-owned: `supabase db push` + `npm run db:pull` (API-10), run API `test:e2e` with the local DB, manual device QA in a development build (camera, GPS, push; walkthrough in the plan).
