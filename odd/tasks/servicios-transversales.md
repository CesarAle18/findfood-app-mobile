# Feature · servicios-transversales

**Locator:** `odd/tasks/servicios-transversales.md` · Engram `odd/servicios-transversales/tasks` (mirror **pending**: Engram tools unavailable in the session that created this file) · project `findfood-app-mobile`
**Branch:** `feat/servicios-transversales` (from `develop` @ `b77e10b`)
**Plan:** `~/.claude/plans/necesito-que-realizes-un-compressed-wind.md`

## Objective
Phase 3 transversal services (MOV-20…MOV-26): catalogs, photo evidence upload, push notifications, notification inbox, background volunteer location, maps and profile editing, wired to `findfood-api` and following `vercel-react-native-skills`.

## Problem / Why
The data layer exists (`src/services/{catalogos,evidencias,notificaciones,perfil}.ts`), but there are no native modules, no binary upload (the API client is JSON-only), no sign-in lifecycle hook, and screens still use mocks (`productOptions`, `PhotoPlaceholder`, SVG `RouteMap`, `preview.ts`, local `useMobile().available`).

## Scope / constraints
- User decisions: background location (foreground fallback); "Importantes" = `ASIGNACION_OFRECIDA, DONACION_CANCELADA, DONACION_EXPIRADA, DONACION_RECHAZADA, VERIFICACION_RECHAZADA` (client filter); catalogs cached in memory + prefetched on entering the app (no persister); delivery `feature-branch-chain`.
- API facts: `GET /catalogos` has no ETag; duplicate evidence `id` → 201 existing; push `data` = `{tipo, donacion_id?, asignacion_id?, notificacion_id}` with no URL, Android channel `default`; inbox is offset-paged with `no_leidas`; `POST /voluntario/ubicacion` accepts only `{lat,lng}`; toggle is `PATCH /voluntario/estado`; no GET for availability (use `/me`); no live volunteer position for donors (API-06); profile metrics missing (API-07).
- Conventional commits, no AI attribution. Tests ship with code. Read Expo v57 docs before using each library.
- Out of scope: Realtime live tracking, API-06/API-07 backend work, offline persistence of catalogs.

## Acceptance criteria
- MOV-20: catalogs fetched once per session and reused; `productOptions`, units, vehicle types and reasons come from `GET /catalogos`.
- MOV-21: a retry after a network cut does not duplicate the evidence; denied permissions show how to enable them.
- MOV-22: a new offer arrives as push and opens `/voluntario/oferta` with that assignment.
- MOV-23: paged inbox with Todas / Sin leer / Importantes, mark one / all read.
- MOV-24: location stops being sent when "No disponible" (without a route in progress) or on sign-out.
- MOV-25: picked point is sent as `{lat,lng}`; the typed address is preserved.
- MOV-26: profile edit via `PATCH /me`; volunteer windows via `PUT /voluntario/disponibilidad` reusing `AvailabilityField`.

## Checks
`npm test` · `npm run typecheck` · `npm run lint`

## Delivery
- Forecast: ~2,500–3,000 authored changed lines (exceeds 400) → strategy `ask-on-risk`; chain strategy: `feature-branch-chain` (one PR per ticket into `feat/servicios-transversales`; final PR to `develop`).
- RDD: on (global). Review boundary starts at branch point `b77e10b`.

## Tasks
| ID | Task | Route | Status | Commit | Review |
|---|---|---|---|---|---|
| T0 | Native deps, config plugins, env keys, jest mocks, permission gate + notice | delegated writer (2+ non-trivial files) | [x] | `4fed226` | medium (slice_budget_reached) → declined (candidate only); writer checks: typecheck 0, lint 0, jest 1098/1098; parent spot check typecheck 0 |
| T1 | MOV-20 catalogs: single prefetched query, selectors, replace mocks, `MotivoField`, signed-in effects | delegated writer (2+ non-trivial files) | [x] | `8b44b36` | medium (slice_budget_reached) → declined (candidate only); writer: typecheck 0, lint 0, jest 1131/1131, test:render 3 PASS; parent spot check catalog+motivo tests 16/16 |
| T2 | MOV-21 resumable evidence upload pipeline, `usePhotoCapture`, `PhotoField` | delegated writer (2+ non-trivial files) | [x] | `96d46e1` | medium (slice_budget_reached) → declined (candidate only); writer: typecheck 0, lint 0, jest 1154/1154, test:render 3 PASS; parent spot check src/media 20/20 |
| T3 | MOV-23 inbox: `routeForNotification`, infinite query, FlashList screen, optimistic read | delegated writer | [ ] | | |
| T4 | MOV-22 push: handler, channel, registration, response routing, real offer screen | delegated writer | [ ] | | |
| T5 | MOV-24 background location task, availability toggle from `/me`, stop on sign-out | delegated writer | [ ] | | |
| T6 | MOV-25 maps: `FindFoodMap`, `LocationPicker`, `RouteMapView` | delegated writer | [ ] | | |
| T7 | MOV-26 profile edit, franjas mapper, controlled `AvailabilityField`, edit availability | delegated writer | [ ] | | |

## External prerequisites (user)
1. `eas init` → `extra.eas.projectId`; FCM V1 + APNs credentials in EAS.
2. Google Maps keys (Android/iOS) in `GOOGLE_MAPS_ANDROID_API_KEY` / `GOOGLE_MAPS_IOS_API_KEY`.
3. New development build after T0.
4. Play Console background-location declaration and Apple "Always" justification before store release.

## Progress / evidence
- Branch created from `develop` @ `b77e10b`.
- T0 `4fed226`: RED→GREEN for permissions helper, PermissionNotice, problem slugs. Notification icon omitted (no 96x96 white asset) → follow-up. Maps plugin and `extra.eas.projectId` only applied when env vars set. Review boundary → `4fed226`.
- T1 `8b44b36`: RED→GREEN for catalog selectors, draft helpers, signed-in effects. `useCatalogos` replaced by `catalogosQuery()` + `useTiposAlimento/useUnidades/useTiposVehiculo/useMotivos`. Reason body field is `observacion`. Reject offer / cancel donation call the API only when the route carries `asignacionId` / `id`. Review boundary → `8b44b36`.
- T2 `96d46e1`: RED→GREEN pipeline (20 tests): id generated once at capture, retry after register failure reuses id without re-PUT, expired URL re-requested once, duplicate object = uploaded. Upload = PUT to Supabase signed URL with `x-upsert:false`, content-type, cache-control (matches supabase-js `uploadToSignedUrl`). `PhotoPlaceholder` removed. Review boundary → `96d46e1`.

## Follow-ups
- Live volunteer position for donors (API-06 / Realtime). Push code for routes. Profile metrics (API-07).
- Donation create body mapper from draft (`tipoAlimentoId`, `unidadToId`) and "Publicar donación" submit are not wired (pre-existing gap).
- Volunteer registration submit (`solicitarVoluntario`, `Number(vehicleType)`) not wired. No abandon-assignment UI (ABANDONO_ASIGNACION).
- Notification icon asset (96x96 white PNG). Unit tests for env-gated branches of `app.config.ts`.
- Evidence fields (RECOGIDA/ENTREGA) upload but do not register until screens have a real parent id; product photo `ruta` not yet in `DraftProduct`; evidence list UI pending. Storage error shapes not verified live.

## Next step
T3 (MOV-23 inbox).
