"use client";

/**
 * /mod/schedule — 1:1 from docs/frontend-design-basis-prototype/mod/schedule.html
 *
 * Weekly Time x Day grid built from `GET /api/shows` (mod-only list, has full
 * cadence + roster ids needed for editing) via the pure `buildScheduleFromShows`
 * + `toDaypartGrid` pipeline (src/lib/schedule/grid.ts). A filled
 * `mod-schedule-cell` opens the show for editing; an empty cell opens the
 * add dialog prefilled with that day + time slot.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useShowsControllerList, getShowsControllerListQueryKey } from "@/lib/api/endpoints/shows/shows";
import { useRosterControllerList } from "@/lib/api/endpoints/roster/roster";
import type { ShowDto, RosterEntryDto } from "@/lib/mod/types";
import { buildScheduleFromShows, toDaypartGrid, WEEKDAYS } from "@/lib/schedule/grid";
import type { Weekday } from "@/lib/mod/types";
import { Button } from "@/components/ui/button";
import { ShowFormDialog } from "@/components/mod/show-form-dialog";

const DAY_HEADER: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; day?: Weekday; start?: string; end?: string }
  | { mode: "edit"; show: ShowDto };

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [dialogState, setDialogState] = useState<DialogState>({ mode: "closed" });

  const showsQuery = useShowsControllerList<ShowDto[]>();
  const rosterQuery = useRosterControllerList<RosterEntryDto[]>({ includeArchived: false });
  const roster = rosterQuery.data ?? [];
  const shows = useMemo(() => showsQuery.data ?? [], [showsQuery.data]);

  const grid = useMemo(() => toDaypartGrid(buildScheduleFromShows(shows)), [shows]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getShowsControllerListQueryKey() });
  }

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold">Shows &amp; schedule</h1>
          <p className="wc-muted">
            The weekly grid that drives the public &quot;what&apos;s on&quot; board. Every edit is
            audit-logged.
          </p>
        </div>
        <Button data-testid="mod-schedule-add" onClick={() => setDialogState({ mode: "create" })}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add show
        </Button>
      </header>

      <div className="wc-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="wc-table min-w-[860px]">
            <thead>
              <tr>
                <th className="w-24">Time</th>
                {WEEKDAYS.map((day) => (
                  <th key={day}>{DAY_HEADER[day]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center wc-muted py-8" data-testid="mod-schedule-empty">
                    No shows scheduled yet — add the first one.
                  </td>
                </tr>
              ) : (
                grid.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="tnum wc-muted font-semibold">{row.label}</td>
                    {WEEKDAYS.map((day) => {
                      const cell = row.cells[day];
                      if (!cell) {
                        return (
                          <td key={day} style={{ background: "var(--muted)" }} className="text-center wc-muted p-0">
                            <button
                              type="button"
                              className="w-full h-full py-3"
                              data-testid="mod-schedule-cell"
                              aria-label={`Add a show ${DAY_HEADER[day]} ${row.label}`}
                              onClick={() =>
                                setDialogState({ mode: "create", day, start: row.start, end: row.end })
                              }
                            >
                              —
                            </button>
                          </td>
                        );
                      }
                      const showEntity = shows.find((s) => s.id === cell.id);
                      return (
                        <td key={day} className="p-0">
                          <button
                            type="button"
                            className="block w-full text-left cursor-pointer hover:text-gold px-[.85rem] py-[.72rem]"
                            data-testid="mod-schedule-cell"
                            onClick={() => showEntity && setDialogState({ mode: "edit", show: showEntity })}
                          >
                            <span className="font-bold">{cell.name}</span>
                            <br />
                            <span className="wc-muted text-xs tnum">
                              {cell.start}–{cell.end}
                            </span>
                            <br />
                            <span className="text-xs">{cell.roster.join(", ") || "—"}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="wc-help mt-2">Tip: tap any show to edit, or an empty cell to drop a new one in.</p>

      {dialogState.mode !== "closed" && (
        <ShowFormDialog
          key={dialogState.mode === "edit" ? dialogState.show.id : "new"}
          open
          show={dialogState.mode === "edit" ? dialogState.show : null}
          roster={roster}
          prefillDay={dialogState.mode === "create" ? dialogState.day : undefined}
          prefillStart={dialogState.mode === "create" ? dialogState.start : undefined}
          prefillEnd={dialogState.mode === "create" ? dialogState.end : undefined}
          onOpenChange={(open) => {
            if (!open) setDialogState({ mode: "closed" });
          }}
          onSaved={() => {
            invalidate();
            setDialogState({ mode: "closed" });
          }}
          onDeleted={() => {
            invalidate();
            setDialogState({ mode: "closed" });
          }}
        />
      )}
    </div>
  );
}
