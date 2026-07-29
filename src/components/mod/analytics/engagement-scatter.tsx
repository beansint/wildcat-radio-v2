"use client";

/**
 * Engagement vs reach — one dot per show, radius by episode count.
 *
 * The quadrant reading is the point: top-right is a hit, bottom-left a sleeper
 * whose slot is worth reviewing. The caption names both rather than leaving the
 * moderator to eyeball it, because the chart's whole job is to produce that one
 * sentence.
 */
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { AnalyticsShowRankDto } from "@/lib/api/model";
import { buildScatter, formatDecimal, hitAndSleeper } from "@/lib/analytics/view";

export function EngagementScatter({ shows }: { shows: AnalyticsShowRankDto[] }) {
  const points = buildScatter(shows);

  if (points.length === 0) {
    return (
      <p className="wc-help py-8 text-center" data-testid="mod-analytics-scatter-empty">
        No show broadcast in this period.
      </p>
    );
  }

  const { hit, sleeper } = hitAndSleeper(points);

  return (
    <>
      {/* Named for the same reason as the retention curve — see its comment. */}
      <div
        className="wc-chart"
        data-testid="mod-analytics-scatter"
        role="img"
        aria-label={`Scatter plot of engagement against average concurrent listeners for ${points.length} show${points.length === 1 ? '' : 's'}, dots sized by episode count.`}
      >
        <ResponsiveContainer width="100%" height={220}>
          <ScatterChart
            accessibilityLayer={false}
            margin={{ top: 8, right: 12, bottom: 16, left: -14 }}
          >
            <CartesianGrid strokeDasharray="2 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="audience"
              name="avg concurrent"
              tickLine={false}
              label={{
                value: "avg concurrent",
                position: "insideBottom",
                offset: -10,
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
            <YAxis
              type="number"
              dataKey="engagement"
              name="engagement"
              tickLine={false}
              width={44}
              label={{
                value: "engagement",
                angle: -90,
                position: "insideLeft",
                offset: 18,
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
            {/* Radius by episode count — a show with one episode should not read
                as loudly as a show with twelve. */}
            <ZAxis type="number" dataKey="episodeCount" range={[40, 260]} />
            <Tooltip
              cursor={{ strokeDasharray: "2 3" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--foreground)",
                fontSize: "0.75rem",
              }}
              content={({ payload }) => {
                const point = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!point) return null;
                return (
                  <div
                    className="wc-card wc-card-pad text-xs"
                    style={{ padding: "0.5rem 0.65rem" }}
                  >
                    <div className="font-bold">{point.name}</div>
                    <div className="wc-muted">
                      {formatDecimal(point.audience)} avg concurrent ·{" "}
                      {formatDecimal(point.engagement)} engagement
                    </div>
                    <div className="wc-muted">
                      {point.episodeCount} episode{point.episodeCount === 1 ? "" : "s"}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter data={points} fill="var(--chart-2)" fillOpacity={0.85} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* The same sentence the sighted caption carries, so the plot is not
          mute to a screen reader. */}
      {hit && sleeper && (
        <p className="wc-help mt-2" data-testid="mod-analytics-scatter-caption">
          <b>Hit:</b> {hit.name} (high on both). <b>Sleeper:</b> {sleeper.name} (low on both — review
          the slot).
        </p>
      )}
    </>
  );
}
