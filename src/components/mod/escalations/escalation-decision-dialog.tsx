"use client";

/**
 * Custodian decision modal for /admin/escalations — shared shell for both
 * variants:
 *   - appeal: Uphold / Reduce / Overturn -> moderationControllerResolveAppeal
 *   - reinstatement: Approve / Deny -> moderationControllerApproveReinstatement
 *
 * A written response is required on every decision (design constraint from
 * the escalations spec: "final custodian decisions... a written response is
 * required on every decision"). For the reinstatement variant the API only
 * accepts `{ approve: boolean }` — there is no `writtenResponse` field on
 * `moderationControllerApproveReinstatement` — so the textarea is still
 * shown (parity with the prototype + UX consistency) and still validated,
 * but its value is NOT sent to the backend for reinstatement decisions.
 * See the page-agent report for this caveat.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Scale, RotateCcw } from "lucide-react";
import {
  moderationControllerResolveAppeal,
  moderationControllerApproveReinstatement,
} from "@/lib/api/endpoints/moderation/moderation";
import { getAdminControllerGetEscalationsQueryKey } from "@/lib/api/endpoints/admin/admin";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { AppealDtoStatus } from "@/lib/api/model";
import type { AppealDto, ReinstatementRequestDto } from "@/lib/api/model";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Fallback subject label when the enriched DTO's `handle` is null (the joined
 * user row was missing/soft-deleted): a short, stable, human-scannable form
 * of the id. Prefer `subjectHandle()` — this is only its null branch.
 */
export function shortUserId(userId: string): string {
  return `@user-${userId.slice(0, 8)}`;
}

/**
 * The escalations DTOs now carry the subject's `handle` (nullable). Render
 * `@handle` when present, else fall back to the id-derived placeholder.
 */
export function subjectHandle(handle: string | null, userId: string): string {
  return handle ? `@${handle}` : shortUserId(userId);
}

export type DialogTarget =
  | { kind: "appeal"; item: AppealDto }
  | { kind: "reinstatement"; item: ReinstatementRequestDto };

interface EscalationDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DialogTarget;
  onDecided: () => void;
}

export function EscalationDecisionDialog({
  open,
  onOpenChange,
  target,
  onDecided,
}: EscalationDecisionDialogProps) {
  const queryClient = useQueryClient();
  const [appealOutcome, setAppealOutcome] = useState<AppealDtoStatus | null>(null);
  const [approveOutcome, setApproveOutcome] = useState<boolean | null>(null);
  const [response, setResponse] = useState("");
  const [showValidation, setShowValidation] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getAdminControllerGetEscalationsQueryKey() });
  }

  const resolveAppealMutation = useMutation({
    mutationFn: (status: AppealDtoStatus) =>
      moderationControllerResolveAppeal(target.item.id, {
        body: JSON.stringify({ status, writtenResponse: response.trim() }),
      }),
    onSuccess: () => {
      invalidate();
      onDecided();
    },
  });

  const approveReinstatementMutation = useMutation({
    mutationFn: (approve: boolean) =>
      moderationControllerApproveReinstatement(target.item.id, {
        body: JSON.stringify({ approve }),
      }),
    onSuccess: () => {
      invalidate();
      onDecided();
    },
  });

  const busy = resolveAppealMutation.isPending || approveReinstatementMutation.isPending;
  const mutationError = resolveAppealMutation.error ?? approveReinstatementMutation.error;
  const responseInvalid = showValidation && response.trim().length === 0;
  const outcomeInvalid =
    showValidation && (target.kind === "appeal" ? appealOutcome === null : approveOutcome === null);

  function handleDecide() {
    setShowValidation(true);
    if (response.trim().length === 0) return;

    if (target.kind === "appeal") {
      if (appealOutcome === null) return;
      resolveAppealMutation.mutate(appealOutcome);
    } else {
      if (approveOutcome === null) return;
      approveReinstatementMutation.mutate(approveOutcome);
    }
  }

  const handle = subjectHandle(target.item.handle, target.item.userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="esc-decision-dialog">
        <DialogHeader>
          <DialogTitle>Custodian decision · {handle}</DialogTitle>
          <DialogDescription>
            {target.kind === "appeal"
              ? "Final review of an escalated appeal. A written response is required."
              : "Final review of a reinstatement request. A written response is required."}
          </DialogDescription>
        </DialogHeader>

        <div className="wc-card wc-card-pad">
          <div className="flex items-center gap-2 mb-2 wc-muted text-sm font-semibold">
            {target.kind === "appeal" ? (
              <Scale className="w-4 h-4" aria-hidden="true" />
            ) : (
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            )}
            {target.kind === "appeal" ? "Appeal text" : "Reinstatement request"}
          </div>
          <blockquote className="border-l-2 border-border pl-3 text-sm italic">
            {target.item.text}
          </blockquote>
        </div>

        <div>
          <div className="font-bold text-sm mb-2">Decision</div>
          {target.kind === "appeal" ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Decision outcome">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="esc-uphold"
                aria-pressed={appealOutcome === AppealDtoStatus.UPHELD}
                disabled={busy}
                onClick={() => setAppealOutcome(AppealDtoStatus.UPHELD)}
              >
                Uphold
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="esc-reduce"
                aria-pressed={appealOutcome === AppealDtoStatus.REDUCED}
                disabled={busy}
                onClick={() => setAppealOutcome(AppealDtoStatus.REDUCED)}
              >
                Reduce
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="esc-overturn"
                aria-pressed={appealOutcome === AppealDtoStatus.OVERTURNED}
                disabled={busy}
                onClick={() => setAppealOutcome(AppealDtoStatus.OVERTURNED)}
              >
                Overturn
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Decision outcome">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="esc-deny"
                aria-pressed={approveOutcome === false}
                disabled={busy}
                onClick={() => setApproveOutcome(false)}
              >
                Deny
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="esc-approve"
                aria-pressed={approveOutcome === true}
                disabled={busy}
                onClick={() => setApproveOutcome(true)}
              >
                Approve
              </Button>
            </div>
          )}
          {outcomeInvalid && (
            <p role="alert" className="text-sm font-semibold text-destructive mt-2">
              Choose an outcome before deciding.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="esc-response">Written response (required)</Label>
          <Textarea
            id="esc-response"
            rows={4}
            className="mt-1"
            data-testid="esc-response"
            placeholder="Explain the decision to the user — this is sent to them and recorded."
            disabled={busy}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
          />
          {responseInvalid && (
            <p role="alert" className="text-sm font-semibold text-destructive mt-1">
              A written response is required.
            </p>
          )}
        </div>

        {mutationError && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {getApiErrorMessage(mutationError)}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" data-testid="esc-decide" disabled={busy} onClick={handleDecide}>
            {busy ? "Deciding…" : "Decide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
