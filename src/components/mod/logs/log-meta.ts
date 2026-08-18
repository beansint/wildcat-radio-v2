/**
 * Action-string → display metadata for the two /mod/logs tables.
 *
 * Both `BroadcastActivityEntryDto.action` and `StaffAuditEntryDto.action` are
 * free-form dotted strings from the backend (e.g. `attendance.time_in`,
 * `mod.action.ban`) — there's no enum on the wire, so this file is the single
 * place that turns those strings into a friendly label + icon/color (or
 * `StatusPill` variant) for the UI. Falls back to a humanized version of the
 * raw action for anything not explicitly mapped, so a new backend action
 * never renders as a blank cell.
 */
import {
  LogIn,
  LogOut,
  PlayCircle,
  StopCircle,
  SignalZero,
  type LucideIcon,
} from "lucide-react";
import type { StatusPillVariant } from "@/components/mod/status-pill";

/** Turns `attendance.time_in` into "Attendance time in" as a last-resort label. */
export function humanizeAction(action: string): string {
  const words = action.split(/[._]/).filter(Boolean);
  if (words.length === 0) return action;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export interface BroadcastEventMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind color utility class, or undefined to inherit the default (muted) icon color. */
  colorClass?: string;
}

const BROADCAST_EVENT_META: Record<string, BroadcastEventMeta> = {
  "attendance.time_in": { label: "Time-in", icon: LogIn, colorClass: "text-success" },
  "attendance.time_out": { label: "Time-out", icon: LogOut },
  "episode.started": { label: "Episode started", icon: PlayCircle, colorClass: "text-gold" },
  "episode.ended": { label: "Episode ended", icon: StopCircle },
  "stream.off_air": { label: "Stream off-air", icon: SignalZero, colorClass: "text-destructive" },
};

/** Falls back to a muted `StopCircle` + humanized label for any unmapped action. */
export function broadcastEventMeta(action: string): BroadcastEventMeta {
  return (
    BROADCAST_EVENT_META[action] ?? {
      label: humanizeAction(action),
      icon: StopCircle,
    }
  );
}

/** `from`/`to` (per date-range filter) options for the Broadcast activity tab's Type select. */
export const BROADCAST_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "attendance.", label: "Time-in / Time-out" },
  { value: "episode.", label: "Episode start / end" },
  { value: "stream.", label: "Stream off-air" },
];

export interface AuditActionMeta {
  label: string;
  variant: StatusPillVariant;
}

const AUDIT_ACTION_PREFIX_META: [prefix: string, meta: AuditActionMeta][] = [
  ["mod.", { label: "Moderation", variant: "bad" }],
  ["staff.", { label: "Staff review", variant: "bad" }],
  ["user.role", { label: "Role change", variant: "bad" }],
  ["strike.", { label: "Strike", variant: "bad" }],
  ["attendance.", { label: "Attendance correction", variant: "warn" }],
  ["appeal.", { label: "Appeal", variant: "neutral" }],
  ["filter.", { label: "Filter", variant: "neutral" }],
  ["roster.", { label: "Roster change", variant: "neutral" }],
  ["settings.", { label: "Settings", variant: "neutral" }],
  ["report.", { label: "Report", variant: "neutral" }],
  ["schedule.", { label: "Schedule", variant: "neutral" }],
  ["announcement.", { label: "Announcement decision", variant: "neutral" }],
];

/** Longest-prefix match against `AUDIT_ACTION_PREFIX_META`; unmapped actions fall back to neutral + humanized label. */
export function auditActionMeta(action: string): AuditActionMeta {
  const match = AUDIT_ACTION_PREFIX_META.filter(([prefix]) => action.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0];
  if (match) return match[1];
  return { label: humanizeAction(action), variant: "neutral" };
}

/** Options for the Staff audit tab's Type select — values are `action` prefix filters. */
export const AUDIT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "mod.", label: "Moderation" },
  { value: "staff.", label: "Staff review" },
  { value: "strike.", label: "Strike" },
  { value: "appeal.", label: "Appeal" },
  { value: "filter.", label: "Filter" },
  { value: "roster.", label: "Roster" },
  { value: "settings.", label: "Settings" },
  { value: "user.role", label: "Role change" },
];
