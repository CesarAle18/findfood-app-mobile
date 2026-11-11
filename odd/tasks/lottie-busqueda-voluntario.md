# Feature · lottie-busqueda-voluntario

**Locator:** `odd/tasks/lottie-busqueda-voluntario.md` (Engram mirror `odd/lottie-busqueda-voluntario/tasks`: pending — Engram tools unavailable in this session)
**Branch:** `feat/lottie-busqueda-voluntario` (from `develop` @ `9445fd6`)

## Objective
While a donation is PUBLICADA, the donor's "Donación publicada" screen (`/donante/espera-voluntario`) plays an animated Lottie loader instead of the static search icon.

## Scope / constraints
- `lottie-react-native` ~7.3.8 (Expo SDK 57 bundled version) plus its optional web peer `@lottiefiles/dotlottie-react` ^0.13.5 (its web entry imports it statically).
- Animation chosen by the user (2026-11-10): LottieFiles share `81943ed6-d89b-4c1e-b97e-db780c4fa53e` ("Lottie Loader new 2", vectors only, 512×512, 60 fps, 241 frames ≈ 4 s, teal tones), its JSON extracted from the `.lottie` into `assets/lottie/searching-volunteer.json`.
- Decorative: hidden from accessibility (the headline already says "Estamos buscando un voluntario"). With "reduce motion" on it falls back to the static search icon.
- Native module: the dev client must be rebuilt (`npx expo run:android` / `run:ios`) before it shows on device.
- Delivery strategy: `ask-on-risk`. Forecast ≈ 120 authored lines (JSON asset excluded); one PR.

## Tasks
- [x] T1 Dependency + Lottie asset + `SearchingAnimation` (`src/components/findfood/searching-animation.tsx`) shown in `Waiting` only for PUBLICADA; Jest assertions in `waiting-screen.test.tsx`; `lottie-react-native` stub in `scripts/check-render.cjs`. Route: inline (small, understood change). Commit `5e9ecb0`.

## Acceptance criteria
- PUBLICADA: the animation renders above "Estamos buscando un voluntario".
- Any other state: the static per-state icon, no animation.

## Checks
- `npm run typecheck`, eslint on touched files, `npx jest src/screens src/components`, `npm run test:render`.

## Progress
- 2026-11-10: T1 implemented. Test-first exception: assertions added after the component (not observed RED). Checks: `npm run typecheck` exit 0 · `npx eslint` on touched src files clean (2 pre-existing errors in `scripts/check-render.cjs`: `__dirname` no-undef line 10, display-name line ~288) · `npx jest src/screens src/components` 34 suites / 453 tests passed · `npm run test:render` fails at the pre-existing assertion line 540 ("Ubica la dirección escrita…"), same on `develop` without this change; the WaitingScreen checks before it pass. Visual check of the animation not run (Chrome extension not connected): pending on device.
- [x] T2 Replace the generated animation with the user's LottieFiles one (same asset path, component unchanged). Route: inline (asset swap).
- 2026-11-10: T2 done. Checks: `npx jest src/screens/__tests__/waiting-screen.test.tsx` 8/8 passed. Visual check pending on device.
- [x] T3 Replace the loader with the user's search animation (`https://lottie.host/6ec7736e-f104-434e-8890-6f1fd366c92a/Q3Ln3KfDNU.json`, "Search", vectors only, 350×250, 24 fps, 96 frames = 4 s); the frame is now 280×200 (user asked for wider and bigger after 210×150) to keep its aspect. Route: inline (asset swap + size constants).
- [x] T4 EXPIRADA plays an original "timeout" Lottie (`assets/lottie/publication-expired.json`: clock whose minute hand sweeps one turn and stops, the clock shakes, a gold "!" badge pops in; 350×250, 30 fps, 4 s loop, same palette as the search one). `SearchingAnimation` became `StatusAnimation({ kind: "searching" | "expired" })` in `src/components/findfood/status-animation.tsx`; `WAITING_ANIMATION` in `src/screens/donations.tsx` maps the state. Route: inline. Checks: `npm run typecheck` exit 0 · eslint on touched files clean · `npx jest src/screens src/components` 34 suites / 453 tests passed (new assertions in the expired test; added after the code, no observed RED). Visual check pending (Chrome extension not connected).
- [x] T5 "No hay donaciones con este filtro" (Mis donaciones, `src/screens/donor.tsx`) plays an original Lottie (`assets/lottie/empty-filter.json`: three gold dots drop into a filter funnel and vanish, the funnel shakes; 350×250, 30 fps, 4 s loop). `EmptyState` gained an optional `illustration` prop that takes the icon's place; `StatusAnimation` kind `empty-filter`. Route: inline. Checks: `npm run typecheck` exit 0 · eslint on touched files clean · `npx jest src/screens src/components` 34 suites / 454 tests passed (new test in `remote-screens.test.tsx`, added after the code, no observed RED) · `npm run test:render` still stops at the pre-existing line-540 assertion. Visual check pending.
- [x] T6 Notificaciones › "Sin leer" empty state ("Estás al día", `src/screens/notifications.tsx`) plays an original Lottie (`assets/lottie/caught-up.json`: a bell rings and settles, a gold badge pops in and its check draws itself; 350×250, 30 fps, 4 s loop). The other tabs keep the bell icon. `StatusAnimation` kind `caught-up`. Route: inline. Checks: `npm run typecheck` exit 0 · eslint on touched files clean · `npx jest src/screens src/components` 34 suites / 455 tests passed (new test in `notifications-screen.test.tsx`, added after the code, no observed RED) · `npm run test:render` still stops at the pre-existing line-540 assertion. Visual check pending.
