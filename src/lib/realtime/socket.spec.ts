import { describe, expect, it, vi } from "vitest";
import { SocketLeaseManager } from "./socket";

interface FakeSocket {
  disconnect: ReturnType<typeof vi.fn>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SocketLeaseManager", () => {
  it("disconnects only after the final owner releases", async () => {
    const socket: FakeSocket = { disconnect: vi.fn() };
    const manager = new SocketLeaseManager(async () => socket);

    const first = await manager.acquire();
    const second = await manager.acquire();
    first.release();
    expect(socket.disconnect).not.toHaveBeenCalled();

    second.release();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("makes release idempotent", async () => {
    const socket: FakeSocket = { disconnect: vi.fn() };
    const manager = new SocketLeaseManager(async () => socket);
    const lease = await manager.acquire();

    lease.release();
    lease.release();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("shares in-flight creation without losing either owner", async () => {
    const socket: FakeSocket = { disconnect: vi.fn() };
    const pending = deferred<FakeSocket>();
    const create = vi.fn(() => pending.promise);
    const manager = new SocketLeaseManager(create);

    const firstPromise = manager.acquire();
    const secondPromise = manager.acquire();
    pending.resolve(socket);
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(first.socket).toBe(second.socket);
    first.release();
    expect(socket.disconnect).not.toHaveBeenCalled();
    second.release();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not disconnect an in-flight socket if a new owner arrives", async () => {
    const firstSocket: FakeSocket = { disconnect: vi.fn() };
    const secondSocket: FakeSocket = { disconnect: vi.fn() };
    const pending = deferred<FakeSocket>();
    const create = vi
      .fn<() => Promise<FakeSocket>>()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(secondSocket);
    const manager = new SocketLeaseManager(create);

    const firstPromise = manager.acquire();
    const secondPromise = manager.acquire();
    pending.resolve(firstSocket);
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    first.release();
    second.release();

    const third = await manager.acquire();
    expect(firstSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(third.socket).toBe(secondSocket);
    third.release();
  });
});
