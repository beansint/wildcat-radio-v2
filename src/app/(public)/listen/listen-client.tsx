"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import { useStream } from "@/lib/stream/stream-context";
import { useEngagementRoom } from "@/lib/realtime/use-engagement-room";
import { Stage } from "@/components/listen/stage";
import { ChatColumn } from "@/components/listen/chat-column";
import { MobileChatInput } from "@/components/listen/mobile-chat-input";
import { EngagementSheet } from "@/components/listen/engagement-sheet";
import { pushToast } from "@/components/listen/toast";
import type { SheetTab } from "@/components/listen/engagement-tiles";
import {
  clearStationHandoff,
  consumeStationHandoff,
  readStationHandoff,
} from "@/lib/station-handoff";

export function ListenClient() {
  const router = useRouter();
  const [handoffState, setHandoffState] = useState<"idle" | "consuming" | "error">("idle");
  const { listeners, episodeId, status, manifestAvailability } = useStream();
  const { data: session } = useSession();
  const isLive = manifestAvailability === "ready" && status === "LIVE" && Boolean(episodeId);
  const engagementEpisodeId = isLive ? episodeId : null;
  const engagement = useEngagementRoom(
    engagementEpisodeId,
    pushToast,
    session?.user?.id ?? null,
  );

  useEffect(() => {
    const handoff = readStationHandoff(window.location.hash);
    if (!handoff) return;

    clearStationHandoff(window.location, (state, title, url) => {
      window.history.replaceState(state, title, url);
    });
    let cancelled = false;
    void (async () => {
      // Defer the state transition one microtask so the effect remains an
      // external handoff subscription rather than a synchronous render loop.
      await Promise.resolve();
      if (cancelled) return;
      setHandoffState("consuming");
      try {
        await consumeStationHandoff(handoff);
        if (!cancelled) router.replace("/studio");
      } catch {
        if (!cancelled) setHandoffState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

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

  if (handoffState === "consuming") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 text-sm wc-muted">
        Connecting to the Studio dashboard…
      </main>
    );
  }

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

      {handoffState === "error" && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <div role="alert" className="wc-card wc-card-pad text-sm">
            The Studio dashboard handoff expired or was already used. Open the dashboard from
            WildCat Studio again.
          </div>
        </div>
      )}

      {/* Toast portal */}
    </div>
  );
}
