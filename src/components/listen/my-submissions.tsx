"use client";

import type { MySubmissions as History } from "@/lib/engagement/api";
import { quotaMessage } from "@/lib/engagement/queue-policy";
import { Button } from "@/components/ui/button";

const STATUS_LABELS = { PENDING: "Pending", QUEUED: "Up Next", READ: "Read on air", HANDLED: "Handled", CLOSED: "Closed" };
const TYPE_LABELS = { REQUEST: "Request", DEDICATION: "Dedication", QUESTION: "Question" };

export function MySubmissions({ data, loading, error, onRetry, currentEpisode }: {
  data: History | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  currentEpisode: boolean;
}) {
  return (
    <section className="wc-card wc-card-pad" aria-label="My submissions" data-testid="my-submissions">
      <h2 className="font-extrabold">My submissions</h2>
      <p className="wc-help mt-1">Only you can see this history. {currentEpisode ? "This episode" : "Your latest episode"}.</p>
      {data && <p className="mt-2 text-sm" data-testid="submission-budget">{quotaMessage(data.budget)}</p>}
      {loading && <p className="mt-2 text-sm wc-muted">Loading your submissions…</p>}
      {error && <div role="alert" className="mt-2 text-sm"><p>{error}</p><Button variant="outline" size="sm" onClick={onRetry}>Retry history</Button></div>}
      {data && <details className="mt-3">
        <summary className="cursor-pointer text-sm font-bold">View submissions ({data.items.length}{data.historyTruncated ? "+" : ""})</summary>
        {data.items.length ? <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto">
          {data.items.map(item => <li key={item.id} className="rounded-xl border border-border p-3" data-testid={`my-submission-${item.id}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="wc-muted">{TYPE_LABELS[item.type]}</span><span className="wc-chip-ghost" data-testid="submission-status">{STATUS_LABELS[item.status]}</span></div>
            <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>
            {item.recipient && <p className="wc-help mt-1">For {item.recipient}</p>}
            <time dateTime={item.createdAt} className="wc-help mt-1 block">{new Date(item.createdAt).toLocaleString()}</time>
          </li>)}
        </ol> : <p className="mt-2 text-sm wc-muted">Your requests, dedications, and questions will appear here.</p>}
        {data.historyTruncated && <p className="wc-help mt-2">Showing your 100 most recent submissions. Your allowance includes every submission.</p>}
        <p className="wc-help mt-2">Handled means the booth completed the item; it does not confirm a song played. Closed items are no longer active.</p>
      </details>}
    </section>
  );
}
