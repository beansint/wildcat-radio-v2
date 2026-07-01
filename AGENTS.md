<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI components — use shadcn/ui (default from now on)

Build interactive UI with the **shadcn/ui primitives in `src/components/ui/`** — do **not** hand-write `<button class="wc-btn">`, raw `<input class="wc-input">`, native `<select>`, or ad-hoc overlays in new code. Import `Button`, `Input`, `Textarea`, `Label`, `Switch`, `Checkbox`, `Select`, `Dialog`, `Sheet`, `Form` instead.

- **Need a primitive that doesn't exist yet?** Add it with the CLI: `pnpm dlx shadcn@latest add <name>` (writes into `src/components/ui/`, won't touch `globals.css`). Then re-theme it to the `wc-*` spec before using it (see below).
- **Parity rule (non-negotiable):** the prototype look is the source of truth. Form-control primitives keep 1:1 parity by emitting the existing `wc-*` classes (`Button`→`wc-btn*`, `Input`→`wc-input`, `Textarea`→`wc-textarea`, `Label`→`wc-label`). Radix-backed primitives (`Switch`/`Checkbox`/`Select`/`Dialog`/`Sheet`) are styled with Tailwind utilities off the shared CSS-variable tokens. Wiggle-room is limited to genuinely-opinionated Radix internals (e.g. the `Select` popover open-state) — get sign-off before deviating elsewhere.
- **Tokens, not raw hex.** Theme via the CSS variables / `@theme` in `globals.css` (`bg-primary`, `bg-maroon`, `bg-card`, `ring-ring`, `var(--radius)`, …). Never recolor a component with literal hex.
- **`Button asChild`** wraps a `<Link>` as a button; `className="wc-btn-block"` = full width.
- **Forms:** `react-hook-form` + `@hookform/resolvers/zod` with the shared zod schemas; surface errors in a single `role="alert"` region per form (keeps the e2e suite's `getByRole('alert')` assertions valid).
- **Bespoke brand surfaces** (player, live-status card, auth brand pane, chat, stage, the `.wc-sidenav` drawer) stay on `wc-*` — don't "shadcn-ify" them; there's no a11y gain and it risks parity drift.
- **Don't run `shadcn init`** — it rewrites `globals.css` (480 lines of hand-tuned CSS) and resets `--radius`. The repo is already scaffolded (`components.json`, `src/lib/utils.ts`).

# Route groups — placement convention

Routes live under `src/app/` using **route groups** (`(group)` folders are organizational and do **not** appear in the URL — `(auth)/login` → `/login`). New pages go by *who can see it + which chrome it needs*:

- **`(public)`** — open to anyone; gets the public shell (top-nav + global player). e.g. `/`, `/listen`.
- **`(auth)`** — unauthenticated credential flows; no app chrome (full-viewport split-pane). e.g. `/login`, `/register`, `/forgot-password`.
- **`(app)`** — requires a session; its layout is a **client-side auth guard** (the better-auth cookie is cross-origin httpOnly, so the guard *must* be a layout, not middleware) + authed chrome. e.g. `/profile`, `/notifications`.
- **`(station)`** — station-token surfaces, **not** a Better Auth user session. Auth is a pasted station Bearer token (device token) held client-side and sent as `Authorization: Bearer <token>`; no user login, no app chrome. e.g. `/studio` (the booth console). Use this group for booth/kiosk pages gated by the station device token rather than a user cookie.

Rules: don't wrap groups in a real (non-paren) folder — it would inject that segment into the URL. Don't let two groups resolve to the same path (build error). Don't add a competing root `<html>` layout. When unsure where a page goes, apply the who-can-see-it + which-chrome test above.
