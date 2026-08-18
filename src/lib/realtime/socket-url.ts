/**
 * Resolves the Socket.IO server URL from an env value, falling back to the
 * local backend dev port (3010 — NOT 3000/3001, which are the frontend dev
 * port and a stale backend port used by older fixtures respectively).
 *
 * Pure so it's unit-testable without touching `process.env` or the network.
 */
import { DEV_API_ORIGIN } from "@/lib/api-origin";

export function resolveSocketUrl(envValue: string | undefined): string {
  return envValue && envValue.length > 0 ? envValue : DEV_API_ORIGIN;
}
