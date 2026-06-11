---
name: Feature / Epic
about: A UI slice mapped to the build spec + prototype-2
title: "M? · <area> — <short title>"
labels: ["epic", "frontend"]
---

**Spec:** backend docs/v2-build/00 §3 (access) + 03 (API)  ·  **Prototype:** prototype-2 pages  ·  **Milestone:** M?

## Goal
<what "done" looks like, concretely>

## Pages / scope
- [ ] <page or component>

## Playbook checklist
- [ ] Acceptance written · riskiest part first · kill/pivot criteria
- [ ] Contract-first: consume the codegen'd API client (orval from backend OpenAPI)
- [ ] Tests: **1 golden + 1 edge** Playwright path (`e2e/<slug>.spec.ts`); a11y (keyboard/focus/tap)
- [ ] Verify (evidence): ran real flow · console clean · checked network/state

## Feature docs
- [ ] `docs/features/<N>-<slug>/feature.md` + `qa-plan.md` (conventions: https://github.com/beansint/wildcat-radio-v2-backend/tree/main/docs/conventions)
