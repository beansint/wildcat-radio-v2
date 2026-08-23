# Wildcat Radio v2

Wildcat Radio v2 is the listener-facing web experience for Cebu Institute of Technology's student-run radio station. It brings the station's live stream, programme schedule, shows, DJs, announcements, charts, and community participation into one accessible web application, with dedicated spaces for listeners, station staff, moderators, and the studio booth.

This repository contains the public web application. The API, data model, real-time services, and desktop studio companion live in the sibling [backend repository](../wildcat-radio-v2-backend).

> **Project status:** the application is in launch preparation, not yet a public production service. A real deployment, studio-PC rehearsal, operational ownership, legal review, and music-clearance decisions remain before launch. The [backend pre-launch checklist](../wildcat-radio-v2-backend/docs/PRE-LAUNCH-CHECKLIST.md) tracks those gates candidly.

## What people can do

- Listen to the station and see live or upcoming programme information.
- Discover schedules, shows, DJs, announcements, and charts.
- Create an account to manage a profile and use eligible listener interactions.
- Use staff, moderation, and booth-console tools when authorised.

The app is intentionally paired with a station-operated backend. Browser features, authentication, media, and real-time updates need that API to be configured and available.

## Technology

- Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS 4
- shadcn/ui primitives with the Wildcat design system
- React Query and OpenAPI-generated client code for backend calls
- Socket.IO for real-time station and engagement updates
- Vitest for unit tests and Playwright for browser tests

## Run it locally

For the complete experience, start the backend first at `http://localhost:3010`, with `CORS_ORIGINS` allowing `http://localhost:3011`.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.local.example .env.local
pnpm dev
```

Open [http://localhost:3011](http://localhost:3011). The development server defaults to port 3011, avoiding the API on 3010.

### Environment

The tracked [`.env.local.example`](./.env.local.example) supplies the local defaults:

| Variable | Purpose |
| --- | --- |
| `PORT` | Local frontend port, normally `3011`. |
| `NEXT_PUBLIC_API_URL` | Backend origin, normally `http://localhost:3010`. |
| `NEXT_PUBLIC_STATION_UTC_OFFSET_MINUTES` | Station time offset, currently Manila UTC+8. |
| `NEXT_PUBLIC_MEDIA_HOST` | Allowed public media host for station assets. |
| `NEXT_PUBLIC_SITE_URL` | Public application origin, used for metadata and sitemap output. |

Set production values before building. In a production build, the application fails fast if `NEXT_PUBLIC_API_URL` is absent, rather than silently attempting a localhost API.

## Developer workflow

Use Node.js 22+ and pnpm. The frontend can run by itself for visual work, but authenticated, content, streaming, and real-time flows require a configured backend and development database.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js on port 3011, loading `.env.local`. |
| `pnpm build` | Produce a production build. |
| `pnpm start` | Serve the production build on port 3011. |
| `pnpm lint` | Run ESLint. |
| `pnpm typecheck` | Run the TypeScript compiler without emitting files. |
| `pnpm test:unit` | Run the Vitest suite. |
| `pnpm test:e2e` | Run the serial Playwright suite against the configured stack. |
| `pnpm test` | Run lint, type-checking, and unit tests. |
| `pnpm api:refresh` | Copy the backend OpenAPI document and regenerate the typed client. |

When the backend contract changes, first run `pnpm openapi:export` in the backend repository, then run `pnpm api:refresh` here. Do not hand-edit files under `src/lib/api/endpoints` or `src/lib/api/model`.

For an end-to-end run, start the backend and a production frontend build, then point Playwright at the running URLs:

```bash
# terminal 1, backend repository
pnpm dev

# terminal 2, this repository
pnpm build && pnpm start

# terminal 3, this repository
PLAYWRIGHT_BASE_URL=http://localhost:3011 pnpm test:e2e
```

The browser suite shares a live development backend and database, so it runs serially. Use a safe development environment, never production data.

## Contributing

The shared engineering conventions are maintained in the backend repository:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) - frontend-specific workflow and quality expectations.
- [Shared conventions](../wildcat-radio-v2-backend/docs/conventions/README.md) - branches, commits, feature records, QA, migrations, API contracts, and pull requests.
- [`AGENTS.md`](./AGENTS.md) - route-group, component, accessibility, and design-system rules for contributors and coding agents.
- [`docs/features/`](./docs/features/) - feature specifications, plans, and QA evidence.

New work follows the project chain: issue, feature branch, feature and QA documents, implementation, focused automated checks, pull request with evidence, review, and a feature artifact. Keep the public listener experience accessible, preserve the existing Wildcat visual system, and use the generated API client for backend interactions.
