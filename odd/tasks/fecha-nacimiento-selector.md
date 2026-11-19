# Feature · fecha-nacimiento-selector

**Locator:** `odd/tasks/fecha-nacimiento-selector.md` (Engram mirror `odd/fecha-nacimiento-selector/tasks`: pending — Engram tools unavailable in this session)
**Branch:** `feat/perfil-disponibilidad-agrupada` (stacked on the availability work; user to decide the delivery split)

## Objective
In the volunteer request form (`src/screens/volunteer.tsx`, "Datos personales"), the birth date is chosen with the app's date picker (`DateTimeField`) instead of typed as `DD/MM/AAAA`.

## Problem / why
Typing the date by hand invites format mistakes. The user asked (2026-11-19) for the date selector, as the donation form already uses for the expiry date.

## Scope / constraints
- Reuse `src/components/findfood/date-time-field.tsx`; a birth date needs going back decades, so the picker gains a year jump (tap the month/year title to choose a year) and a `maxDate` bound (days after it disabled, next-month blocked past it).
- Latest pickable birth date = the Bogotá day of 18 years ago; empty value opens the calendar on that month.
- The schema in `src/domain/volunteer-request.ts` keeps validating (required, adult) and the body stays `YYYY-MM-DD`.
- The donation form's use of `DateTimeField` (`disablePast`) must behave as before. No new dependencies.

## Tasks
- [x] T1 `DateTimeField`: `maxDate` + year selection, tests. Then the volunteer form uses it for `fecha_nacimiento`, screen test updated. Route: delegated (writer trigger: 2+ non-trivial files).

## Acceptance criteria
- The birth date field opens a calendar; no keyboard appears.
- A user can reach a year decades back in a few taps; dates making them younger than 18 cannot be picked.
- Submitting sends `fecha_nacimiento` as `YYYY-MM-DD`; missing date still shows "Ingresa tu fecha de nacimiento.".

## Checks
`npm run typecheck`, `npx eslint` on touched files, `npx jest src/components/findfood src/screens src/domain`.

## Progress
- 2026-11-19: document created.
- 2026-11-19: T1 done. `DateTimeField` gained `maxDate` (later days and next month disabled; an empty value opens on its month), a year list behind the month/year title ("Elegir año, <Mes> <Año>", 1900 or today's year with `disablePast` up to `maxDate`'s year, month clamped to the bounds) and a `hint` caption. `latestAdultBirthDate(now)` in `src/domain/volunteer-request.ts` (29 Feb → 28 Feb); the form reads `now` once for the schema and the picker bound. Helper tests in `src/domain/volunteer-request.test.ts` (the allowed surface; the older suite stays in `src/domain/__tests__/`).
  - RED observed: picker + helper 9 failed / 4 passed; screen 4 failed / 5 passed (no "Fecha de nacimiento *: Seleccionar" button).
  - GREEN observed: `npm run typecheck` exit 0; `npx eslint` on the 6 touched src files exit 0; `npx jest src/components/findfood src/screens src/domain` 58 suites / 963 tests passed.
  - `scripts/check-render.cjs` does not touch the birth date; left unchanged.
