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
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useListShowsAdmin, getListShowsAdminQueryKey } from "@/lib/api/endpoints/shows/shows";
import { useRosterControllerList } from "@/lib/api/endpoints/roster/roster";
import type { ShowDto, RosterEntryDto } from "@/lib/api/model";
import { buildScheduleFromShows, toDaypartGrid, WEEKDAYS } from "@/lib/schedule/grid";
import type { Weekday, Cadence } from "@/lib/mod/types";
import type { ScheduleSourceShow } from "@/lib/schedule/grid";
import { Button } from "@/components/ui/button";
import { ShowFormDialog } from "@/components/mod/show-form-dialog";
import { OccurrencesPanel } from "@/components/mod/occurrences-panel";

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
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const addShowRef = useRef<HTMLButtonElement | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ mode: "closed" });

  const showsQuery = useListShowsAdmin<ShowDto[]>();
  const rosterQuery = useRosterControllerList<RosterEntryDto[]>({ includeArchived: false });
  const roster = rosterQuery.data ?? [];
  const shows = useMemo(() => showsQuery.data ?? [], [showsQuery.data]);

  const grid = useMemo(() => {
    // `ShowDto.cadence` comes back as `ShowDtoCadence` (an untyped object) —
    // the backend spec doesn't declare a discriminated union for cadence, so
    // orval generates a blob type. The runtime shape is `Cadence` 1:1 (see
    // `src/lib/mod/types.ts`), which is what `buildScheduleFromShows` needs.
    const sourceShows: ScheduleSourceShow[] = shows.map((s) => ({
      id: s.id,
      name: s.name,
      cadence: s.cadence as unknown as Cadence,
      roster: s.roster,
    }));
    return toDaypartGrid(buildScheduleFromShows(sourceShows));
  }, [shows]);

  const conflicts = useMemo(() => WEEKDAYS.flatMap(day => {
    const cells = grid.rows.map(row => row.cells[day]).filter(cell => cell !== null);
    return cells.flatMap((cell, index) => cells.slice(index + 1)
      .filter(other => cell.start < other.end && other.start < cell.end)
      .map(other => `${DAY_HEADER[day]}: ${cell.name} and ${other.name}`));
  }), [grid]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getListShowsAdminQueryKey() });
    void queryClient.invalidateQueries({ predicate: query => query.queryKey.some(key => typeof key === "string" && (key.includes("/schedule") || key.includes("/occurrences") || key.includes("/studio/today"))) });
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
        <Button ref={addShowRef} data-testid="mod-schedule-add" onClick={(event) => { returnFocusRef.current = event.currentTarget; setDialogState({ mode: "create" }); }}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add show
        </Button>
      </header>

      {conflicts.length > 0 && (
        <div role="status" className="wc-card wc-card-pad mb-4">
          <p className="font-bold">Schedule overlaps need attention</p>
          <p className="text-sm wc-muted">Edit these shows to use separate slots. A show may start exactly when another ends.</p>
          <ul className="mt-2 text-sm list-disc pl-5">{conflicts.map(conflict => <li key={conflict}>{conflict}</li>)}</ul>
        </div>
      )}
      <OccurrencesPanel />

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
                              onClick={(event) => {
                                returnFocusRef.current = event.currentTarget;
                                setDialogState({ mode: "create", day, start: row.start, end: row.end });
                              }}
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
                            onClick={(event) => { returnFocusRef.current = event.currentTarget; if (showEntity) setDialogState({ mode: "edit", show: showEntity }); }}
                          >
                            <span className="font-bold">{cell.name}</span>
                            {showEntity?.hiatusFrom && (
                              <span className="wc-chip-ghost text-[.55rem] ml-1" data-testid="mod-schedule-hiatus">
                                hiatus {showEntity.hiatusFrom}→{showEntity.hiatusUntil}
                              </span>
                            )}
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
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocusRef.current;
            (target?.isConnected ? target : addShowRef.current)?.focus();
          }}
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
