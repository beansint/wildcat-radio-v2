"use client";

/**
 * "Promote moderator" dialog for /admin/staff (BEA-184,
 * staff.html:190-208). Cloned in shape from `@/components/mod/strike-dialog`
 * — react-hook-form + zodResolver, mounted only while `open` (fresh
 * defaults every open), and a single `role="alert"` region combining field
 * errors AND the server error (AGENTS.md; the e2e suite asserts
 * `getByRole('alert')`).
 *
 * The page owns the `useAdminControllerPromote` mutation and passes it in as
 * `onSubmit`/`pending`/`error` — this component only owns the form. Deliberately
 * NOT `@/components/mod/confirm-dialog`: that dialog has no free-text field
 * (see `mod/users/page.tsx:140-145`), and promote needs both an email and a
 * required reason.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { promoteSchema, type PromoteFormValues } from "@/components/mod/admin/schemas";

export interface PromoteModeratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Page owns the mutation; this just forwards the validated, trimmed form values. */
  onSubmit: (values: PromoteFormValues) => void;
  pending?: boolean;
  /** Server-side error surfaced from the page's mutation (404 unknown email, 409 already a moderator, …). */
  error?: string | null;
}

export function PromoteModeratorDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  error,
}: PromoteModeratorDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PromoteFormValues>({
    resolver: zodResolver(promoteSchema),
    defaultValues: { email: "", reason: "" },
  });

  const busy = isSubmitting || pending;
  const alertMessage = errors.email?.message ?? errors.reason?.message ?? error ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="admin-staff-promote-dialog">
        <DialogHeader>
          <DialogTitle>Promote moderator</DialogTitle>
          <DialogDescription>
            Promoting grants moderation powers (warn / strike / mute / ban). Pick a verified campus user.
          </DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Label htmlFor="admin-staff-promote-email">User email</Label>
          <Input
            id="admin-staff-promote-email"
            type="email"
            className="mb-3"
            placeholder="firstname.lastname@cit.edu"
            data-testid="admin-staff-promote-email"
            disabled={busy}
            {...register("email")}
          />

          <Label htmlFor="admin-staff-promote-reason">Reason (required)</Label>
          <Textarea
            id="admin-staff-promote-reason"
            rows={2}
            className="mb-4"
            placeholder="Elected by the org for AY 2026–2027"
            data-testid="admin-staff-promote-reason"
            disabled={busy}
            {...register("reason")}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="admin-staff-promote-cancel"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="admin-staff-promote-confirm">
              {busy ? "Working…" : "Promote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
