# Contributing — Wildcat Radio v2 (frontend)

**Conventions are canonical in the backend repo:** https://github.com/beansint/wildcat-radio-v2-backend/tree/main/docs/conventions
(branch naming `feature/<issue#>-<slug>`, Conventional Commits, no AI attribution, issue/PR rules,
and the **feature-doc + AI-QA chain**). Read those first.

## Frontend specifics
- **Stack**: Next.js 16 (App Router) · Tailwind 4 (CSS-first `@theme`) · shadcn/ui · TypeScript strict.
  This is **not** older Next.js — read `node_modules/next/dist/docs/` before writing Next code (see AGENTS.md).
- **API**: consume the **codegen'd** client (orval from the backend OpenAPI) — never hand-write fetch types.
- **QA (Playwright)**: specs in `e2e/<slug>.spec.ts`; select by **`data-testid="<area>-<element>"`**
  (e.g. `player-play`, `listen-chat-input`), never by copy/CSS. Each spec realizes the feature's
  `qa-plan.md` and references acceptance-criterion IDs (`AC-2: …`) in test titles.
- **Feature docs**: `docs/features/<issue#>-<slug>/feature.md` + `qa-plan.md` (templates in the
  backend `docs/conventions/templates/`).

## Quick start
1. Pick an issue (milestones M0–M9) · 2. `feature/<issue#>-<slug>` off `main` · 3. write the feature
docs · 4. build to the contract · 5. Playwright golden + edge · 6. PR `Closes #N` with evidence.

Local dev: `pnpm install && pnpm dev` (no deploy yet — Vercel paused; see backend docs/v2-build/04).
