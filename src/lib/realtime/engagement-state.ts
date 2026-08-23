import type { PollResponseDto } from "@/lib/api/model";

export interface LiveChatMessage {
  id: string;
  name: string;
  body: string;
  time?: string;
  variant?: "booth" | "mod";
}

export interface QueueReceipt {
  itemId: string;
  status: string;
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
