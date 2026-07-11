/**
 * Hand-written response/request shapes for the `/mod` roster, shows,
 * schedule, and attendance endpoints.
 *
 * The generated orval hooks in `src/lib/api/endpoints/{roster,shows,schedule,
 * attendance}/*.ts` type every response as `Promise<void>` because the
 * backend OpenAPI spec (apps/api/src/**\/*.controller.ts) only declares
 * `@ApiOkResponse({ description: ... })` without a `type`, so orval has
 * nothing to generate a response DTO from. These interfaces mirror the real
 * runtime shapes returned by the NestJS services 1:1 (see
 * wildcat-radio-v2-backend/apps/api/src/{roster,shows,attendance}/*.service.ts)
 * so callers can pass an explicit `TData` generic to the generated query
 * hooks (e.g. `useRosterControllerList<RosterEntryDto[]>(...)`) instead of
 * hand-rolling fetch types from scratch.
 */

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface Cadence {
  kind: "WEEKLY" | "ONE_TIME";
  days?: Weekday[];
  /** YYYY-MM-DD, only present for kind: 'ONE_TIME' */
  date?: string;
  /** HH:MM, 24h station-local */
  start: string;
  /** HH:MM, 24h station-local */
  end: string;
}

export interface RosterEntryDto {
  id: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ShowDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cadence: Cadence;
  createdAt: string;
  updatedAt: string;
  roster: { id: string; displayName: string }[];
}

export type AttendanceStatus = "ON_TIME" | "LATE" | "ABSENT" | "AGREED_OVERTIME";

/**
 * One row of `GET /api/attendance`. `recordId`/`episodeId`/`timeIn`/`timeOut`
 * are nullable: the backend synthesizes an ABSENT row (recordId: null) for
 * every roster member scheduled on a show airing that date who has no
 * `AttendanceRecord` — there is nothing to PATCH for those rows.
 */
export interface AttendanceRowDto {
  recordId: string | null;
  episodeId: string | null;
  rosterId: string;
  displayName: string;
  /** HH:MM scheduled start, or null if the show isn't airing that date. */
  scheduled: string | null;
  /** ISO 8601 datetime, or null if not timed in (incl. synthetic ABSENT rows). */
  timeIn: string | null;
  /** ISO 8601 datetime, or null if not timed out. */
  timeOut: string | null;
  onAirHours: number | null;
  status: AttendanceStatus;
  lateMinutes: number;
  note: string | null;
}
