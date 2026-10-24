# Feature · seguimiento-en-vivo-donante

**Locator:** `odd/tasks/seguimiento-en-vivo-donante.md` (Engram mirror `odd/seguimiento-en-vivo-donante/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/seguimiento-en-vivo` (app, from `develop` @ `6e350d3`) · `feat/seguimiento-donante` (findfood-api, from `Conexion_Front` @ `32b9223`)
**Plan:** `~/.claude/plans/necesito-que-implementes-al-crystalline-badger.md`

## Objective
API-06: the donor's Seguimiento screen shows a live map with the volunteer travelling to the donor's pickup point and then to the food bank, with ETA, until the donation is delivered.

## Problem / Why
The volunteer app already broadcasts its position on the private Supabase Realtime channel `ruta:<id>` (event `posicion`), and the staff web panel (`findfood-front-web`, `src/integration/live-position.ts`) already consumes it. The donor cannot: the RLS function `fn_rt_es_donante_de_ruta` cuts the donor off after pickup, `GET /rutas/:id/seguimiento` excludes DONANTE, and `GET /donaciones/:id` lacks bank coordinates.

## Scope / constraints
- User decisions (2026-10-23): donor sees BOTH legs live until delivery (widen RLS window); new endpoint `GET /v1/donaciones/:id/seguimiento` (DONANTE owner + ADMIN/ASESOR_BANCO).
- Privacy: never return other donors' stops/addresses/ids; only a `paradas_antes` count. Never use `RouteMapView` for the donor (it draws every stop).
- The donor endpoint takes no `?lat&lng` (shared per-route Google cache must not be poisoned); origin is `ultima_ubicacion` (≤30 min).
- Mobile hook ports `useLivePosition`/`parsePosition`/`useGlide` from `findfood-front-web/src/integration/live-position.ts`.
- Conventional commits without Co-Authored-By trailers; tests ship with code; read Expo v57 docs before writing code; push/PR are the user's decision.
- Out of scope: web panel changes, food-bank mobile role, location history.

## Acceptance criteria
- API: migration widens `fn_rt_es_donante_de_ruta` to both legs; endpoint returns phase, pickup, bank, last position, tramo (only when donor's target is the next stop), `ruta_id` only inside the window; 404 for non-owner, 403 for volunteer.
- App: Seguimiento shows "En vivo" section with map (volunteer marker gliding, pickup, bank, leg polyline) and ETA text while `activo`; hidden otherwise; polling 30 s; realtime subscription while active.

## Checks
- API: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e -- test/seguimiento` (needs local DB, `npm run db:local:reiniciar`).
- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:render`.

## Delivery
- Forecast: ~450 API + ~650 app authored changed lines (exceeds 400 per repo). Strategy `ask-on-risk`; chain strategy asked before any PR is created (commits are identical either way).
- RDD: on (global). Review boundary starts at branch point (`32b9223` API, `6e350d3` app).

## Tasks
| ID | Task | Route | Status | Commit | Review |
|---|---|---|---|---|---|
| API06-1 | Migration widening `fn_rt_es_donante_de_ruta` | delegated writer (API backend unit, 2+ non-trivial files) | [x] | `86cc251` | high · granted · approved + acknowledged `review-80e4310b26908d50` (4 lenses; advisory follow-ups F1–F5) |
| API06-2 | `ventanaDonante` + unit spec + `tramoHacia` refactor | delegated writer | [x] | `70a024e` | same review |
| API06-3 | `seguimientoDonacion` + controller + module | delegated writer | [x] | `c9f2048` | same review |
| API06-4 | e2e cases | delegated writer | [x] | `4fff3a1` | same review |
| API06-5 | Docs (`arquitectura.md`, README) + Postman | delegated writer | [x] | `e7921b6` | same review |
| MOV-1 | DTO, service, query key, `useDonationTracking` | delegated writer (2+ non-trivial files) | [x] | `56a210c` | medium · granted · approved + acknowledged `review-5819cd0da6a7c773` (1 lens; follow-ups F6–F7) |
| MOV-2 | `useVolunteerLivePosition` + `useGlide` + tests | delegated writer | [x] | `e24b71e` | medium · granted · approved + acknowledged `review-5819cd0da6a7c773` (1 lens; follow-ups F6–F7) |
| MOV-3 | `DonorTrackingMap` + tests | delegated writer | [x] | `4f3ac3b` | medium · granted · approved + acknowledged `review-5819cd0da6a7c773` (1 lens; follow-ups F6–F7) |
| MOV-4 | Integration in `Tracking` + screen tests (+ parent: 60 s idle poll, `check-render.cjs` stub) | delegated writer + parent inline fix | [x] | `3452181` | medium · granted · approved + acknowledged `review-5819cd0da6a7c773` (1 lens; follow-ups F6–F7) |
| MOV-5 | Docs (`integracion-backend.md`, `servicios-transversales.md`) | inline | [x] | `0bbc1e0` | medium · granted · approved + acknowledged `review-5819cd0da6a7c773` (1 lens; follow-ups F6–F7) |

## Progress
- 2026-10-23: plan approved; branches created; feature document created.
- 2026-10-23: API06-1..5 done. Evidence: lint exit 0 (pre-existing warning only), typecheck exit 0, `npm test` 104/104, `npm test -- seguimiento` 17/17 (parent re-ran: 17/17), `test:e2e -- test/seguimiento test/auth` 38/38. Full e2e: 17 failures in test/ruteo, test/asignacion, test/flujo-completo that also fail on base `32b9223` (pre-existing; POST /v1/rutas 409 after dynamic routes). Deviation: volunteer gets 404 (volunteers keep DONANTE role from signup), recorded in README decision 17. Postman regeneration also added 8 pre-existing endpoints missing from the collection.
- 2026-10-23: MOV-1..4 done by writer (RED observed per task). Parent added idle 60 s poll (RED→GREEN on `pollWhileActive` test) and the `scripts/check-render.cjs` stub for the new hook/map (surface missed in delegation). Evidence: writer `npm test` 100/100 suites, 1658/1658; parent re-ran tracking-screens 22/22, `test:render` PASS (29 screens), typecheck exit 0, lint exit 0. Deviations: seguimiento fixture in `src/test-utils/fixtures/seguimiento.ts`; detail/historial also refreshed when tracking `estado_donacion` differs from the detail.
- 2026-10-23: MOV-5 docs.

## Follow-ups (advisory, from review `review-80e4310b26908d50`; non-blocking)
- F1 (R1-1, privacy, WARNING): on HACIA_BANCO with another donor's pickup still open, the donor keeps seeing `voluntario_posicion` / Realtime position, which can reveal the other donor's approximate address while the volunteer is EN_SITIO there. Plan default accepted it; needs user decision whether to hide/coarsen.
- F2 (R2-001/R3, WARNING): SQL uses EXISTS over any ENTREGA, service uses the highest-orden ENTREGA; diverge only on routes with >1 ENTREGA (not created today). Align both.
- F3 (R4, WARNING): donor polls refresh the shared per-route tramo cache from stored `ultima_ubicacion`; may alternate with volunteer live origin when >2 km apart, raising Google calls.
- F4 (R3, WARNING): e2e Realtime probe issues BEGIN/SET LOCAL/SELECT as separate `ctx.sql.query` calls; nondeterministic if `ctx.sql` is a Pool. Parent checked: `ctx.sql` is a single `pg.Client` (`test/utilidades/app-de-pruebas.ts:192`), so no change needed.
- F5 (R2-002/003, SUGGESTION): open-stop states hard-coded in 3 places; Postman test script for donation seguimiento reads `lista[0].id` on an object.
- F6 (R3-1, app, WARNING): live section kept by cached `activo` after the detail left live states. Fixed in `788a866` (render also gated by `hasLiveTracking(dto.estado)`; tracking-screens 22/22, typecheck 0).
- F7 (R3-2, app, SUGGESTION): `useGlide` resumed from the last drawn point after a null target. Fixed in `1de193a` (RED→GREEN test 'jumps straight to a target that comes back after a null'; 33/33, eslint clean, typecheck 0). These two fixes are post-review commits and are not covered by the acknowledged review.

## Next step
User decision on F1 (privacy on bank leg with other pickups pending); optional API alignment F2/F3/F5; user runs `supabase db push`; device check of the volunteer marker. Push/PR on request (chain strategy asked then).
