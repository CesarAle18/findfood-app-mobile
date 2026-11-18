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
- Delivery strategy: `ask-on-risk`. Forecast is about 700 authored lines (UI and tests), which is over the ~400-line heuristic. Before the commit that crosses it, ask for the chain strategy.

## Tasks
- [ ] T1 Dependencies: `npx expo install expo-blur expo-haptics`, plus mocks in `jest.setup.ts`. Route: delegated writer (T1–T5, 2+ non-trivial files).
- [ ] T2 `src/domain/offer-queue.ts`: queue of pending offers. It keeps live `OFRECIDA` offers, drops the ones the user dismissed, removes duplicates by id, and sorts by `expira_at` ascending. Returns `{current, remaining}`. Test-first.
- [ ] T3 `src/screens/use-accept-offer.ts`: extract the accept flow and the capacity calculation from `OfferDetails`, and expose the problem `type`. The existing `OfferScreen` tests must stay green.
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
(pending)
