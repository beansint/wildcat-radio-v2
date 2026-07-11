/**
 * Local-only helper types not covered by the generated orval models.
 *
 * The `/mod` roster/shows/schedule/attendance response shapes now come from
 * the generated DTOs in `src/lib/api/model/` (orval regenerated these once
 * the backend OpenAPI spec declared response types). The only pieces that
 * still need a hand-written type are `Weekday` and `Cadence`: the backend
 * spec declares `ShowDto.cadence` as an untyped object
 * (`ShowDtoCadence = { [key: string]: unknown }`, see
 * `src/lib/api/model/showDtoCadence.ts`) because the DTO doesn't carry a
 * discriminated-union type for cadence, so orval has nothing precise to
 * generate. This interface mirrors the real runtime shape returned by
 * `wildcat-radio-v2-backend/apps/api/src/shows/*.service.ts` 1:1 so callers
 * can cast `ShowDto['cadence']` to it instead of hand-rolling the shape from
 * scratch.
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
