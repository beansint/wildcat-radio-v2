"use client";

/**
 * Shared "Issue strike / Strikes" modal, used by BOTH /mod/queue (issue a
 * strike off a report/appeal) and /mod/users (manage a user's existing
 * strikes). The page owns the mutation (`useModerationControllerStrike`)
 * and passes it in as `onSubmit` — this component only owns the form.
 *
 * Mounted only while `open` is true (page keeps it out of the tree when
 * closed), so each open gets a fresh `useForm` with clean defaults — no
 * manual reset-on-close plumbing needed (matches
 * `@/components/mod/roster-form-dialog`).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { StrikeDtoLevel, type StrikeDto } from "@/lib/api/model";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StatusPill } from "@/components/mod/status-pill";

const schema = z
  .object({
    reason: z.string().trim().min(1, "Add a reason.").max(2000, "Keep it under 2000 characters."),
    severityOverride: z.boolean(),
    overrideReason: z.string().trim().max(2000, "Keep it under 2000 characters.").optional(),
  })
  .refine((v) => !v.severityOverride || !!v.overrideReason && v.overrideReason.length > 0, {
    message: "Add a reason for the severity override.",
    path: ["overrideReason"],
  });

export type StrikeDialogValues = z.infer<typeof schema>;

export interface StrikeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target user's @handle, shown in the title. */
  userHandle: string;
  /** 'issue' = fresh strike off a report/appeal; 'manage' = the user's strike history. */
  mode: "issue" | "manage";
  /** Only used in 'manage' mode — the user's existing strike history. */
  existingStrikes?: StrikeDto[];
  /** Page owns the mutation; this just forwards the validated form values. */
  onSubmit: (values: StrikeDialogValues) => void;
  pending?: boolean;
  /** Server-side error surfaced from the page's mutation (e.g. 409 conflict). */
  error?: string | null;
}

const STRIKE_LEVEL_META: Record<StrikeDtoLevel, { label: string; variant: "warn" | "bad" }> = {
  [StrikeDtoLevel.NUMBER_1]: { label: "1st — 24h mute", variant: "warn" },
  [StrikeDtoLevel.NUMBER_2]: { label: "2nd — 7-day mute", variant: "warn" },
  [StrikeDtoLevel.NUMBER_3]: { label: "3rd — ban", variant: "bad" },
};

export function StrikeDialog({
  open,
  onOpenChange,
  userHandle,
  mode,
  existingStrikes,
  onSubmit,
  pending,
  error,
}: StrikeDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StrikeDialogValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", severityOverride: false, overrideReason: "" },
  });

  const severityOverride = watch("severityOverride");
  const busy = isSubmitting || pending;

  const alertMessage =
    errors.reason?.message ?? errors.overrideReason?.message ?? error ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="mod-strike-dialog">
        <DialogHeader>
          <DialogTitle>
            {mode === "issue" ? `Issue strike · @${userHandle}` : `Strikes · @${userHandle}`}
          </DialogTitle>
          <DialogDescription>
            Strike ladder: 1 → 24h mute, 2 → 7-day mute, 3 → ban.
          </DialogDescription>
        </DialogHeader>

        {mode === "manage" && (
          <div className="wc-stack" data-testid="mod-strike-history">
            {!existingStrikes || existingStrikes.length === 0 ? (
              <p className="wc-muted text-sm">No strikes on record.</p>
            ) : (
              existingStrikes.map((strike) => {
                const meta = STRIKE_LEVEL_META[strike.level] ?? {
                  label: `Level ${strike.level}`,
                  variant: "bad" as const,
                };
                return (
                  <div key={strike.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{strike.reason}</p>
                      <p className="wc-help mt-0">Expires {strike.expiresAt}</p>
                    </div>
                    <StatusPill variant={meta.variant}>{meta.label}</StatusPill>
                  </div>
                );
              })
            )}
          </div>
        )}

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Label htmlFor="mod-strike-reason">Reason</Label>
          <Textarea
            id="mod-strike-reason"
            rows={3}
            className="mb-3"
            placeholder="Explain what the user did and why it warrants a strike."
            data-testid="mod-strike-reason"
            disabled={busy}
            {...register("reason")}
          />

          <label className="flex items-start gap-3 mb-3">
            <Controller
              control={control}
              name="severityOverride"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={busy}
                  data-testid="mod-strike-override"
                  aria-label="Severity override"
                />
              )}
            />
            <span className="text-sm">
              <span className="font-semibold block">Severity override</span>
              <span className="wc-help mt-0 block">
                Egregious — skips the ladder straight to a ban and notifies the custodian.
              </span>
            </span>
          </label>

          {severityOverride && (
            <>
              <Label htmlFor="mod-strike-override-reason">Override reason</Label>
              <Textarea
                id="mod-strike-override-reason"
                rows={2}
                className="mb-3"
                placeholder="Required — why does this skip the ladder?"
                data-testid="mod-strike-override-reason"
                disabled={busy}
                {...register("overrideReason")}
              />
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="mod-strike-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy}
              data-testid="mod-strike-confirm"
            >
              {busy ? "Working…" : mode === "issue" ? "Issue strike" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
