# Feature · waze-proxima-parada

**Locator:** `odd/tasks/waze-proxima-parada.md` (Engram mirror `odd/waze-proxima-parada/tasks`: pending, because Engram tools aren't available in the orchestrator session)
**Branch:** `feat/waze-next-stop` (app, from local `develop` @ `d91b96a`)

## Objective
While a route is `EN_CURSO`, the "Próxima parada" card gets an "Ir con Waze" button. It opens the Waze app with turn-by-turn navigation to that stop's coordinates.

## Problem / Why
The route screen draws the plan on Google Maps but has no navigation. Volunteers have to copy the address into Waze by hand.

## Decisions (user, 2026-11-19)
- The button lives on the next-stop card. It does not open Waze automatically on start. Waze takes a single destination and no waypoints, so navigation goes stop by stop.
- **No API changes.** `GET /rutas/:id` already returns `lat`, `lng` and `direccion` per stop. The findfood-api repo has no Waze code.

## Scope / constraints
- Use the universal link `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`.
- Don't use `canOpenURL` or the `waze://` scheme. Both would need iOS `LSApplicationQueriesSchemes`, Android `<queries>` and a native build. Follow the `CallButton` pattern instead: catch the failure and show a message.
- Show the button only while the stop is `PENDIENTE`, for pickups and for the delivery.
- Commits are Conventional, without a Co-Authored-By trailer. Push and opening the PR are the user's decision.
- Delivery: `single-pr` to develop. Forecast is about 150 authored lines, under the budget.

## Tasks
- [x] T1 `src/components/findfood/waze-button.tsx` (`wazeUrl` and `WazeButton`) with `__tests__/waze-button.test.tsx`, test-first. Route: delegated writer (T1+T2, 2+ non-trivial files).
- [x] T2 Render `WazeButton` in `NextStop` (`src/screens/route-actions.tsx`) for `PENDIENTE` stops, with coverage in `src/screens/__tests__/route-screen.test.tsx`, test-first.

## Acceptance criteria
- Pressing "Ir con Waze" calls `Linking.openURL("https://waze.com/ul?ll=<lat>,<lng>&navigate=yes")` with the next stop's coordinates.
- If `openURL` rejects, a fallback message appears.
- No button once the stop is `EN_SITIO` or later, and none outside `EN_CURSO`.

## Checks
`npx jest` (focused, then full), `npm run typecheck`, `npm run lint`.

## Progress / evidence
- **T1** (route: delegated writer). Commit `bd03b29` `feat(route): add WazeButton to open a stop in Waze`. RED: `npx jest src/components/findfood/__tests__/waze-button.test.tsx` failed with "Cannot find module '../waze-button'" (the suite did not run, 0 tests). GREEN: same command, 5/5 passed (`wazeUrl`, a press opens the universal link, a rejected `openURL` shows the fallback message, NaN/Infinity render nothing). The button reuses the existing `route` icon. Note: this document's T1 update failed to apply before that commit (no Python on the machine), so it went in unchanged and the T1 evidence is recorded here with T2 (no amend).
- **T2** (route: delegated writer). RED: `npx jest src/screens/__tests__/route-screen.test.tsx -t Waze`: "opens the pending next stop in Waze" failed (no "Ir con Waze" button). The `EN_SITIO` and `PLANIFICADA` no-button tests already passed, as expected before the change. GREEN: `WazeButton` (keyed `waze-${parada.id}`) renders after the card for `PENDIENTE` stops only, and the focused run of both suites passed 37/37. Checks: full `npx jest` 111 suites / 1969 tests passed, `npm run typecheck` exit 0, `npm run lint` exit 0. Commit `278e494` `feat(route): open the next stop in Waze from the route screen`.

- **Review assessment** (`gentle-ai review assess --base-ref develop --committed-only`, unrelated untracked files excluded): tier `medium` (`executable_change`), 5 paths, 180 lines, `review_due: false`, reason `under_budget`. No native review was due. Parent spot check: the focused jest run passed 37/37.

- **T3** (user request 2026-11-19, route: inline, one mechanical component plus a one-line swap). `WazeLogo` in `src/components/findfood/icon.tsx`: the mascot drawn in SVG, decorative, following the `GoogleLogo` pattern. `WazeButton` now uses it instead of the generic `route` icon. There was no meaningful runnable RED, because the icon is hidden from accessibility. Checks: jest for waze-button, route-screen and auth-screens passed 81/81, `npm run typecheck` exit 0, `npm run lint` exit 0. The look still needs checking on a device.

## Next step
T1, T2 and T3 are done. Next: test on a device, then push and a single PR to develop (the user's decision).
