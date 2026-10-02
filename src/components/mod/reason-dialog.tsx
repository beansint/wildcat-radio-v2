"use client";

/**
 * Generic "confirm with a reason" dialog (#106 / FE#84) — overtime
 * approve/revoke and occurrence cancel/resume all need an audited,
 * staff-entered reason. Same shadcn Dialog + react-hook-form + zod shape as
 * `attendance-edit-dialog.tsx`, with one alert region for validation and
 * server errors.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Required (default) or optional reason. */
  reasonRequired?: boolean;
  placeholder?: string;
  destructive?: boolean;
  testid: string;
  onConfirm: (reason: string) => Promise<unknown>;
  /** Awaited before the dialog stops showing "Saving…" — return the refetch promise. */
  onDone: () => unknown;
}

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  reasonRequired = true,
  placeholder,
  destructive,
  testid,
  onConfirm,
  onDone,
}: ReasonDialogProps) {
  // Opened from row state, not a <Dialog.Trigger>, so Radix has no trigger to
  // refocus on close and would drop focus to <body> (same fix as
  // mod/announcements/review-dialog.tsx). Captured once, on mount.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
  );
  const schema = z.object({
    reason: reasonRequired
      ? z.string().trim().min(1, "Add a reason — it goes in the audit log.").max(500, "Keep it under 500 characters.")
      : z.string().trim().max(500, "Keep it under 500 characters."),
  });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => onConfirm(values.reason.trim()),
    onSuccess: () => onDone(),
  });

  const alertMessage = errors.reason?.message ?? (mutation.isError ? getApiErrorMessage(mutation.error) : null);
  const busy = isSubmitting || mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testid}
        onCloseAutoFocus={(event) => {
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <div className="wc-muted text-sm">{description}</div>}

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive" data-testid={`${testid}-alert`}>
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <Label htmlFor={`${testid}-reason`}>Reason{reasonRequired ? "" : " (optional)"}</Label>
          <Textarea
            id={`${testid}-reason`}
            rows={3}
            className="mb-4"
            placeholder={placeholder}
            data-testid={`${testid}-reason`}
            aria-invalid={!!errors.reason}
            disabled={busy}
            {...register("reason")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid={`${testid}-cancel`}>
              Back
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
              data-testid={`${testid}-confirm`}
            >
              {busy ? "Saving…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
