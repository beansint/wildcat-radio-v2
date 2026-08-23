"use client";

/**
 * /mod/attendance — 1:1 from docs/frontend-design-basis-prototype/mod/attendance.html
 *
 * Date + show filters over `GET /api/attendance`. The backend synthesizes
 * ABSENT rows (recordId: null, episodeId: null, timeIn/timeOut: null) for
 * every roster member scheduled that date with no attendance record. Staff can
 * open those rows to create a reasoned, audited correction for the exact show
 * occurrence.
 *
 * FE#51: search + pagination are client-side. `GET /api/attendance` (see
 * `AttendanceControllerListParams`) takes only `date`/`showId` — no `q` or
 * `page` — because a day's roster is small (one station, one day), so the
 * whole day's rows are fetched once and search/paginate happens over the
 * already-loaded array rather than round-tripping per keystroke/page.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus, Pencil } from "lucide-react";
import { useAttendanceControllerList, getAttendanceControllerListQueryKey } from "@/lib/api/endpoints/attendance/attendance";
import { useListShowsAdmin } from "@/lib/api/endpoints/shows/shows";
import type { AttendanceRowDto, ShowDto } from "@/lib/api/model";
import { AttendanceRowDtoStatus } from "@/lib/api/model";
import { DataTable, type DataTableColumn } from "@/components/mod/data-table";
import { TableToolbar } from "@/components/mod/table-toolbar";
import { TablePagination } from "@/components/mod/table-pagination";
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
import { overtimeStatusLabel } from "@/lib/time/attendance";

const ALL_SHOWS = "all";
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

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

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const showsQuery = useListShowsAdmin<ShowDto[]>();
  const shows = showsQuery.data ?? [];

  const attendanceQuery = useAttendanceControllerList<AttendanceRowDto[]>({
    date,
    showId: showId === ALL_SHOWS ? undefined : showId,
  });
  const allRows = useMemo(() => attendanceQuery.data ?? [], [attendanceQuery.data]);

  // Debounced search — the whole day's roster is already in memory (see
  // file-header note), so this filters client-side rather than refetching.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // A new date/show selection changes the underlying roster — start back at
  // page 1 rather than stranding the moderator on a now-out-of-range page.
  // Adjusted during render (React's documented "resetting state" pattern)
  // rather than in an Effect, so it doesn't cause an extra render pass.
  const rosterKey = `${date}::${showId}`;
  const [prevRosterKey, setPrevRosterKey] = useState(rosterKey);
  if (rosterKey !== prevRosterKey) {
    setPrevRosterKey(rosterKey);
    setPage(1);
  }

  const filteredRows = useMemo(() => {
    if (!search) return allRows;
    return allRows.filter((r) => r.displayName.toLowerCase().includes(search));
  }, [allRows, search]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      key: "overtime",
      header: "Overtime",
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <span className="tnum">{r.overtimeMinutes > 0 ? `${r.overtimeMinutes}m` : "—"}</span>
          <span className="wc-muted text-xs">{overtimeStatusLabel(r.overtimeStatus)}</span>
        </div>
      ),
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
      cell: (r) => (
        <Button
          variant="outline"
          size="sm"
          data-testid={r.recordId ? "mod-attendance-edit" : "mod-attendance-create"}
          aria-label={`${r.recordId ? "Edit attendance for" : "Record missed attendance for"} ${r.displayName}`}
          onClick={() => setEditRow(r)}
        >
          {r.recordId ? <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> : <ClipboardPlus className="w-3.5 h-3.5" aria-hidden="true" />}
          {r.recordId ? "Edit" : "Record"}
        </Button>
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
          loading={attendanceQuery.isPending}
          toolbar={
            <TableToolbar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Search DJs…"
              searchTestId="mod-attendance-search"
              summary={<span data-testid="mod-attendance-count">{total} rows</span>}
            />
          }
          pagination={
            <TablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              testidPrefix="mod-attendance"
            />
          }
          emptyState={
            <div className="p-6 text-center wc-muted">
              {search ? "No DJs match your search." : "No attendance rows for this date."}
            </div>
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
