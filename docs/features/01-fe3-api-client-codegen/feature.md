# FE#3 — Typed API client via orval + TanStack Query

## Purpose

Replace hand-written `fetch` calls and inline response types with a generated, typed API client. Orval reads `openapi/openapi.json` (synced from the backend repo) and emits TanStack Query hooks plus zod validators into `src/lib/api/`.

Generated — never hand-edit; run `pnpm api:refresh` after backend contract changes.

## Generated hooks

From the current OpenAPI spec (4 endpoints, no response body schemas yet — `data` is loosely typed until the backend enriches the spec):

| Hook | Path | Tag file |
|---|---|---|
| `useGetHealth` | `GET /api/health` | `src/lib/api/endpoints/health/health.ts` |
| `useGetHealthDb` | `GET /api/health/db` | `src/lib/api/endpoints/health/health.ts` |
| `useListSettings` | `GET /api/settings` | `src/lib/api/endpoints/settings/settings.ts` |
| `useGetStreamManifest` | `GET /api/stream/manifest` | `src/lib/api/endpoints/stream/stream.ts` |

Zod validators are co-located in `src/lib/api/endpoints/wildcatRadioV2API.zod.ts`.

## Workflow

```bash
# After backend changes the OpenAPI spec:
pnpm api:refresh   # = spec:sync + api:generate

# Generate only (spec already current):
pnpm api:generate
```

## Notes

- The custom fetcher (`src/lib/api/fetcher.ts`) prepends `NEXT_PUBLIC_API_URL` and throws on non-2xx responses so TanStack Query's `isError` / retry logic works correctly.
- Response schemas are currently empty in the spec — cast `data` loosely at call sites until the backend adds them (see usages in `src/app/page.tsx` and `src/components/global-player.tsx`).
- `src/lib/api/**` is in `eslint.config.mjs` `globalIgnores` to suppress lint noise on generated files.
