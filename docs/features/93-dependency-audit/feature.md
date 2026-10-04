# Frontend dependency security gate

Closes #93.

The baseline audit reported 14 critical and 14 high entries. This updates Next.js within 16.x, Orval within 8.x, and vulnerable transitive packages, and adds a full-dependency CI audit that rejects high/critical advisories.

The final blocker was Next's ESLint plugin dependency on fast-glob -> micromatch -> braces3.0.3 (GHSA-vfj7-8cjw-p6xm, no published patch). Only that plugin's fast-glob dependency is replaced with pinned tinyglobby0.2.17. A pnpm patch of the plugin's single globSync consumer preserves nonrecursive literal-directory matching, absolute paths and directory formatting. Next lint rules remain enabled. Regression tests use the actual plugin helper and internal-link rule.

- AC-1: no critical advisories remain.
- AC-2: no high advisories remain in the full dependency audit; no advisory exclusions or production-only gate.
- AC-3: lint, typecheck, unit tests and production build remain passing.
- AC-4: CI rejects unsuppressed high/critical advisories.

Maintain the exact eslint-config-next version and matching pnpm patch together. When upgrading, rerun the consumer regression tests and frozen-lockfile install, and remove this workaround once the upstream dependency chain is safe. Do not ignore a patch application failure.

The remaining moderate findings are remediated too: Vitest/coverage4.1.11 (including Better Auth’s declared Vitest dependency), baseline-browser-mapping2.11.27 and markdown-it14.3.1. The final full and production audit must have zero advisories. Socket lease test mocks use explicit callable types for Vitest4; product socket behavior is unchanged. Audit counts are dependency findings, not evidence of 28 exploitable production paths.
