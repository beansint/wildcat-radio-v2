"use client";

import { X, Music, Megaphone, HelpCircle } from "lucide-react";
import { useState } from "react";
import type { SheetTab } from "./engagement-tiles";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface EngagementSheetProps {
  open: boolean;
  tab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  onClose: () => void;
  pushToast: (msg: string) => void;
}

export function EngagementSheet({
  open,
  tab,
  onTabChange,
  onClose,
  pushToast,
}: EngagementSheetProps) {
  const gate = useEngagementGate();

  // Request panel state
  const [reqSong, setReqSong] = useState("");
  const [reqNote, setReqNote] = useState("");

  // Dedication panel state
  const [dedBody, setDedBody] = useState("");
  const [dedTo, setDedTo] = useState("");

  // Q&A panel state
  const [qaBody, setQaBody] = useState("");

  function handleReqSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO(M5/M6): wire to DJ queue API
    pushToast("Queued! DJ will play it when ready");
    setReqSong("");
    setReqNote("");
    onClose();
  }

  function handleDedSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO(M5/M6): wire to DJ queue API
    pushToast("Sent! Watch for it on air");
    setDedBody("");
    setDedTo("");
    onClose();
  }

  function handleQaSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO(M5/M6): wire to DJ queue API
    pushToast("Asked! DJ will pick it up");
    setQaBody("");
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} aria-label="Send to the booth">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <SheetTitle className="text-lg font-extrabold">Send to the booth</SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>
          <SheetDescription className="sr-only">
            Send a song request, dedication, or question to the booth.
          </SheetDescription>

          {/* Engagement gate — if not ok, show CTA instead of forms */}
          {gate !== 'ok' ? (
            <div className="py-4">
              <p className="wc-muted text-sm mb-3">
                {gate === 'anon'
                  ? 'Sign in to send requests, dedications, and questions to the booth.'
                  : 'Verify your email to send requests and dedications.'}
              </p>
              <EngagementGateNotice gate={gate} next="/listen" />
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="wc-seg mb-4">
                <button
                  className={tab === "req" ? "active" : ""}
                  onClick={() => onTabChange("req")}
                >
                  <Music className="w-4 h-4" aria-hidden="true" />
                  Request
                </button>
                <button
                  className={tab === "ded" ? "active" : ""}
                  onClick={() => onTabChange("ded")}
                >
                  <Megaphone className="w-4 h-4" aria-hidden="true" />
                  Dedication
                </button>
                <button
                  className={tab === "qa" ? "active" : ""}
                  onClick={() => onTabChange("qa")}
                >
                  <HelpCircle className="w-4 h-4" aria-hidden="true" />
                  Q&amp;A
                </button>
              </div>

              {/* Request panel */}
              {tab === "req" && (
                <form onSubmit={handleReqSubmit}>
                  <Label htmlFor="req-song">Song &amp; artist</Label>
                  <Input
                    id="req-song"
                    className="mb-3"
                    placeholder="e.g. Ere — Juan Karlos"
                    value={reqSong}
                    onChange={(e) => setReqSong(e.target.value)}
                    required
                  />
                  <Label htmlFor="req-note">
                    Note to DJ <span className="wc-muted font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="req-note"
                    className="mb-4"
                    placeholder="Birthday greet sana 🥳"
                    value={reqNote}
                    onChange={(e) => setReqNote(e.target.value)}
                  />
                  <Button type="submit" className="wc-btn-block">
                    Send request
                  </Button>
                </form>
              )}

              {/* Dedication panel */}
              {tab === "ded" && (
                <form onSubmit={handleDedSubmit}>
                  <Label htmlFor="ded-body">Your shout-out / bati</Label>
                  <Textarea
                    id="ded-body"
                    className="mb-3"
                    rows={2}
                    placeholder="Para sa BSIT-3A, padayon mga 'dong!"
                    value={dedBody}
                    onChange={(e) => setDedBody(e.target.value)}
                    required
                  />
                  <Label htmlFor="ded-to">
                    To <span className="wc-muted font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="ded-to"
                    className="mb-4"
                    placeholder="BSIT-3A"
                    value={dedTo}
                    onChange={(e) => setDedTo(e.target.value)}
                  />
                  <Button type="submit" className="wc-btn-block">
                    Send dedication
                  </Button>
                </form>
              )}

              {/* Q&A panel */}
              {tab === "qa" && (
                <form onSubmit={handleQaSubmit}>
                  <Label htmlFor="qa-body">Your question</Label>
                  <Textarea
                    id="qa-body"
                    className="mb-4"
                    rows={3}
                    placeholder="What's your favorite OPM album of all time?"
                    value={qaBody}
                    onChange={(e) => setQaBody(e.target.value)}
                    required
                  />
                  <Button type="submit" className="wc-btn-block">
                    Ask the DJ
                  </Button>
                </form>
              )}

              <p className="wc-help mt-3">
                The broadcast comes first — your message goes privately to the DJ&apos;s queue. You&apos;ll get a receipt only when it&apos;s used on air.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
