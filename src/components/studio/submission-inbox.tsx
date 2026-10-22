"use client";

import { useState } from "react";
import { Check, Heart, HelpCircle, Inbox, Megaphone, Music, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QueueAction, StudioQueue } from "@/lib/engagement/api";
import { groupStudioQueue } from "@/lib/engagement/queue-policy";

const META = {
  REQUEST: { icon: Music, iconClass: "wc-ti-req", label: "Request" },
  DEDICATION: { icon: Heart, iconClass: "wc-ti-ded", label: "Dedication" },
  QUESTION: { icon: HelpCircle, iconClass: "wc-ti-qa", label: "Q&A" },
};

export function SubmissionInbox({ queue, loading, pending, onAct }: {
  queue: StudioQueue | undefined;
  loading: boolean;
  pending: boolean;
  onAct: (id: string, action: QueueAction) => void;
}) {
  const [view, setView] = useState<"pending" | "upNext" | "history">("pending");
  const groups = groupStudioQueue(queue?.items ?? []);
  const items = view === "upNext"
    ? [...groups.upNext].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    : groups[view];
  return <>
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Inbox className="h-5 w-5 text-gold" aria-hidden="true" />
      <h2 className="font-extrabold">Inbox</h2>
      <span className="wc-chip py-0.5 text-[.7rem]" data-testid="studio-pending-count" aria-label={`${groups.pending.length} pending`}>{groups.pending.length}</span>
      <span className="text-xs wc-muted">Pending submissions need a decision</span>
    </div>
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Submission queue view">
      {([ ["pending", "Pending"], ["upNext", "Up Next"], ["history", "History"] ] as const).map(([key, label]) =>
        <Button key={key} size="sm" variant={view === key ? "default" : "outline"} aria-pressed={view === key} onClick={() => setView(key)} data-testid={`studio-queue-${key}`}>{label}</Button>)}
    </div>
    <p className="wc-help mb-3">{view === "pending" ? "Queue publishes the item in Up Next. Read on air sends a private receipt when enabled. Decline is silent." : view === "upNext" ? "Oldest submissions first. Mark an item handled to remove it from public Up Next; no new receipt is sent." : "Completed and closed items stay here for this episode."}</p>
    <div className="wc-stack" data-testid="studio-queue">
      {loading ? <p className="text-sm wc-muted">Loading queue…</p> : items.length ? items.map(item => {
        const meta = META[item.type];
        const Icon = meta.icon;
        return <article key={item.id} className="wc-card wc-card-pad" data-testid={`studio-submission-${item.id}`}>
          <div className="flex items-start gap-2">
            <span className={`wc-typeicon ${meta.iconClass}`}><Icon aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase wc-muted">{meta.label}</span><span className="text-xs font-semibold wc-muted">{item.status === "READ" ? "Read on air" : item.status}</span></div>
              <p className="whitespace-pre-wrap break-words text-sm">{item.text} · <span className="text-gold">@{item.submitter?.handle ?? "listener"}</span></p>
              {item.recipient && <p className="mt-1 text-xs wc-muted">For {item.recipient}</p>}
            </div>
          </div>
          {item.status === "PENDING" && <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => onAct(item.id, "QUEUE")}><Check className="h-3.5 w-3.5" aria-hidden="true" />Queue</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onAct(item.id, "READ")}><Megaphone className="h-3.5 w-3.5" aria-hidden="true" />Read on air</Button>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => onAct(item.id, "DECLINE")}><X className="h-3.5 w-3.5" aria-hidden="true" />Decline</Button>
          </div>}
          {item.status === "QUEUED" && <div className="mt-3"><Button size="sm" variant="outline" disabled={pending} onClick={() => onAct(item.id, "HANDLE")}><Check className="h-3.5 w-3.5" aria-hidden="true" />Handled</Button></div>}
        </article>;
      }) : <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm wc-muted">{view === "pending" ? "All caught up. New listener submissions will appear here privately." : view === "upNext" ? "Nothing queued. Accepted submissions will appear here." : "No history yet this episode."}</p>}
    </div>
    {view === "history" && queue?.historyTruncated && <p className="wc-help mt-3">Showing the 100 most recent history items.</p>}
  </>;
}
