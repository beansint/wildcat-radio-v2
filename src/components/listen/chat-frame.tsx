"use client";

import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useChatReader } from "@/lib/engagement/use-chat-reader";

type Reader = ReturnType<typeof useChatReader>;

export function ChatFrame({ title, heading, messageIds, children }: {
  title: string;
  heading: ReactNode;
  messageIds: readonly string[];
  children: (reader: Reader & { focused: boolean }) => ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const reader = useChatReader(messageIds);
  return (
    <Dialog open={focused} onOpenChange={setFocused}>
      <section className="wc-card flex min-h-0 flex-col overflow-hidden bg-card" aria-label={title}>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          {heading}
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Focus ${title.toLowerCase()}`}>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />Focus
            </Button>
          </DialogTrigger>
        </header>
        {!focused && children({ ...reader, focused: false })}
      </section>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:inset-3 sm:h-[calc(100dvh-1.5rem)] sm:w-[calc(100%-1.5rem)] sm:rounded-2xl"
        data-testid="chat-focus-dialog"
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild>
            <Button variant="outline" size="sm" aria-label="Exit focus mode"><Minimize2 className="h-4 w-4" aria-hidden="true" />Exit focus</Button>
          </DialogClose>
        </header>
        <DialogDescription className="sr-only">Full-height chat. Escape exits focus mode and returns to the focus button.</DialogDescription>
        {children({ ...reader, focused: true })}
      </DialogContent>
    </Dialog>
  );
}

export function NewMessagesJump({ unread, onJump }: { unread: number; onJump: () => void }) {
  if (!unread) return null;
  return <div className="flex shrink-0 justify-center border-t border-border bg-card p-2"><Button variant="outline" size="sm" onClick={onJump} aria-label={`New messages (${unread}). Jump to latest.`} data-testid="chat-new-messages">New messages ({unread}) ↓</Button></div>;
}
