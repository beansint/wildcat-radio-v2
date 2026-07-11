"use client";

/**
 * /mod/roster — 1:1 from docs/frontend-design-basis-prototype/mod/roster.html
 *
 * DJ card grid (monogram, name, status pill, bio, Edit/Archive) + an
 * `mod-roster-add` primary CTA opening a Dialog form. Archive toggles
 * `isActive` via PATCH; archived cards render `opacity-60 grayscale` and are
 * hidden unless the `mod-roster-show-archived` switch is on.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import {
  useRosterControllerList,
  getRosterControllerListQueryKey,
  rosterControllerUpdate,
} from "@/lib/api/endpoints/roster/roster";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { RosterEntryDto } from "@/lib/mod/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RosterFormDialog } from "@/components/mod/roster-form-dialog";
import { ConfirmDialog } from "@/components/mod/confirm-dialog";

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; entry: RosterEntryDto };

const MONO_CLASSES = ["wc-mono-1", "wc-mono-2", "wc-mono-3", "wc-mono-4", "wc-mono-5", "wc-mono-6"];

function monoClassFor(index: number): string {
  return MONO_CLASSES[index % MONO_CLASSES.length];
}

export default function RosterPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({ mode: "closed" });
  const [archiveTarget, setArchiveTarget] = useState<RosterEntryDto | null>(null);

  const rosterQuery = useRosterControllerList<RosterEntryDto[]>({ includeArchived: true });
  const allEntries = rosterQuery.data ?? [];
  const visibleEntries = showArchived ? allEntries : allEntries.filter((e) => e.isActive);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getRosterControllerListQueryKey() });
  }

  const archiveMutation = useMutation({
    mutationFn: (target: RosterEntryDto) =>
      rosterControllerUpdate(target.id, {
        body: JSON.stringify({ isActive: !target.isActive }),
      }) as unknown as Promise<RosterEntryDto>,
    onSuccess: () => {
      invalidate();
      setArchiveTarget(null);
    },
  });

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold">DJ roster</h1>
          <p className="wc-muted">
            The on-air talent shown on the public site. Roster entries are data, not accounts — adds
            &amp; edits are audit-logged.
          </p>
        </div>
        <Button data-testid="mod-roster-add" onClick={() => setDialogState({ mode: "create" })}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add DJ
        </Button>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <Switch
          id="roster-show-archived"
          data-testid="mod-roster-show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
        <Label htmlFor="roster-show-archived">Show archived</Label>
      </div>

      {archiveMutation.isError && (
        <div role="alert" className="mb-4 text-sm font-semibold text-destructive">
          {getApiErrorMessage(archiveMutation.error)}
        </div>
      )}

      {rosterQuery.isLoading ? (
        <p className="wc-muted">Loading roster…</p>
      ) : visibleEntries.length === 0 ? (
        <div className="wc-card wc-card-pad text-center wc-muted" data-testid="mod-roster-empty">
          No DJs yet — add the first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleEntries.map((entry, index) => (
            <article
              key={entry.id}
              data-testid="mod-roster-card"
              className={`wc-card wc-card-pad ${entry.isActive ? "" : "opacity-60 grayscale"}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className={`wc-mono ${monoClassFor(index)} h-12 w-12 flex-none text-lg`}>
                  {entry.displayName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-bold truncate">{entry.displayName}</div>
                  <span className={`wc-pill mt-1 ${entry.isActive ? "wc-pill-ok" : "wc-pill-neutral"}`}>
                    {entry.isActive ? "Active" : "Archived"}
                  </span>
                </div>
              </div>
              {entry.bio && <p className="wc-muted text-sm truncate">{entry.bio}</p>}
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="mod-roster-edit"
                  aria-label={`Edit ${entry.displayName}`}
                  onClick={() => setDialogState({ mode: "edit", entry })}
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="mod-roster-archive"
                  onClick={() => setArchiveTarget(entry)}
                >
                  {entry.isActive ? "Archive" : "Restore"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {dialogState.mode !== "closed" && (
        <RosterFormDialog
          key={dialogState.mode === "edit" ? dialogState.entry.id : "new"}
          open
          entry={dialogState.mode === "edit" ? dialogState.entry : null}
          onOpenChange={(open) => {
            if (!open) setDialogState({ mode: "closed" });
          }}
          onSaved={() => {
            invalidate();
            setDialogState({ mode: "closed" });
          }}
        />
      )}

      {archiveTarget && (
        <ConfirmDialog
          open
          title={archiveTarget.isActive ? "Archive DJ" : "Restore DJ"}
          description={
            archiveTarget.isActive
              ? `Archive ${archiveTarget.displayName}? Their card will be hidden from the public roster until restored.`
              : `Restore ${archiveTarget.displayName} to the active roster?`
          }
          confirmLabel={archiveTarget.isActive ? "Archive" : "Restore"}
          pending={archiveMutation.isPending}
          destructive={archiveTarget.isActive}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
          onConfirm={() => archiveMutation.mutate(archiveTarget)}
          testid="mod-roster-archive-confirm"
        />
      )}
    </div>
  );
}
