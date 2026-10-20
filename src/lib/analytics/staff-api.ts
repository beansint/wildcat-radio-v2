import { customFetch } from "@/lib/api/fetcher";
import type {
  AnalyticsCoverageDto,
  AnalyticsEpisodeDto,
  AnalyticsEpisodeListDto,
  AnalyticsEpisodeListItemDto,
  AnalyticsEpisodeListItemDtoMeasurementStatus,
  AnalyticsQualityDto,
  GetAnalyticsEpisodesParams,
} from "@/lib/api/model";

export type MeasurementStatus = AnalyticsEpisodeListItemDtoMeasurementStatus;
export type MeasurementQuality = AnalyticsQualityDto;
export type StaffEpisode = AnalyticsEpisodeListItemDto;
export type StaffEpisodeDetail = AnalyticsEpisodeDto;
export type EpisodePage = AnalyticsEpisodeListDto;
export type MeasurementCoverage = AnalyticsCoverageDto;
export type EpisodeFilters = GetAnalyticsEpisodesParams;

/** Staff-facing wrappers share generated contracts and the credentialed fetcher. */
export function listAnalyticsEpisodes(
  filters: EpisodeFilters,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return customFetch<EpisodePage>(`/api/analytics/episodes?${params}`, {
    signal,
  });
}
export function getStaffAnalyticsEpisode(id: string, signal?: AbortSignal) {
  return customFetch<StaffEpisodeDetail>(
    `/api/analytics/episodes/${encodeURIComponent(id)}`,
    { signal },
  );
}
