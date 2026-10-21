import { getAnalyticsEpisode, getAnalyticsEpisodes } from "@/lib/api/endpoints/analytics/analytics";
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

/** Delegate URL construction and credentialed requests to the generated API. */
export function listAnalyticsEpisodes(filters: EpisodeFilters, signal?: AbortSignal) {
  return getAnalyticsEpisodes(filters, { signal });
}
export function getStaffAnalyticsEpisode(id: string, signal?: AbortSignal) {
  return getAnalyticsEpisode(id, { signal });
}
