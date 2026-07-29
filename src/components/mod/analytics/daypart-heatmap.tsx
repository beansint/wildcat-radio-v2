"use client";

/**
 * Daypart heatmap — relative listening intensity by day and hour.
 *
 * A CSS grid (`.wc-heat`), exactly as the design basis specifies, rather than a
 * charting-library component: a library renders a small categorical grid worse
 * than CSS does, and the prototype's own note calls these chart bits
 * "self-contained, no JS".
 *
 * The distinction the grid has to carry is **never-broadcast vs broadcast-quiet**.
 * A zero-intensity cell would read as "we aired and nobody came"; an unaired
 * slot is a different fact, and for a tool whose job is to suggest *when to
 * schedule*, it is the more actionable of the two. Unaired cells are drawn as a
 * hairline outline with no fill and are announced as such.
 */
import type { AnalyticsDaypartDto } from "@/lib/api/model";
import {
  buildHeatmap,
  heatmapRows,
  HEATMAP_WEEKDAYS,
  HEAT_LABEL_THRESHOLD,
  hourLabel,
  peakSlot,
  weekdayLabel,
} from "@/lib/analytics/view";

export function DaypartHeatmap({ dayparts }: { dayparts: AnalyticsDaypartDto[] }) {
  const cells = buildHeatmap(dayparts);
  const peak = peakSlot(cells);
  const rows = heatmapRows(dayparts);

  return (
    <>
      {/* The grid is 8 columns and each cell has a legibility floor (a 30px
          min-height against a 1.6:1 aspect ratio puts it at ~48px wide), so
          below roughly 420px it cannot fit. Squeezing it further would make the
          numbers unreadable, which defeats the panel — so it scrolls inside its
          own container instead, and the page never scrolls sideways. */}
      <div className="overflow-x-auto">
        {/* Real table semantics. `aria-label` on a bare <span> is not reliably
            exposed (ARIA forbids naming `generic`), and the visible text of any
            cell below the label threshold is the empty string — so the grid was
            42 silent spans to a screen reader, with no keyboard path to them
            either. A table with scoped headers announces the row and column
            for free, which is exactly the relationship this panel encodes. */}
        <div
          role="table"
          aria-label="Average concurrent listeners by weekday and two-hour slot"
          className="wc-heat min-w-[26rem]"
          data-testid="mod-analytics-heatmap"
        >
          <span className="rowlab" role="columnheader" aria-label="Time slot" />
          {HEATMAP_WEEKDAYS.map((d) => (
            <span key={d.weekday} className="collab" role="columnheader">
              {d.label}
            </span>
          ))}

          {rows.map((row) => (
            <HeatRow key={row.hour} hour={row.hour} label={row.label} cells={cells} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-6 rounded-[4px]"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--maroon) 8%, transparent), var(--maroon))",
            }}
          />
          <span className="wc-muted">quieter → busier</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-6 rounded-[4px] border border-dashed"
            style={{ borderColor: "var(--border)" }}
          />
          <span className="wc-muted">no broadcast</span>
        </span>
        {peak && (
          <span className="wc-help" data-testid="mod-analytics-heatmap-peak">
            Peak: {weekdayLabel(peak.weekday)} {hourLabel(peak.hour)} ·{" "}
            {Math.round(peak.avgConcurrent as number)} avg concurrent
          </span>
        )}
      </div>
    </>
  );
}

function HeatRow({
  hour,
  label,
  cells,
}: {
  hour: number;
  label: string;
  cells: ReturnType<typeof buildHeatmap>;
}) {
  return (
    <>
      <span className="rowlab" role="rowheader">
        {label}
      </span>
      {HEATMAP_WEEKDAYS.map((col) => {
        const cell = cells.find((c) => c.weekday === col.weekday && c.hour === hour);
        const aired = cell?.avgConcurrent !== null && cell?.avgConcurrent !== undefined;
        const value = aired ? Math.round(cell.avgConcurrent as number) : null;
        const strong = (cell?.intensity ?? 0) >= HEAT_LABEL_THRESHOLD;

        return (
          <span
            key={`${col.weekday}:${hour}`}
            className="cell"
            // role="cell" makes the name reliable; `aria-label` on a generic
            // span is not guaranteed to be exposed at all.
            role="cell"
            data-testid={`mod-analytics-heat-${col.weekday}-${hour}`}
            data-aired={aired ? "true" : "false"}
            // A screen reader gets the value on every cell; sighted users get
            // it only where the fill is dark enough to carry white text.
            title={
              aired
                ? `${weekdayLabel(col.weekday)} ${label}: ${value} avg concurrent`
                : `${weekdayLabel(col.weekday)} ${label}: no broadcast`
            }
            aria-label={
              aired
                ? `${weekdayLabel(col.weekday)} ${label}, ${value} average concurrent listeners`
                : `${weekdayLabel(col.weekday)} ${label}, no broadcast`
            }
            style={
              aired
                ? {
                    // Floor the ramp at 66% so any cell dark enough to print a
                    // number clears 4.5:1 against white 10.5px bold text. The
                    // previous 6%..94% ramp put the FIRST labelled cells (just
                    // over the 0.6 threshold) at ~4.06:1 — below AA, and
                    // precisely where the numbers start appearing.
                    background: `color-mix(in srgb, var(--maroon) ${Math.round(
                      18 + (cell?.intensity ?? 0) * 78,
                    )}%, transparent)`,
                  }
                : { border: "1px dashed var(--border)", background: "transparent" }
            }
          >
            {strong && value !== null ? value : ""}
          </span>
        );
      })}
    </>
  );
}
