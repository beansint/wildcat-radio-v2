# Verification plan

1. Reproduce the full high audit failure and trace braces to its actual Next ESLint consumer.
2. Replace only that dependency chain; preserve normal, glob/brace, multiple-root, backslash-normalized and directory-only discovery. Verify the actual Next internal-link lint rule still reports invalid links.
3. Run frozen-lockfile install, full high audit, production audit, lint/typecheck/unit tests, coverage and production build. Record moderate findings separately; do not suppress advisories.
4. Exercise representative public and staff flows against the real isolated local API/Postgres using the production Next build.
5. Review the final immutable PR diff independently after pushing, confirm head CI, merge with a head guard, then confirm dev CI and branch state.

No shared database/provider mutations or deployment. Browser SQL guards must keep the exact disposable local database name and port.
