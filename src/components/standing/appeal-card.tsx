"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { moderationControllerCreateAppeal } from "@/lib/api/endpoints/moderation/moderation";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const appealSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Tell us why you think this was unfair.")
    .max(2000, "Keep it under 2000 characters."),
});

type AppealForm = z.infer<typeof appealSchema>;

interface AppealCardProps {
  /** Most recent active strike, if any — appeals attach to it when present. */
  subjectStrikeId?: string;
  /** True when there's an active strike or an active mute/ban to appeal. */
  hasSomethingToAppeal: boolean;
}

/** "Appeal this strike" card — prototype: listener/standing.html. */
export function AppealCard({ subjectStrikeId, hasSomethingToAppeal }: AppealCardProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AppealForm>({
    resolver: zodResolver(appealSchema),
    defaultValues: { text: "" },
  });

  const appealMutation = useMutation({
    mutationFn: (values: AppealForm) =>
      moderationControllerCreateAppeal({
        body: JSON.stringify({ subjectStrikeId, text: values.text.trim() }),
      }),
  });

  if (!hasSomethingToAppeal) {
    return (
      <div className="wc-card wc-card-pad mb-4">
        <h2 className="text-lg font-extrabold mb-1">Appeal this strike</h2>
        <p className="wc-help mb-0">Nothing to appeal right now — you&apos;re in good standing.</p>
      </div>
    );
  }

  const busy = isSubmitting || appealMutation.isPending;
  const alertMessage =
    errors.text?.message ?? (appealMutation.isError ? getApiErrorMessage(appealMutation.error) : null);

  function onSubmit(values: AppealForm) {
    appealMutation.mutate(values, {
      onSuccess: () => reset({ text: "" }),
    });
  }

  return (
    <div className="wc-card wc-card-pad mb-4">
      <h2 className="text-lg font-extrabold mb-1">Appeal this strike</h2>
      <p className="wc-help mb-3">
        Think this was unfair? Tell us what happened. A moderator reviews every appeal and
        you&apos;re guaranteed a written response.
      </p>

      {appealMutation.isSuccess ? (
        <p className="wc-help mb-0" data-testid="standing-appeal-success">
          A written moderator response is guaranteed — watch your notifications.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} data-testid="standing-appeal-form">
          {alertMessage && (
            <div role="alert" className="mb-3 text-sm font-semibold text-destructive">
              {alertMessage}
            </div>
          )}

          <Label htmlFor="standing-appeal">Your appeal</Label>
          <Textarea
            id="standing-appeal"
            className="mb-3"
            rows={4}
            placeholder="Tell us why you think this was unfair…"
            disabled={busy}
            data-testid="standing-appeal-text"
            {...register("text")}
          />

          <Button type="submit" disabled={busy} data-testid="standing-appeal-submit">
            <Send className="w-4 h-4" aria-hidden="true" />
            {busy ? "Submitting…" : "Submit appeal"}
          </Button>
          <p className="wc-help">
            A written moderator response is guaranteed — watch your notifications.
          </p>
        </form>
      )}
    </div>
  );
}
