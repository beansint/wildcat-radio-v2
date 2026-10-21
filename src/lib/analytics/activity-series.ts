import type { AnalyticsRetentionPointDto } from "@/lib/api/model";
import {
  getStaffAnalyticsEpisode,
  listAnalyticsEpisodes,
  type EpisodeFilters,
} from "./staff-api";
interface Discovery {
  list: (
    filters: EpisodeFilters,
    signal?: AbortSignal,
  ) => Promise<{
    total: number;
    items: { episodeId: string; quality: { sampleCount: number | null } }[];
  }>;
  detail: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<{
    episodeId: string;
    title: string | null;
    showName: string | null;
    retention: AnalyticsRetentionPointDto[];
  }>;
}
/** Find the latest two actual curves, including archived/unscheduled history. */
export async function loadActivitySeries(
  range: { from: string; to: string },
  signal?: AbortSignal,
  source: Discovery = {
    list: listAnalyticsEpisodes,
    detail: getStaffAnalyticsEpisode,
  },
) {
  const result: {
    episodeId: string;
    label: string;
    points: AnalyticsRetentionPointDto[];
  }[] = [];
  const pageSize = 50;
  for (let page = 1; ; page++) {
    const episodes = await source.list(
      { ...range, measurementStatus: "complete", page, pageSize },
      signal,
    );
    for (const episode of episodes.items) {
      if (episode.quality.sampleCount === 0) continue;
      const detail = await source.detail(episode.episodeId, signal);
      if (!detail.retention.length) continue;
      result.push({
        episodeId: detail.episodeId,
        label: detail.title ?? detail.showName ?? "Unscheduled",
        points: detail.retention,
      });
      if (result.length === 2) return result;
    }
    if (!episodes.items.length || page * pageSize >= episodes.total)
      return result;
  }
}
