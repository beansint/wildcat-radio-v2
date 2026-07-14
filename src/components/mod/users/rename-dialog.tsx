"use client";

/**
 * /mod/users "Force-rename" dialog — a small standalone form (not the shared
 * StrikeDialog/ConfirmDialog) that PATCHes a user's handle via
 * `usersControllerForceRename`. Owns its own mutation (mirrors
 * `AttendanceEditDialog`'s pattern: mounted only while `open`, so a fresh
 * `useForm` on every open needs no manual reset-on-close plumbing).
 *
 * The backend runs the new handle through the content filter — a rejected
 * handle 400s, and that message is surfaced verbatim in the `role="alert"`
 * region below rather than a generic "Something went wrong."
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { usersControllerForceRename } from "@/lib/api/endpoints/users/users";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { UserSummaryDto } from "@/lib/api/model";
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

const schema = z.object({
  handle: z
    .string()
    .trim()
    .min(2, "Handle must be at least 2 characters.")
    .max(32, "Keep it under 32 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, and underscores only."),
});

type FormValues = z.infer<typeof schema>;

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserSummaryDto;
  onRenamed: () => void;
}

export function RenameDialog({ open, onOpenChange, user, onRenamed }: RenameDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { handle: user.handle },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      usersControllerForceRename(user.id, { body: JSON.stringify({ handle: values.handle }) }),
    onSuccess: () => onRenamed(),
  });

  const busy = isSubmitting || mutation.isPending;
  const alertMessage =
    errors.handle?.message ?? (mutation.isError ? getApiErrorMessage(mutation.error) : null);

  function onSubmit(values: FormValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="mod-users-rename-dialog">
        <DialogHeader>
          <DialogTitle>Force-rename · @{user.handle}</DialogTitle>
          <DialogDescription>
            Sets a new handle for this user. Runs through the content filter — audit-logged either way.
          </DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <Label htmlFor="mod-users-rename-input">New handle</Label>
          <Input
            id="mod-users-rename-input"
            data-testid="mod-users-rename-input"
            disabled={busy}
            {...register("handle")}
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} data-testid="mod-users-rename-confirm">
              {busy ? "Working…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
