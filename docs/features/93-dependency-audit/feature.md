# Frontend dependency security gate

Closes #93 after the residual upstream advisory is resolved.

The baseline reported 14 critical and 14 high advisory entries. Upgrade Next.js within16.x, Orval within8.x, and vulnerable transitive overrides; introduce a non-suppressed high/critical CI audit gate.

- AC-1: no critical advisories remain.
- AC-2: no high advisories remain; currently blocked by unpatched braces3.0.3, GHSA-vfj7-8cjw-p6xm.
- AC-3: lint, typecheck, unit tests and production build remain passing.
- AC-4: CI rejects unsuppressed high/critical advisories.

Do not claim28 exploitable production vulnerabilities: generation tooling, staticOG content and Windows-only advisories have different reachability.
