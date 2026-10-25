# Release audit follow-up — 2026-10-25

Release preflight found fresh dependency advisories after the original feature verification. Updated the affected dependencies within their current major versions; no application source or migration changes.

Backend: Electron 42.11.16, Vitest 4.1.12, Multer 2.5.0, body-parser 2.4.0, Zod 4.6.6, Undici 6.29.1/7.30.1 and fast-uri 3.1.9. Website: Zod 4.6.7, Undici 7.30.1 and fast-uri 3.1.9. Existing Next ESLint patch is preserved.

Verification: unfiltered dependency audits report zero findings in both repositories; API compile, Studio 255 unit tests plus 2 release checks, website typecheck and 13 focused account/snapshot tests pass. Release CI runs the configured main-target checks. No full local E2E rerun and no production test fixtures.

Production has Resend key/sender configured, checked by presence only without disclosing values. Actual sender-domain validity and inbox delivery are not established by this check. The stable Better Auth secret remains the fallback encryption key.
