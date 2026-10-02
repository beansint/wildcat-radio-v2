"use client";

/**
 * /mod/schedule — "This date" panel (#106 / FE#84). Per-date exceptions to
 * the weekly template: delay, cancel, resume — each audited with a reason.
 * Occurrences a DJ has already tapped into are locked (the server enforces
 * it too). Hiatus is shown here but managed from the show's edit dialog.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Lock, RotateCcw, XCircle } from "lucide-react";
import {
  getListShowOccurrencesQueryKey,
  resumeShowOccurrence,
  upsertShowOccurrence,
  useListShowOccurrences,
} from "@/lib/api/endpoints/shows/shows";
import { getGetTodayScheduleQueryKey } from "@/lib/api/endpoints/schedule/schedule";
import type { ShowOccurrenceAdminDto } from "@/lib/api/model";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { stationDate, stationHhmm } from "@/lib/time/station";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReasonDialog } from "@/components/mod/reason-dialog";
import { OccurrenceDelayDialog } from "@/components/mod/occurrence-delay-dialog";

const STATUS_PILL: Record<string, { label: string; pillClass: string }> = {
  SCHEDULED: { label: "Scheduled", pillClass: "wc-pill-ok" },
  DELAYED: { label: "Delayed", pillClass: "wc-pill-warn" },
  CANCELLED: { label: "Cancelled", pillClass: "wc-pill-bad" },
  HIATUS: { label: "On hiatus", pillClass: "wc-pill-neutral" },
};

type Action =
  | { kind: "delay"; occ: ShowOccurrenceAdminDto }
  | { kind: "cancel"; occ: ShowOccurrenceAdminDto }
  | { kind: "resume"; occ: ShowOccurrenceAdminDto }
  | null;

export function OccurrencesPanel() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => stationDate(new Date()));
  const [action, setAction] = useState<Action>(null);
  const query = useListShowOccurrences<ShowOccurrenceAdminDto[]>({ date });
  const rows = query.data ?? [];

  // Refetch first, then close: the dialog keeps "Saving…" until the list
  // shows the change, instead of closing onto stale rows (seen in live QA).
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListShowOccurrencesQueryKey({ date }) }),
      queryClient.invalidateQueries({ queryKey: getGetTodayScheduleQueryKey() }),
    ]);
    setAction(null);
  }

  return (
    <section className="wc-card mb-5" data-testid="mod-occurrences">
      <div className="wc-card-pad border-b border-border flex items-end gap-3 flex-wrap">
        <CalendarClock className="h-5 w-5 text-gold mb-2" aria-hidden="true" />
        <div className="flex-1 min-w-[12rem]">
          <h2 className="font-extrabold">Changes for one date</h2>
          <p className="wc-muted text-sm">Delay or cancel a single airing. The weekly grid below stays as it is.</p>
        </div>
        <div className="w-44">
          <Label htmlFor="occ-date">Date</Label>
          <Input
            id="occ-date"
            type="date"
            className="tnum"
            value={date}
            data-testid="mod-occurrences-date"
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
      </div>

      {query.isError ? (
        <div role="alert" className="p-4 text-sm font-semibold text-destructive">
          {getApiErrorMessage(query.error)}
        </div>
      ) : query.isPending ? (
        <p className="p-4 wc-muted text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 wc-muted text-sm" data-testid="mod-occurrences-empty">
          No shows air on this date.
        </p>
      ) : (
        <ul>
          {rows.map((occ) => {
            const pill = STATUS_PILL[occ.status] ?? STATUS_PILL.SCHEDULED;
            const overridden = occ.status === "DELAYED" || occ.status === "CANCELLED";
            return (
              <li
                key={occ.showId}
                data-testid="mod-occurrence-row"
                data-status={occ.status}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 flex-wrap"
              >
                <div className="w-28 text-sm tnum flex-none">
                  {stationHhmm(occ.effectiveStart)}–{stationHhmm(occ.effectiveEnd)}
                  {occ.status === "DELAYED" && (
                    <div className="text-xs wc-muted">
                      <span className="sr-only">originally </span>
                      <span className="line-through">
                        {stationHhmm(occ.originalStart)}–{stationHhmm(occ.originalEnd)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className={`font-bold${occ.status === "CANCELLED" ? " line-through wc-muted" : ""}`}>{occ.showName}</div>
                  {occ.reason && <div className="text-xs wc-muted">“{occ.reason}”</div>}
                </div>
                <span className={`wc-pill ${pill.pillClass}`} data-testid="mod-occurrence-status">
                  {pill.label}
                </span>
                {occ.status === "HIATUS" ? (
                  <span className="text-xs wc-muted">Edit the show to end the hiatus</span>
                ) : occ.locked ? (
                  <span className="text-xs wc-muted flex items-center gap-1" data-testid="mod-occurrence-locked">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />A DJ has tapped in
                  </span>
                ) : (
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="mod-occurrence-delay"
                      aria-label={`Delay ${occ.showName} on ${occ.date}`}
                      onClick={() => setAction({ kind: "delay", occ })}
                    >
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      Delay
                    </Button>
                    {occ.status !== "CANCELLED" && (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="mod-occurrence-cancel"
                        aria-label={`Cancel ${occ.showName} on ${occ.date}`}
                        onClick={() => setAction({ kind: "cancel", occ })}
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        Cancel
                      </Button>
                    )}
                    {overridden && (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="mod-occurrence-resume"
                        aria-label={`Resume ${occ.showName} on ${occ.date}`}
                        onClick={() => setAction({ kind: "resume", occ })}
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Resume
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {action?.kind === "delay" && (
        <OccurrenceDelayDialog occurrence={action.occ} onOpenChange={(o) => !o && setAction(null)} onSaved={refresh} />
      )}
      {action?.kind === "cancel" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          testid="occ-cancel"
          title={`Cancel ${action.occ.showName} on ${action.occ.date}?`}
          description="Listeners see it as cancelled for that date and no one is marked absent. Resume any time before a DJ taps in."
          confirmLabel="Cancel this date"
          destructive
          placeholder="e.g. exam week"
          onConfirm={(reason) =>
            upsertShowOccurrence(action.occ.showId, action.occ.date, {
              body: JSON.stringify({ status: "CANCELLED", reason }),
            })
          }
          onDone={refresh}
        />
      )}
      {action?.kind === "resume" && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          testid="occ-resume"
          title={`Resume ${action.occ.showName} on ${action.occ.date}?`}
          description={`Back to its usual ${stationHhmm(action.occ.originalStart)}–${stationHhmm(action.occ.originalEnd)} slot.`}
          confirmLabel="Resume"
          placeholder="e.g. power restored"
          onConfirm={(reason) =>
            resumeShowOccurrence(action.occ.showId, action.occ.date, { body: JSON.stringify({ reason }) })
          }
          onDone={refresh}
        />
      )}
    </section>
  );
}
