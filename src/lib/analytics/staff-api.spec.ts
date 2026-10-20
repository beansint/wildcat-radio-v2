import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnalyticsEpisode, getAnalyticsEpisodes } from "@/lib/api/endpoints/analytics/analytics";
import { getStaffAnalyticsEpisode, listAnalyticsEpisodes } from "./staff-api";
vi.mock("@/lib/api/endpoints/analytics/analytics", () => ({
  getAnalyticsEpisodes: vi.fn(),
  getAnalyticsEpisode: vi.fn(),
}));
describe("staff analytics generated contract delegation", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 }))); });
  it("passes list filters and cancellation to the generated API", async () => {
    const filters = { from: "2026-10-01T16:00:00Z", to: "2026-10-02T16:00:00Z", showId: "unscheduled", measurementStatus: "complete" as const, page: 2, pageSize: 20 };
    const signal = new AbortController().signal;
    const result = { items: [], total: 0, page: 2, pageSize: 20 };
    vi.mocked(getAnalyticsEpisodes).mockResolvedValue(result);
    await listAnalyticsEpisodes(filters, signal);
    expect(getAnalyticsEpisodes).toHaveBeenCalledWith(filters, { signal });
  });
  it("passes the episode ID and cancellation to the generated API", async () => {
    const signal = new AbortController().signal;
    vi.mocked(getAnalyticsEpisode).mockResolvedValue({ episodeId: "episode" } as Awaited<ReturnType<typeof getAnalyticsEpisode>>);
    await getStaffAnalyticsEpisode("episode", signal);
    expect(getAnalyticsEpisode).toHaveBeenCalledWith("episode", { signal });
  });
});


