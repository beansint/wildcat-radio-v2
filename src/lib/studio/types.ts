/**
 * Hand-written response/request shapes for the `/api/studio/{today,roster}`
 * endpoints, following the same convention as `src/lib/mod/types.ts`.
 *
 * The generated orval hooks in `src/lib/api/endpoints/studio/studio.ts` type
 * every response as `Promise<void>` because the backend OpenAPI spec
 * (wildcat-radio-v2-backend/apps/api/src/studio/studio.controller.ts) only
 * declares `@ApiOperation` without a response `type`, so orval has nothing to
 * generate a response DTO from. These interfaces mirror the real runtime
 * shapes returned by `StreamStateService.getStudioToday` /
 * `listActiveRoster` 1:1 (see
 * wildcat-radio-v2-backend/apps/api/src/stream/stream-state.service.ts) so
 * callers can pass an explicit `TData` generic to the generated query hooks
 * (e.g. `useGetStudioToday<StudioTodayDto>(...)`) instead of hand-rolling
 * fetch types from scratch.
 */

export type EpisodeStatus = "OFF_AIR" | "ON_AIR" | "TECH_DIFFICULTIES";

export interface StudioOpenEpisodeDto {
  id: string;
  status: EpisodeStatus;
  /** ISO 8601 datetime, or null. */
  startedAt: string | null;
  /** ISO 8601 datetime, or null. */
  endedAt: string | null;
  showId: string | null;
  unscheduled: boolean;
}

export interface StudioAttendeeDto {
  rosterId: string;
  displayName: string;
  /** ISO 8601 datetime. */
  timeIn: string;
}

/**
 * One row per DJ on the open episode's show roster, merged with this
 * episode's attendance (including closed records, so subs who already
 * timed out still show up as "was in, now out"). Empty when there's no open
 * episode, or the open episode is unscheduled (no show roster to merge).
 */
export interface StudioSlotRosterEntryDto {
  rosterId: string;
  displayName: string;
  timedIn: boolean;
  /** ISO 8601 datetime, or null if never timed in. */
  timeIn: string | null;
  /** ISO 8601 datetime, or null if not timed out. */
  timeOut: string | null;
}

export interface StudioTodayShowDto {
  id: string;
  showId: string | null;
  /** ISO 8601 datetime. */
  scheduledFor: string;
  status: EpisodeStatus;
  showName: string | null;
  djs: string[];
}

export interface StudioTodayDto {
  episode: StudioOpenEpisodeDto | null;
  attendees: StudioAttendeeDto[];
  slotRoster: StudioSlotRosterEntryDto[];
  todayShows: StudioTodayShowDto[];
}

export interface StudioRosterEntryDto {
  id: string;
  displayName: string;
}
