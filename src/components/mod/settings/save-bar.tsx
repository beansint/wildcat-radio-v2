"use client";

/**
 * Sticky Discard/Save bar — the settings form's *single* `role="alert"`
 * region lives here (invariants/07 §3), fed by client-side validation or a
 * save failure. A successful save instead renders `role="status"` so it
 * doesn't compete with the alert role, matching
 * `page.getByRole('status').or(page.getByRole('alert'))` in the spec.
 */
import { Button } from "@/components/ui/button";

interface SaveBarProps {
  isDirty: boolean;
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
  alertMessage: string | null;
  statusMessage: string | null;
}

export function SaveBar({ isDirty, isSaving, onDiscard, onSave, alertMessage, statusMessage }: SaveBarProps) {
  return (
    <div
      className="sticky bottom-0 mt-5 -mx-4 md:-mx-7 lg:mx-0 px-4 md:px-7 lg:px-0 py-3 border-t"
      style={{ background: "var(--background)", borderColor: "var(--border)" }}
    >
      {alertMessage ? (
        <div role="alert" className="mb-2 text-sm font-semibold text-destructive">
          {alertMessage}
        </div>
      ) : (
        statusMessage && (
          <div role="status" className="mb-2 text-sm font-semibold text-success">
            {statusMessage}
          </div>
        )
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="mod-settings-discard"
          disabled={!isDirty || isSaving}
          onClick={onDiscard}
        >
          Discard
        </Button>
        <Button type="button" data-testid="mod-settings-save" disabled={!isDirty || isSaving} onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}
