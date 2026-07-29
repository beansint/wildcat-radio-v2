# Feature: FE#10 — M6 curation dashboard

- **Branch:** `feature/10-analytics-dashboard` · **Milestone:** M6 · **Issue:** FE#10
- **Design basis:** `wildcat-radio-v2-backend/docs/frontend-design-basis-prototype/mod/analytics.html`
- **Consumes:** BE#11 Slice B (`docs/features/017-m6-analytics-read-apis/feature.md`)

## What shipped

`/mod/analytics`, wired into the staff sidebar (previously an `href="#"` placeholder): period
selector, four stat cards, retention curve, daypart heatmap, show ranking, engagement scatter, and
CSV/PDF export.

Charts are **Recharts 3** (per the issue) for the line and scatter; the heatmap stays a **CSS grid**
as the design basis specifies — its own note calls these chart bits "self-contained, no JS", and a
charting library renders a small categorical grid worse than CSS does.

## Deliberate deviations from the design basis

Each one is a place where the prototype predates the API or predates real data.

1. **"Cumulative reach", not "Weekly reach / unique listeners".** The API cannot publish
   period-unique reach — it sums each episode's unique listeners, so a regular counts once per
   episode, and true reach needs raw session rows that are pruned at ~90 days. Keeping the
   prototype's label would print an overstated audience on the station's own dashboard.
2. **"Engagement vs audience", not "Engagement vs reach".** The x-axis is average concurrent
   listeners, which measures *simultaneity*: a 30-minute show with 100 listeners all present and a
   3-hour show with 500 rotating through plot at the same x. Calling it reach would be a claim the
   chart does not support.
3. **The ranking and the scatter get full-width rows** rather than the prototype's 2×2. Six columns
   do not fit a half-width card at any desktop width (measured at 1440px), and the column that
   clipped first was Trend — the one a curation decision turns on.
4. **The heatmap's rows are derived, not fixed at 8a–6p.** A fixed grid silently deleted every
   broadcast outside those hours *and* excluded them from the peak, so the caption confidently named
   a daytime slot as busiest while a late-night show outdrew it. The default day is still 8a–6p; any
   band the station actually used is added.
5. **The export buttons download the real file** instead of firing a toast, and report what the
   backend records (the export is written to the staff audit log).

## Edge cases

- No snapshots in the period → every panel renders its own empty state; none shows a spinner that
  never resolves.
- A show whose most recent episode has no snapshot (404 by design) → that curve is dropped, the
  other show's curve still draws, and a failed request says so rather than claiming "no retention
  curve", which is a statement about the data.
- Inverted custom range → refused in the browser, and the export buttons disable, so no request is
  sent and no audit row is written.
- An export in flight disables both buttons: every success writes an audit row, so a double click
  would log two exports for one intent.
- 375px → the heatmap and the ranking table scroll inside their own containers; the page never
  scrolls sideways.

## Notes / decisions

- **`toIsoDate` truncates in station-local time.** `toISOString().slice(0,10)` returns yesterday in
  Manila every morning before 08:00, so "Last 30 days" silently dropped two of its thirty days and
  the date picker refused to let anyone select today.
- **The retention curve filters episodes to the selected period.** `GET /shows/:slug/episodes`
  returns the ten most recent finished episodes with no date filter, so taking the first drew July's
  episode while the rest of the dashboard showed January — and the query key made the panel look
  period-scoped.
- **Both charts are `role="img"` with a describing label, and Recharts' `accessibilityLayer` is
  off.** Recharts 3 defaults it on, which emits an unnamed `role="application"` region in the tab
  order — a regression from the design basis, which labelled its SVGs correctly.
- **The heatmap uses table semantics.** `aria-label` on a bare `<span>` is not reliably exposed, and
  any cell below the label threshold has empty text content, so the grid was silent to a screen
  reader.
- **The maroon ramp starts at 18%, not 6%.** Any cell dark enough to print a number must clear
  4.5:1 against its white bold text; the old ramp put the *first* labelled cells at ~4.06:1.
