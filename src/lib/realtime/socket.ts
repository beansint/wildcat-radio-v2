import type { Socket } from "socket.io-client";
import { resolveSocketUrl } from "./socket-url";

let _socket: Socket | null = null;
let _connecting: Promise<Socket> | null = null;

/**
 * Lazily creates (via a dynamic `import("socket.io-client")`) and connects a
 * singleton Socket.IO client, shared across the whole app. Only call this
 * from real listen-intent code paths (e.g. inside `useStreamPresence` while
 * `active` is true) — every call here opens a live WebSocket connection.
 *
 * Safe to call multiple times concurrently; concurrent callers share the
 * same in-flight connection instead of racing separate `io()` calls.
 */
export async function getSocket(): Promise<Socket> {
  if (_socket) return _socket;
  if (_connecting) return _connecting;

  if (typeof window === "undefined") {
    throw new Error("getSocket() must only be called in the browser");
  }

  _connecting = import("socket.io-client").then(({ io }) => {
    const socket = io(resolveSocketUrl(process.env.NEXT_PUBLIC_API_URL), {
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: true,
    });
    _socket = socket;
    _connecting = null;
    return socket;
  });

  return _connecting;
}

/**
 * Returns the existing socket instance WITHOUT creating one. Use this for
 * "say goodbye on the way out" cleanup (e.g. an unmount effect emitting
 * `listening:leave`) — if there is no socket, there is nothing to leave, and
 * calling this must never itself open a connection.
 */
export function getExistingSocket(): Socket | null {
  return _socket;
}

/**
 * Disconnects and clears the singleton, if one exists. Called when the
 * listener goes idle so no socket lingers between listening sessions.
 */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
  _connecting = null;
}
