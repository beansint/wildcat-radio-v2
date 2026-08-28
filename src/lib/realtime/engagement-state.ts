import type {
  EpisodeEngagementSnapshotDto,
  EpisodeSnapshotChatMessageDto,
  PollResponseDto,
} from "@/lib/api/model";

export interface LiveChatMessage {
  id: string;
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
}

export interface PinnedTopic {
  text: string;
  expiresAt?: string | Date | null;
}

export interface HypeState {
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
    hype: { count: 0, trend: "flat" },
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
  snapshot: EpisodeEngagementSnapshotDto,
  options: {
    preserveLiveIds?: ReadonlySet<string>;
    removedIds?: ReadonlySet<string>;
    preserveLiveScalars?: boolean;
  } = {},
): EngagementState {
  if (current.episodeId !== snapshot.episodeId) return current;

  const preserveLiveIds = options.preserveLiveIds ?? new Set<string>();
  const removedIds = options.removedIds ?? new Set<string>();
  const snapshotHype = {
    count: snapshot.reactions.reduce((total, reaction) => total + reaction.count, 0),
    trend: "flat",
  };
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
    upNext: mergeById(
      snapshot.upNext.map((item) => ({
        id: item.id,
        type: item.type,
        text: item.text,
        recipient: item.recipient,
        by: item.by,
      })),
      current.upNext,
      preserveLiveIds,
      removedIds,
    ),
    pinnedTopic: options.preserveLiveScalars ? current.pinnedTopic : snapshotPin,
    hype: options.preserveLiveScalars ? current.hype : snapshotHype,
  };
}
