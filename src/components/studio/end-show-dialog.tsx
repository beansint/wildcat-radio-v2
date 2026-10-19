"use client";

/**
 * FE#132 F1 — the last on-air DJ is about to end the show. Built from the
 * API's 409 CONFIRM_END_REQUIRED preview, so it names the show that is really
 * ending and who is really waiting, even if the kiosk's picture is stale.
 * Focus starts on "Keep broadcasting"; Escape keeps the show on air.
 */
import { Check, Radio } from "lucide-react";
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
import type { ConfirmEndPreviewDto, StudioNextUpDto } from "@/lib/api/model";
import { formatOnFor, stationClock } from "@/lib/studio/show-transition";

interface EndShowDialogProps {
  request: { preview: ConfirmEndPreviewDto; displayName: string } | null;
  /** The next scheduled show when nobody has checked in for it yet. */
  upcoming: StudioNextUpDto | null;
  now: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EndShowDialog({ request: incoming, upcoming, now, pending, onConfirm, onCancel }: EndShowDialogProps) {
  // Keep rendering the last request while the dialog animates closed, so the
  // exit frame never falls back to blank copy.
  const [request, setRequest] = useState(incoming);
  if (incoming && incoming !== request) setRequest(incoming);
  const preview = request?.preview;
  const showName = preview?.showName ?? "this ad-hoc episode";
  const next = preview?.nextUp ?? null;
  return (
    <AlertDialog open={!!incoming} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent data-testid="studio-end-show-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>End {showName}?</AlertDialogTitle>
          <AlertDialogDescription>
            {request?.displayName} is the last DJ on air
            {preview?.startedAt ? ` (${formatOnFor(preview.startedAt, now).replace(/^on /, "on for ")})` : ""}.
            Timing out ends the show.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {next ? (
          <div className="rounded-xl p-3" style={{ background: "var(--accent)" }} data-testid="studio-end-show-next">
            <div className="text-xs font-bold uppercase wc-muted">Goes live next</div>
            <div className="font-extrabold">{next.showName}</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {next.djs.map((dj) => (
                <li key={dj.rosterId} className={`wc-pill ${dj.checkedIn ? "wc-pill-ok" : "wc-pill-neutral"}`}>
                  {dj.checkedIn && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {dj.displayName} · {dj.checkedIn ? "here" : "not here"}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl p-3 text-sm" style={{ background: "var(--muted)" }} data-testid="studio-end-show-rotation">
            <div className="flex items-center gap-2 font-bold">
              <Radio className="h-4 w-4 text-gold" aria-hidden="true" />
              Nobody is waiting — the station plays rotation.
            </div>
            {upcoming && (
              <div className="mt-1 wc-muted">
                Next on the schedule: {upcoming.showName} at {stationClock(upcoming.effectiveStart)} (nobody checked in yet).
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel data-testid="studio-end-show-cancel">Keep broadcasting</AlertDialogCancel>
          <AlertDialogAction
            data-testid="studio-end-show-confirm"
            className="wc-btn-maroon"
            disabled={pending}
            onClick={(event) => {
              // Stay open until the request settles; the panel closes it.
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? "Ending…" : next ? "End show & hand over" : "End show"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
