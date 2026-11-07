# Feature · direccion-sigue-al-mapa

**Locator:** `odd/tasks/direccion-sigue-al-mapa.md` (Engram mirror `odd/direccion-sigue-al-mapa/tasks`: pending — Engram tools unavailable in the orchestrator session)
**Branch:** `feat/ventana-recogida-dia-completo` (same unpushed "Nueva donación" branch, after `79920b3`)

## Objective
In "Nueva donación", every time the donor moves the map pin or taps "Usar mi ubicación", "Dirección de recogida" is replaced with the address of the new point.

## Problem / Why
Bug report (2026-11-07): the field is filled from the first map point, but later map moves and "Usar mi ubicación" keep the old address. Cause: `donations.tsx` passes `onAddressSuggestion` to `LocationPicker` only while the address is empty, and `suggestDireccion` never overwrites typed text (deliberate earlier rule, now reversed by the user).

## Scope / constraints
- Only points from the map (`"map"`) or the device (`"device"`) rewrite the address; "Ubicar dirección" and a picked Google suggestion (`"address"`) keep the donor's text.
- Writing the reverse-geocoded address must not open the autocomplete list or start a billed autocomplete search for it.
- A slow, stale reverse-geocode answer must not overwrite the address of a newer point.
- The volunteer zone picker (`volunteer-zone.tsx`) keeps its behavior.
- Delivery strategy: `ask-on-risk`. Forecast ≈ 120 authored lines.

## Tasks
- [x] T1 always apply map/device address suggestions in the new-donation form; latest-answer guard and no autocomplete for the applied suggestion in `LocationPicker`; tests. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- Move the map → after the reverse-geocode delay the field shows the new address, even if it already had text.
- "Usar mi ubicación" → the field shows the device position's address.
- No autocomplete suggestions appear for the address written by the map.

## Checks
- `npm run typecheck`, `npx eslint src/components src/domain src/screens`, `npx jest src/components src/domain src/screens`.

## Progress
- 2026-11-07: explored; feature document created.
- 2026-11-07: T1 done (delegated writer). `NewDonationScreen` always passes `onAddressSuggestion`; `suggestDireccion` replaces the address. `LocationPicker` bumps a point counter on every new point (map gesture, "Usar mi ubicación", "Ubicar dirección", a picked suggestion) and drops answers for older points (this also cancels a pending map suggestion when the donor locates their typed address). It marks the suggested text as chosen before applying it, so the autocomplete neither searches nor lists it. `volunteer-zone.tsx` passes neither `address` nor `onAddressSuggestion`, so it is unchanged. Authored lines: about 220 added, 21 removed, mostly tests (over the ~120 forecast because of the screen and picker tests).
  - RED (before the fix): 6 failing: `suggestDireccion` replaces typed text; picker ignores a late answer, does not rewrite an address located after a map move, no autocomplete for the map's address; screen replaces the typed address after a map move and after "Usar mi ubicación". "suggests the address of each new point" passed already (regression guard: the picker always re-suggested, the screen gated it).
  - GREEN: the three touched suites 65/65.
  - Checks: `npm run typecheck` pass; `npx eslint src/components src/domain src/screens` pass; `npx jest src/components src/domain src/screens` 50 suites, 799 tests pass. The 3 "overlapping act()" console errors in `map.test.tsx` also appear on the base.
- 2026-11-07: T1 assess (`--base-ref 0e21c53`): medium, 578 lines, `slice_budget_reached`. Native review granted, lineage `review-958300566c45f2ee`, reliability lens: approved and acknowledged (authority burned); reviewed boundary now `ac111b2`. Parent spot check: `npx jest map donor-draft-screens` 2 suites / 48 tests passed. Advisory, non-blocking: R3-001 (a programmatic camera move reported with `isGesture` undefined would count as a map point and rewrite a just-located address; `isGesture === false` is the only filter), R3-002 (the "drops the located point" screen test no longer proves a point was set before the address changed).
