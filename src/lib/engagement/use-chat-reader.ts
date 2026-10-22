"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { isChatAtBottom, unreadMessageCount } from "./chat-scroll";

/** A reader who scrolls away from the bottom owns their reading position. */
export function useChatReader(messageIds: readonly string[]) {
  const feedRef = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const readingTop = useRef(0);
  const readingAnchor = useRef<{ id: string; offset: number } | null>(null);
  const seen = useRef<Set<string>>(new Set(messageIds));
  const currentIds = useRef(messageIds);
  const [unread, setUnread] = useState(0);

  const jumpToLatest = useCallback(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
    following.current = true;
    seen.current = new Set(currentIds.current);
    setUnread(0);
    // The jump may unmount its button. Keep keyboard users in the chat.
    feed?.focus({ preventScroll: true });
  }, []);
  const onScroll = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    readingTop.current = feed.scrollTop;
    following.current = isChatAtBottom(feed);
    const top = feed.getBoundingClientRect().top;
    const firstVisible = [...feed.querySelectorAll<HTMLElement>("[data-chat-message-id]")].find(message => message.getBoundingClientRect().bottom > top);
    readingAnchor.current = firstVisible ? { id: firstVisible.dataset.chatMessageId!, offset: firstVisible.getBoundingClientRect().top - top } : null;
    if (following.current) {
      seen.current = new Set(currentIds.current);
      setUnread(0);
    }
  }, []);
  const attachFeed = useCallback((feed: HTMLDivElement | null) => {
    feedRef.current = feed;
    if (feed) feed.scrollTop = following.current ? feed.scrollHeight : readingTop.current;
  }, []);

  useLayoutEffect(() => {
    currentIds.current = messageIds;
    const feed = feedRef.current;
    if (following.current) {
      if (feed) feed.scrollTop = feed.scrollHeight;
      seen.current = new Set(messageIds);
      setUnread(0);
    } else {
      const anchor = readingAnchor.current;
      const message = feed && anchor ? feed.querySelector<HTMLElement>(`[data-chat-message-id="${CSS.escape(anchor.id)}"]`) : null;
      if (feed && message && anchor) {
        feed.scrollTop += message.getBoundingClientRect().top - feed.getBoundingClientRect().top - anchor.offset;
        readingTop.current = feed.scrollTop;
      }
      setUnread(unreadMessageCount(messageIds, seen.current));
    }
  }, [messageIds]);

  return { feedRef: attachFeed, onScroll, unread, jumpToLatest };
}
