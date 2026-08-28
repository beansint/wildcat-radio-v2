import { describe, expect, it, vi } from "vitest";
import {
  clearStationHandoff,
  consumeStationHandoff,
  readStationHandoff,
} from "./station-handoff";

describe("station handoff URL", () => {
  it("reads the opaque handoff from the URL fragment", () => {
    expect(readStationHandoff("#station_handoff=opaque-code")).toBe("opaque-code");
  });

  it("does not read a handoff from the query string", () => {
    expect(readStationHandoff("?station_handoff=query-code")).toBeNull();
  });

  it("removes only the handoff fragment from browser history", () => {
    const replaceState = vi.fn();

    clearStationHandoff(
      { pathname: "/listen", search: "?from=studio", hash: "#station_handoff=opaque-code" },
      replaceState,
    );

    expect(replaceState).toHaveBeenCalledWith(null, "", "/listen?from=studio");
  });

  it("posts the handoff to the API without exposing it in the returned value", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, expiresAt: 123 });

    await expect(consumeStationHandoff("opaque-code", request)).resolves.toEqual({
      ok: true,
      expiresAt: 123,
    });
    expect(request).toHaveBeenCalledWith(
      "/api/studio/handoff/consume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ handoff: "opaque-code" }),
      }),
    );
  });
});
