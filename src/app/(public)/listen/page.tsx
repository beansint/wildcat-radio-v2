"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth/client";
import { useStream } from "@/lib/stream/stream-context";
import { useEngagementRoom } from "@/lib/realtime/use-engagement-room";
import { Stage } from "@/components/listen/stage";
import { ChatColumn } from "@/components/listen/chat-column";
import { MobileChatInput } from "@/components/listen/mobile-chat-input";
import { EngagementSheet } from "@/components/listen/engagement-sheet";
import { useToast } from "@/components/listen/toast";
import type { SheetTab } from "@/components/listen/engagement-tiles";

export default function ListenPage() {
  const { listeners, episodeId, status } = useStream();
  const { data: session } = useSession();
  const { pushToast, ToastHost } = useToast();
  const engagement = useEngagementRoom(episodeId, pushToast, session?.user?.id ?? null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SheetTab>("req");

  function openSheet(tab: SheetTab) {
    setSheetTab(tab);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  const listenerCount = listeners ?? 142;

  return (
    /* muted background matches prototype `body{background:var(--muted)}` for listen page */
    <div className="flex-1 flex flex-col" style={{ background: "var(--muted)" }}>
      <main className="wc-container w-full py-4 grid gap-4 lg:grid-cols-[1.04fr_.96fr] lg:items-start">
        {/* Stage - left column (sticky on desktop) */}
        <Stage
          onOpenSheet={openSheet}
          pinnedTopic={engagement.pinnedTopic}
          hype={engagement.hype}
          upNext={engagement.upNext}
          onReact={engagement.react}
          reacting={engagement.reacting}
          reactionError={engagement.reactionError}
          isLive={Boolean(episodeId) && status === "LIVE"}
        />

        {/* Chat column - right column */}
        <ChatColumn
          messages={engagement.messages}
          onSend={engagement.sendChat}
          listenerCount={listenerCount}
          polls={engagement.polls}
          selectedOptions={engagement.selectedOptions}
          onVote={engagement.vote}
          votePending={engagement.votePending}
          voteError={engagement.voteError}
          pollsLoading={engagement.pollsLoading}
          pollsError={engagement.pollsError}
          isLive={Boolean(episodeId)}
        />
      </main>

      {/* Mobile sticky chat input */}
      <MobileChatInput
        onOpenSheet={openSheet}
        onSend={engagement.sendChat}
        onReact={() => engagement.react("🔥")}
        reacting={engagement.reacting}
      />

      {/* Engagement bottom sheet + overlay */}
      <EngagementSheet
        open={sheetOpen}
        tab={sheetTab}
        onTabChange={setSheetTab}
        onClose={closeSheet}
        pushToast={pushToast}
        onSubmitQueue={engagement.submitQueue}
        submitting={engagement.submitQueuePending}
        submitError={engagement.submitQueueError}
        disabled={!episodeId}
      />

      {/* Toast portal */}
      <ToastHost />
    </div>
  );
}
