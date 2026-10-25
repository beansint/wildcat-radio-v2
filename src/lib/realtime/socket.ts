import type { Socket } from "socket.io-client";
import { resolveSocketUrl } from "./socket-url";

interface Disconnectable {
  disconnect(): void;
  connect?(): unknown;
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
  private identity: string | undefined;

  constructor(private readonly create: () => Promise<T>) {}

  setIdentity(identity: string): void {
    // The persistent status owner outlives identity-scoped pages. Refresh the
    // cookie handshake here so page remounts cannot reset the identity detector.
    const changed = this.identity !== undefined && this.identity !== identity;
    this.identity = identity;
    if (changed && this.socket) {
      this.socket.disconnect();
      this.socket.connect?.();
    }
  }

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

    const createdFor = this.identity;
    this.connecting = this.create().then(
      (socket) => {
        this.socket = socket;
        this.connecting = null;
        if (createdFor !== this.identity) { socket.disconnect(); socket.connect?.(); }
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

export function synchronizeSocketIdentity(identity: string): void {
  socketLeases.setIdentity(identity);
}
