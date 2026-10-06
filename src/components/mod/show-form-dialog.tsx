"use client";

/**
 * Add/edit show dialog — 1:1 with
 * docs/frontend-design-basis-prototype/mod/schedule.html #mShow, extended
 * with a day picker: seven toggle chips (plus one-tap presets) whose
 * selection maps straight onto the backend `Cadence` shape
 *   { kind:'WEEKLY', days:<selected days>, start, end }.
 * It replaced a Mon-Wed-Fri/Daily/Custom select whose "Custom" option hid
 * the day checkboxes — the days ARE the recurrence, so they are shown first.
 * One-time (`Cadence.kind === "ONE_TIME"`) is intentionally not offered —
 * the weekly schedule grid only renders WEEKLY shows, so a one-time show
 * would have no cell to appear in.
 * Mounted only while open, so each open gets fresh defaults from `show` (edit)
 * or the `prefillDay`/`prefillStart`/`prefillEnd` props (clicking an empty
 * schedule cell).
 */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  showsControllerCreate,
  showsControllerUpdate,
  showsControllerRemove,
} from "@/lib/api/endpoints/shows/shows";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { ShowDto, RosterEntryDto } from "@/lib/api/model";
import type { Cadence, Weekday } from "@/lib/mod/types";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/mod/confirm-dialog";

const ALL_DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MWF: Weekday[] = ["MON", "WED", "FRI"];
const DAY_LABEL: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

// One-time (`Cadence.kind === "ONE_TIME"`) is deliberately not exposed here:
// the weekly schedule grid (`/mod/schedule`, `/schedule`) only renders
// WEEKLY shows, so a show created as one-time would have no cell to render
// in and become unmanageable. The `Cadence` type itself keeps ONE_TIME for
// a future slice; this form just never produces or round-trips it.
const PRESETS: { id: string; label: string; days: Weekday[] }[] = [
  { id: "weekdays", label: "Weekdays", days: ["MON", "TUE", "WED", "THU", "FRI"] },
  { id: "mwf", label: "Mon·Wed·Fri", days: MWF },
  { id: "tuth", label: "Tue·Thu", days: ["TUE", "THU"] },
  { id: "daily", label: "Every day", days: ALL_DAYS },
];

function sameDaySet(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

/** Week order, regardless of the order the chips were tapped in. */
function sortDays(days: Weekday[]): Weekday[] {
  return ALL_DAYS.filter((d) => days.includes(d));
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function daysSummary(days: Weekday[]): string {
  if (days.length === 0) return "No days picked yet";
  if (days.length === 7) return "Airs every day";
  if (sameDaySet(days, PRESETS[0].days)) return "Airs weekdays";
  return `Airs ${sortDays(days).map((d) => DAY_LABEL[d]).join(", ")}`;
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Add a show name.").max(120, "Keep it under 120 characters."),
    days: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])),
    start: z.string().min(1, "Add a start time."),
    end: z.string().min(1, "Add an end time."),
    rosterIds: z.array(z.string()).min(1, "Assign at least one DJ."),
    // #106 hiatus (edit only): inclusive station-local dates + audited reason.
    hiatusOn: z.boolean(),
    hiatusFrom: z.string(),
    hiatusUntil: z.string(),
    hiatusReason: z.string().max(500, "Keep the hiatus reason under 500 characters."),
  })
  .superRefine((val, ctx) => {
    if (val.hiatusOn) {
      if (!val.hiatusFrom || !val.hiatusUntil) {
        ctx.addIssue({ code: "custom", path: ["hiatusFrom"], message: "Pick the first and last day of the hiatus." });
      } else if (val.hiatusUntil < val.hiatusFrom) {
        ctx.addIssue({ code: "custom", path: ["hiatusUntil"], message: "The hiatus must end on or after it starts." });
      }
      if (!val.hiatusReason.trim()) {
        ctx.addIssue({ code: "custom", path: ["hiatusReason"], message: "Add a reason for the hiatus." });
      }
    }
    if (val.days.length === 0) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Pick at least one day." });
    }
    if (val.start && val.end && val.start >= val.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End time must be after start time." });
    }
  });

type FormValues = z.infer<typeof schema>;

function cadenceFromForm(values: FormValues): Cadence {
  return { kind: "WEEKLY", days: sortDays(values.days), start: values.start, end: values.end };
}

interface ShowFormDialogProps {
  onCloseAutoFocus?: (event: Event) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  show?: ShowDto | null;
  roster: RosterEntryDto[];
  onSaved: () => void;
  onDeleted: () => void;
  /** Prefill for the "empty cell" add flow — a day + time slot to seed the form. */
  prefillDay?: Weekday;
  prefillStart?: string;
  prefillEnd?: string;
}

export function ShowFormDialog({
  open,
  onCloseAutoFocus,
  onOpenChange,
  show,
  roster,
  onSaved,
  onDeleted,
  prefillDay,
  prefillStart,
  prefillEnd,
}: ShowFormDialogProps) {
  const isEdit = !!show;
  // `ShowDto.cadence` comes back as `ShowDtoCadence` (an untyped object) —
  // the backend spec doesn't declare a discriminated union for cadence, so
  // orval generates a blob type. The runtime shape is `Cadence` 1:1 (see
  // `src/lib/mod/types.ts`).
  const cadence = show?.cadence as Cadence | undefined;
  // A ONE_TIME cadence should never reach this dialog (see note above); it
  // falls back to the fresh-show default rather than an empty day set.
  const initialDays =
    cadence?.kind === "WEEKLY" && cadence.days?.length
      ? cadence.days
      : prefillDay
        ? [prefillDay]
        : MWF;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: show?.name ?? "",
      days: initialDays,
      start: cadence?.start ?? prefillStart ?? "13:00",
      end: cadence?.end ?? prefillEnd ?? "16:00",
      rosterIds: show?.roster.map((r) => r.id) ?? [],
      hiatusOn: !!show?.hiatusFrom,
      hiatusFrom: show?.hiatusFrom ?? "",
      hiatusUntil: show?.hiatusUntil ?? "",
      hiatusReason: show?.hiatusReason ?? "",
    },
  });
  const hiatusOn = watch("hiatusOn");

  const days = watch("days");
  const start = watch("start");
  const end = watch("end");
  const selectedRosterIds = watch("rosterIds");
  // `roster` is active-only (the "add DJ" picker should only offer active
  // DJs), but a show can have an archived DJ still assigned to it — that
  // entry won't be in `roster` yet stays in `rosterIds` until explicitly
  // removed. Union the active roster with the show's own (possibly
  // archived) roster so every assigned DJ renders as a removable chip.
  const rosterById = new Map<string, string>();
  roster.forEach((r) => rosterById.set(r.id, r.displayName));
  show?.roster.forEach((r) => rosterById.set(r.id, r.displayName));
  const selectedRoster = selectedRosterIds.map((id) => ({
    id,
    displayName: rosterById.get(id) ?? id,
  }));
  const availableRoster = roster.filter((r) => !selectedRosterIds.includes(r.id));

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const body: Record<string, unknown> = {
        name: values.name.trim(),
        cadence: cadenceFromForm(values),
        rosterIds: values.rosterIds,
      };
      if (isEdit && show) {
        if (values.hiatusOn) {
          body.hiatusFrom = values.hiatusFrom;
          body.hiatusUntil = values.hiatusUntil;
          body.hiatusReason = values.hiatusReason.trim();
        } else if (show.hiatusFrom) {
          body.hiatusFrom = null;
          body.hiatusUntil = null;
        }
        return showsControllerUpdate(show.id, { body: JSON.stringify(body) });
      }
      return showsControllerCreate({ body: JSON.stringify(body) });
    },
    onSuccess: () => onSaved(),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!show) return;
      await showsControllerRemove(show.id);
    },
    onSuccess: () => {
      setConfirmDelete(false);
      onDeleted();
    },
    // Drop back to the edit dialog so its alert shows why (e.g. show is airing).
    onError: () => setConfirmDelete(false),
  });

  const alertMessage =
    errors.name?.message ??
    errors.days?.message ??
    errors.start?.message ??
    errors.end?.message ??
    errors.rosterIds?.message ??
    errors.hiatusFrom?.message ??
    errors.hiatusUntil?.message ??
    errors.hiatusReason?.message ??
    (saveMutation.isError ? getApiErrorMessage(saveMutation.error) : null) ??
    (deleteMutation.isError ? getApiErrorMessage(deleteMutation.error) : null);

  // #127 — a pending delete is busy too: no saving over a show mid-delete. A
  // 409 (e.g. the show's episode is airing or in overtime) lands in the alert.
  const busy = isSubmitting || saveMutation.isPending || deleteMutation.isPending;

  function onSubmit(values: FormValues) {
    saveMutation.mutate(values);
  }

  function addRoster(id: string) {
    setValue("rosterIds", [...selectedRosterIds, id], { shouldValidate: true });
  }

  function removeRoster(id: string) {
    setValue(
      "rosterIds",
      selectedRosterIds.filter((r) => r !== id),
      { shouldValidate: true },
    );
  }

  function toggleDay(day: Weekday) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setValue("days", next, { shouldValidate: true });
  }

  function applyPreset(next: Weekday[]) {
    setValue("days", next, { shouldValidate: true });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit show" : "Add show"}</DialogTitle>
          </DialogHeader>

          {alertMessage && (
            <div role="alert" className="text-sm font-semibold text-destructive">
              {alertMessage}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <Label htmlFor="show-name">Show name</Label>
            <Input
              id="show-name"
              className="mb-3"
              placeholder="Afternoon Vibes"
              data-testid="show-name"
              disabled={busy}
              {...register("name")}
            />

            <div className="mb-3">
              <Label id="show-days-label">Airs on</Label>
              <div
                role="group"
                aria-labelledby="show-days-label"
                aria-describedby="show-days-summary"
                className="mt-1 grid grid-cols-7 gap-1.5"
                data-testid="show-days"
              >
                {ALL_DAYS.map((day) => {
                  const on = days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      data-testid={`show-day-${day.toLowerCase()}`}
                      disabled={busy}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "min-h-11 rounded-xl border text-sm font-bold transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon",
                        "disabled:opacity-50",
                        on
                          ? "border-maroon bg-maroon text-white"
                          : "border-border bg-background text-muted-foreground hover:border-maroon/60 hover:text-foreground",
                      )}
                    >
                      {DAY_LABEL[day]}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
                <span className="text-muted-foreground mr-1">Quick pick:</span>
                {PRESETS.map((p) => {
                  const active = sameDaySet(days, p.days);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      data-testid={`show-days-preset-${p.id}`}
                      disabled={busy}
                      onClick={() => applyPreset(p.days)}
                      className={cn(
                        "min-h-8 rounded-full border px-2.5 font-semibold transition-colors",
                        active ? "border-ring bg-accent text-foreground" : "border-border text-foreground hover:bg-muted",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {days.length > 0 && (
                  <button
                    type="button"
                    data-testid="show-days-preset-clear"
                    disabled={busy}
                    onClick={() => applyPreset([])}
                    className="min-h-8 rounded-full px-2.5 font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p id="show-days-summary" className="wc-help mt-1.5" aria-live="polite" data-testid="show-days-summary">
                {daysSummary(days)}
                {days.length > 0 && start && end ? ` · ${formatTime(start)}–${formatTime(end)}` : ""}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label htmlFor="show-start">Start time</Label>
                <Input
                  id="show-start"
                  type="time"
                  className="tnum"
                  data-testid="show-start"
                  disabled={busy}
                  {...register("start")}
                />
              </div>
              <div>
                <Label htmlFor="show-end">End time</Label>
                <Input
                  id="show-end"
                  type="time"
                  className="tnum"
                  data-testid="show-end"
                  disabled={busy}
                  {...register("end")}
                />
              </div>
            </div>

            <Label>Assigned DJs</Label>
            <div className="flex flex-wrap items-center gap-2 mb-1" data-testid="show-djs">
              {selectedRoster.map((r) => (
                <span key={r.id} className="wc-chip-ghost">
                  {r.displayName}
                  <button
                    type="button"
                    className="ml-0.5"
                    aria-label={`Remove ${r.displayName}`}
                    disabled={busy}
                    onClick={() => removeRoster(r.id)}
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              {availableRoster.length > 0 && (
                <Select onValueChange={addRoster} disabled={busy}>
                  <SelectTrigger className="w-auto min-h-0 py-1 px-2 text-sm" data-testid="show-djs-add">
                    <SelectValue placeholder="+ Add DJ" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoster.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <p className="wc-help mb-4">DJs are pulled from the active roster.</p>

            {isEdit && (
              <fieldset className="mb-4 rounded-xl border border-border p-3" data-testid="show-hiatus">
                <legend className="px-1 text-sm font-bold">Hiatus</legend>
                <label className="flex items-center gap-2 text-sm mb-2" htmlFor="show-hiatus-on">
                  <Controller
                    control={control}
                    name="hiatusOn"
                    render={({ field }) => (
                      <Checkbox
                        id="show-hiatus-on"
                        data-testid="show-hiatus-on"
                        checked={field.value}
                        onCheckedChange={(c) => field.onChange(c === true)}
                        disabled={busy}
                      />
                    )}
                  />
                  Take this show off air for a stretch (e.g. semester break)
                </label>
                {hiatusOn && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div>
                        <Label htmlFor="show-hiatus-from">First day off</Label>
                        <Input id="show-hiatus-from" type="date" className="tnum" data-testid="show-hiatus-from" disabled={busy} {...register("hiatusFrom")} />
                      </div>
                      <div>
                        <Label htmlFor="show-hiatus-until">Last day off</Label>
                        <Input id="show-hiatus-until" type="date" className="tnum" data-testid="show-hiatus-until" disabled={busy} {...register("hiatusUntil")} />
                      </div>
                    </div>
                    <Label htmlFor="show-hiatus-reason">Reason</Label>
                    <Input
                      id="show-hiatus-reason"
                      placeholder="Semester break"
                      data-testid="show-hiatus-reason"
                      disabled={busy}
                      {...register("hiatusReason")}
                    />
                    <p className="wc-help mt-1">Hidden from the public schedule and never marked absent on those days.</p>
                  </>
                )}
              </fieldset>
            )}

            <DialogFooter>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  data-testid="show-delete"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  Delete
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="show-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={busy} data-testid="show-save">
                {isSubmitting || saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {confirmDelete && (
        <ConfirmDialog
          open
          title="Delete show"
          description={`Delete ${show?.name ?? "this show"}? This removes it from the schedule immediately.`}
          confirmLabel="Delete"
          destructive
          pending={deleteMutation.isPending}
          onOpenChange={(next) => {
            if (!next) setConfirmDelete(false);
          }}
          onConfirm={() => deleteMutation.mutate()}
          testid="show-delete-confirm"
        />
      )}
    </>
  );
}
