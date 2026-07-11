"use client";

/**
 * "Time in a sub / guest DJ" dialog — 1:1 with
 * docs/frontend-design-basis-prototype/studio/studio-attendance.html #mSub.
 * Searches the active roster (`GET /api/studio/roster`) client-side (the
 * list is small — active DJs only) and times in whichever entry is picked,
 * regardless of whether they're on the current slot's roster.
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useListStudioRoster, timeInStudio } from "@/lib/api/endpoints/studio/studio";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { StudioRosterEntryDto } from "@/lib/studio/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MONO_CLASSES = ["wc-mono-1", "wc-mono-2", "wc-mono-3", "wc-mono-4", "wc-mono-5", "wc-mono-6"];

function monoClassFor(index: number): string {
  return MONO_CLASSES[index % MONO_CLASSES.length];
}

interface SubTimeInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTimedIn: (displayName: string) => void;
}

export function SubTimeInDialog({ open, onOpenChange, onTimedIn }: SubTimeInDialogProps) {
  const [search, setSearch] = useState("");

  const rosterQuery = useListStudioRoster<StudioRosterEntryDto[]>();
  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((r) => r.displayName.toLowerCase().includes(q));
  }, [roster, search]);

  const timeInMutation = useMutation({
    mutationFn: (rosterId: string) => timeInStudio({ body: JSON.stringify({ rosterId }) }),
  });

  function handlePick(entry: StudioRosterEntryDto) {
    timeInMutation.mutate(entry.id, {
      onSuccess: () => {
        onTimedIn(entry.displayName);
        setSearch("");
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-gold" aria-hidden="true" />
            Time in a sub / guest DJ
          </DialogTitle>
          <DialogDescription>
            Search the roster for a substitute or guest DJ covering this slot.
          </DialogDescription>
        </DialogHeader>

        {timeInMutation.isError && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {getApiErrorMessage(timeInMutation.error)}
          </div>
        )}

        <div>
          <Label htmlFor="studio-timein-sub-search">Search roster</Label>
          <Input
            id="studio-timein-sub-search"
            className="mt-1"
            placeholder="Name or DJ handle…"
            data-testid="studio-timein-sub-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="wc-stack mt-3 max-h-64 overflow-y-auto">
          {rosterQuery.isLoading ? (
            <p className="wc-muted text-sm">Loading roster…</p>
          ) : filtered.length === 0 ? (
            <p className="wc-muted text-sm">No matching DJs.</p>
          ) : (
            filtered.map((entry, index) => (
              <Button
                key={entry.id}
                type="button"
                variant="outline"
                className="wc-btn-block justify-start"
                data-testid="studio-timein-sub-option"
                disabled={timeInMutation.isPending}
                onClick={() => handlePick(entry)}
              >
                <span className={`wc-mono ${monoClassFor(index)} h-8 w-8 flex-none text-xs`}>
                  {entry.displayName.charAt(0).toUpperCase()}
                </span>
                {entry.displayName}
              </Button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
