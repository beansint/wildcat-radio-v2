"use client";

/**
 * /mod/attendance — 1:1 from docs/frontend-design-basis-prototype/mod/attendance.html
 *
 * Date + show filters over `GET /api/attendance`. The backend synthesizes
 * ABSENT rows (recordId: null, episodeId: null, timeIn/timeOut: null) for
 * every roster member scheduled that date with no attendance record — those
 * fields are treated as nullable throughout, rendered as an "Absent" pill,
 * and never get an edit trigger (there's nothing to PATCH).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useAttendanceControllerList, getAttendanceControllerListQueryKey } from "@/lib/api/endpoints/attendance/attendance";
import { useListShowsAdmin } from "@/lib/api/endpoints/shows/shows";
import type { AttendanceRowDto, ShowDto } from "@/lib/api/model";
import { AttendanceRowDtoStatus } from "@/lib/api/model";
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendanceEditDialog } from "@/components/mod/attendance-edit-dialog";
import { stationDate, stationHhmm } from "@/lib/time/station";

const ALL_SHOWS = "all";

/** Formats a station-local 'HH:MM' as a 12-hour display string, e.g. "1:00 PM". */
function formatHhmmDisplay(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** `iso` is a UTC instant — render it in station-local time, not the browser's timezone. */
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return formatHhmmDisplay(stationHhmm(iso));
}

/** `hhmm` is already station-local wall-clock time (no timezone conversion needed). */
function formatScheduled(hhmm: string | null): string {
  if (!hhmm) return "—";
  return formatHhmmDisplay(hhmm);
}

const STATUS_META: Record<AttendanceRowDtoStatus, { label: string; pillClass: string }> = {
  [AttendanceRowDtoStatus.ON_TIME]: { label: "On time", pillClass: "wc-pill-ok" },
  [AttendanceRowDtoStatus.LATE]: { label: "Late", pillClass: "wc-pill-warn" },
  [AttendanceRowDtoStatus.ABSENT]: { label: "Absent", pillClass: "wc-pill-bad" },
  [AttendanceRowDtoStatus.AGREED_OVERTIME]: { label: "Agreed overtime", pillClass: "wc-pill-neutral" },
};

function statusLabel(row: AttendanceRowDto): string {
  if (row.status === AttendanceRowDtoStatus.LATE) return `Late ${row.lateMinutes}m`;
  return STATUS_META[row.status].label;
}

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => stationDate(new Date()));
  const [showId, setShowId] = useState<string>(ALL_SHOWS);
  const [editRow, setEditRow] = useState<AttendanceRowDto | null>(null);

  const showsQuery = useListShowsAdmin<ShowDto[]>();
  const shows = showsQuery.data ?? [];

  const attendanceQuery = useAttendanceControllerList<AttendanceRowDto[]>({
    date,
    showId: showId === ALL_SHOWS ? undefined : showId,
  });
  const rows = attendanceQuery.data ?? [];

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: getAttendanceControllerListQueryKey() });
    setEditRow(null);
  }

  const columns: DataTableColumn<AttendanceRowDto>[] = [
    { key: "dj", header: "DJ", cell: (r) => <span className="font-bold">{r.displayName}</span> },
    {
      key: "scheduled",
      header: "Scheduled",
      cell: (r) => <span className="tnum wc-muted">{formatScheduled(r.scheduled)}</span>,
    },
    { key: "timein", header: "Timed in", cell: (r) => <span className="tnum">{formatTime(r.timeIn)}</span> },
    { key: "timeout", header: "Timed out", cell: (r) => <span className="tnum">{formatTime(r.timeOut)}</span> },
    {
      key: "hours",
      header: "On-air hrs",
      numeric: true,
      cell: (r) => <span className="tnum">{r.onAirHours ?? 0}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <span className={`wc-pill ${STATUS_META[r.status].pillClass}`}>{statusLabel(r)}</span>
      ),
    },
    { key: "note", header: "Note", cell: (r) => <span className="wc-muted">{r.note || "—"}</span> },
    {
      key: "actions",
      header: "Actions",
      cell: (r) =>
        r.recordId ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="mod-attendance-edit"
            aria-label={`Edit attendance for ${r.displayName}`}
            onClick={() => setEditRow(r)}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <span className="wc-muted text-sm">—</span>
        ),
    },
  ];

  return (
    <div className="p-4 md:p-7">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Attendance sheet</h1>
        <p className="wc-muted">
          Time-in/out vs. the schedule, on-air hours, and overtime agreements. Edits are audit-logged.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="sm:w-48">
          <Label htmlFor="attendance-date">Date</Label>
          <Input
            id="attendance-date"
            type="date"
            className="tnum"
            data-testid="mod-attendance-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="sm:w-60">
          <Label htmlFor="attendance-show">Show</Label>
          <Select value={showId} onValueChange={setShowId}>
            <SelectTrigger id="attendance-show" data-testid="mod-attendance-show">
              <SelectValue placeholder="All shows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SHOWS}>All shows</SelectItem>
              {shows.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="wc-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={rows}
          testid="mod-attendance"
          rowKey={(r, i) => r.recordId ?? `absent-${r.rosterId}-${i}`}
          emptyState={
            <div className="p-6 text-center wc-muted">No attendance rows for this date.</div>
          }
        />
      </div>

      {editRow && (
        <AttendanceEditDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditRow(null);
          }}
          row={editRow}
          date={date}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
