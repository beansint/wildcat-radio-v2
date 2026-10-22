import { getEpisodeEngagementSnapshot } from "@/lib/api/endpoints/episodes/episodes";

interface RequestJob<T> {
  promise: Promise<T>;
  fetching: boolean;
  dirty: boolean;
}

const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

function rateLimited(error: unknown): boolean {
  // customFetch prefixes HTTP failures with their numeric status. Also accept
  // a structured status if that client gains a typed error in the future.
  return (typeof error === "object" && error !== null && "status" in error && error.status === 429)
    || (error instanceof Error && /^429(?:\s|$)/.test(error.message));
}

/** One pending read per episode across player/listener consumers; no result cache. */
export class SnapshotRequests<T> {
  private readonly jobs = new Map<string, RequestJob<T>>();
  constructor(private readonly load: (episodeId: string) => Promise<T>) {}

  read(episodeId: string): Promise<T> {
    const pending = this.jobs.get(episodeId);
    if (pending) {
      // A commit may follow the SELECT already in flight. Every reader must
      // receive the follow-up snapshot, rather than resurrecting handled rows.
      if (pending.fetching) pending.dirty = true;
      return pending.promise;
    }
    const job = { fetching: false, dirty: false } as RequestJob<T>;
    job.promise = this.loadFresh(episodeId, job).finally(() => {
      if (this.jobs.get(episodeId) === job) this.jobs.delete(episodeId);
    });
    this.jobs.set(episodeId, job);
    return job.promise;
  }

  private async loadFresh(episodeId: string, job: RequestJob<T>): Promise<T> {
    let throttles = 0;
    // Queue up-next/changed events and both consumers normally share a burst.
    await pause(50);
    for (;;) {
      job.dirty = false;
      job.fetching = true;
      try {
        const result = await this.load(episodeId);
        job.fetching = false;
        if (!job.dirty) return result;
        await pause(50);
      } catch (error) {
        job.fetching = false;
        if (!rateLimited(error) || throttles++ >= 2) throw error;
        // Production uses a 60s read window. All callers share at most two
        // retries after that window, even if no further socket event arrives.
        await pause(61_000);
      }
    }
  }
}

const publicSnapshots = new SnapshotRequests(getEpisodeEngagementSnapshot);
export const requestEngagementSnapshot = (episodeId: string) => publicSnapshots.read(episodeId);
