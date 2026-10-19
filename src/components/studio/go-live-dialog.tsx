"use client";

/**
 * FE#132 F2 — "Start my show" / "Go live now" / "Start next show" end whatever
 * is on air right now, so they say so first. Focus starts on Cancel.
 */
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatOnFor } from "@/lib/studio/show-transition";

export interface GoLiveRequest {
  incoming: string;
  /** The show on air now, with who is on it; null when nothing is on air. */
  outgoing: { showName: string; djs: Array<{ displayName: string; timeIn: string | null }> } | null;
  continuingCrew: boolean;
}

interface GoLiveDialogProps {
  request: GoLiveRequest | null;
  now: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function GoLiveDialog({ request: incoming, now, pending, onConfirm, onCancel }: GoLiveDialogProps) {
  // Keep rendering the last request while the dialog animates closed.
  const [request, setRequest] = useState(incoming);
  if (incoming && incoming !== request) setRequest(incoming);
  const outgoing = request?.outgoing ?? null;
  const longest = outgoing?.djs.map((dj) => dj.timeIn).filter((t): t is string => !!t).sort()[0];
  return (
    <AlertDialog open={!!incoming} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent data-testid="studio-go-live-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Start {request?.incoming} now?</AlertDialogTitle>
          <AlertDialogDescription data-testid="studio-go-live-summary">
            {outgoing
              ? `This ends ${outgoing.showName} (${outgoing.djs.map((dj) => dj.displayName).join(", ") || "no DJs"}${
                  longest ? `, ${formatOnFor(longest, now)}` : ""
                }).${request?.continuingCrew ? " Everyone on air stays on for the next show." : ""}`
              : `Nothing is on air — ${request?.incoming} starts now.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="studio-go-live-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="studio-go-live-confirm"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Starting…" : outgoing ? `End ${outgoing.showName} & go live` : "Go live"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
