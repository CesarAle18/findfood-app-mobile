# Feature · deslizar-eliminar-notificacion

**Locator:** `odd/tasks/deslizar-eliminar-notificacion.md` (Engram mirror `odd/deslizar-eliminar-notificacion/tasks`: pending — Engram tools unavailable in this session)
**Branches:** mobile `feat/deslizar-eliminar-notificacion` (from `develop` @ `950d29d`) · API `findfood-api` `feat/eliminar-notificacion` (from `Conexion_Front` @ `c3eb033`)

## Objective
In the inbox (`src/screens/notifications.tsx`, Alertas tab of donor and volunteer), swiping a notification to the left deletes it, for real, on the server.

## Problem / why
The inbox only allows opening a notification or marking them read; users asked to clear notifications with a left swipe. The API had no delete endpoint, so the user chose (2026-11-10) to add `DELETE /me/notificaciones/:id` in `findfood-api`.

## Scope / constraints
- API: `DELETE /v1/me/notificaciones/:id` → 204; 404 when it does not exist or belongs to another user; 400 for a non-UUID id. Hard delete (no inbound FKs on `notificacion`); a deleted row also leaves the push queue.
- Mobile: `ReanimatedSwipeable` (react-native-gesture-handler ~2.32, already installed) on each row; left swipe past the threshold deletes; optimistic removal with rollback; unread counts drop only when the row was unread; an accessibility action "Eliminar" as the gesture alternative.
- No new dependencies. Delivery strategy: `ask-on-risk`. Forecast ≈ 250 authored lines across both repos; one PR per repo.
- The app needs an API with the DELETE endpoint; deliver both together.

## Tasks
- [x] T1 (API) `eliminar` in `notificaciones.service.ts`, `@Delete(':id')` in `notificaciones.controller.ts`, HTTP spec, e2e step in `test/sincronizacion.e2e-spec.ts`. Route: delegated (writer trigger: 3+ non-trivial files in another repo). Commit API `9953869`.
- [x] T2 (mobile) `eliminarNotificacion` + `useEliminarNotificacionMutation` in `src/services/notificaciones.ts` (`api.delete` already existed) with tests. Route: delegated (writer trigger: T2–T4 touch 4+ non-trivial files). Commit `0c22e29`.
- [x] T3 (mobile) Swipeable `NotificationRow` (`ReanimatedSwipeable`, red `colors.danger` panel with new `trash` icon, "Eliminar"), accessibility action, wiring in `NotificationsScreen`, screen tests. Commit `ee5946a`.
- [x] T4 (mobile) `GestureHandlerRootView` at the root of `src/app/_layout.tsx` (expo-router 57's native `Stack` does not add one); `ReanimatedSwipeable` stub in `scripts/check-render.cjs`; `jest.setup.ts` unchanged (not needed). Commit `ee5946a` (merged with T3).

## Acceptance criteria
- Swiping a row left past the threshold removes it immediately; it stays gone after refetch.
- Deleting an unread row lowers the "N sin leer" badge and the tab-bar count; deleting a read row does not.
- A short swipe springs back without deleting. A failed DELETE puts the row back.
- Screen readers can delete via the "Eliminar" accessibility action.

## Checks
- API: `npm run typecheck`, `npm run lint`, `npm test -- notificaciones`; e2e if a local DB is available.
- Mobile: `npm run typecheck`, eslint on touched files, `npx jest src/services/notificaciones.test.ts src/screens/__tests__/notifications-screen.test.tsx`, `npx jest src/screens src/components`.

## Progress
- 2026-11-10: plan approved; branches created; document created.
- 2026-11-10: T1 done. RED observed (3/3 failed, route missing) → GREEN 3/3. Checks: `npm test -- notificaciones-http` 3 passed (parent spot check re-ran: 3 passed) · `npm run typecheck` clean · oxlint clean · prettier clean on touched files (4 untouched files in the module were already unformatted). E2E `npm run test:e2e -- sincronizacion` NOT run: test Postgres at 127.0.0.1:54329 not reachable. The new e2e `it` expects no sync events: the only trigger on `notificacion` is AFTER INSERT (`supabase/migrations/20261108000002_sincronizacion_cuenta_bandeja.sql:59-62`). RDD assess (API, base `c3eb033`, committed-only, untracked excluded): medium, 4 paths / 110 lines, `review_due=false` (`under_budget`).
- 2026-11-10: T2–T4 done. RED observed (T2: 5 failing, T3: 3 failing) → GREEN. Checks: `npx jest src/services/notificaciones.test.ts src/screens/__tests__/notifications-screen.test.tsx` 30 passed (parent spot check re-ran: 30 passed) · `npm run typecheck` clean · eslint on touched src files clean · `npx jest src/screens src/components src/services` 43 suites / 576 tests passed · `npm run test:render` stops at the pre-existing "Ubica la dirección escrita…" assertion (now line 547); the inbox check before it passes. Jest logs a gesture-handler "mixed worklet callbacks" console.error from the library's swipeable, non-failing. No toast exists in the app: a failed delete only rolls back. RDD assess (mobile, base `950d29d`, committed-only, untracked excluded): medium, 7 paths / 384 lines, `review_due=false` (`under_budget`).
- Pending: device check (swipe feel vs vertical scroll / pull-to-refresh, panel alignment, recycled cell closed after delete, TalkBack/VoiceOver "Eliminar"); API e2e (needs local test DB). Next: push + PR in both repos (user decision); deliver the API first.
