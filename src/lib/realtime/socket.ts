import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

/**
 * Singleton Socket.IO client — connects once, shared across the whole app.
 * Safe to call on every render; returns the same instance.
 */
export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001", {
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: true,
    });
  }
  return _socket;
}
