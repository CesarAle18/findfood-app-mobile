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
- [ ] T1 always apply map/device address suggestions in the new-donation form; latest-answer guard and no autocomplete for the applied suggestion in `LocationPicker`; tests. Route: delegated writer (2+ non-trivial files).

## Acceptance criteria
- Move the map → after the reverse-geocode delay the field shows the new address, even if it already had text.
- "Usar mi ubicación" → the field shows the device position's address.
- No autocomplete suggestions appear for the address written by the map.

## Checks
- `npm run typecheck`, `npx eslint src/components src/domain src/screens`, `npx jest src/components src/domain src/screens`.

## Progress
- 2026-11-07: explored; feature document created.
