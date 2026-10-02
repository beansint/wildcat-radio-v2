"use client";

/**
 * Publish dialog — the author takes their own announcement live, now or at a
 * scheduled time. There is no second approver: whoever publishes is
 * responsible for the post, and the audit log records them as the publisher.
 * Replaces the old review dialog (PENDING_REVIEW -> PUBLISHED | SCHEDULED |
 * REJECTED), which made a post wait on a second moderator.
 *
 * Exactly one `role="alert"` region (conventions/07 §3 / INV-2) carries both
 * client-side validation (past schedule) and the server's mutation error.
 */
import { useState } from "react";
import { CalendarClock, Send } from "lucide-react";
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
import { validateScheduledFor } from "@/lib/announcements/errors";
import { cn } from "@/lib/utils";

export interface PublishSubmitValues {
  /** Omitted = publish now. */
  scheduledFor?: string;
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (values: PublishSubmitValues) => void;
  pending?: boolean;
  error?: string | null;
}

type When = "now" | "later";

const OPTIONS: { value: When; label: string; hint: string; Icon: typeof Send }[] = [
  { value: "now", label: "Publish now", hint: "Goes live on the public site immediately.", Icon: Send },
  { value: "later", label: "Schedule", hint: "Goes live automatically at the time you pick.", Icon: CalendarClock },
];

export function PublishDialog({ open, onOpenChange, title, onSubmit, pending, error }: PublishDialogProps) {
  const [when, setWhen] = useState<When>("now");
  const [scheduleInput, setScheduleInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Opened from row state, not a Dialog.Trigger, so Radix has no trigger to
  // restore focus to — capture the opener once on mount (see reason-dialog).
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
  );

  function handleConfirm() {
    setLocalError(null);
    if (when === "later") {
      const iso = scheduleInput ? new Date(scheduleInput).toISOString() : "";
      const validation = validateScheduledFor(iso);
      if (!validation.ok) {
        setLocalError(validation.message);
        return;
      }
      onSubmit({ scheduledFor: iso });
      return;
    }
    onSubmit({});
  }

  const alertMessage = localError ?? error ?? null;
  const busy = !!pending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setWhen("now");
          setScheduleInput("");
          setLocalError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-testid="mod-ann-publish-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Publish · {title}</DialogTitle>
          <DialogDescription>
            You&apos;re responsible for this post — no second approval is needed. Every publish is
            audit-logged under your name.
          </DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <div role="radiogroup" aria-label="When to publish" className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map(({ value, label, hint, Icon }) => {
            const selected = when === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                data-testid={`mod-ann-publish-${value}`}
                onClick={() => setWhen(value)}
                className={cn(
                  "flex min-h-11 items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon",
                  selected ? "border-ring bg-accent" : "border-border hover:bg-muted",
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4 flex-none", selected ? "text-foreground" : "text-muted-foreground")} aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {when === "later" && (
          <div>
            <Label htmlFor="mod-ann-publish-at">Publish at</Label>
            <Input
              id="mod-ann-publish-at"
              type="datetime-local"
              data-testid="mod-ann-publish-at"
              value={scheduleInput}
              disabled={busy}
              onChange={(e) => setScheduleInput(e.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" data-testid="mod-ann-publish-confirm" disabled={busy} onClick={handleConfirm}>
            {busy ? "Working…" : when === "later" ? "Schedule" : "Publish now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
