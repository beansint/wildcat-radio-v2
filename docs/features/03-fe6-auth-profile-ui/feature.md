# FE#6 — Auth & Profile UI (M2)

**Issue:** frontend #6  
**Milestone:** M2  
**Branch:** `feature/6-auth-profile-ui`

---

## Scope (implemented)

- **Better Auth client** (`src/lib/auth/client.ts`): `createAuthClient` + `inferAdditionalFields` for `class`, `role`, `handle`; exports `authClient`, `useSession`, `signIn`, `signUp`, `signOut`.
- **CSS ports** (`globals.css`): `wc-auth-grid`, `wc-auth-brand/form/formcard/glass/check/avatars`, `wc-mono*`, `wc-bottomnav`, `wc-switch`, `wc-pill/ok/warn/bad/neutral`, `wc-divider`, `wc-typeicon/wc-ti-*`, `hide-scrollbar`.
- **`(auth)` route group** — no TopNav; `wc-auth-grid` split pane; brand pane extracted to `AuthBrandPane` (`login`/`register` variants).
  - `/login` — email+password, CIT button disabled with "coming soon", redirect to `?next=` or `/`.
  - `/register` — email+handle+password+confirm+terms, success → verify-banner state (user logged in).
  - `/verify-email?token=` — calls `verifyEmail`; success/error/resend.
  - `/forgot-password` — calls `forgetPassword`; "check inbox" state.
  - `/reset-password?token=` — calls `resetPassword`; success → redirect to `/login`.
- **`(app)` route group** — client-side auth guard (`useSession` → isPending: skeleton, !data: redirect `/login?next=`, data: render children).
  - `/profile` — profile card, verification banner, about-you (year/college/age/gender), demographics consent, notifications toggles, quick-links, sign-out.
  - `/notifications` — static shell + placeholder items; live receipts deferred to M3/M4.
- **Nav updates**:
  - `TopNav` — session-aware: logged-in = avatar → /profile; logged-out = Sign in + Listen live; isPending = invisible placeholder.
  - `MobileDrawer` — session-aware footer: logged-in = profile link + sign out; logged-out = Sign in + Listen live.
  - `BottomNav` (`wc-bottomnav`, mobile-only, `bottom:64px` to clear player) — Home / Listen / Schedule / News / You; rendered in `(app)` layout.
- **Engagement gate** (`engagement-gate.tsx`): hook `useEngagementGate()` → `'anon'|'unverified'|'ok'`; presentational `EngagementGateNotice`. Applied to `ChatColumn` (desktop input), `MobileChatInput`, `EngagementSheet`. **Reactions stay open.**
- **API client**: `pnpm api:refresh` → generated `useUsersControllerGetMe`, `usersControllerUpdateMe`, `usersControllerRecordConsent`, `analyticsControllerRecordAgeBucket` (`useAnalyticsControllerRecordAgeBucket`); raw async fns called directly for mutations via `customFetch`.

---

## data-testid inventory

| testid | element | location |
|---|---|---|
| `auth-email` | email input | login / register |
| `auth-password` | password input | login / register |
| `auth-handle` | handle input | register |
| `auth-confirm` | confirm-password input | register |
| `auth-submit` | submit button | login / register |
| `auth-cit-btn` | CIT/Entra button (disabled) | login / register |
| `auth-terms` | terms checkbox | register |
| `profile-handle` | @handle display | profile |
| `profile-year` | year level select | profile |
| `profile-college` | college select | profile |
| `profile-age` | age range pick buttons | profile |
| `profile-gender` | gender pick buttons | profile |
| `profile-consent` | demographics consent checkbox | profile |
| `profile-save` | save button | profile |
| `profile-verify-banner` | unverified email banner | profile |
| `notif-email` | notifyEmail toggle | profile |
| `notif-inapp` | notifyInApp toggle | profile |
| `profile-signout` | sign out button | profile |
| `listen-chat-input` | chat text input | chat-column / mobile-chat-input |
| `listen-gate-signin` | gate CTA: sign in | engagement-gate |
| `listen-gate-verify` | gate CTA: verify email | engagement-gate |

---

## Orval hook names

| Purpose | Hook / function |
|---|---|
| GET /users/me | `useUsersControllerGetMe` |
| PATCH /users/me | `usersControllerUpdateMe` (raw fn; called via `customFetch` directly) |
| POST /users/me/consent | `usersControllerRecordConsent` (raw fn; called via `customFetch`) |
| POST /analytics/age-bucket | `analyticsControllerRecordAgeBucket` (raw fn; called via `customFetch`) |
| GET /users/me/consent | `useUsersControllerGetMyConsent` |

---

## Deferred

- CIT Microsoft Entra SSO (Gate B / M9)
- Live notification receipts in /notifications (M3/M4)
- Standing page `/standing`
- Push notification backend field (announcement toggle is UI-only local TODO)
- Playwright e2e requires both servers running (backend :3001 + web :3000)
