"use client";

/**
 * Moderation tab's block/watch filter lists — `FilterEntry` rows
 * (`GET/POST/DELETE /api/mod/filter`), a different resource from the typed
 * settings registry (SET-U-05). One shared add-form (word + tier) feeds
 * both lists; duplicate words are rejected client-side via
 * `validateFilterAdd` before the request is even sent.
 *
 * This form gets its own single `role="alert"` region — invariants/07 §3
 * scopes "exactly one alert per form", and the filter-add form is its own
 * form, separate from the settings save form.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  useModerationControllerListFilter,
  getModerationControllerListFilterQueryKey,
  moderationControllerAddFilter,
  moderationControllerRemoveFilter,
} from "@/lib/api/endpoints/moderation/moderation";
import type { FilterEntryDto } from "@/lib/api/model";
import { FilterEntryDtoTier } from "@/lib/api/model";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { validateFilterAdd } from "@/lib/settings/filter-list";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function FilterTierList({
  title,
  help,
  entries,
  onRemove,
  isRemoving,
}: {
  title: string;
  help: string;
  entries: FilterEntryDto[];
  onRemove: (id: string) => void;
  isRemoving: boolean;
}) {
  return (
    <div className="mb-4">
      <Label className="mb-1 block">{title}</Label>
      <p className="wc-help mb-2">{help}</p>
      {entries.length === 0 ? (
        <p className="wc-help">No terms yet.</p>
      ) : (
        <ul className="wc-stack">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="text-sm">{entry.word}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${entry.word}`}
                data-testid="mod-settings-filter-remove"
                disabled={isRemoving}
                onClick={() => onRemove(entry.id)}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FilterListEditor() {
  const queryClient = useQueryClient();
  const filterQuery = useModerationControllerListFilter<FilterEntryDto[]>();
  const entries = filterQuery.data ?? [];

  const [word, setWord] = useState("");
  const [tier, setTier] = useState<FilterEntryDtoTier>(FilterEntryDtoTier.BLOCK);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getModerationControllerListFilterQueryKey() });
  }

  async function handleAdd() {
    const validation = validateFilterAdd(entries, word);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await moderationControllerAddFilter({ body: JSON.stringify({ word: validation.word, tier }) });
      setWord("");
      invalidate();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      await moderationControllerRemoveFilter(id);
      invalidate();
    } catch (removeError) {
      setError(getApiErrorMessage(removeError));
    } finally {
      setRemovingId(null);
    }
  }

  const blockEntries = entries.filter((entry) => entry.tier === FilterEntryDtoTier.BLOCK);
  const watchEntries = entries.filter((entry) => entry.tier === FilterEntryDtoTier.WATCH);

  return (
    <section className="wc-card wc-card-pad">
      <h2 className="font-bold mb-3">Filters</h2>

      <FilterTierList
        title="Block-list"
        help="Matched messages are auto-hidden."
        entries={blockEntries}
        onRemove={handleRemove}
        isRemoving={removingId !== null}
      />
      <FilterTierList
        title="Watch-list"
        help="Context-ambiguous terms — posts normally but is flagged for a mod to review."
        entries={watchEntries}
        onRemove={handleRemove}
        isRemoving={removingId !== null}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[10rem]">
          <Label htmlFor="settings-filter-word" className="mb-1 block">
            Add a term
          </Label>
          <Input
            id="settings-filter-word"
            data-testid="mod-settings-filter-input"
            value={word}
            onChange={(e) => {
              setWord(e.target.value);
              setError(null);
            }}
            placeholder="word or phrase"
          />
        </div>
        <div>
          <Label htmlFor="settings-filter-tier" className="mb-1 block">
            Tier
          </Label>
          <Select value={tier} onValueChange={(next) => setTier(next as FilterEntryDtoTier)}>
            <SelectTrigger id="settings-filter-tier" data-testid="mod-settings-filter-tier" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FilterEntryDtoTier.BLOCK}>Block</SelectItem>
              <SelectItem value={FilterEntryDtoTier.WATCH}>Watch</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          data-testid="mod-settings-filter-add"
          disabled={isSubmitting}
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>

      {error && (
        <div role="alert" className="mt-2 text-sm font-semibold text-destructive">
          {error}
        </div>
      )}
    </section>
  );
}
