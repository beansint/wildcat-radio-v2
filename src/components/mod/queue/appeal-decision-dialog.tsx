"use client";

/**
 * Small modal used by /mod/queue's appeal cards. Prototype rule: "A written
 * response is required on every appeal decision." The card's Uphold/Reduce/
 * Overturn buttons each preset `status` and open this dialog; it only owns
 * the `writtenResponse` textarea + the required-field validation, matching
 * the mounted-only-while-open pattern used by StrikeDialog/RosterFormDialog
 * (fresh state per open, no manual reset plumbing).
 */
import { useState, type FormEvent } from "react";
import { AppealDtoStatus } from "@/lib/api/model";
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

const STATUS_LABEL: Record<AppealDtoStatus, string> = {
  [AppealDtoStatus.OPEN]: "Open",
  [AppealDtoStatus.UPHELD]: "Uphold",
  [AppealDtoStatus.REDUCED]: "Reduce",
  [AppealDtoStatus.OVERTURNED]: "Overturn",
};

export interface AppealDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which decision the triggering button picked; drives the title + submit label. */
  status: AppealDtoStatus;
  /** `@handle` (or id fallback) of the appealing user, shown in the title. */
  subjectHandle: string;
  onSubmit: (writtenResponse: string) => void;
  pending?: boolean;
  /** Server-side error surfaced from the page's mutation. */
  error?: string | null;
}

export function AppealDecisionDialog({
  open,
  onOpenChange,
  status,
  subjectHandle,
  onSubmit,
  pending,
  error,
}: AppealDecisionDialogProps) {
  const [writtenResponse, setWrittenResponse] = useState("");
  const [touched, setTouched] = useState(false);

  const trimmed = writtenResponse.trim();
  const fieldError = touched && trimmed.length === 0 ? "A written response is required." : null;
  const alertMessage = fieldError ?? error ?? null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="mod-queue-appeal-dialog">
        <DialogHeader>
          <DialogTitle>
            {STATUS_LABEL[status]} appeal · @{subjectHandle}
          </DialogTitle>
          <DialogDescription>
            A written response is required on every appeal decision.
          </DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Label htmlFor="mod-queue-appeal-response">Written response</Label>
          <Textarea
            id="mod-queue-appeal-response"
            rows={4}
            className="mb-3"
            placeholder="Explain the decision to the appealing user."
            data-testid="mod-queue-appeal-response"
            disabled={pending}
            value={writtenResponse}
            onChange={(e) => setWrittenResponse(e.target.value)}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="mod-queue-appeal-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={status === AppealDtoStatus.UPHELD ? "destructive" : "default"}
              disabled={pending}
              data-testid="mod-queue-appeal-submit"
            >
              {pending ? "Working…" : STATUS_LABEL[status]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
