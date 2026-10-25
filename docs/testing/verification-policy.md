# Fast development verification

Owner decision, 2026-10-23: CI and repeated full-suite waiting must not block development handoff.

- Run focused local tests for changed behavior, relevant edges and shared consumers; compile/typecheck touched code.
- Record the result, push the PR and finish the handoff. Remote CI runs in the background; do not wait or repeatedly poll it before reporting completion.
- Run affected tests once after the final fix. Repeat only for a demonstrated flaky/concurrency issue or release requirement.
- Full Playwright runs are for releases, substantial cross-cutting changes or explicit requests. A full run plus focused repair/rechecks is valid evidence when app source is unchanged; report failures and recovery honestly.
- Documentation-only pushes skip CI. Development CI runs lint, types, units and the dependency audit. Coverage and production builds run for `main` or **Actions → CI → Run workflow → full**.
- Preserve branch protection, provider safety, isolated databases and truthful test reporting.

The backend canonical policy is `docs/conventions/09-ci-and-verification.md`. This replaces older blanket requirements to wait for CI or run the complete browser suite twice for every feature.
