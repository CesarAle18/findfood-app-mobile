# Feature · oferta-modal-voluntario

**Locator:** `odd/tasks/oferta-modal-voluntario.md` (Engram mirror `odd/oferta-modal-voluntario/tasks`: pending, because Engram tools aren't available in the orchestrator session)
**Branch:** `feat/oferta-modal-voluntario` (app, from `origin/develop` @ `3991807`). `main` only holds the initial commit; `develop` is the integration branch.

## Objective
When a new offer reaches a volunteer (an `asignacion` in state `OFRECIDA`), a floating glass card appears over the current screen, like a ride request in Uber but in FindFood's own style. The card shows:
- what to pick up
- where to pick it up
- the pickup window
- how long the volunteer has left to answer

It has two actions:
- **Aceptar donación** runs the existing accept flow unchanged.
- **Ahora no** closes the card without changing the offer.

## Problem / Why
Today a volunteer only finds out from the push banner, the Home card, or by opening `/voluntario/oferta`. Offers are simultaneous and the first to accept wins (409 `oferta-tomada`), so a slow reaction loses the pickup.

## Decisions (user, 2026-11-17)
- The donor's name stays private until the offer is accepted (Ley 1581). **No API changes.** findfood-api was checked: push, Realtime, `/asignaciones/ofertas`, the donation detail and atomic accept already cover everything.
- Install `expo-blur` and `expo-haptics`. Both are official and lightweight, and both need a new dev/store build.
- The card appears only when the user is in volunteer mode (`activeRole` volunteer). In donor mode the push banner stays.
- Nothing is invented. There is no travel-time estimate, because the offer has no ETA, only `distancia_km`. Photos come from the first donation item that has one.

## Scope / constraints
- Reuse the existing pieces:
  - `useOfertas({live:true})`, `liveOffers`, `offerFromOferta`
  - `useCountdown`, `useDonacion`, `useAceptarOfertaMutation`, `messageFor`
  - `Button`, `FormMessage`, `Icon`, `motion` tokens
- Invalidation from the push and from Realtime already refreshes `["asignaciones","ofertas"]`.
- The overlay is an absolutely positioned sibling of `RootNavigator`, following the `OfflineOverlay` pattern. It is not an RN `Modal`.
- Formal rejection (which needs a `motivo_id`) still happens on `/voluntario/oferta`. The card offers it through "Ver detalle".
- Commits are Conventional, without a Co-Authored-By trailer. Tests ship with the code. Push and opening the PR are the user's decision.
- Delivery: single PR to develop, user decision 2026-11-17 (strategy `single-pr`, one commit per task, no slicing). Forecast is about 700 authored lines (UI and tests).

## Tasks
- [x] T1 Dependencies: `npx expo install expo-blur expo-haptics`, plus mocks in `jest.setup.ts`. Route: delegated writer (T1–T5, 2+ non-trivial files).
- [x] T2 `src/domain/offer-queue.ts`: queue of pending offers. It keeps live `OFRECIDA` offers, drops the ones the user dismissed, removes duplicates by id, and sorts by `expira_at` ascending. Returns `{current, remaining}`. Test-first.
- [x] T3 `src/screens/use-accept-offer.ts`: extract the accept flow and the capacity calculation from `OfferDetails`, and expose the problem `type`. The existing `OfferScreen` tests must stay green.
- [ ] T4 `offer-alert-card.tsx`, the glass card:
  - blur with an opaque fallback
  - header with a "+N" count and the countdown with a progress bar
  - products, a distance-then-pickup route block, the pickup window, and the photo and notes from the detail
  - unavailable and expired states, and a loading state on accept
  - Plus tests.
- [ ] T5 `offer-alert-host.tsx`:
  - mounted in `_layout.tsx`; reads role and route
  - dismissed set and taken detection
  - enter/exit animations and keyboard handling
  - haptics
  - suppress the foreground banner for `ASIGNACION_OFRECIDA` in `push.ts`
  - Plus tests.
- [ ] T6 Full verification: `typecheck`, `lint`, `test`, `test:render`.

## Acceptance criteria
- An offer arriving in the foreground shows the card on any screen in volunteer mode. It doesn't show on `/voluntario/oferta`, and it doesn't show in donor mode.
- No duplicates. With several offers, the one closest to expiring shows first, with "+N más".
- Accept calls `POST /asignaciones/:id/aceptar` and navigates as it does today. A 409 `oferta-tomada` or `donacion-no-disponible` shows "ya no disponible" and disables accept.
- "Ahora no" sends no request, and the offer stays on Home.
- If the offer disappears from the list (taken or withdrawn), the card switches to unavailable and closes by itself.
- When the countdown runs out, accept is disabled.

## Checks
`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:render`.

## Progress / evidence
- Base (`3991807`, before any change): `npm run typecheck` exit 0; `npm test` 106 suites / 1874 tests passed.
- T1 · route: delegated writer · commit `28fa982` `chore(deps): add expo-blur and expo-haptics for the offer alert`. `npx expo install` pinned `expo-blur ~57.0.3` and `expo-haptics ~57.0.3`. Neither package ships a config plugin (no `app.plugin.js`) and the v57 docs list none, so `app.json` is unchanged. Both add native code: **a new dev/store build is required**. Jest mocks: `BlurView`/`BlurTargetView` render as plain Views keeping their props; haptics calls are `jest.fn` resolving, enums stay real. Checks: a throwaway mock test passed (then removed); `npm run typecheck` exit 0. (This doc's T1 entry landed in the T2 commit: the doc edit failed to apply before the T1 commit.)
- T2 · route: delegated writer · commit: `feat(offers): queue the live offers for the offer alert` (hash in `git log`; recorded in the T3 entry). `pendingOffers(ofertas, dismissed, now)` returns `{current: QueuedOffer | null, remaining}`; `QueuedOffer` extends `OfferView` with `offeredAtIso`, `street`, `reference` and `refrigerated` (the card's progress bar and route block need them, and the mapper stays untouched). RED: `npx jest src/domain/offer-queue.test.ts` against a stub → 6 failed, 4 passed. GREEN: 10 passed. `eslint` on both files exit 0.
- T3 · route: delegated writer · T2 landed as `36675b4`; T3 commit: `refactor(offers): share the accept flow and the capacity check` (hash recorded in the T4 entry). `useAcceptOffer(id, {onAccepted, onFailed})` → `{accept, accepting, error, closedReason}`; `closedReasonOf(type)` maps `oferta-tomada`/`donacion-no-disponible`/`oferta-ya-respondida` → `unavailable` and `oferta-vencida` → `expired`; `acceptedLoadKg` and `exceedsCapacity` replace the inline sums in `OfferScreen`/`OfferDetails`. Navigation keeps `router.dismissTo("/voluntario/rutas")`: the v57 router docs say it "dismisses screens until the provided href is reached" and "if the href is not found, it will instead replace the current screen", so from the overlay it either returns to the Rutas tab or replaces the current screen, never stacking a duplicate. RED/GREEN exception: a behavior-preserving extraction, so characterization tests came first (accept → POST `/asignaciones/asg-7/aceptar` and "Mis rutas"; 409 `oferta-tomada` → message, stays) and passed on the base (14/14) and after (14/14). New `use-accept-offer.test.ts`: 13 passed. `tsc --noEmit` exit 0; `eslint` on the touched files exit 0.
