# Feature · zona-servicio-bogota

**Locator:** `odd/tasks/zona-servicio-bogota.md` in both repos (Engram mirror `odd/zona-servicio-bogota/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/zona-servicio-bogota` (app, from `develop` @ `83707ae`) · `feat/zona-servicio-bogota` (findfood-api, from `Conexion_Front`)
**Plan:** `~/.claude/plans/necesito-tambien-que-modifiques-composed-giraffe.md`

## Objective
Addresses and saved points are limited to Bogotá and its neighbouring municipalities (Soacha, Chía, Cajicá, Cota, Funza, Mosquera, Madrid, La Calera, Sibaté, Tocancipá…).

## Problem / Why
Google searches are only restricted to Colombia (a 50 km bias around Bogotá), so suggestions and geocoded points from other cities appear, and the API accepts any valid lat/lng as a pickup point or volunteer base.

## Scope / constraints
- User decisions (2026-10-24): restrict searches AND reject points outside the area (app + API); the map itself still pans freely. Area = Bogotá + neighbouring municipalities.
- Service area rectangle (same numbers in both repos): south 4.44, north 5.00, west -74.30, east -73.95.
- API changes also affect the web front (same `/geo/*` endpoints and DTOs).
- Conventional commits without Co-Authored-By trailers; tests ship with code; push/PR are the user's decision.

## Tasks
- [ ] T1 (findfood-api) Service area constant + validator; Google autocomplete `locationRestriction.rectangle`; details/geocode filtered to the area; reverse geocode outside the area skips Google; DTO validation for `ubicacion_recogida` and `ubicacion_base`; unit + e2e tests. Route: delegated writer (2+ non-trivial files).
- [x] T2 (app) `SERVICE_AREA` + `isInServiceArea`; phone geocoder results outside the area are "not found"; donation draft and volunteer request reject points outside the area; NOT_FOUND text mentions Bogotá; tests. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- Autocomplete only suggests places inside the rectangle; geocoding an address outside answers 404; points outside are rejected with 400 by the API and with a field error by the app; a point in Chía is accepted.

## Checks
- API: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e` (geo, donaciones, voluntario; needs local DB).
- App: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:render`.

## Progress
- Pre-work (not part of this feature): app `develop` got `beb0d57` (light map), `88802e3` (native pin), `83707ae` (search icon).
- T2 done in app commit `b1da8af` (delegated writer). RED observed first (7 new tests failing), then GREEN. Checks: `npm run lint` exit 0; `npm run typecheck` exit 0; `npm test` 100 suites / 1678 tests passed; `npm run test:render` PASS (exit 0). Volunteer registration screen test fixture moved from Cali to Bogotá (4.65, -74.06).
