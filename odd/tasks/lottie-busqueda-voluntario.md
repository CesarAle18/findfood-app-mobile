# Feature · lottie-busqueda-voluntario

**Locator:** `odd/tasks/lottie-busqueda-voluntario.md` (Engram mirror `odd/lottie-busqueda-voluntario/tasks`: pending — Engram tools unavailable in this session)
**Branch:** `feat/lottie-busqueda-voluntario` (from `develop` @ `9445fd6`)

## Objective
While a donation is PUBLICADA, the donor's "Donación publicada" screen (`/donante/espera-voluntario`) plays an animated Lottie (radar rings pulsing around a magnifier) instead of the static search icon.

## Scope / constraints
- `lottie-react-native` ~7.3.8 (Expo SDK 57 bundled version) plus its optional web peer `@lottiefiles/dotlottie-react` ^0.13.5 (its web entry imports it statically).
- Original animation, generated in brand colors (`#1F7A5A`), 200×200, 60 fps, 2 s loop: `assets/lottie/searching-volunteer.json`.
- Decorative: hidden from accessibility (the headline already says "Estamos buscando un voluntario"). With "reduce motion" on it falls back to the static search icon.
- Native module: the dev client must be rebuilt (`npx expo run:android` / `run:ios`) before it shows on device.
- Delivery strategy: `ask-on-risk`. Forecast ≈ 120 authored lines (JSON asset excluded); one PR.

## Tasks
- [x] T1 Dependency + Lottie asset + `SearchingAnimation` (`src/components/findfood/searching-animation.tsx`) shown in `Waiting` only for PUBLICADA; Jest assertions in `waiting-screen.test.tsx`; `lottie-react-native` stub in `scripts/check-render.cjs`. Route: inline (small, understood change).

## Acceptance criteria
- PUBLICADA: the animation renders above "Estamos buscando un voluntario".
- Any other state: the static per-state icon, no animation.

## Checks
- `npm run typecheck`, eslint on touched files, `npx jest src/screens src/components`, `npm run test:render`.

## Progress
- 2026-11-10: T1 implemented. Test-first exception: assertions added after the component (not observed RED). Checks: `npm run typecheck` exit 0 · `npx eslint` on touched src files clean (2 pre-existing errors in `scripts/check-render.cjs`: `__dirname` no-undef line 10, display-name line ~288) · `npx jest src/screens src/components` 34 suites / 453 tests passed · `npm run test:render` fails at the pre-existing assertion line 540 ("Ubica la dirección escrita…"), same on `develop` without this change; the WaitingScreen checks before it pass. Visual check of the animation not run (Chrome extension not connected): pending on device.
