# FE#6 — QA Plan: Auth & Profile UI

**Spec file prefix:** `e2e/auth-*.spec.ts`, `e2e/profile-*.spec.ts`, `e2e/listen-gate.spec.ts`

---

## Acceptance Criteria

| # | Title | Type | Spec file |
|---|---|---|---|
| AC-1 | Guest registers → logged-in + verify banner | golden | `auth-register.spec.ts` |
| AC-2 | Login / logout + session-aware nav | golden | `auth-login-logout.spec.ts` |
| AC-3 | Profile edit persists (handle/year/college/gender/notify) | golden | `profile-edit.spec.ts` |
| AC-4 | Demographics consent + age-bucket fires once | golden | `profile-edit.spec.ts` |
| AC-5 | Unverified can browse; /listen chat shows verify CTA; reactions open | golden | `listen-gate.spec.ts` |

### Edge paths

| # | Scenario | Spec file |
|---|---|---|
| E-1 | Wrong password → error message shown | `auth-login-logout.spec.ts` |
| E-2 | Duplicate email/handle on register → error shown | `auth-register.spec.ts` |
| E-3 | Invalid/expired verify token → error + resend button | `auth-login-logout.spec.ts` |
| E-4 | Invalid/expired reset token → error | `auth-login-logout.spec.ts` |
| E-5 | Auth guard preserves ?next= on redirect | `auth-login-logout.spec.ts` |
| E-6 | Anon user on /listen → gate CTA (sign in) | `listen-gate.spec.ts` |

---

## data-testid selectors used in specs

```
auth-email, auth-password, auth-handle, auth-confirm, auth-submit,
auth-cit-btn, auth-terms,
profile-handle, profile-year, profile-college, profile-age, profile-gender,
profile-consent, profile-save, profile-verify-banner,
notif-email, notif-inapp, profile-signout,
listen-chat-input, listen-gate-signin, listen-gate-verify
```

---

## Servers required

- Backend: `pnpm --filter @wildcat/api start:dev` → http://localhost:3001
- Web: `pnpm dev` → http://localhost:3000

---

## Accessibility check pages

- `/login` — axe-core scan
- `/register` — axe-core scan
- `/profile` — axe-core scan (requires auth)
