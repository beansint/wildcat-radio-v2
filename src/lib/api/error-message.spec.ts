import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./error-message";

describe("getApiErrorMessage", () => {
  it("strips a leading machine code from a Nest error message (#106)", () => {
    const err = new Error('409 Conflict: {"statusCode":409,"message":"OCCURRENCE_CANCELLED: \\"Midday Mix\\" is cancelled today","error":"Conflict"}');
    expect(getApiErrorMessage(err)).toBe('"Midday Mix" is cancelled today');
  });

  it("keeps ordinary messages and joins validation arrays", () => {
    expect(getApiErrorMessage(new Error('400 Bad Request: {"message":"Show not found"}'))).toBe("Show not found");
    expect(getApiErrorMessage(new Error('400 Bad Request: {"message":["a","b"]}'))).toBe("a b");
  });

  it("falls back for non-errors", () => {
    expect(getApiErrorMessage("nope")).toBe("Something went wrong.");
  });
});
