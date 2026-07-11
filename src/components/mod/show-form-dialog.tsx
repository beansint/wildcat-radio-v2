"use client";

/**
 * Add/edit show dialog — 1:1 with
 * docs/frontend-design-basis-prototype/mod/schedule.html #mShow, extended
 * with a Recurrence select (Mon-Wed-Fri/Daily/Custom) that maps to the
 * backend `Cadence` shape:
 *   Mon-Wed-Fri  -> { kind:'WEEKLY', days:['MON','WED','FRI'] }
 *   Daily        -> { kind:'WEEKLY', days:<all 7> }
 *   Custom       -> { kind:'WEEKLY', days:<checked days> }
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
import type { ShowDto, RosterEntryDto, Cadence, Weekday } from "@/lib/mod/types";
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
type Recurrence = "MWF" | "DAILY" | "CUSTOM";

function sameDaySet(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");
}

function recurrenceFromCadence(cadence?: Cadence | null): {
  recurrence: Recurrence;
  customDays: Weekday[];
} {
  // A ONE_TIME cadence should never reach this dialog (see note above), but
  // fall back to MWF defensively rather than a recurrence value the select
  // no longer offers.
  if (!cadence || cadence.kind === "ONE_TIME") return { recurrence: "MWF", customDays: [] };
  const days = cadence.days ?? [];
  if (sameDaySet(days, MWF)) return { recurrence: "MWF", customDays: [] };
  if (sameDaySet(days, ALL_DAYS)) return { recurrence: "DAILY", customDays: [] };
  return { recurrence: "CUSTOM", customDays: days };
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Add a show name.").max(120, "Keep it under 120 characters."),
    recurrence: z.enum(["MWF", "DAILY", "CUSTOM"]),
    customDays: z.array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])),
    start: z.string().min(1, "Add a start time."),
    end: z.string().min(1, "Add an end time."),
    rosterIds: z.array(z.string()).min(1, "Assign at least one DJ."),
  })
  .superRefine((val, ctx) => {
    if (val.recurrence === "CUSTOM" && val.customDays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["customDays"], message: "Pick at least one day." });
    }
    if (val.start && val.end && val.start >= val.end) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End time must be after start time." });
    }
  });

type FormValues = z.infer<typeof schema>;

function cadenceFromForm(values: FormValues): Cadence {
  const days =
    values.recurrence === "MWF" ? MWF : values.recurrence === "DAILY" ? ALL_DAYS : values.customDays;
  return { kind: "WEEKLY", days, start: values.start, end: values.end };
}

interface ShowFormDialogProps {
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
  const initial = recurrenceFromCadence(show?.cadence);
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
      recurrence: isEdit ? initial.recurrence : prefillDay ? "CUSTOM" : "MWF",
      customDays: isEdit ? initial.customDays : prefillDay ? [prefillDay] : [],
      start: show?.cadence.start ?? prefillStart ?? "13:00",
      end: show?.cadence.end ?? prefillEnd ?? "16:00",
      rosterIds: show?.roster.map((r) => r.id) ?? [],
    },
  });

  const recurrence = watch("recurrence");
  const customDays = watch("customDays");
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
      const body = {
        name: values.name.trim(),
        cadence: cadenceFromForm(values),
        rosterIds: values.rosterIds,
      };
      if (isEdit && show) {
        return showsControllerUpdate(show.id, { body: JSON.stringify(body) }) as unknown as Promise<ShowDto>;
      }
      return showsControllerCreate({ body: JSON.stringify(body) }) as unknown as Promise<ShowDto>;
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
  });

  const alertMessage =
    errors.name?.message ??
    errors.customDays?.message ??
    errors.start?.message ??
    errors.end?.message ??
    errors.rosterIds?.message ??
    (saveMutation.isError ? getApiErrorMessage(saveMutation.error) : null) ??
    (deleteMutation.isError ? getApiErrorMessage(deleteMutation.error) : null);

  const busy = isSubmitting || saveMutation.isPending;

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

  function toggleCustomDay(day: Weekday, checked: boolean) {
    const next = checked ? [...customDays, day] : customDays.filter((d) => d !== day);
    setValue("customDays", next, { shouldValidate: true });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
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

            <Label htmlFor="show-recurrence">Recurrence</Label>
            <Controller
              control={control}
              name="recurrence"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                  <SelectTrigger id="show-recurrence" className="mb-3" data-testid="show-recurrence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MWF">Mon-Wed-Fri</SelectItem>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />

            {recurrence === "CUSTOM" && (
              <div className="mb-3">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {ALL_DAYS.map((day) => (
                    <label
                      key={day}
                      className="flex items-center gap-1.5 text-sm"
                      htmlFor={`show-day-${day.toLowerCase()}`}
                    >
                      <Checkbox
                        id={`show-day-${day.toLowerCase()}`}
                        data-testid={`show-day-${day.toLowerCase()}`}
                        checked={customDays.includes(day)}
                        onCheckedChange={(checked) => toggleCustomDay(day, checked === true)}
                        disabled={busy}
                      />
                      {DAY_LABEL[day]}
                    </label>
                  ))}
                </div>
              </div>
            )}

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
                {busy ? "Saving…" : "Save"}
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
