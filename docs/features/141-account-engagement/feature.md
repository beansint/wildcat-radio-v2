# Feature: complete listener and booth engagement journeys (#141)

Branch `feature/141-account-engagement`; paired backend issue `beansint/wildcat-radio-v2-backend#203`; M9.

Pull requests: [frontend #142](https://github.com/beansint/wildcat-radio-v2/pull/142) and [backend #204](https://github.com/beansint/wildcat-radio-v2-backend/pull/204).

The canonical numbered specification, contract, implementation plan and QA plan live in backend `docs/features/203-account-engagement/`. Implement AC-1–16 from that feature: correct verification journeys, Pending/Up Next/History and Handled, private submission history and clear quotas, episode-scoped booth pauses, full-height chat with stable reading position, truthful profile/consent state.

Frontend source rules: AGENTS.md; existing shadcn primitives and wc tokens; existing API/auth conventions. No required demographics, custom identity/token system, broad station privilege grant or unrelated redesign. Preserve accessible alerts/testids and mobile/global-player behavior.

Verification evidence and selectors will be recorded in qa-log.md alongside the canonical backend matrix. New generated DTOs must come from backend OpenAPI. No remote database fixtures.

CI also identified existing dependency advisories. The implementation includes the minimum Next 16.4.1 security update and aligned Vitest 4.1.12 tooling; the existing ESLint compatibility patch remains unchanged. Final acceptance runs use these patched dependencies.
