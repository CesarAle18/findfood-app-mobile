# Feature · terminos-condiciones-modal

**Locator:** `odd/tasks/terminos-condiciones-modal.md` (Engram mirror `odd/terminos-condiciones-modal/tasks`: pending — Engram tools unavailable in this session)
**Branch:** mobile `feat/terminos-condiciones-modal` (from `develop` @ `2cf9f82`)

## Objective
Let users read the full Terms and Conditions (including the personal-data policy) in a modal opened from `TermsCheckbox`, and accept them from there, at sign-up and at the profile completion while `ACEPTAR_TERMINOS` is pending.

## Problem / why
The checkbox says "Acepto los Términos y Condiciones y la Política de Privacidad", but no terms text exists anywhere (mobile, web, API; the API only cites Ley 1581 de 2012 and stores `acepto_terminos_at`). The user chose (2026-11-17) a drafted text and a modal with "Aceptar" (checks the box and closes) and "Cerrar".

## Scope / constraints
- Content in `src/content/terminos.ts`: drafted Spanish text for Find Food (Colombia), marked as a draft pending legal review.
- `TermsModal` in `src/components/findfood/terms-modal.tsx`: full-screen RN `Modal` + `SafeAreaView`, scrollable sections, fixed footer with Aceptar / Cerrar; Android back closes.
- `TermsCheckbox` (`src/screens/auth.tsx`) gets a separate, accessible "Leer términos y condiciones" link; its props stay unchanged; "Aceptar" is hidden while the checkbox is disabled.
- No new dependencies. Delivery strategy: `ask-on-risk`. Forecast ≈ 300 authored lines (most of it the terms text); one PR.

## Tasks
- [x] T1 Terms content `src/content/terminos.ts`. Route: delegated (writer trigger: T1–T3 touch 3+ non-trivial files). Commit `781b4a0`.
- [x] T2 `TermsModal` component. Route: delegated (same writer). Commit `087df87`.
- [x] T3 Wire into `TermsCheckbox` + tests in `src/screens/__tests__/auth-screens.test.tsx` (RED first); `scripts/check-render.cjs` adjusted if needed (it was not). Route: delegated (same writer). Commit `f869789`.

## Acceptance criteria
- Tapping "Leer términos y condiciones" opens the modal with every section; it scrolls.
- "Aceptar" checks the box (never unchecks it) and closes; "Cerrar", the close icon and Android back close without changing it.
- Works the same at `/registro` and at the profile completion.

## Checks
- `npx jest src/screens/__tests__/auth-screens.test.tsx` (RED → GREEN), `npx jest src/screens src/components`.
- `npm run typecheck`, eslint on touched files, `npm run test:render`.

## Progress
- 2026-11-17: plan approved; branch created; document created.
- 2026-11-17: T1 done (`781b4a0`): 14 sections drafted in Spanish, marked as a draft pending legal review; eslint clean.
- 2026-11-17: T2 done (`087df87`): `TermsModal` (full-screen `Modal` slide + `SafeAreaView`, header with close icon "Cerrar términos", scrollable sections, fixed footer Aceptar/Cerrar); eslint and typecheck clean.
- 2026-11-17: T3 done (`f869789`): separate "Leer términos y condiciones" link (role link, 44 pt, enabled while disabled) below the checkbox and its error; "Aceptar" only checks and is hidden while disabled. RED: 5 new tests failed (39 passed) before T2/T3; GREEN: `auth-screens.test.tsx` 44/44. `npx jest src/screens src/components`: 34 suites, 473 tests passed. `npm run typecheck`: clean. eslint on touched files: clean. `npm run test:render`: stops at the known pre-existing assertion (l.547); with l.547 skipped in memory, RegisterScreen (l.624) and CompleteProfileScreen (l.661) render fine and it stops at l.675 (VolunteerRegistrationScreen), which fails identically without this change. No profile-setup test file exists, so none was added.
- Next: native review / PR decision by the user.
