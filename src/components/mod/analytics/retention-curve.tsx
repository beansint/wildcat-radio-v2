"use client";

/**
 * Retention curve — % of listeners still tuned in, by minutes into the episode.
 *
 * The design basis draws this as a hand-authored SVG polyline with static
 * points; here it is Recharts (per FE#10) fed by real episode snapshots, styled
 * onto the same tokens: `--chart-1` solid and `--chart-2` dashed, grid and axis
 * chrome via `.wc-chart` in globals.css. Interactivity is the one deliberate
 * addition — a static mock has no need of a tooltip, a real curve does, because
 * "which minute did we lose them" is the question the chart exists to answer.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsRetentionPointDto } from "@/lib/api/model";

export interface RetentionSeries {
  episodeId: string;
  label: string;
  points: AnalyticsRetentionPointDto[];
}

const SERIES_STYLES = [
  { stroke: "var(--chart-1)", dash: undefined },
  { stroke: "var(--chart-2)", dash: "5 4" },
] as const;

/** Merge series onto one minute axis so Recharts can share the x scale. */
function mergeByMinute(series: readonly RetentionSeries[]) {
  const minutes = new Set<number>();
  for (const s of series) for (const p of s.points) minutes.add(p.minute);

  return [...minutes]
    .sort((a, b) => a - b)
    .map((minute) => {
      const row: Record<string, number | null> = { minute };
      for (const s of series) {
        // `null` (not 0) where a series has no sample for this minute: Recharts
        // then breaks the line instead of drawing a plunge to zero that never
        // happened.
        row[s.episodeId] = s.points.find((p) => p.minute === minute)?.pctOfPeak ?? null;
      }
      return row;
    });
}

export function RetentionCurve({ series }: { series: RetentionSeries[] }) {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return (
      <p className="wc-help py-8 text-center" data-testid="mod-analytics-retention-empty">
        No episode has a retention curve in this period yet.
      </p>
    );
  }

  const data = mergeByMinute(series);

  return (
    <>
      {/* Recharts 3 defaults `accessibilityLayer: true`, which emits an
          <svg role="application" tabIndex={0}> with no accessible name — a
          screen-reader user tabs into an unnamed application region (which
          suppresses browse mode) containing nothing announceable. The design
          basis got this right with role="img" + a describing aria-label, so
          this is a regression to avoid rather than parity to keep. The summary
          sentence below is the text alternative. */}
      <div
        className="wc-chart"
        data-testid="mod-analytics-retention"
        role="img"
        aria-label={`Line chart of listener retention by minutes into the episode, for ${series
          .slice(0, SERIES_STYLES.length)
          .map((s) => s.label)
          .join(' and ')}.`}
      >
        <ResponsiveContainer width="100%" height={200}>
          <LineChart
            data={data}
            accessibilityLayer={false}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="2 3" vertical={false} />
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, "dataMax"]}
              tickLine={false}
              label={undefined}
            />
            {/* Explicit ticks: left to itself Recharts picked a 102 tick that
                the axis then clipped to "i02" — a mislabelled axis is worse
                than a sparse one. The scale is a percentage, so the quartiles
                are the meaningful stops. */}
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickLine={false}
              width={34}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--foreground)",
                fontSize: "0.75rem",
              }}
              formatter={((value: unknown, name: unknown) => [
                `${value}%`,
                series.find((s) => s.episodeId === name)?.label ?? String(name),
              ]) as never}
              labelFormatter={(minute) => `${minute} min in`}
            />
            {series.slice(0, SERIES_STYLES.length).map((s, i) => (
              <Line
                key={s.episodeId}
                type="monotone"
                dataKey={s.episodeId}
                stroke={SERIES_STYLES[i].stroke}
                strokeDasharray={SERIES_STYLES[i].dash}
                strokeWidth={2.5}
                strokeLinejoin="round"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Text alternative: the shape of the curve stated in words, so the
          panel says something to a reader who cannot see the line. */}
      <p className="sr-only">
        {series.slice(0, SERIES_STYLES.length).map((s) => {
          const last = s.points[s.points.length - 1];
          const first = s.points[0];
          if (!last || !first) return null;
          return (
            <span key={s.episodeId}>
              {s.label}: {first.pctOfPeak}% of peak at the start, {last.pctOfPeak}% by minute{' '}
              {last.minute}.{' '}
            </span>
          );
        })}
      </p>

      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        {series.slice(0, SERIES_STYLES.length).map((s, i) => (
          <span key={s.episodeId} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-5 align-middle"
              style={
                i === 0
                  ? { background: SERIES_STYLES[i].stroke }
                  : {
                      backgroundImage: `repeating-linear-gradient(90deg, ${SERIES_STYLES[i].stroke} 0 4px, transparent 4px 7px)`,
                    }
              }
            />
            {s.label} ({i === 0 ? "solid" : "dashed"})
          </span>
        ))}
      </div>
    </>
  );
}
