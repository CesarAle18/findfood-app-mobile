# Feature · flujo-donante

**Locator:** `odd/tasks/flujo-donante.md` · Engram `odd/flujo-donante/tasks` (mirror **pending**: Engram tools unavailable in the session that created this file) · project `findfood-app-mobile`
**Branch:** `feat/flujo-donante` (from `develop` @ `9f4cb6b`) · API: `findfood-api` `feat/flujo-donante` (from `Conexion_Front`)
**Plan:** `~/.claude/plans/realiza-la-implementacion-utilizando-wondrous-whale.md`

## Objective
Phase 4 donor flow (MOV-30…MOV-39) wired to the real `findfood-api` contract, plus API-08 (rating aspects) in the API, following `vercel-react-native-skills`.

## Problem / Why
Donor screens exist but run on drafts and mocks: Nueva/Revisar never POST or publish, Donación publicada is static with a demo link, Inicio uses mock activity, Calificar / Registro voluntario are local-only, and the donor delivery screen is fake.

## Scope / constraints
- User decisions: MOV-39 = real donor "Donación entregada" confirmation; MOV-37 = implement API-08 end to end (API + mobile); MOV-38 = adapt the form to the current API contract; all mobile work on `feat/flujo-donante` (no chained PRs); API branch `feat/flujo-donante` from `Conexion_Front`; the user runs `supabase db push` + `npm run db:pull`.
- API facts: `/v1` prefix, raw JSON, pages `{datos,total,limite,desplazamiento}`; `peso_estimado_kg` required per item; PATCH only in BORRADOR/EXPIRADA (items replace all); publicar 422 `sin-productos|producto-vencido|ventana-en-el-pasado|ventana-muy-corta`, 409 `sin-almacen-disponible`; detail `asignacion.voluntario.telefono` null until acceptance; history at `GET /donaciones/:id/historial`; cancel `{motivo_id, observacion?}`; rating only when assignment COMPLETADA; volunteer request requires plate, birth date (18+), base location, `documento_frente`, `url_foto_vehiculo`.
- Out of scope: API-06 (live volunteer location / ETA), API-01, MOV-46, push/PR/merge.

## Acceptance criteria
- MOV-30: food types and units from catalogs, inline pickup point, per-product photo `ruta_foto`, window/expiry validated before review.
- MOV-31: Confirmar = POST (or PATCH when the draft already exists in the API) + publicar; Editar returns to the draft.
- MOV-32: detail + history, refreshed by polling and push; cancel with `motivo_id`.
- MOV-33: paged list; En seguimiento = PUBLICADA…EN_TRANSITO, Entregadas = ENTREGADA/RECIBIDA.
- MOV-34: `/me/impacto` metrics, latest donation, recent activity from notifications, tracking count from the list.
- MOV-35/36: history timeline, `tel:` only when the phone arrives, assigned volunteer with pickup map.
- MOV-37 + API-08: aspects catalog, rating with aspects, idempotent repeat, enabled only when ENTREGADA and not rated yet.
- MOV-38: `POST /voluntario/solicitud` with photos, status from `GET /me`.
- MOV-39: donor delivery confirmation with real data, opened by DONACION_ENTREGADA push.

## Checks
Mobile: `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:render`. API: `npm run lint` · `npm run typecheck` · `npm test` · `npm run test:e2e`.

## Delivery
- Forecast: ~3,000 authored changed lines across both repos (exceeds 400). User chose a single branch per repo with work-unit commits; PR/merge remain the user's decision.
- RDD: `gentle-ai` binary not executable in this environment (permission denied, same as servicios-transversales T7) → assessment unavailable; recorded per task, independent parent verification instead.

## Tasks
| ID | Task | Route | Status | Commit | Review |
|---|---|---|---|---|---|
| T0 | Feature document | inline | [x] | (this commit) | passive |
| A1 | API-08 rating aspects (findfood-api) | delegated writer (2+ non-trivial files) | [x] | api `b0c2ce1` | RDD unavailable; writer: lint 0, typecheck 0, jest 62/62; test:e2e **not run** (no local Postgres/Docker: ECONNREFUSED 127.0.0.1:54329); parent spot check aspectos.spec 4/4 |
| M1 | MOV-30 Nueva donación: draft → create body, validation, photos, date | delegated writer | [x] | `2ceb525` | RDD unavailable (gentle-ai not executable); writer: typecheck 0 errors, lint 0 problems, jest 1353/1353 (73 suites), test:render 3/3 PASS |
| M2 | MOV-31 Revisar: POST/PATCH + publicar, errors, thumbnails | delegated writer | [x] | `ea97412` | RDD unavailable (gentle-ai not executable); writer: typecheck 0 errors, lint 0 problems, jest 1359/1359 (73 suites), test:render 3/3 PASS |
| M3 | MOV-32 Donación publicada: detail + history, polling + push, cancel | delegated writer | [ ] | | |
| M4 | MOV-33 Mis donaciones: tab predicates | delegated writer | [ ] | | |
| M5 | MOV-34 Inicio donante: impacto, latest, activity | delegated writer | [ ] | | |
| M6 | MOV-35/36 Seguimiento, Detalle, Voluntario asignado | delegated writer | [ ] | | |
| M7 | MOV-37 Calificar voluntario with aspects | delegated writer | [ ] | | |
| M8 | MOV-39 Entrega donante | delegated writer | [ ] | | |
| M9 | MOV-38 Registro voluntario | delegated writer | [ ] | | |

## External prerequisites (user)
1. `supabase db push` + `npm run db:pull` in `findfood-api` after A1, before testing MOV-37 against Supabase.

## Progress / evidence
- Branch `feat/flujo-donante` at `develop` @ `9f4cb6b`.
- M1 (`2ceb525`): RED 21 failing (new `src/domain/__tests__/draft-submission.test.ts` + `dates.test.ts` helpers) → GREEN. Draft gains `apiId`, `pickupDate`, `DraftProduct.rutaFoto/fotoUri`; `newDonationDraft(now)` defaults the date to today in Bogotá (`initialDonationDraft` keeps `pickupDate: ""`). `toCrearDonacionBody` returns null while incomplete and throws `MappingError` for a unit missing from the catalog or without `factor_a_kg`; `validateDraft(draft, now)` (zod 4) mirrors the API rules by field. NewDonationScreen: pickup date field, inline errors after the first "Continuar", product photo `ruta` + local uri stored via the new `PhotoField onUploadedFile` prop (`onUploaded` unchanged). `MobileProvider` accepts `initialDraft` for tests.
- M1 decision: `pickupDate` is `DD/MM/AAAA` (not `YYYY-MM-DD`) because `DateTimeField` writes and `toPickupWindow`/`parseDate` read that format; equal start/end times are refused client-side (the mapper would read them as a 24 h window).
- M2 (`ea97412`): RED 6 failing in `src/screens/__tests__/donor-draft-screens.test.tsx` → GREEN (9 tests: validation, POST+publicar, PATCH when `apiId`, 422 `ventana-muy-corta` then retry PATCHes, 409 `donacion-no-editable`, re-validation, thumbnails). Confirmar re-validates, stores `apiId` right after POST, publishes, resets the draft and `router.replace`s to `espera-voluntario?id=`. Editar uses `dismissTo` back to the form, keeping `apiId`.
- M2 decision: on 409 `donacion-no-editable` for an existing `apiId` the app clears `apiId` and asks the donor to check Mis donaciones before confirming again (which creates a new donation); it never re-creates silently, because the earlier publish may have succeeded with a lost answer. Problem messages for the publish/PATCH/file codes already existed in `problem-messages.ts`.

- A1 `b0c2ce1` (findfood-api): migration `20261016000000_aspectos_calificacion.sql` (`aspecto_calificacion`, `calificacion_aspecto`, RLS, 5 VOLUNTARIO aspects); `validarAspectos` → 422 `aspecto-invalido` + `codigos_invalidos`; rating repeat now 200 with the original data (409 `ya-calificada` removed); `GET /catalogos?incluir=aspectos_calificacion&rol_calificado=`; detail `asignacion.calificada_por_mi`. RED→GREEN unit only; e2e written but not run (needs Docker + `npm run db:local`).

## Next step
M3 (MOV-32), M4 (MOV-33), M5 (MOV-34).
