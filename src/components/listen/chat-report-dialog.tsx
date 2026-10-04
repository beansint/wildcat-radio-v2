"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { moderationControllerCreateReport } from "@/lib/api/endpoints/moderation/moderation";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ChatReportDialogProps {
  message: { id: string; name: string; body: string };
  authenticated: boolean;
  onClose: () => void;
}

export function ChatReportDialog({ message, authenticated, onClose }: ChatReportDialogProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [opener] = useState<HTMLElement | null>(() => typeof document !== "undefined" ? document.activeElement as HTMLElement : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || sent || !authenticated) return;
    const text = reason.trim();
    if (!text) { setError("Enter a reason for reporting this message."); return; }
    if (text.length > 2000) { setError("Keep the reason within 2,000 characters."); return; }
    setPending(true);
    setError(null);
    try {
      // The server derives the subject from this real message id. Public
      // snapshots do not expose user ids, and display names are not identity.
      await moderationControllerCreateReport({ body: JSON.stringify({ targetMessageId: message.id, reason: text }) });
      setSent(true);
    } catch (error) {
      setError(getApiErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent data-testid="chat-report-dialog" showCloseButton={!pending} onCloseAutoFocus={(event) => { event.preventDefault(); opener?.focus(); }}>
        <DialogHeader>
          <DialogTitle>Report message</DialogTitle>
          <DialogDescription>Send this message to staff for review.</DialogDescription>
        </DialogHeader>
        <blockquote className="min-w-0 rounded-lg bg-muted p-3 text-sm [overflow-wrap:anywhere]">
          <p className="font-semibold">{message.name}</p>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
        </blockquote>
        {!authenticated ? (
          <>
            <p>Sign in before reporting a message.</p>
            <Button asChild><Link href="/login?next=/listen">Sign in to report</Link></Button>
          </>
        ) : sent ? (
          <>
            <p role="status">Report sent. Staff will review this message.</p>
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-3">
            <Label htmlFor="chat-report-reason">Reason for reporting</Label>
            <Textarea id="chat-report-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} disabled={pending} required autoFocus />
            <p className="wc-help">Up to 2,000 characters.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send report"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
