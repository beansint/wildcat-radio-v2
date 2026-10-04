# QA plan

- AC-1/2/7: desktop and 390px mobile browser regressions, legacy duplicate/minute fixture, rejected edit alert and keyboard Enter/Escape/focus flow.
- AC-3: inspect generated query keys and invalidate admin shows/dated occurrences/public schedule/Studio today after mutations.
- AC-4/5: browser manifest name/off-air edge and Studio closure regression; inspect episode-gated queue use.
- AC-6: continuing-crew action browser regression plus real API/DB handover/overtime tests in companion backend; full real-stack Playwright runs on CI isolated Postgres.
- Run the six fixture-browser regressions twice, frontend unit suite, lint, typecheck and production build.
- Local browser fixtures prove UI behavior only; Supabase rollback checks prove persistence. Full live-stack CI and physical audio are separate boundaries.
