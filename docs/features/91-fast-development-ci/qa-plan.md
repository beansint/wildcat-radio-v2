# Verification

Parse workflow YAML; compare verify job and trigger/concurrency/permission settings with dev; confirm jobs contains only verify. Check Playwright scripts/specs/config are unchanged. PR CI must run and pass only the verify job. No browser regression run is needed for this workflow-only change.
