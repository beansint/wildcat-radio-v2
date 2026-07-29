# Feature: FE#11 — legal, consent and data-subject-rights surfaces

- **Branch:** `feature/11-legal-compliance-ui` · **Milestone:** M7 · **Issue:** FE#11
- **Consumes:** BE#12 (`wildcat-radio-v2-backend/docs/features/018-m7-legal-compliance/feature.md`)
- **Design basis:** **none.** The prototype has no legal, consent or rights pages, so these follow
  the established public/app page conventions rather than a 1:1 reference.

## What shipped

| Surface | Route | Group |
|---|---|---|
| Privacy Notice | `/legal/privacy` | `(public)` |
| Terms of Service | `/legal/terms` | `(public)` |
| Music credits | `/attribution` | `(public)` |
| Your data (rights centre) | `/privacy` | `(app)` — needs a session |

Footer links to all three public surfaces, and the footer is now rendered by `PublicShell` rather
than by the landing page alone.

## The two things this UI must get right

1. **Unreviewed text must never read as binding terms.** The API marks placeholder documents with
   `isPlaceholder`, and the page renders that as a banner above the body, not a footnote. The
   version and effective date sit under the title, because a legal document without a version is
   not one.
2. **The deletion copy must describe what deletion actually does.** Erasure is anonymisation:
   moderation and audit records survive without identifying you. Writing "we delete everything"
   would describe a product we did not build, and this is the one screen where a person decides
   based on that sentence.

## Edge cases

- A fresh account has consent **off** — that is what makes it opt-in, and the golden-path test
  asserts it rather than assuming it.
- Withdrawing and re-granting shows both events in the consent history, with the notice version each
  was given against.
- Erasure is gated behind typing `DELETE` exactly; near-misses (`delete`, `DELETE `) keep the button
  disabled. A confirm button that is merely a second click is not a confirmation for something
  irreversible.
- After erasure the session is gone, so the app returns to the public site rather than to a page it
  can no longer load.
- The export goes through `fetch` rather than the generated client, which parses every response as
  JSON to return it — this one has to reach the user as a file.

## Notes / decisions

- **The footer moved into the public shell.** It previously rendered only on the landing page, which
  would have left the privacy notice reachable from exactly one screen. A notice nobody can find is
  not much of a notice.
- **`pb-28`, matching every other `(app)` page.** The first version used `pb-16`, and the bottom nav
  and global player stack to ~120px of fixed chrome — which left the **delete** button permanently
  unclickable. Found by driving the page, not by reading it.
- **The consent switch is disabled while its query is in flight.** Worth stating because it is also
  why a keyboard test must wait for *enabled* rather than *visible*.
- **`/privacy` is the rights centre and `/legal/privacy` is the notice.** Two different things, and
  the rights centre links to the notice rather than duplicating it.
