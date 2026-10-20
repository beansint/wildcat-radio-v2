"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TablePagination } from "@/components/mod/table-pagination";
import {
  getStaffAnalyticsEpisode,
  listAnalyticsEpisodes,
  type MeasurementStatus,
  type StaffEpisodeDetail,
} from "@/lib/analytics/staff-api";
import { formatDecimal } from "@/lib/analytics/view";

const metric = (value: number | null | undefined) =>
  value == null ? "Unavailable" : formatDecimal(value);
const clock = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
export function EpisodeAnalytics({
  range,
  shows,
}: {
  range: { from: string; to: string };
  shows: { showId: string | null; name: string }[];
}) {
  const [page, setPage] = useState(1);
  const [showId, setShowId] = useState("all");
  const [measurementStatus, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["staff-episodes", range, page, showId, measurementStatus],
    enabled: Boolean(range.from && range.to) && range.from < range.to,
    queryFn: ({ signal }) =>
      listAnalyticsEpisodes(
        {
          ...range,
          page,
          pageSize: 20,
          ...(showId === "all" ? {} : { showId }),
          ...(measurementStatus === "all"
            ? {}
            : { measurementStatus: measurementStatus as MeasurementStatus }),
        },
        signal,
      ),
  });
  const showOptions = [
    ...new Map([
      ...shows
        .filter((show) => show.showId)
        .map(
          (show) =>
            [show.showId!, { id: show.showId!, name: show.name }] as const,
        ),
      ...(query.data?.items ?? [])
        .filter((episode) => episode.showId)
        .map(
          (episode) =>
            [
              episode.showId!,
              {
                id: episode.showId!,
                name: episode.showName ?? "Archived show",
              },
            ] as const,
        ),
    ]).values(),
  ];
  const detail = useQuery({
    queryKey: ["staff-episode", selected],
    enabled: !!selected,
    queryFn: ({ signal }) => getStaffAnalyticsEpisode(selected!, signal),
  });
  return (
    <section
      className="wc-card wc-card-pad mt-4 min-w-0"
      data-testid="mod-analytics-episodes"
    >
      <h2 className="font-bold">Episode measurements</h2>
      <p className="wc-help mb-3">
        Includes archived shows and unscheduled broadcasts. Times are
        Asia/Manila. Pending and unavailable measurements are never counted as
        measured zero.
      </p>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="min-w-48">
          <Label htmlFor="analytics-show">Show</Label>
          <Select
            value={showId}
            onValueChange={(value) => {
              setShowId(value);
              setPage(1);
            }}
          >
            <SelectTrigger id="analytics-show" data-testid="mod-analytics-episode-show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="mod-analytics-episode-show-all">All shows</SelectItem>
              <SelectItem value="unscheduled" data-testid="mod-analytics-episode-show-unscheduled">Unscheduled</SelectItem>
              {showOptions.map((s) => (
                <SelectItem key={s.id} value={s.id} data-testid={`mod-analytics-episode-show-${s.id}`}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-48">
          <Label htmlFor="analytics-measurement">Measurement</Label>
          <Select
            value={measurementStatus}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger id="analytics-measurement" data-testid="mod-analytics-episode-measurement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="mod-analytics-episode-measurement-all">All statuses</SelectItem>
              {["live", "pending", "complete", "unavailable"].map((status) => (
                <SelectItem key={status} value={status} data-testid={`mod-analytics-episode-measurement-${status}`}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {query.isError ? (
        <p role="alert">
          Couldn&apos;t load episodes.{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </p>
      ) : query.isLoading ? (
        <p className="wc-help">Loading episodes…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="wc-table min-w-[40rem]">
              <thead>
                <tr>
                  <th>Episode / show</th>
                  <th>Actual start</th>
                  <th>Measurement</th>
                  <th>Measured browser reach</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.map((episode) => (
                  <tr key={episode.episodeId} data-testid={`mod-analytics-episode-row-${episode.episodeId}`}>
                    <td>
                      <strong>
                        {episode.title ?? episode.showName ?? "Unscheduled"}
                      </strong>
                      <div className="wc-help">
                        {episode.showName ?? "Unscheduled"}
                      </div>
                    </td>
                    <td>{clock(episode.startedAt)}</td>
                    <td>{episode.measurementStatus}</td>
                    <td className="tnum">{metric(episode.reach)}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="mod-analytics-episode-open" onClick={() => setSelected(episode.episodeId)}
                      >
                        View episode
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data?.total === 0 && (
            <p className="wc-help py-4">No episodes match these filters.</p>
          )}
          <TablePagination
            page={page}
            pageSize={20}
            total={query.data?.total ?? 0}
            busy={query.isFetching}
            onPrev={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
            testidPrefix="mod-analytics-episodes"
          />
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          data-testid="mod-analytics-episode-detail"
        >
          <DialogHeader>
            <DialogTitle>
              {detail.data?.title ??
                detail.data?.showName ??
                "Episode measurements"}
            </DialogTitle>
            <DialogDescription>
              Aggregate episode activity. No listener sessions or individual
              voters.
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <p>Loading episode…</p>
          ) : detail.isError ? (
            <p role="alert">
              Couldn&apos;t load this episode.{" "}
              <Button variant="outline" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            </p>
          ) : (
            detail.data && <EpisodeDetail episode={detail.data} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
function EpisodeDetail({ episode: e }: { episode: StaffEpisodeDetail }) {
  const values = [
    ["Measurement", e.measurementStatus],
    ["Scheduled", `${clock(e.scheduledFor)} – ${clock(e.scheduledEndAt)}`],
    ["Actual start", clock(e.startedAt)],
    ["Actual end", clock(e.endedAt)],
    ["Measured duration (minutes)", metric(e.durationMinutes)],
    ["Peak connections (sampled)", metric(e.peak)],
    ["Average active connections", metric(e.average)],
    ["Measured distinct browser IDs", metric(e.reach)],
    ["Listening hours", metric(e.tlh)],
    ["Mean session minutes", metric(e.tsl)],
    [
      "Samples / expected",
      `${metric(e.quality.sampleCount)} / ${metric(e.quality.expectedSamples)}`,
    ],
    [
      "Sampling coverage",
      e.quality.samplingCoverage == null
        ? "Unavailable"
        : `${formatDecimal(e.quality.samplingCoverage * 100)}%`,
    ],
    ["Interrupted sessions", metric(e.quality.interruptedSessions)],
    ["Connection fallback sessions", metric(e.quality.fallbackSessions)],
  ];
  return (
    <>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {values.map(([label, value]) => (
          <div key={label}>
            <dt className="wc-help">{label}</dt>
            <dd className="font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="font-bold mt-3">Aggregate engagement</h3>
      <dl className="grid grid-cols-2 gap-2">
        {Object.entries(e.engagement ?? {})
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => (
            <div key={key}>
              <dt className="wc-help">{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
      </dl>
      {(["queueByType", "queueByStatus"] as const).map((key) => (
        <div key={key}>
          <h4 className="font-semibold mt-2">
            {key === "queueByType" ? "Queue by type" : "Queue by status"}
          </h4>
          <p className="wc-help">
            {Object.entries(e.engagement?.[key] ?? {})
              .map(([name, count]) => `${name}: ${count}`)
              .join(" · ") || "Breakdown unavailable"}
          </p>
        </div>
      ))}
      <p className="wc-help mt-3">
        Reach counts episode-specific browser identifiers, not people. Multiple
        tabs can add active web-player connections.{" "}
        {e.quality.measurementVersion === "legacy"
          ? "Legacy reach may include socket fallback identities. "
          : ""}
        Minute sampling can miss brief peaks and sub-minute broadcasts.
        Interrupted sessions exclude process downtime, with up to{" "}
        {e.quality.unobservedIntervalSeconds} seconds unobserved. When browser storage is denied, fallback connection
        sessions may count again after a reconnect or in another tab.
      </p>
    </>
  );
}
