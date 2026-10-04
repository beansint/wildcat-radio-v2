# Fast development CI

Issue: https://github.com/beansint/wildcat-radio-v2/issues/91

At the owner's explicit request, remove automatic frontend Playwright E2E from CI. Retain the existing verify job (lint, typecheck, unit/coverage and build), triggers, cancellation and read-only permissions. Playwright specs/config and pnpm test:e2e remain available manually. No replacement workflow or application change.

This supersedes the automatic E2E gate in feature 12. Browser verification is no longer a merge gate for development work.
