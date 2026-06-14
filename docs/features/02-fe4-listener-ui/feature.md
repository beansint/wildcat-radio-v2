# FE#4 / BEA-116 — Slice 1: Landing + /listen player + live status (M1)

## Scope (implemented)

- Design system port: `globals.css` rewritten with prototype-2 CSS variables (`:root`) and `@theme inline` Tailwind 4 token mapping. All `.wc-*` component classes ported verbatim.
- Font: `next/font/google` Poppins (400/500/600/700/800) as `--font-sans`, replaces Geist.
- `TopNav` — sticky glassmorphic header, desktop nav links, Sign in + Listen live CTAs.
- `BottomNav` — mobile bottom bar (hidden md+), sits 64px above the global player.
- `Footer` — `wc-grad-ink` dark footer with mascot mark + CIT-U seal.
- `LiveStatusCard` — hero card on `/`: LIVE badge / STATION_ROTATION badge / off-air badge; listener count; show art (`wc-art`); show name + DJ chips; play button (triggers GlobalPlayer via StreamContext); "Join the chat" link to `/listen`.
- `/listen` page — sticky `wc-grad-ink` live-player header (badge, show name, listener count, play button); main station-info card; "Chat & requests — coming soon" placeholder sidebar card.
- `GlobalPlayer` — restyled to `.wc-player` (cover art via `wc-art`, meta title+sub, gold `wc-play`, `.eq` bars animating while playing). HLS logic preserved, `data-testid`s kept.
- `StreamContext` — shared React context (wraps QueryProvider) holding manifest poll + socket presence state. Single source of truth for all three surfaces.
- `socket.ts` — singleton `socket.io-client` to `NEXT_PUBLIC_API_URL`.
- `use-stream-presence.ts` — joins `listening:join`/`listening:leave` while playing; subscribes `stream:status` for live listener counts.

## data-testid inventory

| testid | element | location |
|---|---|---|
| `player-audio` | `<audio>` | GlobalPlayer |
| `player-play` | play/pause button | GlobalPlayer |
| `player-status` | sr-only status text | GlobalPlayer |
| `now-playing` | show title span | GlobalPlayer, LiveStatusCard, /listen header |
| `live-badge` | status badge | LiveStatusCard, /listen header |
| `listener-count` | listener chip | LiveStatusCard, /listen header |
| `listen-play` | play button | LiveStatusCard, /listen header |

## Deferred (future slices)

- Chat feed (v2.2)
- Polls / hype meter (v2.2)
- Song requests / dedications / Q&A (v2.2)
- Featured announcement section
- Now/next schedule row
- Most-requested chart
- Shows grid
- Reactions

## Presence + live status wiring

1. `getSocket()` creates singleton `io()` on first call (websocket transport).
2. `useStreamPresence(episodeId, active)` — emits `listening:join` when player starts; `listening:leave` on stop/unmount. Listens for `stream:status → {episodeId, status, listeners}` and surfaces them.
3. `StreamContext` combines manifest poll (15s refetch) with socket status: socket status wins when present, falls back to manifest poll. All three surfaces (landing card, /listen header, GlobalPlayer) read from this single context — React Query deduplicates the manifest fetch automatically.
