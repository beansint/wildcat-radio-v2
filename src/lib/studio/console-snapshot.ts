/**
 * live-path-hardening (#127) — studio console recovery helpers.
 *
 * The console only ever saw engagement events emitted while its socket was
 * connected, so a reload or reconnect started it empty. On join and on every
 * reconnect it now merges the episode's public engagement snapshot in.
 */
import type {
  ChatMessageResponseDto,
  EpisodeEngagementSnapshotDto,
  PollResponseDto,
} from "@/lib/api/model";

const CONSOLE_CHAT_LIMIT = 100;

/** `customFetch` errors read "<status> <text>: <body>"; only 401/403 mean "not authorised". */
export function isAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const match = error.message.match(/^(\d{3})\s/);
  return match !== null && (match[1] === "401" || match[1] === "403");
}

export function mergeSnapshotChat(
  current: ChatMessageResponseDto[],
  snapshot: EpisodeEngagementSnapshotDto,
  preserveIds: ReadonlySet<string> = new Set(),
  removedIds: ReadonlySet<string> = new Set(),
): ChatMessageResponseDto[] {
  const byId = new Map(current.filter(message => preserveIds.has(message.id) && !removedIds.has(message.id)).map((message) => [message.id, message]));
  for (const message of snapshot.recentChat) {
    if (byId.has(message.id) || removedIds.has(message.id)) continue;
    byId.set(message.id, {
      id: message.id,
      episodeId: snapshot.episodeId,
      content: message.content,
      asBooth: message.asBooth,
      createdAt: message.createdAt,
      // The public snapshot omits author ids; the console only shows handles.
      author: message.author ? { id: "", ...message.author } : null,
    });
  }
  return [...byId.values()]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-CONSOLE_CHAT_LIMIT);
}

export function mergeSnapshotPolls(current: PollResponseDto[], snapshot: PollResponseDto[], preserveIds: ReadonlySet<string> = new Set()): PollResponseDto[] {
  const byId = new Map(snapshot.map(poll => [poll.id, poll]));
  for (const poll of current) if (preserveIds.has(poll.id)) byId.set(poll.id, poll);
  return [...byId.values()];
}
