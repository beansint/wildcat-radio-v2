"use client";

import { MessagesSquare, Send, Users } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { ChatFrame, NewMessagesJump } from "./chat-frame";
import { ChatReportDialog } from "./chat-report-dialog";
import { ChatMessage, type ChatMessageProps } from "./chat-message";
import { InlinePoll } from "./inline-poll";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PollResponseDto } from "@/lib/api/model";
import { EngagementErrorNotice } from "@/components/listen/engagement-error-notice";
import { getApiErrorMessage } from "@/lib/api/error-message";

export interface ChatMsg extends ChatMessageProps {
  id: string;
  authorId?: string | null;
  authorHandle?: string | null;
}

interface ChatColumnProps {
  messages: ChatMsg[];
  reporterId?: string;
  reporterHandle?: string | null;
  onSend: (text: string) => Promise<void>;
  listenerCount: number | null;
  polls: PollResponseDto[];
  selectedOptions: Record<string, string>;
  onVote: (input: { pollId: string; optionId: string }) => Promise<unknown>;
  votePending: boolean;
  voteError: string | null;
  pollsLoading: boolean;
  pollsError: string | null;
  isLive: boolean;
  chatRestriction?: string | null;
  voteRestriction?: string | null;
}

export const ChatColumn = memo(function ChatColumn({
  messages,
  reporterId,
  reporterHandle,
  onSend,
  listenerCount,
  polls,
  selectedOptions,
  onVote,
  votePending,
  voteError,
  pollsLoading,
  pollsError,
  isLive,
  chatRestriction,
  voteRestriction,
}: ChatColumnProps) {
  const messageIds = useMemo(() => messages.map(message => message.id), [messages]);
  const [inputValue, setInputValue] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reportTarget, setReportTarget] = useState<ChatMsg | null>(null);
  const gate = useEngagementGate();
  // Avoid SSR/client hydration mismatch: the gate depends on session data
  // that isn't visible during SSR (cross-origin httpOnly cookie), so the
  // very first client render must match the server's neutral shell. Only
  // reveal the auth-dependent branch (gate notice vs form) after mount.
  const mounted = useHydrated();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || sending || !isLive || chatRestriction) return;
    setSending(true);
    setSendError(null);
    try {
      await onSend(text);
      setInputValue("");
    } catch (error) {
      setSendError(getApiErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatFrame title="Live chat" messageIds={messageIds} heading={<>
        <div className="font-extrabold flex items-center gap-2">
          <MessagesSquare className="w-[18px] h-[18px] text-maroon" aria-hidden="true" />
          Live chat
        </div>
        {isLive && listenerCount !== null && (
          <span className="wc-chip-ghost tnum">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            {listenerCount}
          </span>
        )}
      </>}>
      {({ feedRef, onScroll, unread, jumpToLatest, focused }) => <>
      <div
        id="chatFeed"
        ref={feedRef}
        onScroll={onScroll}
        tabIndex={-1}
        className="wc-chatfeed min-h-0 flex-1 overflow-y-auto hide-scrollbar p-3"
        style={focused ? undefined : { maxHeight: "min(62vh, 560px)" }}
        aria-live={unread ? "off" : "polite"}
        aria-relevant="additions"
        data-testid="engagement-chat-feed"
      >
        {messages.length === 0 ? (
          <div className="wc-muted text-sm px-2 py-3">
            {isLive
              ? "Chat will appear here when listeners and the booth post during the episode."
              : "Chat is available during a live episode."}
          </div>
        ) : (
          messages.map((msg) => {
            // This is a UI convenience only. The report request uses message
            // identity and the API resolves its actual author independently.
            const ownMessage = msg.authorId
              ? msg.authorId === reporterId
              : !!reporterHandle && msg.authorHandle === reporterHandle;
            const reportable = msg.variant !== "booth" && !!(msg.authorId || msg.authorHandle) && !ownMessage;
            return (
              <div key={msg.id} data-testid="chat-report-message" data-chat-message-id={msg.id}>
                <ChatMessage name={msg.name} time={msg.time} body={msg.body} variant={msg.variant} />
                {reportable && <Button type="button" size="sm" variant="ghost" aria-label="Report message" onClick={() => setReportTarget(msg)}>Report</Button>}
              </div>
            );
          })
        )}
        {/* Inline poll placed after messages, matching prototype order */}
        {isLive && (
          <InlinePoll
            polls={polls}
            selectedOptions={selectedOptions}
            onVote={onVote}
            votePending={votePending}
            voteError={voteError}
            loading={pollsLoading}
            error={pollsError}
            disabled={gate !== "ok" || !!voteRestriction}
          />
        )}
        {isLive && voteRestriction && <p className="wc-help px-2">{voteRestriction}</p>}
      </div>

      <NewMessagesJump unread={unread} onJump={jumpToLatest} />

      {reportTarget && <ChatReportDialog message={reportTarget} authenticated={!!reporterId} onClose={() => setReportTarget(null)} />}

      {/* Desktop-only input - gated */}
      {!isLive ? null : !mounted ? (
        <div
          className={`${focused ? "flex" : "hidden lg:flex"} shrink-0 border-t`}
          style={{ borderColor: "var(--border)" }}
          aria-hidden="true"
        />
      ) : gate !== 'ok' ? (
        <div
          className={`${focused ? "flex" : "hidden lg:flex"} shrink-0 border-t`}
          style={{ borderColor: "var(--border)" }}
        >
          <EngagementGateNotice gate={gate} next="/listen" />
        </div>
      ) : chatRestriction ? (
        <p role="status" className="shrink-0 border-t border-border p-3 text-sm wc-muted" data-testid="chat-restriction">{chatRestriction} Playback and fixed reactions remain available.</p>
      ) : (
        <form
          className={`${focused ? "flex" : "hidden lg:flex"} shrink-0 items-center gap-2 p-2.5 border-t pb-[max(.625rem,env(safe-area-inset-bottom))]`}
          style={{ borderColor: "var(--border)" }}
          onSubmit={handleSubmit}
          aria-label={focused ? "Focus chat input" : "Desktop chat input"}
        >
          <Input
            className="flex-1"
            placeholder="Say something to the booth…"
            aria-label="Chat message"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            data-testid="listen-chat-input"
            disabled={sending || !isLive}
          />
          <Button
            type="submit"
            variant="maroon"
            size="icon"
            aria-label="Send"
            disabled={sending || !isLive}
          >
            <Send className="w-5 h-5" aria-hidden="true" />
          </Button>
        </form>
      )}
      {isLive && sendError && (
        <EngagementErrorNotice error={sendError} className={`${focused ? "block" : "hidden lg:block"} shrink-0 px-3 pb-2.5`} />
      )}
      </>}
    </ChatFrame>
  );
});
