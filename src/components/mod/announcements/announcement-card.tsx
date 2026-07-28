"use client";

/**
 * One announcement row on `/mod/announcements`. Actions are gated purely by
 * `availableActions(status)` (`@/lib/announcements/lifecycle`) so this view
 * can never offer a transition the API would 409 on — SCHEDULED has no
 * "publish now", ARCHIVED has no "restore", DRAFT has no "archive".
 *
 * `mod-ann-pin` / `mod-ann-feature` are single toggle buttons carrying
 * `aria-pressed` (binding testid list — no separate unpin/unfeature id).
 * The pin control is never given a native `disabled` attribute even at the
 * pin cap: it uses `aria-disabled="true"` (which Playwright's `toBeDisabled()`
 * recognizes, and which its own actionability wait treats as "not enabled" —
 * so a *plain* `.click()` would hang, but `.click({force: true})` skips that
 * wait and still reaches the real `onClick`) so a forced click still hits
 * the server and surfaces the real 409 rather than a client-side fiction
 * (ANN-E-05 — a genuinely `disabled` `<button>` never dispatches a click at
 * all, forced or not, so this is the only design that satisfies both the
 * "disabled with an explanation" AC and the "forced attempt is humane" AC).
 *
 * Provenance (`mod-ann-provenance`) is staff-only — this component must
 * never be imported from a public-surface page.
 */
import type { SyntheticEvent } from "react";
import type { AnnouncementStaffDto } from "@/lib/api/model";
import {
  availableActions,
  scheduleState,
  statusLabel,
  statusVariant,
  type AnnouncementStatus,
} from "@/lib/announcements/lifecycle";
import { MAX_PHOTOS } from "@/lib/announcements/photos";
import { provenanceSegments } from "./provenance";
import { Pin, Star } from "lucide-react";
import { StatusPill } from "@/components/mod/status-pill";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/components/standing/format";

const EXCERPT_MAX = 160;

function excerpt(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX)}…` : trimmed;
}

interface AnnouncementCardProps {
  announcement: AnnouncementStaffDto;
  pinnedCount: number;
  pinLimit: number;
  busy?: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  onReview: () => void;
  onArchive: () => void;
  onTogglePin: () => void;
  onToggleFeature: () => void;
}

export function AnnouncementCard({
  announcement,
  pinnedCount,
  pinLimit,
  busy,
  onEdit,
  onSubmit,
  onReview,
  onArchive,
  onTogglePin,
  onToggleFeature,
}: AnnouncementCardProps) {
  const status = announcement.status as AnnouncementStatus;
  const actions = availableActions(status);
  const canEdit = actions.includes("edit");
  const canPin = actions.includes("pin");
  const canFeature = actions.includes("feature");
  const pinAtCap = canPin && !announcement.isPinned && pinnedCount >= pinLimit;

  const schedule = status === "SCHEDULED" ? scheduleState(announcement.scheduledFor) : "none";
  const scheduleChip =
    schedule === "pending" && announcement.scheduledFor
      ? `Scheduled for ${formatDateTime(announcement.scheduledFor)}`
      : schedule === "elapsed"
        ? "Scheduled — awaiting promotion"
        : null;

  const provenanceLine = provenanceSegments(announcement).join(" · ");

  function stop<E extends SyntheticEvent>(handler: () => void) {
    return (e: E) => {
      e.stopPropagation();
      handler();
    };
  }

  return (
    <article
      className="wc-card wc-card-pad"
      data-testid="mod-ann-row"
      onClick={canEdit ? onEdit : undefined}
      style={canEdit ? { cursor: "pointer" } : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill variant={statusVariant(status)}>{statusLabel(status)}</StatusPill>
        {/* Lucide glyphs, not emoji: emoji render differently per platform/font,
            can't be themed off the design tokens, and are announced as their
            unicode name by screen readers. */}
        {announcement.isPinned && (
          <span className="wc-chip-ghost">
            <Pin className="w-3.5 h-3.5" aria-hidden="true" />
            Pinned
          </span>
        )}
        {announcement.featuredAt && (
          <span className="wc-chip-ghost">
            <Star className="w-3.5 h-3.5" aria-hidden="true" />
            Featured
          </span>
        )}
        {scheduleChip && <span className="wc-chip-ghost tnum">{scheduleChip}</span>}
        {announcement.photos.length > 0 && (
          <span className="wc-chip-ghost tnum">
            {announcement.photos.length} of {MAX_PHOTOS} photos
          </span>
        )}
      </div>

      <h3 className="font-bold mt-2">{announcement.title}</h3>
      <p className="wc-muted text-sm">{excerpt(announcement.content)}</p>

      {provenanceLine && (
        <p className="wc-help" data-testid="mod-ann-provenance">
          {provenanceLine}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {/* The whole card is clickable as a convenience, but a click target on
            a non-interactive <article> is invisible to the keyboard — without
            this button an editable DRAFT could not be opened at all without a
            mouse, which broke the very first step of the lifecycle. */}
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-ann-edit"
            disabled={busy}
            onClick={stop(onEdit)}
          >
            Edit
          </Button>
        )}
        {actions.includes("submit") && (
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-ann-submit"
            disabled={busy}
            onClick={stop(onSubmit)}
          >
            Submit for review
          </Button>
        )}
        {actions.includes("review") && (
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-ann-review"
            disabled={busy}
            onClick={stop(onReview)}
          >
            Review
          </Button>
        )}
        {canPin && (
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-ann-pin"
            aria-pressed={announcement.isPinned}
            aria-disabled={pinAtCap || undefined}
            title={pinAtCap ? `Pin cap (${pinLimit}) reached — unpin another first.` : undefined}
            className={pinAtCap ? "opacity-60" : undefined}
            disabled={busy}
            onClick={stop(onTogglePin)}
          >
            {announcement.isPinned ? "Unpin" : "Pin"}
          </Button>
        )}
        {canFeature && (
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-ann-feature"
            aria-pressed={!!announcement.featuredAt}
            disabled={busy}
            onClick={stop(onToggleFeature)}
          >
            {announcement.featuredAt ? "Unfeature" : "Feature"}
          </Button>
        )}
        {actions.includes("archive") && (
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-ann-archive"
            disabled={busy}
            onClick={stop(onArchive)}
          >
            Archive
          </Button>
        )}
      </div>

      {pinAtCap && (
        <p className="wc-help mt-2">Pin cap ({pinLimit}) reached — unpin another announcement first.</p>
      )}
    </article>
  );
}
