"use client";

/**
 * `/mod/analytics` — the M6 curation dashboard, 1:1-adapted from
 * docs/frontend-design-basis-prototype/mod/analytics.html.
 *
 * Adapted rather than copied in two places, both because the prototype predates
 * the API:
 *
 * - The prototype's second stat card reads "Weekly reach / unique listeners".
 *   The API deliberately does not publish that: it can only sum each episode's
 *   unique listeners, which counts a regular once per episode, and true
 *   period-unique reach needs the raw session rows that are pruned at ~90 days.
 *   The card is labelled for what the number actually is.
 * - The prototype's export buttons only fire a toast. Here they download the
 *   real file, and the toast repeats what the backend records — the export is
 *   written to the staff audit log because it leaves the building.
 *
 * The retention curve and the scatter are Recharts (FE#10); the heatmap stays a
 * CSS grid, as the prototype specifies — a charting library renders a small
 * categorical grid worse than CSS does.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, TrendingDown, TrendingUp } from "lucide-react";
import {
  useGetAnalyticsOverview,
  useGetAnalyticsShows,
  useGetAnalyticsDayparts,
  getAnalyticsEpisode,
} from "@/lib/api/endpoints/analytics/analytics";
import type {
  AnalyticsDaypartDto,
  AnalyticsOverviewDto,
  AnalyticsShowRankDto,
} from "@/lib/api/model";
import { API_BASE_URL } from "@/lib/api/fetcher";
import { listShowsPublic } from "@/lib/api/endpoints/shows-public/shows-public";
import { getShowEpisodes } from "@/lib/api/endpoints/shows-public/shows-public";
import { SegTabs } from "@/components/mod/seg-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RetentionCurve, type RetentionSeries } from "@/components/mod/analytics/retention-curve";
import { DaypartHeatmap } from "@/components/mod/analytics/daypart-heatmap";
import { EngagementScatter } from "@/components/mod/analytics/engagement-scatter";
import {
  formatCount,
  formatDecimal,
  periodRange,
  toIsoDate,
  type PeriodKey,
} from "@/lib/analytics/view";

const PERIOD_TABS = [
  { key: "p30", label: "Last 30 days" },
  { key: "psem", label: "This semester" },
  { key: "pcustom", label: "Custom" },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<PeriodKey>("p30");
  const today = useMemo(() => toIsoDate(new Date()), []);
  const [customFrom, setCustomFrom] = useState(() => periodRange("p30", new Date()).from);
  const [customTo, setCustomTo] = useState(today);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const range = useMemo(() => {
    if (period === "pcustom") return { from: customFrom, to: customTo };
    return periodRange(period, new Date());
  }, [period, customFrom, customTo]);

  // A custom range the moderator is mid-way through typing would otherwise fire
  // a 400 on every keystroke.
  const rangeValid = range.from <= range.to;
  const params = { from: range.from, to: range.to };
  const enabled = { query: { enabled: rangeValid } };

  const overviewQuery = useGetAnalyticsOverview<AnalyticsOverviewDto>(params, enabled);
  const showsQuery = useGetAnalyticsShows<AnalyticsShowRankDto[]>(params, enabled);
  const daypartsQuery = useGetAnalyticsDayparts<AnalyticsDaypartDto[]>(params, enabled);

  const shows = useMemo(() => showsQuery.data ?? [], [showsQuery.data]);

  // The retention curve compares the two strongest shows' most recent episodes.
  // The prototype draws exactly two series, and more than two lines on a 200px
  // chart stops being readable anyway.
  const retentionQuery = useQuery({
    queryKey: ["analytics-retention", range.from, range.to, shows.map((s) => s.showId).join(",")],
    enabled: rangeValid && shows.length > 0,
    queryFn: async (): Promise<RetentionSeries[]> => {
      const top = shows.filter((s) => s.showId !== null).slice(0, 2);
      // Fetched once, not once per show: it is the same full list either way.
      const allShows = await listShowsPublic();

      const series = await Promise.all(
        top.map(async (show) => {
          try {
            const episodeId = await episodeInPeriod(allShows, show, range);
            if (!episodeId) return null;
            const detail = await getAnalyticsEpisode(episodeId);
            return {
              episodeId: detail.episodeId,
              label: show.name,
              points: detail.retention ?? [],
            } satisfies RetentionSeries;
          } catch {
            // Per-show, not per-request: an episode that ended before the
            // snapshot pipeline shipped 404s by design, and one show's missing
            // curve must not discard the other show's perfectly good one.
            return null;
          }
        }),
      );
      return series.filter((s): s is RetentionSeries => s !== null);
    },
    // A 404 here is a permanent answer, not a blip worth three retries.
    retry: false,
  });

  const isLoading =
    overviewQuery.isLoading || showsQuery.isLoading || daypartsQuery.isLoading;
  const isError = overviewQuery.isError || showsQuery.isError || daypartsQuery.isError;

  async function handleExport(format: "csv" | "pdf") {
    // Every successful export writes an audit row, so a second click while the
    // first is still running records two exports for one intent — on the very
    // surface whose value is that it is logged. The buttons disable while a
    // report renders (a semester PDF is not instant on a t3.micro).
    if (exporting || !rangeValid) return;
    setExporting(format);
    setExportError(null);
    setExportStatus(null);
    try {
      const url = `${API_BASE_URL}/api/analytics/media-kit/export?format=${format}&from=${range.from}&to=${range.to}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      // Anchor-and-revoke rather than navigating: the request needs the session
      // cookie and the response is an attachment, so a plain link would lose
      // credentials on a cross-origin API.
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `wildcat-audience-report-${range.to}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Next tick: Firefox has historically aborted a same-tick revoke.
      setTimeout(() => URL.revokeObjectURL(href), 0);

      setExportStatus(`${format.toUpperCase()} export downloaded · logged to staff audit`);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Export failed. Please try again.",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="wc-container py-5 pb-16">
      <header className="mb-4">
        <h1 className="text-2xl font-extrabold">Analytics</h1>
        <p className="wc-muted">
          Aggregate &amp; anonymous — we measure audiences, not students.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegTabs
          tabs={PERIOD_TABS}
          value={period}
          onValueChange={(key) => setPeriod(key as PeriodKey)}
          testid="mod-analytics-period"
          className="flex-wrap"
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-analytics-export-csv"
            disabled={exporting !== null || !rangeValid}
            onClick={() => handleExport("csv")}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            {exporting === "csv" ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="mod-analytics-export-pdf"
            disabled={exporting !== null || !rangeValid}
            onClick={() => handleExport("pdf")}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {exporting === "pdf" ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      {period === "pcustom" && (
        <div className="wc-card wc-card-pad mb-5 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="mod-analytics-from">From</Label>
            <Input
              id="mod-analytics-from"
              type="date"
              max={customTo}
              data-testid="mod-analytics-from"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mod-analytics-to">To</Label>
            <Input
              id="mod-analytics-to"
              type="date"
              min={customFrom}
              max={today}
              data-testid="mod-analytics-to"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          {!rangeValid && (
            <p className="wc-help text-destructive" role="alert">
              The start date must not be after the end date.
            </p>
          )}
        </div>
      )}

      {(exportError || exportStatus) && (
        <div
          className="mb-4"
          role={exportError ? "alert" : "status"}
          data-testid="mod-analytics-export-message"
        >
          <p className={exportError ? "wc-help text-destructive" : "wc-help"}>
            {exportError ?? exportStatus}
          </p>
        </div>
      )}

      {isError ? (
        <div className="wc-card wc-card-pad text-center" role="alert">
          <p className="font-semibold text-destructive">Couldn&apos;t load analytics.</p>
          <p className="wc-help mt-1">
            The dashboard reads finished episode snapshots; if this keeps happening the API may be
            unreachable.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            data-testid="mod-analytics-retry"
            onClick={() => {
              void overviewQuery.refetch();
              void showsQuery.refetch();
              void daypartsQuery.refetch();
              // Without this a transient failure left the retention panel stuck
              // until the period changed.
              void retentionQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <p className="wc-muted py-10 text-center">Loading analytics…</p>
      ) : (
        <>
          <StatCards overview={overviewQuery.data} />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="wc-card wc-card-pad min-w-0">
              <h2 className="mb-1 font-bold">Retention curve</h2>
              <p className="wc-help mb-3">
                % of listeners still tuned in, by minutes into the episode.
              </p>
              {retentionQuery.isLoading ? (
                <p className="wc-help py-8 text-center">Loading curves…</p>
              ) : retentionQuery.isError ? (
                // "No episode has a retention curve" is a claim about the data.
                // Printing it when the request failed states something we do
                // not know.
                <p className="wc-help py-8 text-center">
                  Couldn&apos;t load the retention curves.
                </p>
              ) : (
                <RetentionCurve series={retentionQuery.data ?? []} />
              )}
            </section>

            <section className="wc-card wc-card-pad min-w-0">
              <h2 className="mb-1 font-bold">Daypart heatmap</h2>
              <p className="wc-help mb-3">
                Relative listening intensity by day &amp; hour. Exact values are shown on the
                strongest cells.
              </p>
              <DaypartHeatmap dayparts={daypartsQuery.data ?? []} />
            </section>

            {/* The one deliberate deviation from the design basis' 2x2 grid.
                Six columns do not fit a half-width card at any desktop width —
                measured at 1440px the table still overflowed — and the column
                that gets clipped first is Trend, which is the column a curation
                decision actually turns on. A table you must scroll sideways to
                read the answer is a worse outcome than giving it the row. Same
                sections, same order, same tokens; only the span changes. */}
            <section className="wc-card wc-card-pad min-w-0 lg:col-span-2">
              <h2 className="mb-1 font-bold">Show ranking</h2>
              <p className="wc-help mb-3">
                Ordered by average concurrent listeners. Trend compares the period before this one.
              </p>
              <ShowRanking shows={shows} />
            </section>

            {/* Full width for the same reason as the ranking, plus one of its
                own: separating a hit from a sleeper is an x-axis judgement, and
                a wider plot spreads the shows out instead of clustering them
                into an unreadable clump on the left. */}
            <section className="wc-card wc-card-pad min-w-0 lg:col-span-2">
              {/* Not "Engagement vs reach", which the design basis used: the
                  x-axis is average concurrent listeners, a simultaneity
                  measure, and the API deliberately publishes no per-show reach.
                  Keeping the prototype's word would have put a reach claim on a
                  chart that does not plot reach. */}
              <h2 className="mb-1 font-bold">Engagement vs audience</h2>
              <p className="wc-help mb-3">
                Each dot is a show, plotted by its average concurrent listeners. Bigger dots ran
                more episodes. Top-right are hits; bottom-left are sleepers.
              </p>
              <EngagementScatter shows={shows} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatCards({ overview }: { overview?: AnalyticsOverviewDto }) {
  const cards = [
    {
      label: "Peak concurrent",
      value: overview ? formatCount(overview.peakConcurrent) : "—",
      caption: "listeners at once",
      testid: "peak",
    },
    {
      // NOT "unique listeners": the API sums each episode's unique listeners,
      // so a regular counts once per episode. Saying otherwise would overstate
      // the audience on the station's own dashboard.
      label: "Cumulative reach",
      value: overview ? formatCount(overview.cumulativeEpisodeReach) : "—",
      caption: "listeners per episode, summed",
      testid: "reach",
    },
    {
      label: "Total listening hrs",
      value: overview ? formatDecimal(overview.totalListeningHours) : "—",
      caption: "hours streamed",
      testid: "tlh",
    },
    {
      label: "Avg engagement",
      value: overview ? formatDecimal(overview.averageEngagementPerEpisode) : "—",
      caption: "actions / episode",
      testid: "engagement",
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.testid} className="wc-card wc-card-pad">
          <p className="wc-help">{card.label}</p>
          <p className="tnum text-3xl font-extrabold" data-testid={`mod-analytics-stat-${card.testid}`}>
            {card.value}
          </p>
          <p className="wc-help">{card.caption}</p>
        </div>
      ))}
    </div>
  );
}

function ShowRanking({ shows }: { shows: AnalyticsShowRankDto[] }) {
  if (shows.length === 0) {
    return (
      <p className="wc-help py-8 text-center" data-testid="mod-analytics-shows-empty">
        No show broadcast in this period.
      </p>
    );
  }

  return (
    // The table has six columns and lives in a half-width grid cell, so it
    // scrolls rather than being squeezed: without the min-width the browser
    // compresses the last columns to nothing and the Trend cell — the one
    // column a curation decision actually turns on — becomes unreadable.
    <div className="overflow-x-auto">
      <table className="wc-table min-w-[32rem]" data-testid="mod-analytics-shows">
        <thead>
          <tr>
            <th scope="col">Show</th>
            <th scope="col">Eps</th>
            <th scope="col">Avg concurrent</th>
            <th scope="col">Avg TLH</th>
            <th scope="col">Avg engagement</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {shows.map((show) => (
            <tr key={show.showId ?? "unscheduled"} data-testid="mod-analytics-show-row">
              <td>
                <span className="font-bold">{show.name}</span>
                {show.theme && <span className="wc-chip-ghost ml-2">{show.theme}</span>}
              </td>
              <td className="tnum">{show.episodeCount}</td>
              <td className="tnum">{formatDecimal(show.avgConcurrent)}</td>
              <td className="tnum">{formatDecimal(show.avgTlh)}</td>
              <td className="tnum">{formatDecimal(show.avgEngagement)}</td>
              <td>
                <TrendCell trend={show.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendCell({ trend }: { trend: AnalyticsShowRankDto["trend"] }) {
  if (trend === "up") {
    return (
      // No `sr-only` companion: the word "up" is already visible text and the
      // icon is aria-hidden, so adding one made screen readers announce
      // "trending up up". It also broke the layout — `sr-only` is
      // position:absolute, so inside the table's scroll container it escaped
      // the clip and gave the whole page 191px of horizontal scroll at 375px.
      <span className="inline-flex items-center gap-1" style={{ color: "var(--success)" }}>
        <TrendingUp className="h-4 w-4" aria-hidden="true" />
        up
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <TrendingDown className="h-4 w-4" aria-hidden="true" />
        down
      </span>
    );
  }
  return <span className="wc-muted">flat</span>;
}

/**
 * The ranking row carries no episode ids and there is no per-show episode list
 * on the analytics surface, so the retention curve borrows the public
 * show-episodes route to find an episode to draw.
 *
 * It must pick one **inside the selected period**. `GET /shows/:slug/episodes`
 * returns the ten most recent finished episodes with no date filter, so taking
 * `recent[0]` drew July's episode while the other three panels showed January
 * — and because the query key carries the range, the panel visibly "responded"
 * to a period change by re-rendering identical data, which is worse than
 * showing nothing.
 */
async function episodeInPeriod(
  allShows: { id: string; slug: string }[],
  show: AnalyticsShowRankDto,
  range: { from: string; to: string },
): Promise<string | null> {
  if (!show.showId) return null;
  const slug = allShows.find((s) => s.id === show.showId)?.slug;
  if (!slug) return null;

  const episodes = await getShowEpisodes(slug);
  const fromMs = new Date(`${range.from}T00:00:00.000Z`).getTime();
  // Exclusive upper bound, matching the API's own [from, to) window.
  const toMs = new Date(`${range.to}T00:00:00.000Z`).getTime();

  const inPeriod = episodes.recent.filter((e) => {
    const started = e.startedAt ? new Date(e.startedAt).getTime() : null;
    return started !== null && started >= fromMs && started < toMs;
  });
  return inPeriod[0]?.id ?? null;
}
