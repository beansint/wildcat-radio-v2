import { describe, expect, it } from "vitest";
import {
  getStaffPortalPath,
  isCustodianRole,
  isStaffRole,
  resolvePostLoginPath,
} from "./staff-routing";

describe("staff role routing", () => {
  it("UNIT-01: maps elevated roles to the shared staff console", () => {
    expect(getStaffPortalPath("MODERATOR")).toBe("/mod/roster");
    expect(getStaffPortalPath("CUSTODIAN")).toBe("/mod/roster");
    expect(getStaffPortalPath("LISTENER")).toBeNull();
    expect(getStaffPortalPath(undefined)).toBeNull();
    expect(isStaffRole("MODERATOR")).toBe(true);
    expect(isStaffRole("CUSTODIAN")).toBe(true);
    expect(isStaffRole("LISTENER")).toBe(false);
  });

  it("UNIT-02/03: defaults login to the right portal", () => {
    expect(resolvePostLoginPath("MODERATOR")).toBe("/mod/roster");
    expect(resolvePostLoginPath("CUSTODIAN")).toBe("/mod/roster");
    expect(resolvePostLoginPath("LISTENER")).toBe("/");
  });

  it("UNIT-04: preserves internal next paths and rejects external ones", () => {
    expect(resolvePostLoginPath("MODERATOR", "/mod/queue?tab=appeals")).toBe(
      "/mod/queue?tab=appeals",
    );
    expect(resolvePostLoginPath("LISTENER", "/profile")).toBe("/profile");
    expect(resolvePostLoginPath("MODERATOR", "https://evil.example")).toBe(
      "/mod/roster",
    );
    expect(resolvePostLoginPath("MODERATOR", "//evil.example")).toBe(
      "/mod/roster",
    );
    expect(resolvePostLoginPath("MODERATOR", "/\\evil.example")).toBe(
      "/mod/roster",
    );
  });

  it("UNIT-05: distinguishes custodian-only navigation", () => {
    expect(isCustodianRole("CUSTODIAN")).toBe(true);
    expect(isCustodianRole("MODERATOR")).toBe(false);
    expect(isCustodianRole("LISTENER")).toBe(false);
  });
});
