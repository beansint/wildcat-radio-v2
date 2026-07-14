"use client";

/**
 * /mod/queue — moderation queue: reports, watch-list flags, appeals, and
 * reinstatement requests awaiting a moderator decision, over
 * `useModerationControllerGetQueue` (`GET /api/mod/queue` -> QueueDto).
 *
 * Subject identity: the enriched queue DTOs carry the target/subject's
 * `handle` + listener `class` (`ReportDto.targetHandle`/`targetClass`;
 * `AppealDto`/`ReinstatementRequestDto` `handle`/`class`/`role`), so cards
 * render the real `@handle` + a class/role `wc-chip-ghost`, falling back to
 * a truncated id only when the handle is null. Only the target/subject
 * identity is exposed — the reporter's identity is deliberately never
 * surfaced (there's no reporter-handle field, and watch-flags set
 * `reporterId = targetUserId`).
 *
 * Mutation bodies (strike/action/resolveReport/resolveAppeal) aren't
 * separately typed by orval — the generated fns take `(id, options?:
 * RequestInit)` same as `rosterControllerUpdate` — so this page builds each
 * JSON body by hand per the task's confirmed shapes and JSON.stringifies it
 * into `options.body`, matching the roster page's
 * `rosterControllerUpdate(id, { body: JSON.stringify(...) })` pattern.
 *
 * One-click actions (Dismiss/Looks fine/Warn/Mute/Ban) go through
 * `ConfirmDialog` rather than a text form, so each sends a fixed, audit-
 * readable canned reason (see `CANNED_REASON` below) instead of prompting
 * for free text — that's what keeps them "one-click" while still satisfying
 * the backend's required `reason` field.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useModerationControllerGetQueue,
  getModerationControllerGetQueueQueryKey,
  moderationControllerStrike,
  moderationControllerAction,
  moderationControllerResolveReport,
  moderationControllerResolveAppeal,
} from "@/lib/api/endpoints/moderation/moderation";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { AppealDtoStatus, type QueueDto, type ReportDto, type AppealDto } from "@/lib/api/model";
import { SegTabs, type SegTab } from "@/components/mod/seg-tabs";
import { ConfirmDialog } from "@/components/mod/confirm-dialog";
import { StrikeDialog, type StrikeDialogValues } from "@/components/mod/strike-dialog";
import {
  ReportCard,
  FlagCard,
  AppealCard,
  ReinstatementCard,
  truncatedHandle,
} from "@/components/mod/queue/queue-card";
import { AppealDecisionDialog } from "@/components/mod/queue/appeal-decision-dialog";

type TabKey = "all" | "reports" | "flags" | "appeals" | "reinstatements";

const CANNED_REASON: Record<"dismiss" | "looksFine" | "warn" | "mute" | "ban", string> = {
  dismiss: "Reviewed — no policy violation found.",
  looksFine: "Reviewed — watch-term match was a false positive.",
  warn: "Formal warning issued for the reported content.",
  mute: "Muted per moderation policy for the reported content.",
  ban: "Banned per moderation policy for the reported content.",
};

type OneClickAction = "dismiss" | "looksFine" | "warn" | "mute" | "ban";

interface ConfirmState {
  action: OneClickAction;
  /** The report/flag (ReportDto) the action targets. */
  report: ReportDto;
}

interface StrikeState {
  /** userId the strike/severity-override targets. */
  userId: string;
  /** Resolved subject handle for the dialog title (null → truncated-id fallback). */
  handle: string | null;
  /** The report/flag this strike was opened from — only used for the alert-scoping key. */
  sourceId: string;
}

/** Bare subject label (no `@`) for dialogs that prefix `@` themselves. */
function handleLabel(handle: string | null, fallbackId: string): string {
  return handle ?? truncatedHandle(fallbackId);
}

interface AppealDialogState {
  appeal: AppealDto;
  status: AppealDtoStatus;
}

const CONFIRM_COPY: Record<
  OneClickAction,
  { title: string; description: (handle: string) => string; confirmLabel: string; destructive: boolean }
> = {
  dismiss: {
    title: "Dismiss report",
    description: (h) => `Dismiss the report on @${h}? No action will be taken against the user.`,
    confirmLabel: "Dismiss",
    destructive: false,
  },
  looksFine: {
    title: "Looks fine",
    description: (h) => `Mark the watch-flag on @${h} as reviewed with no violation found?`,
    confirmLabel: "Looks fine",
    destructive: false,
  },
  warn: {
    title: "Warn user",
    description: (h) => `Send a formal warning to @${h}?`,
    confirmLabel: "Warn",
    destructive: false,
  },
  mute: {
    title: "Mute user",
    description: (h) => `Mute @${h}? This is audit-logged and visible to the user.`,
    confirmLabel: "Mute",
    destructive: true,
  },
  ban: {
    title: "Ban user",
    description: (h) => `Ban @${h}? This is audit-logged and immediately ends their access.`,
    confirmLabel: "Ban",
    destructive: true,
  },
};

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [strikeState, setStrikeState] = useState<StrikeState | null>(null);
  const [appealDialog, setAppealDialog] = useState<AppealDialogState | null>(null);
  const [escalated, setEscalated] = useState<Set<string>>(new Set());

  const queueQuery = useModerationControllerGetQueue<QueueDto>();
  const queue = queueQuery.data;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getModerationControllerGetQueueQueryKey() });
  }

  const resolveReportMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: "ACTIONED" | "DISMISSED"; reason: string }) =>
      moderationControllerResolveReport(id, { body: JSON.stringify({ status, reason }) }),
    onSuccess: () => {
      invalidate();
      setConfirmState(null);
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({
      id,
      type,
      reason,
      messageId,
    }: {
      id: string;
      type: "WARN" | "MUTE" | "BAN" | "SEVERITY_OVERRIDE";
      reason: string;
      messageId?: string;
    }) =>
      moderationControllerAction(id, {
        body: JSON.stringify({ type, reason, ...(messageId ? { messageId } : {}) }),
      }),
    onSuccess: () => {
      invalidate();
      setConfirmState(null);
      setStrikeState(null);
    },
  });

  const strikeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      moderationControllerStrike(id, { body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      invalidate();
      setStrikeState(null);
    },
  });

  const resolveAppealMutation = useMutation({
    mutationFn: ({ id, status, writtenResponse }: { id: string; status: AppealDtoStatus; writtenResponse: string }) =>
      moderationControllerResolveAppeal(id, { body: JSON.stringify({ status, writtenResponse }) }),
    onSuccess: () => {
      invalidate();
      setAppealDialog(null);
    },
  });

  const reports = queue?.reports ?? [];
  const watchFlags = queue?.watchFlags ?? [];
  const appeals = queue?.appeals ?? [];
  const reinstatements = queue?.reinstatements ?? [];

  const tabs: SegTab[] = useMemo(
    () => [
      { key: "all", label: "All", count: reports.length + watchFlags.length + appeals.length + reinstatements.length },
      { key: "reports", label: "Reports", count: reports.length },
      { key: "flags", label: "Flags", count: watchFlags.length },
      { key: "appeals", label: "Appeals", count: appeals.length },
      { key: "reinstatements", label: "Reinstatement", count: reinstatements.length },
    ],
    [reports.length, watchFlags.length, appeals.length, reinstatements.length],
  );

  const showReports = tab === "all" || tab === "reports";
  const showFlags = tab === "all" || tab === "flags";
  const showAppeals = tab === "all" || tab === "appeals";
  const showReinstatements = tab === "all" || tab === "reinstatements";

  const totalVisible =
    (showReports ? reports.length : 0) +
    (showFlags ? watchFlags.length : 0) +
    (showAppeals ? appeals.length : 0) +
    (showReinstatements ? reinstatements.length : 0);

  function alertFor(id: string): string | null {
    if (resolveReportMutation.isError && resolveReportMutation.variables?.id === id) {
      return getApiErrorMessage(resolveReportMutation.error);
    }
    if (actionMutation.isError && actionMutation.variables?.id === id) {
      return getApiErrorMessage(actionMutation.error);
    }
    return null;
  }

  function isBusyFor(id: string): boolean {
    return (
      (resolveReportMutation.isPending && resolveReportMutation.variables?.id === id) ||
      (actionMutation.isPending && actionMutation.variables?.id === id)
    );
  }

  function runConfirmedAction() {
    if (!confirmState) return;
    const { action, report } = confirmState;
    const subjectId = report.targetUserId ?? report.reporterId;
    switch (action) {
      case "dismiss":
        resolveReportMutation.mutate({ id: report.id, status: "DISMISSED", reason: CANNED_REASON.dismiss });
        return;
      case "looksFine":
        resolveReportMutation.mutate({ id: report.id, status: "DISMISSED", reason: CANNED_REASON.looksFine });
        return;
      case "warn":
        actionMutation.mutate({
          id: subjectId,
          type: "WARN",
          reason: CANNED_REASON.warn,
          messageId: report.targetMessageId ?? undefined,
        });
        return;
      case "mute":
        actionMutation.mutate({
          id: subjectId,
          type: "MUTE",
          reason: CANNED_REASON.mute,
          messageId: report.targetMessageId ?? undefined,
        });
        return;
      case "ban":
        actionMutation.mutate({
          id: subjectId,
          type: "BAN",
          reason: CANNED_REASON.ban,
          messageId: report.targetMessageId ?? undefined,
        });
        return;
    }
  }

  function handleStrikeSubmit(values: StrikeDialogValues) {
    if (!strikeState) return;
    if (values.severityOverride) {
      actionMutation.mutate({
        id: strikeState.userId,
        type: "SEVERITY_OVERRIDE",
        reason: values.overrideReason || values.reason,
      });
    } else {
      strikeMutation.mutate({ id: strikeState.userId, reason: values.reason });
    }
  }

  function handleAppealSubmit(writtenResponse: string) {
    if (!appealDialog) return;
    resolveAppealMutation.mutate({ id: appealDialog.appeal.id, status: appealDialog.status, writtenResponse });
  }

  function toggleEscalated(id: string) {
    setEscalated((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Moderation queue</h1>
        <p className="wc-muted">
          Reports, watch-list flags, appeals &amp; reinstatement — one-click actions. Everything you do is
          audit-logged.
        </p>
      </header>

      <SegTabs tabs={tabs} value={tab} onValueChange={(k) => setTab(k as TabKey)} testid="mod-queue-tabs" className="mb-5" />

      {queueQuery.isLoading ? (
        <p className="wc-muted">Loading queue…</p>
      ) : totalVisible === 0 ? (
        <div className="wc-card wc-card-pad text-center wc-muted" data-testid="mod-queue-empty">
          {tab === "all"
            ? "Nothing in the queue."
            : tab === "reports"
              ? "No reports."
              : tab === "flags"
                ? "No flags."
                : tab === "appeals"
                  ? "No appeals."
                  : "No reinstatement requests."}
        </div>
      ) : (
        <div className="wc-stack">
          {showReports &&
            reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                busy={isBusyFor(report.id) || isBusyFor(report.targetUserId ?? report.reporterId)}
                alert={alertFor(report.id) ?? alertFor(report.targetUserId ?? report.reporterId)}
                onDismiss={() => setConfirmState({ action: "dismiss", report })}
                onWarn={() => setConfirmState({ action: "warn", report })}
                onStrike={() =>
                  setStrikeState({
                    userId: report.targetUserId ?? report.reporterId,
                    handle: report.targetHandle,
                    sourceId: report.id,
                  })
                }
                onMute={() => setConfirmState({ action: "mute", report })}
                onBan={() => setConfirmState({ action: "ban", report })}
              />
            ))}

          {showFlags &&
            watchFlags.map((flag) => (
              <FlagCard
                key={flag.id}
                flag={flag}
                busy={isBusyFor(flag.id) || isBusyFor(flag.targetUserId ?? flag.reporterId)}
                alert={alertFor(flag.id) ?? alertFor(flag.targetUserId ?? flag.reporterId)}
                onLooksFine={() => setConfirmState({ action: "looksFine", report: flag })}
                onStrike={() =>
                  setStrikeState({
                    userId: flag.targetUserId ?? flag.reporterId,
                    handle: flag.targetHandle,
                    sourceId: flag.id,
                  })
                }
              />
            ))}

          {showAppeals &&
            appeals.map((appeal) => (
              <AppealCard
                key={appeal.id}
                appeal={appeal}
                busy={resolveAppealMutation.isPending && resolveAppealMutation.variables?.id === appeal.id}
                alert={
                  resolveAppealMutation.isError && resolveAppealMutation.variables?.id === appeal.id
                    ? getApiErrorMessage(resolveAppealMutation.error)
                    : null
                }
                onUphold={() => setAppealDialog({ appeal, status: AppealDtoStatus.UPHELD })}
                onReduce={() => setAppealDialog({ appeal, status: AppealDtoStatus.REDUCED })}
                onOverturn={() => setAppealDialog({ appeal, status: AppealDtoStatus.OVERTURNED })}
              />
            ))}

          {showReinstatements &&
            reinstatements.map((reinstatement) => (
              <ReinstatementCard
                key={reinstatement.id}
                reinstatement={reinstatement}
                escalated={escalated.has(reinstatement.id)}
                onSendToCustodian={() => toggleEscalated(reinstatement.id)}
              />
            ))}
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          open
          title={CONFIRM_COPY[confirmState.action].title}
          description={CONFIRM_COPY[confirmState.action].description(
            handleLabel(
              confirmState.report.targetHandle,
              confirmState.report.targetUserId ?? confirmState.report.reporterId,
            ),
          )}
          confirmLabel={CONFIRM_COPY[confirmState.action].confirmLabel}
          destructive={CONFIRM_COPY[confirmState.action].destructive}
          pending={resolveReportMutation.isPending || actionMutation.isPending}
          onOpenChange={(open) => {
            if (!open) setConfirmState(null);
          }}
          onConfirm={runConfirmedAction}
          testid="mod-queue-confirm"
        />
      )}

      {strikeState && (
        <StrikeDialog
          open
          mode="issue"
          userHandle={handleLabel(strikeState.handle, strikeState.userId)}
          onOpenChange={(open) => {
            if (!open) setStrikeState(null);
          }}
          onSubmit={handleStrikeSubmit}
          pending={strikeMutation.isPending || actionMutation.isPending}
          error={
            strikeMutation.isError
              ? getApiErrorMessage(strikeMutation.error)
              : actionMutation.isError && actionMutation.variables?.id === strikeState.userId
                ? getApiErrorMessage(actionMutation.error)
                : null
          }
        />
      )}

      {appealDialog && (
        <AppealDecisionDialog
          open
          status={appealDialog.status}
          subjectHandle={handleLabel(appealDialog.appeal.handle, appealDialog.appeal.userId)}
          onOpenChange={(open) => {
            if (!open) setAppealDialog(null);
          }}
          onSubmit={handleAppealSubmit}
          pending={resolveAppealMutation.isPending}
          error={resolveAppealMutation.isError ? getApiErrorMessage(resolveAppealMutation.error) : null}
        />
      )}
    </div>
  );
}
