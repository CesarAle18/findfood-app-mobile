# Feature · perfil-disponibilidad-agrupada

**Locator:** `odd/tasks/perfil-disponibilidad-agrupada.md` (Engram mirror `odd/perfil-disponibilidad-agrupada/tasks`: pending — Engram tools unavailable in this session)
**Branch:** `feat/perfil-disponibilidad-agrupada` (from `develop` @ `d91b96a`)

## Objective
In the volunteer Profile → "Disponibilidad", group consecutive days with identical hours into a few rows (`Lun – Mié 08:00 – 18:00`, `Sáb 09:00 – 14:00`, `Dom Sin horario`) and add a live status badge.

## Problem / why
The section showed every window on one long `Lun 08:00–18:00 · Mar 08:00–18:00 · …` line (`formatFranjas`), hard to scan. The user asked (2026-11-19) for grouped rows and a real-time status indicator.

## Scope / constraints
- Badge = toggle + schedule in Bogotá time, refreshed every minute (user choice 2026-11-19):
  - `disponible` and inside a window → "En línea · hasta HH:mm", primary tone, pulsing dot.
  - `disponible` outside every window → "Fuera de horario · vuelve hoy/mañana/<Día> HH:mm", warning tone.
  - not `disponible` → "No disponible", neutral tone.
- Days without windows read "Sin horario" (user choice); consecutive empty days group. Week Mon→Sun, no wrap.
- Pulse respects the system reduce-motion setting. No new dependencies. Delivery strategy: `ask-on-risk`; forecast ≈ 350 authored lines, one PR.

## Tasks
- [x] T1 Domain: `WEEK_DAYS.short`, `bogotaWeekdayAndTime` in `dates.ts`, `groupFranjas` + `liveAvailability` in `availability-summary.ts`, unit tests. Route: delegated (writer trigger: T1–T3 touch 5+ non-trivial files). Commit `4211916`.
- [x] T2 UI: `LiveStatusBadge`, clock hook (`useNow` or existing), `AvailabilitySchedule`, component tests. Route: delegated (same writer). Commit `256abd1`.
- [x] T3 Wire into `src/screens/account.tsx` `VolunteerProfile`; `scripts/check-render.cjs` stub + assertions; drop `formatFranjas` if unused. Route: delegated (same writer). Commit `4e69659`.

## Acceptance criteria
- The mockup schedule renders as 4 rows: `Lun – Mié`, `Jue – Vie`, `Sáb`, `Dom · Sin horario`.
- Non-consecutive days with equal hours stay separate; multi-window days list every range.
- The badge reads the right state for toggle on/off and inside/outside a window, and updates on the minute.
- The dot pulses only when online and not under reduce motion.

## Checks
`npm run typecheck`, `npx eslint` on touched files, `npx jest src/domain/mappers src/components/findfood src/screens`, `npm run test:render` (known pre-existing failure at the "Ubica la dirección escrita…" assertion).

## Progress
- 2026-11-19: plan approved; branch and document created.
- 2026-11-19 T1 (`4211916`): RED observed (`Cannot find module ./availability-summary`, `bogotaWeekdayAndTime is not a function`; 2 suites failed), then GREEN `npx jest src/domain/mappers` 11 suites / 281 tests passed; `npm run typecheck` clean; `npx eslint` on the 5 touched files clean. A window ending at `23:59` also covers its last minute (deviation noted for review).
- 2026-11-19 T2 (`256abd1`): no existing minute clock (`useCountdown` is a per-second deadline countdown), so `src/hooks/use-now.ts` was added. RED observed (3 suites `Cannot find module`), then GREEN 13/13; leak test verified by removing the cleanup (1 failed) and restoring it. `npx jest src/hooks src/components/findfood` 17 suites / 196 passed; typecheck and eslint clean.
- 2026-11-19 T3 (`4e69659`): Disponibilidad renders `LiveStatusBadge` above `AvailabilitySchedule` in its own `AvailabilitySection` (minute clock scoped there; hooks after the early return avoided); `formatFranjas` + tests removed (no other caller). Deviation: Reanimated `useReducedMotion` is missing from `react-native-reanimated/mock` (loaded by `expo-router/testing-library`), so the badge reads reduce motion from `AccessibilityInfo` (follows changes, still until known); badge test reworked accordingly. Checks: `npm run typecheck` clean; `npx eslint` on 15 touched src files clean; `npx jest src/domain/mappers src/components/findfood src/screens src/hooks` 52 suites / 857 passed; `npm run test:render` new profile assertions pass, stops at the known pre-existing `Ubica la dirección escrita…` assertion (check-render.cjs:559). Authored lines: T1 336, T2 376, T3 206 (≈ 918 total vs 350 forecast: tests and doc comments; one PR still to be decided by the user under `ask-on-risk`).
