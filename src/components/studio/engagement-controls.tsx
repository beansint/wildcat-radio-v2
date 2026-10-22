"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { updateEngagementControls, type EngagementControls } from "@/lib/engagement/api";
import { controlsQueryKey, useEpisodeControls } from "@/lib/engagement/use-episode-controls";

export function StudioEngagementControls({ episodeId }: { episodeId: string }) {
  const client = useQueryClient();
  const query = useEpisodeControls(episodeId);
  const mutation = useMutation({
    mutationFn: (flags: Partial<Pick<EngagementControls, "chatPaused" | "submissionsPaused">>) => updateEngagementControls(episodeId, flags),
    onSuccess: async controls => {
      await client.cancelQueries({ queryKey: controlsQueryKey(controls.episodeId) });
      client.setQueryData(controlsQueryKey(controls.episodeId), controls);
      await client.invalidateQueries({ queryKey: controlsQueryKey(controls.episodeId) });
    },
  });
  const data = query.data;
  const error = mutation.error ?? query.error;
  return <section className="border-b border-border bg-muted/40 px-4 py-3" aria-label="Episode participation controls" data-testid="studio-engagement-controls">
    <h2 className="mb-2 text-sm font-extrabold">Episode participation</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {([ ["chatPaused", "Pause listener chat"], ["submissionsPaused", "Pause new submissions"] ] as const).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <div><Label htmlFor={`studio-${key}`} className="mb-0">{label}</Label><p className="wc-help mt-1">{data ? data[key] ? "Paused for this episode" : "Open for this episode" : "Loading current state…"}</p></div>
        <Switch id={`studio-${key}`} data-testid={`studio-control-${key}`} checked={data?.[key] ?? false} disabled={!data || mutation.isPending} onCheckedChange={checked => mutation.mutate({ [key]: checked })} />
      </div>)}
    </div>
    {data?.staffChatFrozen && <p role="status" className="mt-2 text-sm font-semibold">Station staff have frozen listener chat and new submissions. Resuming booth controls cannot lift this restriction.</p>}
    {data?.staffGuestsDisabled && <p role="status" className="mt-2 text-sm font-semibold">Station staff have paused guest participation, including voting. Campus listeners remain subject to the chat and submission controls.</p>}
    <p className="wc-help mt-2">Playback, fixed reactions, existing content, and staff participation stay available. Booth pauses reset when the episode ends.</p>
    {error && <div role="alert" className="mt-2 text-sm"><p>{getApiErrorMessage(error)}</p>{query.error && <Button variant="outline" size="sm" onClick={() => { void query.refetch(); }}>Retry controls</Button>}</div>}
  </section>;
}
