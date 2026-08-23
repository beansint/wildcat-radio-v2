"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth/client";
import { useStream } from "@/lib/stream/stream-context";
import { useEngagementRoom } from "@/lib/realtime/use-engagement-room";
import { Stage } from "@/components/listen/stage";
import { ChatColumn } from "@/components/listen/chat-column";
import { MobileChatInput } from "@/components/listen/mobile-chat-input";
import { EngagementSheet } from "@/components/listen/engagement-sheet";
import { pushToast } from "@/components/listen/toast";
import type { SheetTab } from "@/components/listen/engagement-tiles";

export function ListenClient() {
  const { listeners, episodeId, status, manifestAvailability } = useStream();
  const { data: session } = useSession();
  const isLive = manifestAvailability === "ready" && status === "LIVE" && Boolean(episodeId);
  const engagementEpisodeId = isLive ? episodeId : null;
  const engagement = useEngagementRoom(
    engagementEpisodeId,
    pushToast,
    session?.user?.id ?? null,
  );

  const [sheetState, setSheetState] = useState<{
    scope: string;
    open: boolean;
    tab: SheetTab;
  }>({ scope: "", open: false, tab: "req" });

  function openSheet(tab: SheetTab) {
    setSheetState({ scope: episodeScope, open: true, tab });
  }

  function closeSheet() {
    setSheetState((current) => ({ ...current, open: false }));
  }

  const episodeScope = engagementEpisodeId ?? `${manifestAvailability}:${status}`;
  const sheetOpen = sheetState.scope === episodeScope && sheetState.open;
  const sheetTab = sheetState.scope === episodeScope ? sheetState.tab : "req";

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
          isLive={isLive}
        />

        {/* Chat column - right column */}
        <ChatColumn
          key={`chat:${episodeScope}`}
          messages={engagement.messages}
          onSend={engagement.sendChat}
          listenerCount={listeners}
          polls={engagement.polls}
          selectedOptions={engagement.selectedOptions}
          onVote={engagement.vote}
          votePending={engagement.votePending}
          voteError={engagement.voteError}
          pollsLoading={engagement.pollsLoading}
          pollsError={engagement.pollsError}
          isLive={isLive}
        />
      </main>

      {/* Mobile sticky chat input */}
      <MobileChatInput
        key={`mobile-chat:${episodeScope}`}
        onOpenSheet={openSheet}
        onSend={engagement.sendChat}
        onReact={() => engagement.react("🔥")}
        reacting={engagement.reacting}
        isLive={isLive}
      />

      {/* Engagement bottom sheet + overlay */}
      <EngagementSheet
        key={`sheet:${episodeScope}`}
        open={sheetOpen}
        tab={sheetTab}
        onTabChange={(tab) => setSheetState({ scope: episodeScope, open: true, tab })}
        onClose={closeSheet}
        pushToast={pushToast}
        onSubmitQueue={engagement.submitQueue}
        submitting={engagement.submitQueuePending}
        submitError={engagement.submitQueueError}
        disabled={!isLive}
      />

      {/* Toast portal */}
    </div>
  );
}
