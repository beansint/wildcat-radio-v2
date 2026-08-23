"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { attendanceControllerCorrect, attendanceControllerCreate, attendanceControllerDecideOvertime } from "@/lib/api/endpoints/attendance/attendance";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { AttendanceRowDto } from "@/lib/api/model";
import { buildAttendanceCorrection, type OvertimeStatus } from "@/lib/time/attendance";
import { stationDate, stationHhmm } from "@/lib/time/station";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  timeInDate: z.string().min(1, "Add a station date for time in."),
  timeIn: z.string().min(1, "Add a time in."),
  timeOutDate: z.string(),
  timeOut: z.string(),
  note: z.string().max(2000, "Keep the note under 2000 characters."),
  reason: z.string().trim().min(1, "Explain this staff correction for the audit log.").max(2000),
  overtimeStatus: z.enum(["NONE", "PENDING", "APPROVED", "REJECTED"]),
}).superRefine((values, context) => {
  if (values.timeOut && !values.timeOutDate) {
    context.addIssue({ code: "custom", path: ["timeOutDate"], message: "Add a station date for time out." });
  } else if (values.timeOut) {
    const correction = buildAttendanceCorrection(values);
    if (new Date(correction.timeOut ?? 0) < new Date(correction.timeIn)) {
      context.addIssue({ code: "custom", path: ["timeOut"], message: "Time out must be after time in." });
    }
  }
});

type FormValues = z.infer<typeof schema>;

function isoToStationDate(iso: string | null, fallback: string): string {
  return iso ? stationDate(iso) : fallback;
}

function isoToTimeInput(iso: string | null): string {
  return iso ? stationHhmm(iso) : "";
}

interface AttendanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AttendanceRowDto;
  /** YYYY-MM-DD, the sheet's currently selected station date filter. */
  date: string;
  onSaved: () => void;
}

export function AttendanceEditDialog({ open, onOpenChange, row, date, onSaved }: AttendanceEditDialogProps) {
  const isCreate = !row.recordId;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      timeInDate: isoToStationDate(row.timeIn, date),
      timeIn: isoToTimeInput(row.timeIn),
      timeOutDate: isoToStationDate(row.timeOut, date),
      timeOut: isoToTimeInput(row.timeOut),
      note: row.note ?? "",
      reason: "",
      overtimeStatus: row.overtimeStatus ?? "NONE",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body = buildAttendanceCorrection(values);
      if (row.recordId) {
        const corrected = await attendanceControllerCorrect(row.recordId, body);
        if (values.overtimeStatus === "APPROVED" && corrected.overtimeMinutes > 0) {
          return attendanceControllerDecideOvertime(row.recordId, { approved: true, reason: values.reason });
        }
        if (values.overtimeStatus === "REJECTED") {
          return attendanceControllerDecideOvertime(row.recordId, { approved: false, reason: values.reason });
        }
        return corrected;
      }
      if (!row.showId || !row.scheduledFor) throw new Error("This absent row is missing its scheduled show occurrence.");
      const created = await attendanceControllerCreate({ ...body, rosterId: row.rosterId, showId: row.showId, scheduledFor: row.scheduledFor });
      return values.overtimeStatus === "APPROVED" && created.overtimeMinutes > 0
        ? attendanceControllerDecideOvertime(created.recordId!, { approved: true, reason: values.reason })
        : values.overtimeStatus === "REJECTED" && created.overtimeMinutes > 0
          ? attendanceControllerDecideOvertime(created.recordId!, { approved: false, reason: values.reason })
        : created;
    },
    onSuccess: () => onSaved(),
  });
  const overtimeStatus = useWatch({ control: form.control, name: "overtimeStatus" });

  const alertMessage =
    form.formState.errors.timeInDate?.message ??
    form.formState.errors.timeIn?.message ??
    form.formState.errors.timeOutDate?.message ??
    form.formState.errors.timeOut?.message ??
    form.formState.errors.note?.message ??
    form.formState.errors.reason?.message ??
    (mutation.isError ? getApiErrorMessage(mutation.error) : null);

  const busy = form.formState.isSubmitting || mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreate ? "Record missed attendance" : "Edit attendance"} · {row.displayName}</DialogTitle>
        </DialogHeader>
        <p className="wc-muted text-sm">
          Scheduled <span className="tnum">{row.scheduled ?? "—"}</span>{row.scheduledEnd ? ` to ${row.scheduledEnd}` : ""}
        </p>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="att-timein-date">Time in date</Label>
              <Input id="att-timein-date" type="date" className="tnum" disabled={busy} {...form.register("timeInDate")} />
            </div>
            <div>
              <Label htmlFor="att-timein">Time in</Label>
              <Input
                id="att-timein"
                type="time"
                className="tnum"
                data-testid="att-timein"
                disabled={busy}
                {...form.register("timeIn")}
              />
            </div>
            <div>
              <Label htmlFor="att-timeout-date">Time out date</Label>
              <Input id="att-timeout-date" type="date" className="tnum" disabled={busy} {...form.register("timeOutDate")} />
            </div>
            <div>
              <Label htmlFor="att-timeout">Time out</Label>
              <Input
                id="att-timeout"
                type="time"
                className="tnum"
                data-testid="att-timeout"
                disabled={busy}
                {...form.register("timeOut")}
              />
            </div>
          </div>
          <p className="wc-help">Leave time out blank to keep this attendance record open.</p>
          <div>
            <Label htmlFor="att-overtime">Overtime review</Label>
            <Select value={overtimeStatus} onValueChange={(value) => form.setValue("overtimeStatus", value as OvertimeStatus)} disabled={busy}>
              <SelectTrigger id="att-overtime" data-testid="att-overtime"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No overtime</SelectItem>
                <SelectItem value="PENDING">Overtime pending</SelectItem>
                <SelectItem value="APPROVED">Overtime approved</SelectItem>
                <SelectItem value="REJECTED">Overtime declined</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="att-note">Note</Label>
            <Textarea id="att-note" rows={2} placeholder="e.g. extended live set" data-testid="att-note" disabled={busy} {...form.register("note")} />
          </div>
          <div>
            <Label htmlFor="att-reason">Correction reason</Label>
            <Textarea id="att-reason" rows={2} placeholder="Required for the staff audit log" data-testid="att-reason" disabled={busy} {...form.register("reason")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="att-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="att-save">
              {busy ? "Saving…" : isCreate ? "Create record" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
