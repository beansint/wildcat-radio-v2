"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { moderationControllerCreateReinstatement } from "@/lib/api/endpoints/moderation/moderation";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const reinstatementSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Tell us why you should be reinstated.")
    .max(2000, "Keep it under 2000 characters."),
});

type ReinstatementForm = z.infer<typeof reinstatementSchema>;

interface ReinstatementCardProps {
  /** Only banned users get a real action here — otherwise this is inert info copy. */
  isBanned: boolean;
}

/**
 * "Reinstatement" card — prototype: listener/standing.html. Inert/informational
 * by default (`background:var(--muted);opacity:.85`); becomes a real request
 * form once the user is actually banned.
 */
export function ReinstatementCard({ isBanned }: ReinstatementCardProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReinstatementForm>({
    resolver: zodResolver(reinstatementSchema),
    defaultValues: { text: "" },
  });

  const reinstatementMutation = useMutation({
    mutationFn: (values: ReinstatementForm) =>
      moderationControllerCreateReinstatement({
        body: JSON.stringify({ text: values.text.trim() }),
      }),
  });

  if (!isBanned) {
    return (
      <div className="wc-card wc-card-pad" style={{ background: "var(--muted)", opacity: 0.85 }}>
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 mt-0.5 wc-muted flex-none" aria-hidden="true" />
          <div>
            <div className="font-bold wc-muted">Reinstatement</div>
            <p className="wc-help mt-1">
              Banned users may request reinstatement after one clean semester. This option
              appears here automatically once you&apos;re eligible.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const busy = isSubmitting || reinstatementMutation.isPending;
  const alertMessage =
    errors.text?.message ??
    (reinstatementMutation.isError ? getApiErrorMessage(reinstatementMutation.error) : null);

  function onSubmit(values: ReinstatementForm) {
    reinstatementMutation.mutate(values, {
      onSuccess: () => reset({ text: "" }),
    });
  }

  return (
    <div className="wc-card wc-card-pad" data-testid="standing-reinstatement">
      <div className="flex items-start gap-3 mb-3">
        <Info className="w-5 h-5 mt-0.5 text-maroon flex-none" aria-hidden="true" />
        <div>
          <div className="font-bold">Reinstatement</div>
          <p className="wc-help mt-1">
            Banned users may request reinstatement after one clean semester. If you believe
            you&apos;re eligible, tell us why below.
          </p>
        </div>
      </div>

      {reinstatementMutation.isSuccess ? (
        <p className="wc-help mb-0" data-testid="standing-reinstatement-success">
          Your reinstatement request is in — a moderator will follow up.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          {alertMessage && (
            <div role="alert" className="mb-3 text-sm font-semibold text-destructive">
              {alertMessage}
            </div>
          )}
          <Label htmlFor="standing-reinstatement-text">Why should you be reinstated?</Label>
          <Textarea
            id="standing-reinstatement-text"
            className="mb-3"
            rows={4}
            placeholder="Tell us what's changed…"
            disabled={busy}
            data-testid="standing-reinstatement-text"
            {...register("text")}
          />
          <Button type="submit" disabled={busy} data-testid="standing-reinstatement-submit">
            <Send className="w-4 h-4" aria-hidden="true" />
            {busy ? "Submitting…" : "Request reinstatement"}
          </Button>
        </form>
      )}
    </div>
  );
}
