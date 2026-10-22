import { activePin } from "./snapshot-recovery";
import type {
  EpisodeEngagementSnapshotDto,
  EpisodeSnapshotChatMessageDto,
  PollResponseDto,
} from "@/lib/api/model";

export interface LiveChatMessage {
  id: string;
  authorId?: string | null;
  authorHandle?: string | null;
  name: string;
  body: string;
  time?: string;
  variant?: "booth" | "mod";
}

export interface QueueReceipt {
  episodeId: string;
  itemId: string;
  status: string;
}

export function receiptMatchesEpisode(
  receipt: QueueReceipt,
  episodeId: string | null,
): boolean {
  return episodeId !== null && receipt.episodeId === episodeId;
}

export interface UpNextItem {
  id: string;
  type: string;
  text: string;
  recipient?: string | null;
  by?: string | null;
  createdAt?: string;
}

/** Both public surfaces consume a complete snapshot, never acceptance order. */
export function authoritativeUpNext<T extends { id: string; createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(0, 5);
}

export interface PinnedTopic {
  text: string;
  expiresAt?: string | Date | null;
}

export interface HypeState {
  episodeId?: string;
  capturedAt?: string;
  windowSeconds?: 60;
  buckets?: { startedAt: string; count: number }[];
  stale?: boolean;
  count: number;
  trend: "up" | "down" | "flat" | string;
}

export interface EngagementState {
  episodeId: string | null;
  messages: LiveChatMessage[];
  livePolls: PollResponseDto[];
  selectedOptions: Record<string, string>;
  receipts: QueueReceipt[];
  upNext: UpNextItem[];
  pinnedTopic: PinnedTopic | null;
  hype: HypeState;
}

export function emptyEngagementState(episodeId: string | null): EngagementState {
  return {
    episodeId,
    messages: [],
    livePolls: [],
    selectedOptions: {},
    receipts: [],
    upNext: [],
    pinnedTopic: null,
    hype: { count: 0, trend: "flat", stale: true, buckets: [] },
  };
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function snapshotChatToLiveMessage(
  message: EpisodeSnapshotChatMessageDto,
): LiveChatMessage {
  const author = message.author?.handle ?? message.author?.name ?? "@listener";
  return {
    id: message.id,
    authorHandle: message.author?.handle ?? null,
    name: message.asBooth ? "🎙 Booth" : author,
    body: message.content,
    time: formatTime(message.createdAt),
    variant: message.asBooth ? "booth" : undefined,
  };
}

function mergeById<T extends { id: string }>(
  snapshotItems: T[],
  liveItems: T[],
  preserveIds: ReadonlySet<string>,
  removedIds: ReadonlySet<string>,
): T[] {
  const merged = new Map(
    snapshotItems
      .filter((item) => !removedIds.has(item.id))
      .map((item) => [item.id, item]),
  );
  for (const item of liveItems) {
    if (preserveIds.has(item.id)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

export function mergeEngagementSnapshot(
  current: EngagementState,
  snapshot: EpisodeEngagementSnapshotDto & { hype?: HypeState },
  options: {
    preserveLiveIds?: ReadonlySet<string>;
    removedIds?: ReadonlySet<string>;
    preserveLiveScalars?: boolean;
    preservePin?: boolean;
    preserveHype?: boolean;
  } = {},
): EngagementState {
  if (current.episodeId !== snapshot.episodeId) return current;

  const preserveLiveIds = options.preserveLiveIds ?? new Set<string>();
  const removedIds = options.removedIds ?? new Set<string>();
  const snapshotHype = snapshot.hype ? { ...snapshot.hype, stale: false } : { count: 0, trend: "flat", stale: true, buckets: [] };
  const snapshotPin = snapshot.pinnedTopic
    ? { text: snapshot.pinnedTopic.text, expiresAt: snapshot.pinnedTopic.expiresAt }
    : null;

  return {
    ...current,
    messages: mergeById(
      snapshot.recentChat.map(snapshotChatToLiveMessage),
      current.messages,
      preserveLiveIds,
      removedIds,
    ),
    livePolls: mergeById(snapshot.polls, current.livePolls, preserveLiveIds, removedIds),
    upNext: authoritativeUpNext(snapshot.upNext).map((item) => ({
        id: item.id,
        type: item.type,
        text: item.text,
        recipient: item.recipient,
        by: item.by,
        createdAt: item.createdAt,
      })),
    pinnedTopic: activePin((options.preservePin ?? options.preserveLiveScalars) ? current.pinnedTopic : snapshotPin),
    hype: (options.preserveHype ?? options.preserveLiveScalars) ? current.hype : snapshotHype,
  };
}
