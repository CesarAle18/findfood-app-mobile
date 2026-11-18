# Feature · route-map-lines

**Locator:** `odd/tasks/route-map-lines.md` in both repos (Engram mirror `odd/route-map-lines/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `fix/route-geometry-quality` (findfood-api, from `origin/Conexion_Front` @ `f113c81`) · `fix/route-map-lines` (app, from `develop` @ `fa7c235`)

## Objective
The volunteer's route map draws lines that follow the streets: no corner-cutting zigzags, no straight stop-to-stop segments posing as a route, no stale spur from where the route was planned, and the ETA card names the stop the blue leg actually reaches.

## Problem / Why
Reported 2026-11-17 with a screenshot of `RUT-261111-VJADH`:
1. `GoogleRoutesService.ruta()` never sends `polylineQuality`, so Google returns the simplified `OVERVIEW` polyline: few points, cuts across blocks.
2. On Google failure a planned route stores the stops as a straight `LINESTRING`; `seguimiento` returns a 2-point `ESTIMADO` leg. The app draws both like street geometry.
3. Route geometry starts at the planning-time origin and is never retraced when stops close, so it keeps a spur and the legs already driven.
4. App: `RouteDetail` renumbers stops 1..n (OMITIDA dropped) but `NextStopEta` prints the API's `orden` ("parada 3" while the blue leg ends at marker 2).

## Scope / constraints
- The app's GeoJSON decoding is correct (`lineStringToLatLngs`); no client-side simplification exists.
- Conventional commits without Co-Authored-By trailers; tests ship with code; push/PR are the user's decision.
- Delivery strategy: `ask-on-risk`. Forecast ≈ 150 authored lines (≈ 90 API, ≈ 60 app); each repo stays one PR.

## Tasks
- [x] T1 (findfood-api) `polylineQuality: 'HIGH_QUALITY'` in `GoogleRoutesService.ruta()` + unit test. Route: delegated writer (API, with T2–T3). Commit `086de1d` (API repo).
- [x] T2 (findfood-api) planned routes store `geometria = NULL` instead of the straight stop `LINESTRING` when Google returns null. Route: delegated writer. Commit `94f2b44` (API repo).
- [x] T3 (findfood-api) retrace the pending path (`trazar`) from the closed stop after `confirmar`, `fallida` and `omitirParada`, fire-and-forget. Route: delegated writer. Commit `9d4286f` (API repo).
- [x] T6 (findfood-api) retrace when a donation expires, is cancelled or is reassigned on a live route (user decision 2026-11-17). Commit `3e0bcb2` (API repo).
- [x] T7 (findfood-api) a retrace keeps the planned `distancia_total_km` (user decision 2026-11-17). Commit `a8ed228` (API repo).
- [x] T4 (app) `RouteMapView` draws the planned path only when `proveedor_ruteo === "GOOGLE"`; the next leg only when `tramo.proveedor === "GOOGLE"`. Route: delegated writer (app, with T5). Commit `ed37ce2`.
  - `RouteMapView` takes a required `proveedorRuteo` (its only caller is `RouteDetail`; required so a new caller cannot hide the path by omission) and frames only what it draws. `RouteDetail` passes `tramo` only for GOOGLE legs; the ETA card keeps "estimado sin tráfico". Fixture `proveedor_ruteo` changed from `"osrm"` to `"GOOGLE"` (the API writes only `GOOGLE` or `NULL`).
  - RED observed: 3 failures (map: path hidden for `null`/`GEODESICO`; screen: ESTIMADO leg + untraced path hidden). GREEN: 63/63.
- [x] T5 (app) `NextStopEta` shows the displayed stop number (by `parada.id`), falling back to the API `orden`. Route: delegated writer. Commit `dc22975`.
  - RED observed: "Unable to find an element with text: Llegas a la parada 1 hacia las 15:15" (OMITIDA first pickup, API `orden` 2). GREEN: 64/64.

App verification (after `dc22975`): `npm run lint` exit 0; `npm run typecheck` exit 0; `npx jest src/components/findfood/map src/screens/__tests__/route-screen.test.tsx` 64 passed. The "overlapping act()" console error in the map suite also occurs on the base (pre-existing).

Residual (app): routes stored before T2 whose Google matrix succeeded but whose path trace failed keep `proveedor_ruteo = 'GOOGLE'` with a straight `geometria`; new routes get `NULL` (T2), and a later stop closure retraces them (T3).

Route evidence: each repo touches 2+ non-trivial files (service + specs; component + screen + tests) → writer trigger.

## Review (native RDD)
- findfood-api `9ec2b4c..2b1d918` (T1–T3; the range also held upstream `f113c81`): risk medium, `slice_budget_reached` (704 lines) → consent granted → 1 lens (review-reliability) → approved; acknowledged, authority burned (lineage `review-b556308726265c40`). Reviewer note: the `fallida` auto-cancel block belongs to upstream `f113c81`, not to this feature.
- findfood-api `2b1d918..198e48b` (T6–T7): risk medium, `under_budget` (360 lines) → no review due; pending in the slice.
- app `fa7c235..a9ac29a` (T4–T5): risk medium, `under_budget` (185 lines) → no review due.

## Acceptance criteria
- With a Google key, `GET /v1/rutas/:id` `geometria` is the high-quality polyline and, after a stop closes, starts at that stop.
- Without Google, `geometria` is `null` and the app shows the stops only; an `ESTIMADO` leg is not drawn.
- The ETA card's stop number matches the marker the blue leg ends at.

## Checks
- API: `npm run lint`, `npm run typecheck` (if present), `npm test`.
- App: `npm run lint`, `npm run typecheck`, jest for map + route screen.

## Out of scope / follow-up
- `seguimiento` caches a leg for up to 2 min / 2 km (`seguimiento.service.ts:20-22`), so the blue leg may start slightly behind the device.
