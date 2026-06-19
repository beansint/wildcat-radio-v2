"use client";

import { useState } from "react";
import { useStream } from "@/lib/stream/stream-context";
import { Stage } from "@/components/listen/stage";
import { ChatColumn, type ChatMsg } from "@/components/listen/chat-column";
import { MobileChatInput } from "@/components/listen/mobile-chat-input";
import { EngagementSheet } from "@/components/listen/engagement-sheet";
import { useToast } from "@/components/listen/toast";
import type { SheetTab } from "@/components/listen/engagement-tiles";

// Seed messages matching the prototype exactly (5 messages incl. booth + mod)
// TODO(M5/M6): wire to live chat API (WebSocket / server-sent events)
const SEED_MESSAGES: ChatMsg[] = [
  { id: 1, name: "@ana_reyes",   time: "2:14 PM", body: "first time tuning in, this is so good 😭" },
  { id: 2, name: "@carlo.bsit",  body: "PARA SA BSIT-3A!! 🔥" },
  { id: 3, name: "Afternoon Vibes", body: "Shoutout sa BSIT-3A! Next up we got a request — stay tuned 🎶", variant: "booth" },
  { id: 4, name: "@jamie",       body: "can you play Ere next 🙏" },
  { id: 5, name: "@mod_mara",    body: "Keep it kind in chat, wildcat 💛", variant: "mod" },
];

let nextId = SEED_MESSAGES.length + 1;

export default function ListenPage() {
  const { listeners } = useStream();
  const { pushToast, ToastHost } = useToast();

  // Chat state
  const [messages, setMessages] = useState<ChatMsg[]>(SEED_MESSAGES);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SheetTab>("req");

  function appendMessage(text: string) {
    // TODO(M5/M6): wire to chat send API
    setMessages((prev) => [
      ...prev,
      { id: nextId++, name: "@you", body: text },
    ]);
  }

  function openSheet(tab: SheetTab) {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  const listenerCount = listeners ?? 142;

  return (
    <>
      <main className="flex-1 wc-container w-full py-4 grid gap-4 lg:grid-cols-[1.04fr_.96fr] lg:items-start">
        {/* Stage — left column (sticky on desktop) */}
        <Stage onOpenSheet={openSheet} />

        {/* Chat column — right column */}
        <ChatColumn
          messages={messages}
          onSend={appendMessage}
          listenerCount={listenerCount}
        />
      </main>

      {/* Mobile sticky chat input */}
      <MobileChatInput onOpenSheet={openSheet} onSend={appendMessage} />

      {/* Engagement bottom sheet + overlay */}
      <EngagementSheet
        open={sheetOpen}
        tab={sheetTab}
        onTabChange={setSheetTab}
        onClose={closeSheet}
        pushToast={pushToast}
      />

      {/* Toast portal */}
      <ToastHost />
    </>
  );
}
