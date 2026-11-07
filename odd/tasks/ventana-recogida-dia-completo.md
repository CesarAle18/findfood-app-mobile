# Feature · ventana-recogida-dia-completo

**Locator:** `odd/tasks/ventana-recogida-dia-completo.md` (Engram mirror `odd/ventana-recogida-dia-completo/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/ventana-recogida-dia-completo` (from `develop` @ `5d2ff66`)

## Objective
The "Ventana de recogida" section of the new-donation form keeps only the pickup date; the "Desde"/"Hasta" time pickers are removed.

## Problem / Why
The user asked to remove the pickup hours when creating a donation.

## Scope / constraints
- `POST /donaciones` still requires `ventana_recogida_inicio` and `ventana_recogida_fin` (ISO with offset), so the app derives a full-day window from the chosen date (user decision, 2026-11-07): a future date sends 00:00–23:59 Bogotá; today sends from now (to the minute) until 23:59.
- Validation errors move to the date field: past date, or too little time left today (the existing 15-minute minimum).
- The review screen shows the date with "Todo el día" instead of the hours.
- Delivery strategy: `ask-on-risk`. Forecast ≈ 150 authored lines; one PR.

## Tasks
- [ ] T1 remove `pickupFrom`/`pickupUntil` from the draft, derive the full-day window in the body and validation, update the form and review screens and their tests. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- The form shows only "Fecha de recogida" under "Ventana de recogida".
- A future date produces `…T00:00:00-05:00` – `…T23:59:00-05:00`; today produces a start at the current minute and the same end.
- A past date, or today with less than 15 minutes left, shows an error on the date field and blocks publishing.

## Checks
- `npm run lint`, `npm run typecheck`, `npx jest src/domain src/screens`.

## Progress
- 2026-11-07: explored; branch created; feature document created.
