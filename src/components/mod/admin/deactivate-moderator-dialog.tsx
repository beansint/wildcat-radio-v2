"use client";

/**
 * "Deactivate moderator" dialog for /admin/staff (BEA-184,
 * staff.html:211-229). Same shape as `PromoteModeratorDialog` /
 * `@/components/mod/strike-dialog` — react-hook-form + zodResolver, mounted
 * only while `open`, single `role="alert"` region for field + server
 * errors. NOT `@/components/mod/confirm-dialog` — deactivate needs a
 * free-text required reason, which that dialog has no field for.
 *
 * Deactivate = demote to LISTENER (README § "Decided semantics" 1/2): the
 * prototype shows both a "Demote" and a "Deactivate" button per row, but
 * they're the same operation — the page only wires up one control.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
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
import { deactivateSchema, type DeactivateFormValues } from "@/components/mod/admin/schemas";

export interface DeactivateModeratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target moderator's display name, shown in the title. */
  targetName: string;
  /** Page owns the mutation; this just forwards the validated, trimmed form values. */
  onSubmit: (values: DeactivateFormValues) => void;
  pending?: boolean;
  /** Server-side error surfaced from the page's mutation. */
  error?: string | null;
}

export function DeactivateModeratorDialog({
  open,
  onOpenChange,
  targetName,
  onSubmit,
  pending,
  error,
}: DeactivateModeratorDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeactivateFormValues>({
    resolver: zodResolver(deactivateSchema),
    defaultValues: { reason: "" },
  });

  const busy = isSubmitting || pending;
  const alertMessage = errors.reason?.message ?? error ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="admin-staff-deactivate-dialog">
        <DialogHeader>
          <DialogTitle>Deactivate moderator</DialogTitle>
          <DialogDescription>{targetName}</DialogDescription>
        </DialogHeader>

        <div
          className="wc-card wc-card-pad mb-3 flex items-start gap-3"
          style={{ background: "color-mix(in srgb, var(--destructive) 10%, transparent)", borderColor: "var(--destructive)" }}
        >
          <AlertTriangle className="w-5 h-5 mt-0.5 text-destructive" aria-hidden="true" />
          <p className="text-sm">
            Deactivation <b>revokes all powers</b>; the account becomes a <b>LISTENER</b>. Re-promotion needs a new election.
          </p>
        </div>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Label htmlFor="admin-staff-deactivate-reason">Reason (required)</Label>
          <Textarea
            id="admin-staff-deactivate-reason"
            rows={2}
            className="mb-4"
            placeholder="Term ended / stepped down"
            data-testid="admin-staff-deactivate-reason"
            disabled={busy}
            {...register("reason")}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="admin-staff-deactivate-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy}
              data-testid="admin-staff-deactivate-confirm"
            >
              {busy ? "Working…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
