/**
 * Deterministic cover/mono tile styling for public cards that have no photo —
 * picks one of the theme's six `wc-cover-N` / `wc-mono-N` gradients from the
 * entity's id, and derives a 1–2 letter initials label from its display text
 * (prototype's `.init` tile). Purely cosmetic — not part of the qa-plan's
 * tested surface, so it has no dedicated unit spec.
 */
function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function coverClassFor(id: string): string {
  return `wc-cover-${(hashCode(id) % 6) + 1}`;
}

export function monoClassFor(id: string): string {
  return `wc-mono-${(hashCode(id) % 6) + 1}`;
}

export function initialsFor(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const chars = words.map((w) => w[0]?.toUpperCase() ?? "").join("");
  return chars || "?";
}
