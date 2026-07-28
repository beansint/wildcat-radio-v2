/**
 * Spec-first: ANN-I-02 ("provenance renders resolved handles, never a raw
 * id or 'undefined'") pushed down to a unit-testable pure function.
 */
import { describe, it, expect } from "vitest";
import { actorLabel, provenanceSegments, type ProvenanceInput } from "../provenance";

describe("actorLabel", () => {
  it("prefers the handle", () => {
    expect(actorLabel({ id: "clabc123", name: "Mara Santos", handle: "mara.dj" })).toBe("@mara.dj");
  });

  it("falls back to name when handle is null", () => {
    expect(actorLabel({ id: "clabc123", name: "Mara Santos", handle: null })).toBe("Mara Santos");
  });

  it("never falls back to the raw id — returns null instead", () => {
    expect(actorLabel({ id: "clabc123", name: null, handle: null })).toBeNull();
  });

  it("null actor -> null", () => {
    expect(actorLabel(null)).toBeNull();
    expect(actorLabel(undefined)).toBeNull();
  });
});

describe("provenanceSegments", () => {
  const base: ProvenanceInput = {
    createdBy: { id: "c1", name: "Mara Santos", handle: "mara.dj" },
    reviewedBy: null,
    publishedBy: { id: "c2", name: null, handle: "custodian" },
    featuredBy: null,
    lastEditedBy: { id: "c1", name: "Mara Santos", handle: "mara.dj" },
  };

  it("orders created -> reviewed -> published -> featured -> last-edited, skipping nulls", () => {
    expect(provenanceSegments(base)).toEqual([
      "Created by @mara.dj",
      "Published by @custodian",
      "Last edited by @mara.dj",
    ]);
  });

  it("all null -> empty, never 'undefined' text", () => {
    const empty: ProvenanceInput = {
      createdBy: null,
      reviewedBy: null,
      publishedBy: null,
      featuredBy: null,
      lastEditedBy: null,
    };
    const segments = provenanceSegments(empty);
    expect(segments).toEqual([]);
    expect(segments.join(" ")).not.toContain("undefined");
  });

  it("an unresolved actor (no handle, no name) is omitted, not rendered as its id", () => {
    const withUnresolved: ProvenanceInput = {
      ...base,
      reviewedBy: { id: "clnothingreallyhere0000000", name: null, handle: null },
    };
    const segments = provenanceSegments(withUnresolved);
    expect(segments.join(" ")).not.toMatch(/clnothingreallyhere/);
  });
});
