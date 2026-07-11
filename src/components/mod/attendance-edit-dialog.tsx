"use client";

/**
 * Attendance correction dialog — 1:1 with
 * docs/frontend-design-basis-prototype/mod/attendance.html #mAtt.
 * Only ever opened for rows that have a `recordId` (the page never renders
 * the edit trigger for synthetic ABSENT rows), so `row.recordId` is assumed
 * present here.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { attendanceControllerCorrect } from "@/lib/api/endpoints/attendance/attendance";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { AttendanceRowDto } from "@/lib/api/model";
import { stationHhmm, stationLocalToUtcISO } from "@/lib/time/station";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z
  .object({
    timeIn: z.string().min(1, "Add a time in."),
    timeOut: z.string(),
    note: z.string().max(2000, "Keep the note under 2000 characters."),
  })
  .superRefine((val, ctx) => {
    if (val.timeOut && val.timeIn && val.timeOut < val.timeIn) {
      ctx.addIssue({ code: "custom", path: ["timeOut"], message: "Time out must be after time in." });
    }
  });

type FormValues = z.infer<typeof schema>;

/**
 * Combines the attendance sheet's selected date with a `type=time` value,
 * both station-local, into the UTC ISO datetime the backend expects. Using
 * the browser's local timezone here would roll a correction near midnight to
 * the wrong day for anyone outside the station's timezone.
 */
function toIso(date: string, hhmm: string): string {
  return stationLocalToUtcISO(date, hhmm);
}

/** Renders a UTC ISO instant as a station-local 'HH:MM' for the time input. */
function isoToTimeInput(iso: string | null): string {
  if (!iso) return "";
  return stationHhmm(iso);
}

interface AttendanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AttendanceRowDto;
  /** YYYY-MM-DD, the sheet's currently selected date filter. */
  date: string;
  onSaved: () => void;
}

export function AttendanceEditDialog({ open, onOpenChange, row, date, onSaved }: AttendanceEditDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      timeIn: isoToTimeInput(row.timeIn),
      timeOut: isoToTimeInput(row.timeOut),
      note: row.note ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!row.recordId) throw new Error("No attendance record to correct.");
      const body: Record<string, unknown> = { timeIn: toIso(date, values.timeIn) };
      if (values.timeOut) body.timeOut = toIso(date, values.timeOut);
      body.note = values.note ?? "";
      return attendanceControllerCorrect(row.recordId, { body: JSON.stringify(body) });
    },
    onSuccess: () => onSaved(),
  });

  const alertMessage =
    errors.timeIn?.message ??
    errors.timeOut?.message ??
    errors.note?.message ??
    (mutation.isError ? getApiErrorMessage(mutation.error) : null);

  const busy = isSubmitting || mutation.isPending;

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit attendance · {row.displayName}</DialogTitle>
        </DialogHeader>
        <p className="wc-muted text-sm">
          Scheduled <span className="tnum">{row.scheduled ?? "—"}</span>
        </p>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label htmlFor="att-timein">Time in</Label>
              <Input
                id="att-timein"
                type="time"
                className="tnum"
                data-testid="att-timein"
                disabled={busy}
                {...register("timeIn")}
              />
            </div>
            <div>
              <Label htmlFor="att-timeout">Time out</Label>
              <Input
                id="att-timeout"
                type="time"
                className="tnum"
                data-testid="att-timeout"
                disabled={busy}
                {...register("timeOut")}
              />
            </div>
          </div>
          <Label htmlFor="att-note">Note</Label>
          <Textarea
            id="att-note"
            rows={3}
            className="mb-4"
            placeholder="e.g. agreed overtime w/ Mara"
            data-testid="att-note"
            disabled={busy}
            {...register("note")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="att-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="att-save">
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
