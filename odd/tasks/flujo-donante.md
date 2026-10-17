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
| A1 | API-08 rating aspects (findfood-api) | delegated writer (2+ non-trivial files) | [ ] | | |
| M1 | MOV-30 Nueva donación: draft → create body, validation, photos, date | delegated writer | [ ] | | |
| M2 | MOV-31 Revisar: POST/PATCH + publicar, errors, thumbnails | delegated writer | [ ] | | |
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

## Next step
A1 (API-08), then M1…M9 in order.
