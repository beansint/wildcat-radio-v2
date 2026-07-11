# FE#5 UX / a11y checklist (applied during prototype port)

Derived from `ui-ux-pro-max` against the locked prototype (`docs/frontend-design-basis-prototype/{mod,studio}/*.html`). Staff register = black+gold, **dark by default** with a persisted light/dark toggle. The prototype is the pixel source of truth; this is the quality gate to apply while porting it.

## Global (every surface)
- **Contrast:** gold `#ffdf01` on near-black = high contrast (ok for text/borders). **Maroon `#820001` is LOW contrast on dark — use it only as a fill with white text (`wc-btn-maroon`), never as text/icon on a dark surface.** Verify ≥4.5:1 body / ≥3:1 large in BOTH themes.
- **Semantic tokens only** — `bg-card`, `bg-primary`, `text-muted-foreground`, `ring-ring`, `var(--radius)`. No raw hex in components.
- **Icons:** Lucide only (no emoji as structural icons); consistent stroke. Icon-only buttons (edit, archive, close) **must** have `aria-label`.
- **Focus:** visible focus ring on every interactive element; Radix Dialog/Select trap focus + ESC to close; tab order = visual order.
- **Color is never the only signal:** status pills carry a text label (On time / Late 6m / Absent / Agreed overtime), not just a color.
- **Reduced motion:** respect `prefers-reduced-motion`; dialog/segment transitions 150–300ms.
- **Number columns:** tabular figures (`.tnum`) for times, on-air hours, counts.
- **One primary CTA per view** (Add DJ / Add show); destructive actions (archive, delete) visually subordinate + separated.

## Forms (roster, show, attendance-edit dialogs)
- Visible `<label>` per field (never placeholder-only); required marked.
- Errors: single `role="alert"` region per form (keeps `getByRole('alert')` e2e valid); `aria-live` announces; focus the first invalid field on submit.
- Validate on blur, not per keystroke. Error text states cause + fix.
- Submit button: disabled + spinner during the mutation; success closes the dialog + shows a toast.
- **Confirm before destructive:** archive/delete opens a confirm step; offer undo where cheap.
- Time inputs use `type="time"`; date uses `type="date"`.

## Tables / grids (schedule, attendance)
- Wrap wide tables in `overflow-x-auto`; never let the page body scroll horizontally.
- Semantic `<th scope>`; if sortable later, use `aria-sort`.
- Empty states: render the prototype's empty copy ("no shows today", "no attendance rows"), not a blank frame or error.
- Reserve space / skeletons while loading (avoid layout shift).

## Studio attendance (booth kiosk)
- Big, unambiguous tap targets (booth PC, possibly touch). Time-in button gives visual feedback within ~100ms + a toast ("✓ DJ Carla timed in 2:11 PM").
- Segmented Attendance⇄Console: active segment clearly highlighted; Attendance is the default.
- Timed-in rows show a persistent "Timed in ✓ HH:MM" pill (not just a color change).

## Navigation (/mod shell)
- Sidebar = secondary nav; current page highlighted (`.active`); consistent placement across all /mod pages.
- Player must not unmount on navigation between public routes (existing global player rule).

## Pre-merge visual check
- Test at 375 / 768 / 1024 / 1440. Keyboard-only walk of each page + dialog. Toggle light/dark and re-check contrast + divider visibility. Confirm parity against the prototype screenshot.
