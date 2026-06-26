"use client";

import { X, Music, Megaphone, HelpCircle } from "lucide-react";
import { useState } from "react";
import type { SheetTab } from "./engagement-tiles";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";

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
    <>
      {/* Overlay */}
      <div
        className={`wc-overlay${open ? " open" : ""}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`wc-sheet${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Send to the booth"
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-extrabold">Send to the booth</h3>
            <button
              className="wc-btn wc-btn-ghost wc-btn-icon"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

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
                  <label className="wc-label" htmlFor="req-song">Song &amp; artist</label>
                  <input
                    id="req-song"
                    className="wc-input mb-3"
                    placeholder="e.g. Ere — Juan Karlos"
                    value={reqSong}
                    onChange={(e) => setReqSong(e.target.value)}
                    required
                  />
                  <label className="wc-label" htmlFor="req-note">
                    Note to DJ <span className="wc-muted font-normal">(optional)</span>
                  </label>
                  <input
                    id="req-note"
                    className="wc-input mb-4"
                    placeholder="Birthday greet sana 🥳"
                    value={reqNote}
                    onChange={(e) => setReqNote(e.target.value)}
                  />
                  <button type="submit" className="wc-btn wc-btn-primary wc-btn-block">
                    Send request
                  </button>
                </form>
              )}

              {/* Dedication panel */}
              {tab === "ded" && (
                <form onSubmit={handleDedSubmit}>
                  <label className="wc-label" htmlFor="ded-body">Your shout-out / bati</label>
                  <textarea
                    id="ded-body"
                    className="wc-textarea mb-3"
                    rows={2}
                    placeholder="Para sa BSIT-3A, padayon mga 'dong!"
                    value={dedBody}
                    onChange={(e) => setDedBody(e.target.value)}
                    required
                  />
                  <label className="wc-label" htmlFor="ded-to">
                    To <span className="wc-muted font-normal">(optional)</span>
                  </label>
                  <input
                    id="ded-to"
                    className="wc-input mb-4"
                    placeholder="BSIT-3A"
                    value={dedTo}
                    onChange={(e) => setDedTo(e.target.value)}
                  />
                  <button type="submit" className="wc-btn wc-btn-primary wc-btn-block">
                    Send dedication
                  </button>
                </form>
              )}

              {/* Q&A panel */}
              {tab === "qa" && (
                <form onSubmit={handleQaSubmit}>
                  <label className="wc-label" htmlFor="qa-body">Your question</label>
                  <textarea
                    id="qa-body"
                    className="wc-textarea mb-4"
                    rows={3}
                    placeholder="What's your favorite OPM album of all time?"
                    value={qaBody}
                    onChange={(e) => setQaBody(e.target.value)}
                    required
                  />
                  <button type="submit" className="wc-btn wc-btn-primary wc-btn-block">
                    Ask the DJ
                  </button>
                </form>
              )}

              <p className="wc-help mt-3">
                The broadcast comes first — your message goes privately to the DJ&apos;s queue. You&apos;ll get a receipt only when it&apos;s used on air.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
