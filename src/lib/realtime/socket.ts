import type { Socket } from "socket.io-client";
import { resolveSocketUrl } from "./socket-url";

interface Disconnectable {
  disconnect(): void;
}

export interface SocketLease<T> {
  socket: T;
  release: () => void;
}

/**
 * Owns one lazily-created shared transport. Consumers receive idempotent
 * leases, so releasing presence cannot disconnect engagement or Studio.
 */
export class SocketLeaseManager<T extends Disconnectable> {
  private socket: T | null = null;
  private connecting: Promise<T> | null = null;
  private owners = 0;

  constructor(private readonly create: () => Promise<T>) {}

  async acquire(): Promise<SocketLease<T>> {
    this.owners += 1;
    let released = false;

    try {
      const socket = await this.getOrCreate();
      return {
        socket,
        release: () => {
          if (released) return;
          released = true;
          this.owners -= 1;
          this.disconnectIfIdle();
        },
      };
    } catch (error) {
      this.owners -= 1;
      this.disconnectIfIdle();
      throw error;
    }
  }

  private getOrCreate(): Promise<T> {
    if (this.socket) return Promise.resolve(this.socket);
    if (this.connecting) return this.connecting;

    this.connecting = this.create().then(
      (socket) => {
        this.socket = socket;
        this.connecting = null;
        this.disconnectIfIdle();
        return socket;
      },
      (error) => {
        this.connecting = null;
        throw error;
      },
    );
    return this.connecting;
  }

  private disconnectIfIdle(): void {
    if (this.owners !== 0 || !this.socket) return;
    this.socket.disconnect();
    this.socket = null;
  }
}

async function createSocket(): Promise<Socket> {
  if (typeof window === "undefined") {
    throw new Error("acquireSocket() must only be called in the browser");
  }
  const { io } = await import("socket.io-client");
  return io(resolveSocketUrl(process.env.NEXT_PUBLIC_API_URL), {
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: true,
  });
}

const socketLeases = new SocketLeaseManager(createSocket);

export function acquireSocket(): Promise<SocketLease<Socket>> {
  return socketLeases.acquire();
}
