"use client";

import { Music, Megaphone, HelpCircle } from "lucide-react";

export type SheetTab = "req" | "ded" | "qa";

interface EngagementTilesProps {
  onOpen: (tab: SheetTab) => void;
}

export function EngagementTiles({ onOpen }: EngagementTilesProps) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2">
      <button
        className="act"
        onClick={() => onOpen("req")}
        aria-label="Send a song request"
        data-testid="engagement-open-request"
      >
        <Music aria-hidden="true" />
        Request
      </button>
      <button
        className="act"
        onClick={() => onOpen("ded")}
        aria-label="Send a dedication"
        data-testid="engagement-open-dedication"
      >
        <Megaphone aria-hidden="true" />
        Dedication
      </button>
      <button
        className="act"
        onClick={() => onOpen("qa")}
        aria-label="Ask the DJ a question"
        data-testid="engagement-open-qa"
      >
        <HelpCircle aria-hidden="true" />
        Q&amp;A
      </button>
    </div>
  );
}
