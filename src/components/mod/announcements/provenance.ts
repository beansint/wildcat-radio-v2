/**
 * Staff-only provenance line for an announcement card (backend feature.md
 * AC-4: created / reviewed / published / featured / last-edited, each
 * resolved to a handle). Never falls back to a raw id — an actor that
 * resolved to neither a handle nor a name is simply omitted, matching
 * ANN-I-02's "never a raw id or 'undefined'" invariant. This module is
 * staff-only by construction (the public DTO carries none of these
 * fields) — never import it from a public-surface component.
 */
export interface ProvenanceActor {
  id: string;
  name: string | null;
  handle: string | null;
}

export interface ProvenanceInput {
  createdBy: ProvenanceActor | null;
  reviewedBy: ProvenanceActor | null;
  publishedBy: ProvenanceActor | null;
  featuredBy: ProvenanceActor | null;
  lastEditedBy: ProvenanceActor | null;
}

export function actorLabel(actor: ProvenanceActor | null | undefined): string | null {
  if (!actor) return null;
  if (actor.handle) return `@${actor.handle}`;
  if (actor.name) return actor.name;
  return null;
}

/** Ordered created -> reviewed -> published -> featured -> last-edited; unresolved/null actors are skipped. */
export function provenanceSegments(input: ProvenanceInput): string[] {
  const segments: string[] = [];

  const created = actorLabel(input.createdBy);
  if (created) segments.push(`Created by ${created}`);

  const reviewed = actorLabel(input.reviewedBy);
  if (reviewed) segments.push(`Reviewed by ${reviewed}`);

  const published = actorLabel(input.publishedBy);
  if (published) segments.push(`Published by ${published}`);

  const featured = actorLabel(input.featuredBy);
  if (featured) segments.push(`Featured by ${featured}`);

  const lastEdited = actorLabel(input.lastEditedBy);
  if (lastEdited) segments.push(`Last edited by ${lastEdited}`);

  return segments;
}
