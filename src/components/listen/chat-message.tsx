"use client";

import { Mic } from "lucide-react";

export interface ChatMessageProps {
  name: string;
  time?: string;
  body: string;
  variant?: "booth" | "mod";
}

export function ChatMessage({ name, time, body, variant }: ChatMessageProps) {
  if (variant === "booth") {
    return (
      <div className="wc-msg booth">
        <div className="who">
          <Mic className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{name}</span>
          <span className="wc-chip-ghost text-[.58rem] py-0.5">BOOTH</span>
        </div>
        <div className="body">{body}</div>
      </div>
    );
  }

  if (variant === "mod") {
    return (
      <div className="wc-msg mod">
        <div className="who">
          <span className="name">{name}</span>
          <span className="wc-chip-ghost text-[.58rem] py-0.5">MOD</span>
        </div>
        <div className="body">{body}</div>
      </div>
    );
  }

  return (
    <div className="wc-msg">
      <div className="who">
        <span className="name">{name}</span>
        {time && <span className="wc-muted font-normal text-xs">{time}</span>}
      </div>
      <div className="body">{body}</div>
    </div>
  );
}
