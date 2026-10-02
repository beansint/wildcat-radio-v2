"use client";

/**
 * Delay ONE dated occurrence of a show (#106 / FE#84) — the recurring
 * cadence is untouched. Same-day window, reason required (audited). Server
 * rejects overlaps with another show that day (409) and occurrences a DJ has
 * already tapped into; those messages land in the single alert region.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { upsertShowOccurrence } from "@/lib/api/endpoints/shows/shows";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { ShowOccurrenceAdminDto } from "@/lib/api/model";
import { stationHhmm } from "@/lib/time/station";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z
  .object({
    start: z.string().min(1, "Add the new start time."),
    end: z.string().min(1, "Add the new end time."),
    reason: z.string().trim().min(1, "Add a reason — it goes in the audit log.").max(500, "Keep it under 500 characters."),
  })
  .superRefine((v, ctx) => {
    if (v.start && v.end && v.start >= v.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End must be after start, on the same day." });
    }
  });

type FormValues = z.infer<typeof schema>;

interface OccurrenceDelayDialogProps {
  occurrence: ShowOccurrenceAdminDto;
  onOpenChange: (open: boolean) => void;
  /** Awaited before the dialog stops showing "Saving…" — return the refetch promise. */
  onSaved: () => unknown;
}

export function OccurrenceDelayDialog({ occurrence, onOpenChange, onSaved }: OccurrenceDelayDialogProps) {
  // Opened from row state, not a <Dialog.Trigger>, so Radix has no trigger to
  // refocus on close and would drop focus to <body> (same fix as
  // mod/announcements/review-dialog.tsx). Captured once, on mount.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      start: stationHhmm(occurrence.effectiveStart),
      end: stationHhmm(occurrence.effectiveEnd),
      reason: occurrence.status === "DELAYED" ? (occurrence.reason ?? "") : "",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: FormValues) =>
      upsertShowOccurrence(occurrence.showId, occurrence.date, {
        body: JSON.stringify({ status: "DELAYED", start: v.start, end: v.end, reason: v.reason.trim() }),
      }),
    onSuccess: () => onSaved(),
  });

  const alertMessage =
    errors.start?.message ??
    errors.end?.message ??
    errors.reason?.message ??
    (mutation.isError ? getApiErrorMessage(mutation.error) : null);
  const busy = isSubmitting || mutation.isPending;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="occ-delay-dialog"
        onCloseAutoFocus={(event) => {
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Delay · {occurrence.showName}</DialogTitle>
        </DialogHeader>
        <p className="wc-muted text-sm">
          Only <span className="tnum">{occurrence.date}</span> moves. Normally{" "}
          <span className="tnum">
            {stationHhmm(occurrence.originalStart)}–{stationHhmm(occurrence.originalEnd)}
          </span>
          ; the weekly schedule stays as it is.
        </p>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive" data-testid="occ-delay-alert">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label htmlFor="occ-delay-start">New start</Label>
              <Input id="occ-delay-start" type="time" className="tnum" data-testid="occ-delay-start" disabled={busy} {...register("start")} />
            </div>
            <div>
              <Label htmlFor="occ-delay-end">New end</Label>
              <Input id="occ-delay-end" type="time" className="tnum" data-testid="occ-delay-end" disabled={busy} {...register("end")} />
            </div>
          </div>
          <Label htmlFor="occ-delay-reason">Reason</Label>
          <Textarea
            id="occ-delay-reason"
            rows={3}
            className="mb-4"
            placeholder="e.g. power outage on campus"
            data-testid="occ-delay-reason"
            aria-invalid={!!errors.reason}
            disabled={busy}
            {...register("reason")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="occ-delay-cancel">
              Back
            </Button>
            <Button type="submit" disabled={busy} data-testid="occ-delay-save">
              {busy ? "Saving…" : "Delay this date"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
