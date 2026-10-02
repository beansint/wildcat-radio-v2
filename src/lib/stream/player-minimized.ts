import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the global player is collapsed to its corner pill. A per-viewer
 * convenience, so it lives in localStorage — every access is guarded because
 * storage can be blocked (private mode, disabled site data) and the player
 * must still render. useSyncExternalStore keeps SSR on the expanded bar and
 * syncs other tabs through the `storage` event.
 */
const KEY = "wc-player-minimized";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let memory: boolean | null = null;

function getSnapshot(): boolean {
  return memory ?? read();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setPlayerMinimized(next: boolean) {
  memory = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: the in-memory value still drives this tab.
  }
  listeners.forEach((l) => l());
}

export function usePlayerMinimized(): [boolean, (next: boolean) => void] {
  const minimized = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const set = useCallback((next: boolean) => setPlayerMinimized(next), []);
  return [minimized, set];
}
