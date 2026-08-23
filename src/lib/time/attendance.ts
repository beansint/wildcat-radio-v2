import { stationLocalToUtcISO } from "./station";

export type OvertimeStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface AttendanceCorrectionInput {
  timeInDate: string;
  timeIn: string;
  timeOutDate: string;
  timeOut: string;
  note: string;
  reason: string;
}

export interface AttendanceCorrectionBody {
  timeIn: string;
  timeOut: string | null;
  note: string;
  reason: string;
}

export function formatOvertimeMinutes(scheduledEnd: string | null, timeOut: string | null): string {
  if (!scheduledEnd || !timeOut) return "—";
  const minutes = Math.max(0, Math.floor((new Date(timeOut).getTime() - new Date(scheduledEnd).getTime()) / 60_000));
  return minutes > 0 ? `${minutes}m overtime` : "—";
}

export function overtimeStatusLabel(status: OvertimeStatus | null | undefined): string {
  switch (status) {
    case "PENDING":
      return "Overtime pending";
    case "APPROVED":
      return "Overtime approved";
    case "REJECTED":
      return "Overtime declined";
    default:
      return "No overtime";
  }
}

/** Builds the staff endpoint wire payload from station-local form values. */
export function buildAttendanceCorrection(values: AttendanceCorrectionInput): AttendanceCorrectionBody {
  return {
    timeIn: stationLocalToUtcISO(values.timeInDate, values.timeIn),
    timeOut: values.timeOut ? stationLocalToUtcISO(values.timeOutDate, values.timeOut) : null,
    note: values.note,
    reason: values.reason,
  };
}
