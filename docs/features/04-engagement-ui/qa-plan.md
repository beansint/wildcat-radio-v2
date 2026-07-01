# QA Plan: Engagement UI + studio console  (Issue #7)

> Executed by the AI-agent QA loop. Frontend spec location: `e2e/engagement.spec.ts`.

## Setup / fixtures

- Backend API running on a free port with `PORT=<port> pnpm --filter @wildcat/api start:dev`.
- Frontend running with `NEXT_PUBLIC_API_URL=http://localhost:<port> pnpm dev`.
- One active episode opened through the station API.
- One anonymous context, one unverified listener, one verified guest listener, and one station token.
- Prefer API-driven setup. Use Neon only for test fixture verification when the email flow cannot be completed through the UI.

## Golden path 1 - listener queue to up-next

Proves AC-1, AC-2, AC-3, AC-7, and AC-9.

1. Sign in as a verified listener and open `/listen`.
2. Open `data-testid=engagement-open-request`.
3. Fill `engagement-request-song` and submit with `engagement-submit`.
4. Open `/studio`, paste token, and assert `data-testid=studio-queue` contains the item.
5. Queue the item from studio.
6. Assert the listener receives a private receipt and `data-testid=engagement-up-next` shows the approved item.

## Golden path 2 - poll, pin, hype, and booth chat

Proves AC-4, AC-5, AC-6, AC-7, AC-8, and AC-10.

1. Open `/studio` with station token.
2. Launch a poll, set a pinned topic, and post booth chat.
3. Open `/listen` as a verified listener.
4. Assert `engagement-poll`, `engagement-pinned-topic`, and `engagement-chat-feed` reflect the studio changes.
5. Vote in the poll through `engagement-poll-option`.
6. Click a fixed reaction button and assert `engagement-hype-meter` updates after `hype:tick`.

## Edge paths

| Edge | Proves | Assert |
|---|---|---|
| Anonymous listener | AC-2 | Sign-in CTA is visible, write input is absent, listener room still renders |
| Unverified listener | AC-2 | Verify CTA is visible and write actions are unavailable |
| Guest queue budget | AC-11 | Third queue submit shows backend budget error and no duplicate local item |
| Duplicate poll vote | AC-5, AC-11 | Prior selected state remains and an alert explains the duplicate |
| Silent decline | AC-7, AC-11 | Studio shows decline status, listener sees no receipt and no up-next entry |
| Invalid station token | AC-8, AC-11 | `/studio` shows auth error and does not expose console actions |
| No live episode | AC-11 | Queue/chat/poll writes are disabled with clear copy |

## Selectors used

- `listen-gate-signin`, `listen-gate-verify`, `listen-chat-input`
- `engagement-open-request`, `engagement-open-dedication`, `engagement-open-qa`
- `engagement-sheet`, `engagement-submit`, `engagement-chat-feed`
- `engagement-poll`, `engagement-poll-option`, `engagement-hype-meter`
- `engagement-pinned-topic`, `engagement-up-next`
- `studio-token-input`, `studio-token-save`, `studio-queue`

## Evidence to capture

- `pnpm build`, `pnpm lint`, and `pnpm exec tsc --noEmit --pretty false`.
- Playwright output for `e2e/engagement.spec.ts`.
- Browser console scan after golden and edge paths.
- Backend log scan and DB sanity for queue item, poll vote, reaction, pin, booth chat, and notification receipt rows.
- Screenshots or trace for `/listen` receipt/up-next and `/studio` queue action.
