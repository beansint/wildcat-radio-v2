/**
 * FE#51 — client-side quick-filter for `/mod/logs`.
 *
 * Neither `ModerationControllerGetBroadcastLogsParams` nor
 * `ModerationControllerGetAuditParams` (the generated params types for
 * `GET /api/mod/logs/broadcast` and `GET /api/mod/logs/audit`) takes a free-text
 * `q` — only `page`/`pageSize`/`action`/`from`/`to` (and audit's `actorId`).
 * Adding a `q` param is a backend change out of scope for this frontend-only
 * task, so this filters the already-fetched page's rows in the browser
 * rather than round-tripping. It is therefore a **within-page** filter, not
 * a full-dataset search — the "Showing X–Y of total" footer keeps reporting
 * the server's page/total so Prev/Next still paginate the real dataset.
 */

/**
 * Case-insensitive substring match across every field of `entry` (stringified).
 * Deliberately broad — this is a "does this row mention X anywhere" filter,
 * not a targeted per-column search, so a staff member can search a broadcast
 * event's episode id, a mod's actor id, or a strike's reason with the same box.
 */
export function matchesLogSearch(entry: unknown, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return JSON.stringify(entry).toLowerCase().includes(trimmed);
}
