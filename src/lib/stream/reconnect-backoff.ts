/**
 * live-path-hardening (#127) — player reconnect backoff. A BUTT↔harbor blip or
 * a wifi drop used to burn three instant retries and then strand the listener
 * on a dead play button. While the listener still wants audio, keep trying,
 * backing off 1 s → 2 s → 4 s … capped at 30 s.
 */
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;

export function reconnectDelayMs(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_MS);
}
