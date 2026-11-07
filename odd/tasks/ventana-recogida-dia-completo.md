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
- [x] T1 remove `pickupFrom`/`pickupUntil` from the draft, derive the full-day window in the body and validation, update the form and review screens and their tests. Route: delegated writer (2+ non-trivial files).
- [x] T2 expiry calendar ("Fecha de vencimiento"): `DateTimeField` marks today (Bogotá) and, with the new `disablePast` prop, disables past days and "Mes anterior" before the current month; applied to the expiry field only. Route: inline (one component + its new test). Commit `92e8fb1`.

## Acceptance criteria
- The form shows only "Fecha de recogida" under "Ventana de recogida".
- A future date produces `…T00:00:00-05:00` – `…T23:59:00-05:00`; today produces a start at the current minute and the same end.
- A past date, or today with less than 15 minutes left, shows an error on the date field and blocks publishing.

## Checks
- `npm run lint`, `npm run typecheck`, `npx jest src/domain src/screens`.

## Progress
- 2026-11-07: explored; branch created; feature document created.
- 2026-11-07 T1 (delegated writer): added `fullDayPickupWindow`/`fullDayPickupBounds` in `src/domain/mappers/dates.ts` (`toPickupWindow`/`pickupWindowBounds` kept, still covered by their tests); dropped `pickupFrom`/`pickupUntil` from the draft; `toCrearDonacionBody(draft, catalogs, now = Date.now())` sends the full-day window; `pickupDate` validation adds "La fecha de recogida no puede ser anterior a hoy." and "Ya no queda tiempo para recoger hoy. Elige otra fecha." (15-minute minimum), replacing the hour rules; the form shows only the date plus "El voluntario podrá recoger en cualquier momento de ese día."; the review card reads "Ventana: <fecha> · Todo el día"; `donor.tsx` uses one `now` for validation and the body.
  - RED: `npx jest src/domain/mappers/dates.test.ts src/domain/__tests__/draft-submission.test.ts` → 11 failed, 107 passed (new full-day window, body and date-validation tests).
  - GREEN: `npm run typecheck` → clean; `npx eslint src/domain src/screens src/state src/test-utils` → exit 0, no findings; `npx jest src/domain src/screens` → 39 suites, 700 tests passed.
  - `npm run lint` (whole project) not run separately; the scoped eslint above covers the changed files.
- 2026-11-07: review assess (`--base-ref 5d2ff66 --committed-only`, untracked unrelated files excluded): risk `medium`, `review_due: false` (`under_budget`, 288 changed lines). Parent spot check: `npx jest draft-submission donor-draft-screens` 2 suites / 32 tests passed. Full `npm run lint` not run (scoped eslint exit 0).
- 2026-11-07: removed the date hint "El voluntario podrá recoger en cualquier momento de ese día." at the user's request (inline, one mechanical UI line + its assertion). `npx jest donor-draft-screens` 13 passed; `npm run typecheck` clean; eslint on both files exit 0.
- 2026-11-07: T2 done in `92e8fb1`. RED: `npx jest src/components/findfood/__tests__/date-time-field.test.tsx` 4 failed (no today mark, no disablePast; the calendar opened on the wall-clock month). GREEN: `npx jest src/components src/screens` 34 suites / 426 tests passed; `npm run typecheck` clean; `npx eslint src/components/findfood src/screens/donations.tsx` exit 0.
- 2026-11-07: branch reached the slice budget (assess: medium, 404 lines, `slice_budget_reached`). Native review granted, lineage `review-667a35e91273a98d`, one reliability lens: approved and acknowledged (authority burned). Reviewed boundary is now `92e8fb1`. Advisory, non-blocking: R3-001 (this record lacked T2, fixed by this entry), R3-002 (pickup date picker could also use `disablePast`), R3-003 (`fullDayPickupWindow` at 23:59 gives a zero-length window; `validateDraft` blocks it first).
