"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HelpCircle, Megaphone, Music, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import type { SheetTab } from "./engagement-tiles";
import { useEngagementGate, EngagementGateNotice } from "./engagement-gate";
import { getApiErrorMessage } from "@/lib/api/error-message";
import type { SubmitQueueItemDto } from "@/lib/api/model";
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
  onSubmitQueue: (payload: SubmitQueueItemDto) => Promise<unknown>;
  submitting: boolean;
  submitError: string | null;
  disabled: boolean;
}

const requestSchema = z.object({
  song: z.string().trim().min(1, "Add a song and artist.").max(240, "Keep it under 240 characters."),
  note: z.string().trim().max(240, "Keep the note under 240 characters.").optional(),
});

const dedicationSchema = z.object({
  body: z.string().trim().min(1, "Write the dedication.").max(500, "Keep it under 500 characters."),
  to: z.string().trim().max(120, "Keep the recipient under 120 characters.").optional(),
});

const qaSchema = z.object({
  body: z.string().trim().min(1, "Write your question.").max(500, "Keep it under 500 characters."),
});

type RequestForm = z.infer<typeof requestSchema>;
type DedicationForm = z.infer<typeof dedicationSchema>;
type QaForm = z.infer<typeof qaSchema>;

function errorText(errors: FieldErrors) {
  return Object.values(errors)
    .map((error) => error?.message)
    .filter(Boolean)
    .join(" ");
}

export function EngagementSheet({
  open,
  tab,
  onTabChange,
  onClose,
  pushToast,
  onSubmitQueue,
  submitting,
  submitError,
  disabled,
}: EngagementSheetProps) {
  const gate = useEngagementGate();
  const [localError, setLocalError] = useState<string | null>(null);
  const reqForm = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { song: "", note: "" },
  });
  const dedForm = useForm<DedicationForm>({
    resolver: zodResolver(dedicationSchema),
    defaultValues: { body: "", to: "" },
  });
  const qaForm = useForm<QaForm>({
    resolver: zodResolver(qaSchema),
    defaultValues: { body: "" },
  });

  const activeError = useMemo(() => {
    if (tab === "req") return errorText(reqForm.formState.errors);
    if (tab === "ded") return errorText(dedForm.formState.errors);
    return errorText(qaForm.formState.errors);
  }, [dedForm.formState.errors, qaForm.formState.errors, reqForm.formState.errors, tab]);

  async function submitPayload(payload: SubmitQueueItemDto, reset: () => void, success: string) {
    if (disabled) {
      setLocalError("No live episode right now.");
      return;
    }
    setLocalError(null);
    try {
      await onSubmitQueue(payload);
      pushToast(success);
      reset();
      onClose();
    } catch (error) {
      setLocalError(getApiErrorMessage(error));
    }
  }

  async function handleReqSubmit(values: RequestForm) {
    const note = values.note?.trim();
    await submitPayload(
      {
        type: "REQUEST",
        text: note ? `${values.song.trim()}\n${note}` : values.song.trim(),
      },
      () => reqForm.reset(),
      "Request sent to the booth.",
    );
  }

  async function handleDedSubmit(values: DedicationForm) {
    await submitPayload(
      {
        type: "DEDICATION",
        text: values.body.trim(),
        recipient: values.to?.trim() || undefined,
      },
      () => dedForm.reset(),
      "Dedication sent to the booth.",
    );
  }

  async function handleQaSubmit(values: QaForm) {
    await submitPayload(
      {
        type: "QUESTION",
        text: values.body.trim(),
      },
      () => qaForm.reset(),
      "Question sent to the booth.",
    );
  }

  const alert = localError ?? submitError ?? activeError;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-label="Send to the booth"
        data-testid="engagement-sheet"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <SheetTitle className="text-lg font-extrabold">Send to the booth</SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>
          <SheetDescription className="sr-only">
            Send a song request, dedication, or question to the booth.
          </SheetDescription>

          {gate !== "ok" ? (
            <div className="py-4">
              <p className="wc-muted text-sm mb-3">
                {gate === "anon"
                  ? "Sign in to send requests, dedications, and questions to the booth."
                  : "Verify your email to send requests and dedications."}
              </p>
              <EngagementGateNotice gate={gate} next="/listen" />
            </div>
          ) : (
            <>
              <div className="wc-seg mb-4" role="tablist" aria-label="Message type">
                <button
                  id="engagement-tab-req-btn"
                  role="tab"
                  aria-selected={tab === "req"}
                  aria-controls="engagement-panel-req"
                  className={tab === "req" ? "active" : ""}
                  onClick={() => {
                    setLocalError(null);
                    onTabChange("req");
                  }}
                  data-testid="engagement-tab-request"
                >
                  <Music className="w-4 h-4" aria-hidden="true" />
                  Request
                </button>
                <button
                  id="engagement-tab-ded-btn"
                  role="tab"
                  aria-selected={tab === "ded"}
                  aria-controls="engagement-panel-ded"
                  className={tab === "ded" ? "active" : ""}
                  onClick={() => {
                    setLocalError(null);
                    onTabChange("ded");
                  }}
                  data-testid="engagement-tab-dedication"
                >
                  <Megaphone className="w-4 h-4" aria-hidden="true" />
                  Dedication
                </button>
                <button
                  id="engagement-tab-qa-btn"
                  role="tab"
                  aria-selected={tab === "qa"}
                  aria-controls="engagement-panel-qa"
                  className={tab === "qa" ? "active" : ""}
                  onClick={() => {
                    setLocalError(null);
                    onTabChange("qa");
                  }}
                  data-testid="engagement-tab-qa"
                >
                  <HelpCircle className="w-4 h-4" aria-hidden="true" />
                  Q&amp;A
                </button>
              </div>

              {alert && (
                <div role="alert" className="mb-3 text-sm font-semibold text-destructive">
                  {alert}
                </div>
              )}

              {tab === "req" && (
                <div role="tabpanel" id="engagement-panel-req" aria-labelledby="engagement-tab-req-btn">
                  <form onSubmit={reqForm.handleSubmit(handleReqSubmit)}>
                    <Label htmlFor="req-song">Song &amp; artist</Label>
                    <Input
                      id="req-song"
                      className="mb-3"
                      placeholder="e.g. Ere - Juan Karlos"
                      data-testid="engagement-request-song"
                      disabled={submitting || disabled}
                      {...reqForm.register("song")}
                    />
                    <Label htmlFor="req-note">
                      Note to DJ <span className="wc-muted font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="req-note"
                      className="mb-4"
                      placeholder="Birthday greet sana"
                      data-testid="engagement-request-note"
                      disabled={submitting || disabled}
                      {...reqForm.register("note")}
                    />
                    <Button
                      type="submit"
                      className="wc-btn-block"
                      data-testid="engagement-submit"
                      disabled={submitting || disabled}
                    >
                      Send request
                    </Button>
                  </form>
                </div>
              )}

              {tab === "ded" && (
                <div role="tabpanel" id="engagement-panel-ded" aria-labelledby="engagement-tab-ded-btn">
                  <form onSubmit={dedForm.handleSubmit(handleDedSubmit)}>
                    <Label htmlFor="ded-body">Your shout-out / bati</Label>
                    <Textarea
                      id="ded-body"
                      className="mb-3"
                      rows={2}
                      placeholder="Para sa BSIT-3A, padayon mga 'dong!"
                      data-testid="engagement-dedication-body"
                      disabled={submitting || disabled}
                      {...dedForm.register("body")}
                    />
                    <Label htmlFor="ded-to">
                      To <span className="wc-muted font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="ded-to"
                      className="mb-4"
                      placeholder="BSIT-3A"
                      data-testid="engagement-dedication-to"
                      disabled={submitting || disabled}
                      {...dedForm.register("to")}
                    />
                    <Button
                      type="submit"
                      className="wc-btn-block"
                      data-testid="engagement-submit"
                      disabled={submitting || disabled}
                    >
                      Send dedication
                    </Button>
                  </form>
                </div>
              )}

              {tab === "qa" && (
                <div role="tabpanel" id="engagement-panel-qa" aria-labelledby="engagement-tab-qa-btn">
                  <form onSubmit={qaForm.handleSubmit(handleQaSubmit)}>
                    <Label htmlFor="qa-body">Your question</Label>
                    <Textarea
                      id="qa-body"
                      className="mb-4"
                      rows={3}
                      placeholder="What's your favorite OPM album of all time?"
                      data-testid="engagement-qa-body"
                      disabled={submitting || disabled}
                      {...qaForm.register("body")}
                    />
                    <Button
                      type="submit"
                      className="wc-btn-block"
                      data-testid="engagement-submit"
                      disabled={submitting || disabled}
                    >
                      Ask the DJ
                    </Button>
                  </form>
                </div>
              )}

              <p className="wc-help mt-3">
                The broadcast comes first. Your message goes privately to the DJ&apos;s queue. You&apos;ll get a receipt only when it&apos;s used on air.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
