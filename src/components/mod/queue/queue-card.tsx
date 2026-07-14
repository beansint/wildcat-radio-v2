"use client";

/**
 * /mod/queue card renderers — one component per QueueDto bucket (Report,
 * Flag/watch-flag, Appeal, Reinstatement). All four share the same
 * `wc-card wc-card-pad` shell + leading `wc-chip-ghost` type chip; the page
 * owns every mutation and passes callbacks + busy/error state down so a
 * single `useMutation` instance per action type can be shared across cards
 * (see page.tsx).
 *
 * Subject identity comes from the enriched queue DTOs: report/watch-flag
 * cards use `ReportDto.targetHandle`/`targetClass`; appeal + reinstatement
 * cards use `handle`/`class`/`role`. Cards render the real `@handle` + a
 * class/role `wc-chip-ghost`, falling back to a truncated id
 * (`truncatedHandle`) only when the handle is null. The reporter's identity
 * is never surfaced (no reporter-handle field; watch-flags set
 * `reporterId = targetUserId`).
 */
import type { ReactNode } from "react";
import { Flag, Eye, Scale, RotateCcw } from "lucide-react";
import type { ReportDto, AppealDto, ReinstatementRequestDto } from "@/lib/api/model";
import { Button } from "@/components/ui/button";

/**
 * Fallback label for an opaque user id when the backend couldn't resolve a
 * handle (`targetHandle`/`handle` is null) — the enriched queue DTOs now
 * carry the real handle in the common case, so this is a rare last resort.
 */
export function truncatedHandle(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/**
 * Shown in place of a subject label/action set when a report's
 * `targetUserId` is null — the backend couldn't resolve who the report is
 * about. Falling back to `reporterId` in that case would punish (and
 * de-anonymize) the person who filed the report, so we render this instead
 * and disable every punitive action (see `ReportCard`).
 */
export const UNKNOWN_TARGET_LABEL = "Unknown target";

/**
 * Renders the bold subject label: `@handle` when the DTO resolved one, else
 * a truncated-id fallback (no `@`, so it can't be mistaken for a real handle).
 */
function subjectLabel(handle: string | null, fallbackId: string): string {
  return handle ? `@${handle}` : truncatedHandle(fallbackId);
}

function CardShell({
  chipIcon,
  chipLabel,
  subject,
  klass,
  time,
  children,
  actions,
  alert,
}: {
  chipIcon: ReactNode;
  chipLabel: string;
  /** Pre-formatted subject label (`@handle` or truncated-id fallback). */
  subject: string;
  /** Listener class / role (CAMPUS/GUEST/…) — omitted when null. */
  klass?: string | null;
  time: string;
  children: ReactNode;
  actions: ReactNode;
  alert?: string | null;
}) {
  return (
    <article className="wc-card wc-card-pad" data-testid="mod-queue-card">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="wc-chip-ghost inline-flex items-center gap-1">
          {chipIcon}
          {chipLabel}
        </span>
        <span className="font-bold">{subject}</span>
        {klass && <span className="wc-chip-ghost">{klass}</span>}
        <span className="wc-muted text-xs ml-auto tnum">{time}</span>
      </div>

      <div className="mb-3">{children}</div>

      {alert && (
        <div role="alert" className="mb-3 text-sm font-semibold text-destructive">
          {alert}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">{actions}</div>
    </article>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface ReportCardProps {
  report: ReportDto;
  busy: boolean;
  alert?: string | null;
  onDismiss: () => void;
  onWarn: () => void;
  onStrike: () => void;
  onMute: () => void;
  onBan: () => void;
}

export function ReportCard({ report, busy, alert, onDismiss, onWarn, onStrike, onMute, onBan }: ReportCardProps) {
  // `reporterId` is a DIFFERENT person from the report's subject — never use
  // it as a punitive-action target or display fallback. When the backend
  // couldn't resolve `targetUserId`, show an explicit "unknown target" state
  // and disable every action except Dismiss (which just clears the report).
  const hasTarget = !!report.targetUserId;
  const punitiveDisabled = busy || !hasTarget;
  const unresolvedHint = hasTarget ? undefined : "Target user could not be resolved.";
  return (
    <CardShell
      chipIcon={<Flag className="w-3.5 h-3.5" aria-hidden="true" />}
      chipLabel="Report"
      subject={hasTarget ? subjectLabel(report.targetHandle, report.targetUserId as string) : UNKNOWN_TARGET_LABEL}
      klass={report.targetClass}
      time={formatTime(report.createdAt)}
      alert={alert}
      actions={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onDismiss} data-testid="mod-queue-dismiss">
            Dismiss
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={punitiveDisabled}
            title={unresolvedHint}
            onClick={onWarn}
            data-testid="mod-queue-warn"
          >
            Warn
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={punitiveDisabled}
            title={unresolvedHint}
            onClick={onStrike}
            data-testid="mod-queue-strike"
          >
            Strike
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={punitiveDisabled}
            title={unresolvedHint}
            onClick={onMute}
            data-testid="mod-queue-mute"
          >
            Mute
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={punitiveDisabled}
            title={unresolvedHint}
            onClick={onBan}
            data-testid="mod-queue-ban"
          >
            Ban
          </Button>
        </>
      }
    >
      <p className="text-sm">{report.reason ?? "No reason given."}</p>
      {report.targetMessageId && (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic wc-muted">
          Flagged message: {report.targetMessageId}
        </blockquote>
      )}
      {!hasTarget && (
        <p className="wc-help mt-2" data-testid="mod-queue-unknown-target">
          Target user could not be resolved — punitive actions are disabled. You can still dismiss this report.
        </p>
      )}
    </CardShell>
  );
}

export interface FlagCardProps {
  flag: ReportDto;
  busy: boolean;
  alert?: string | null;
  onLooksFine: () => void;
  onStrike: () => void;
}

/**
 * Watch-flags set `reporterId = targetUserId` (system-generated, no real
 * reporter) — render only `targetUserId` (as the subject id) and never
 * surface `reporterId` as a distinct "reporter" identity, per the
 * redaction rule.
 */
export function FlagCard({ flag, busy, alert, onLooksFine, onStrike }: FlagCardProps) {
  const subjectId = flag.targetUserId ?? flag.reporterId;
  return (
    <CardShell
      chipIcon={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
      chipLabel="Flag"
      subject={subjectLabel(flag.targetHandle, subjectId)}
      klass={flag.targetClass}
      time={formatTime(flag.createdAt)}
      alert={alert}
      actions={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onLooksFine} data-testid="mod-queue-dismiss">
            Looks fine
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={onStrike} data-testid="mod-queue-strike">
            Strike
          </Button>
        </>
      }
    >
      <p className="text-sm">{flag.reason?.replace(/^watch:\s*/i, "") ?? "Watch-term match."}</p>
    </CardShell>
  );
}

export interface AppealCardProps {
  appeal: AppealDto;
  busy: boolean;
  alert?: string | null;
  onUphold: () => void;
  onReduce: () => void;
  onOverturn: () => void;
}

export function AppealCard({ appeal, busy, alert, onUphold, onReduce, onOverturn }: AppealCardProps) {
  return (
    <CardShell
      chipIcon={<Scale className="w-3.5 h-3.5" aria-hidden="true" />}
      chipLabel="Appeal"
      subject={subjectLabel(appeal.handle, appeal.userId)}
      klass={appeal.class ?? appeal.role}
      time={formatTime(appeal.createdAt)}
      alert={alert}
      actions={
        <>
          <Button variant="destructive" size="sm" disabled={busy} onClick={onUphold} data-testid="mod-queue-uphold">
            Uphold
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={onReduce} data-testid="mod-queue-reduce">
            Reduce
          </Button>
          <Button variant="default" size="sm" disabled={busy} onClick={onOverturn} data-testid="mod-queue-overturn">
            Overturn
          </Button>
        </>
      }
    >
      <p className="text-sm wc-muted">
        Appealing {appeal.subjectStrikeId ? `strike ${appeal.subjectStrikeId}` : "a moderation action"}.
      </p>
      <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic">"{appeal.text}"</blockquote>
      <p className="wc-help mt-2">A written response is required on every appeal decision.</p>
    </CardShell>
  );
}

export interface ReinstatementCardProps {
  reinstatement: ReinstatementRequestDto;
  escalated: boolean;
  onSendToCustodian: () => void;
}

export function ReinstatementCard({ reinstatement, escalated, onSendToCustodian }: ReinstatementCardProps) {
  return (
    <CardShell
      chipIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
      chipLabel="Reinstatement"
      subject={subjectLabel(reinstatement.handle, reinstatement.userId)}
      klass={reinstatement.class ?? reinstatement.role}
      time={formatTime(reinstatement.createdAt)}
      actions={
        escalated ? (
          <span role="status" className="wc-muted text-sm font-semibold">
            Escalated to custodian
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={onSendToCustodian} data-testid="mod-queue-escalate">
            Send to custodian
          </Button>
        )
      }
    >
      <p className="text-sm">{reinstatement.text}</p>
      <p className="wc-help mt-2">
        Reinstatement approval is a custodian-only decision — this routes the request up rather than
        deciding it here.
      </p>
    </CardShell>
  );
}
