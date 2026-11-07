# Feature · ventana-recogida-dia-completo

**Locator:** `odd/tasks/ventana-recogida-dia-completo.md` (Engram mirror `odd/ventana-recogida-dia-completo/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/ventana-recogida-dia-completo` (from `develop` @ `5d2ff66`)

## Objective
The new-donation form no longer has a "Ventana de recogida" section at all (T1 first removed the "Desde"/"Hasta" hours; T3 also removed "Fecha de recogida"). The app derives the window from the moment of sending: now → now + 24 h.

## Problem / Why
The user asked to remove the pickup hours when creating a donation, and then the whole pickup-window section.

## Scope / constraints
- `POST /donaciones` still requires `ventana_recogida_inicio` and `ventana_recogida_fin` (ISO with offset). Since T3 (user decision, 2026-11-07) the app sends start = the current Bogotá minute at confirmation, end = start + 24 h (`…-05:00`, the end on the next calendar day). T1's full-day window from a chosen date (00:00–23:59, or now–23:59 for today) is superseded.
- No pickup-window validation remains in the form; the review screen shows no window line.
- Delivery strategy: `ask-on-risk`. Forecast ≈ 150 authored lines per task; one PR.

## Tasks
- [x] T1 remove `pickupFrom`/`pickupUntil` from the draft, derive the full-day window in the body and validation, update the form and review screens and their tests. Route: delegated writer (2+ non-trivial files).
- [x] T2 expiry calendar ("Fecha de vencimiento"): `DateTimeField` marks today (Bogotá) and, with the new `disablePast` prop, disables past days and "Mes anterior" before the current month; applied to the expiry field only. Route: inline (one component + its new test). Commit `92e8fb1`.
- [x] T3 remove the whole "Ventana de recogida" section (incl. "Fecha de recogida") and `pickupDate` from the draft; `pickupWindowFromNow(now)` replaces `fullDayPickupWindow`/`fullDayPickupBounds`; no pickup-window validation; the review card drops its "Ventana:" line. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- The form has no "Ventana de recogida" section and no "Fecha de recogida" field (T3).
- Confirming at instant `now` sends `ventana_recogida_inicio` = the current Bogotá minute and `ventana_recogida_fin` = 24 h later (next calendar day), e.g. 23:50 → next day 23:50.
- No pickup-window error blocks the form or the review; the review card shows no window.

## Checks
- `npm run lint`, `npm run typecheck`, `npx jest src/domain src/screens src/state`.

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
- 2026-11-07 T3 (delegated writer): removed the section, `pickupDate`, `newDonationDraft` (callers in `donor.tsx` and `mobile-context.tsx` now use `initialDonationDraft`), the full-day helpers and their tests, and the pickup-date refines/messages. `toCrearDonacionBody` sends `pickupWindowFromNow(now)`; `donor.tsx` still uses one `now` for `validateDraft` and the body, so a PATCH retry re-sends a fresh window. R3-002/R3-003 are moot (no pickup date, no zero-length window).
  - API check (`findfood-api/src/modulos/donaciones`, read-only): create/PATCH only require `fin > inicio` (`validarVentana`); publish refuses `inicio < now − 5 min` (`TOLERANCIA_INICIO_MIN`, `ventana-en-el-pasado`) and `fin < now + 15 min` (`MARGEN_PUBLICACION_MIN`, `ventana-muy-corta`); no maximum duration or days-ahead rule. now → now + 24 h complies; the end was not adapted.
  - RED: `npx jest src/domain/mappers/dates.test.ts src/domain/__tests__/draft-submission.test.ts src/screens/__tests__/donor-draft-screens.test.tsx` → 3 suites failed, 21 failed / 104 passed.
  - GREEN: `npm run typecheck` → clean; `npx eslint src/domain src/screens src/state src/test-utils` → exit 0; `npx jest src/domain src/screens src/state` → 44 suites / 733 tests passed.
- 2026-11-07: T3 assess (`--base-ref 0e21c53 --committed-only`, unrelated untracked excluded): risk `medium`, 263 lines, `review_due: false` (`under_budget`), pending in the slice. Parent spot check: `npx jest dates donor-draft-screens` 2 suites / 108 tests passed; no `pickupDate`/`fullDayPickup`/`newDonationDraft` left in src code.
