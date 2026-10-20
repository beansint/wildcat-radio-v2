import type { PinnedTopic } from "./engagement-state";

/** Only events received during the latest HTTP request can override it. */
export class SnapshotRecovery {
  private sequence = 0;
  private pending: {
    token: number;
    preserveLiveIds: Set<string>;
    removedIds: Set<string>;
    preservePin: boolean;
    preserveHype: boolean;
  } | null = null;
  begin() {
    const token = ++this.sequence;
    this.pending = {
      token,
      preserveLiveIds: new Set(),
      removedIds: new Set(),
      preservePin: false,
      preserveHype: false,
    };
    return token;
  }
  mark(event: { id?: string; removed?: boolean; scalar?: "pin" | "hype" }) {
    const p = this.pending;
    if (!p) return;
    if (event.id) {
      if (event.removed) {
        p.removedIds.add(event.id);
        p.preserveLiveIds.delete(event.id);
      } else p.preserveLiveIds.add(event.id);
    }
    if (event.scalar === "pin") p.preservePin = true;
    if (event.scalar === "hype") p.preserveHype = true;
  }
  finish(token: number) {
    if (this.pending?.token !== token) return null;
    const result = this.pending;
    this.pending = null;
    return result;
  }
  cancel() {
    this.pending = null;
    this.sequence++;
  }
}
export function activePin<T extends PinnedTopic>(
  pin: T | null,
  now = Date.now(),
): T | null {
  if (!pin?.text) return null;
  return pin.expiresAt && new Date(pin.expiresAt).getTime() <= now ? null : pin;
}
export function measuredBarHeights(buckets: ReadonlyArray<{ count: number }>) {
  const peak = Math.max(0, ...buckets.map((b) => b.count));
  return buckets.map((b) => (peak ? (Math.max(0, b.count) / peak) * 100 : 0));
}
