"use client";

/**
 * Review dialog — PENDING_REVIEW -> PUBLISHED | SCHEDULED | REJECTED.
 *
 * Both controls use the shadcn primitives per AGENTS.md — a hand-written
 * native `<select>`/`<input>` is prohibited in new code. An earlier version
 * kept a native `<select>` so the e2e spec could drive it with Playwright's
 * `.selectOption()`; that shaped the product to fit the test. The Radix
 * select is perfectly drivable by click, which is also what a real moderator
 * does, so the spec clicks instead.
 *
 * Exactly one `role="alert"` region (conventions/07 §3 / INV-2) carries
 * both client-side validation (empty reject reason, past schedule) and the
 * server's mutation error (e.g. a 409 from a stale transition).
 */
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateScheduledFor, validateRejectionReason } from "@/lib/announcements/errors";

export type ReviewDecision = "PUBLISH" | "SCHEDULE" | "REJECT";

export interface ReviewSubmitValues {
  decision: ReviewDecision;
  scheduledFor?: string;
  rejectionReason?: string;
}

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (values: ReviewSubmitValues) => void;
  pending?: boolean;
  error?: string | null;
}

export function ReviewDialog({ open, onOpenChange, title, onSubmit, pending, error }: ReviewDialogProps) {
  const [decision, setDecision] = useState<ReviewDecision>("PUBLISH");
  const [scheduleInput, setScheduleInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Radix's own default `onCloseAutoFocus` (in DialogContentModal) only ever
  // refocuses `context.triggerRef` — the DOM node registered by a
  // `<Dialog.Trigger>`. This dialog is opened from row-level state
  // (`reviewTarget` in the page, mounted fresh per open) rather than a
  // `Dialog.Trigger`, so that ref is always null and Radix's default handler
  // silently no-ops, dropping focus to `<body>` on close — a real a11y
  // regression, not a flaky assertion. Captured via `useState`'s lazy
  // initializer (runs exactly once, on mount, before any effect — including
  // FocusScope's own mount effect that moves focus into the dialog's first
  // candidate) rather than a ref: this repo's lint config (react-hooks/refs)
  // forbids reading `ref.current` during render, even guarded.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
  );

  function handleConfirm() {
    setLocalError(null);

    if (decision === "SCHEDULE") {
      const iso = scheduleInput ? new Date(scheduleInput).toISOString() : "";
      const validation = validateScheduledFor(iso);
      if (!validation.ok) {
        setLocalError(validation.message);
        return;
      }
      onSubmit({ decision, scheduledFor: iso });
      return;
    }

    if (decision === "REJECT") {
      const validation = validateRejectionReason(reasonInput);
      if (!validation.ok) {
        setLocalError(validation.message);
        return;
      }
      onSubmit({ decision, rejectionReason: validation.value });
      return;
    }

    onSubmit({ decision: "PUBLISH" });
  }

  const alertMessage = localError ?? error ?? null;
  const busy = !!pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDecision("PUBLISH");
          setScheduleInput("");
          setReasonInput("");
          setLocalError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-testid="mod-ann-review-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Review · {title}</DialogTitle>
          <DialogDescription>
            Publish now, schedule for later, or reject with a reason the author will see.
          </DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <div>
          <Label htmlFor="mod-ann-review-decision">Decision</Label>
          <Select
            value={decision}
            disabled={busy}
            onValueChange={(next) => setDecision(next as ReviewDecision)}
          >
            <SelectTrigger id="mod-ann-review-decision" data-testid="mod-ann-review-decision">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PUBLISH">Publish now</SelectItem>
              <SelectItem value="SCHEDULE">Schedule for later</SelectItem>
              <SelectItem value="REJECT">Reject</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {decision === "SCHEDULE" && (
          <div className="mt-3">
            <Label htmlFor="mod-ann-review-schedule">Publish at</Label>
            <Input
              id="mod-ann-review-schedule"
              type="datetime-local"
              data-testid="mod-ann-review-schedule"
              value={scheduleInput}
              disabled={busy}
              onChange={(e) => setScheduleInput(e.target.value)}
            />
          </div>
        )}

        {decision === "REJECT" && (
          <div className="mt-3">
            <Label htmlFor="mod-ann-review-reason">Rejection reason</Label>
            <Textarea
              id="mod-ann-review-reason"
              rows={3}
              placeholder="Explain what needs to change before this can be resubmitted."
              data-testid="mod-ann-review-reason"
              value={reasonInput}
              disabled={busy}
              onChange={(e) => setReasonInput(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" data-testid="mod-ann-review-confirm" disabled={busy} onClick={handleConfirm}>
            {busy ? "Working…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
