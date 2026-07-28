"use client";

/**
 * Create/edit announcement dialog — title + plain-text body (no rich
 * editor; the contract is plain text by design, feature.md Scope/Out) and,
 * in edit mode only, the photo panel (AC-5: presign -> PUT -> confirm,
 * three steps, mirrored client-side limits).
 *
 * Photo actions are only offered once the row exists server-side (an id is
 * required to presign against `/announcements/:id/photo`) — the create
 * step only ever sends title/content, matching the golden path in
 * qa-plan.md ("Attach a photo" happens as a *separate* step after Save).
 *
 * Exactly one `role="alert"` region for the whole dialog (INV-2): title
 * validation, save errors, and photo errors all funnel into it, one at a
 * time, so a photo rejection never stacks a second alert node next to a
 * save error.
 */
import { useState, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validatePhoto, uploadToPresignedUrl, MAX_PHOTOS } from "@/lib/announcements/photos";
import { humanizeAnnouncementError } from "@/lib/announcements/errors";

export interface AnnouncementFormValues {
  title: string;
  content: string;
}

export interface PhotoUploadHandlers {
  requestUpload: (body: { contentType: string; sizeBytes: number }) => Promise<{ uploadUrl: string; key: string }>;
  confirmUpload: (key: string) => Promise<void>;
}

interface AnnouncementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted (or null) in create mode. */
  editing?: { id: string; title: string; content: string; photos: readonly string[] } | null;
  onSave: (values: AnnouncementFormValues) => void;
  saving?: boolean;
  saveError?: string | null;
  photoHandlers?: PhotoUploadHandlers;
}

export function AnnouncementFormDialog({
  open,
  onOpenChange,
  editing,
  onSave,
  saving,
  saveError,
  photoHandlers,
}: AnnouncementFormDialogProps) {
  const isEdit = !!editing;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [content, setContent] = useState(editing?.content ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const photos = editing?.photos ?? [];
  const busy = !!saving || photoBusy;

  // See review-dialog.tsx for why this is needed: this dialog is opened from
  // row/page state, not a `<Dialog.Trigger>`, so Radix's built-in
  // onCloseAutoFocus (which only refocuses `context.triggerRef`) would
  // otherwise silently drop focus to `<body>` on close. `useState`'s lazy
  // initializer (not a ref read during render — forbidden by this repo's
  // react-hooks/refs lint rule) captures it once, on mount.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null,
  );

  function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError("Add a title.");
      return;
    }
    setTitleError(null);
    onSave({ title: trimmedTitle, content });
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !photoHandlers) return;

    const validation = validatePhoto({ type: file.type, size: file.size, existingCount: photos.length });
    if (!validation.ok) {
      setPhotoError(validation.message);
      return;
    }
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const presigned = await photoHandlers.requestUpload({ contentType: file.type, sizeBytes: file.size });
      await uploadToPresignedUrl(presigned.uploadUrl, file);
      await photoHandlers.confirmUpload(presigned.key);
    } catch (err) {
      setPhotoError(humanizeAnnouncementError(err, "validation"));
    } finally {
      setPhotoBusy(false);
    }
  }

  const alertMessage = titleError ?? photoError ?? saveError ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTitleError(null);
          setPhotoError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        data-testid="mod-ann-form-dialog"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit announcement" : "New announcement"}</DialogTitle>
          <DialogDescription>Plain text — no rich editor. Line breaks are kept.</DialogDescription>
        </DialogHeader>

        {alertMessage && (
          <div role="alert" className="text-sm font-semibold text-destructive">
            {alertMessage}
          </div>
        )}

        <Label htmlFor="mod-ann-title">Title</Label>
        <Input
          id="mod-ann-title"
          className="mb-3"
          placeholder="e.g. Brownout advisory — Thu broadcast may be cut short"
          data-testid="mod-ann-title"
          disabled={busy}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Label htmlFor="mod-ann-body">Body</Label>
        <Textarea
          id="mod-ann-body"
          rows={5}
          className="mb-3"
          placeholder="Write the announcement…"
          data-testid="mod-ann-body"
          disabled={busy}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {isEdit && (
          <div className="mb-3">
            <Label htmlFor="mod-ann-photo-input">Photos</Label>
            <input
              id="mod-ann-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              data-testid="mod-ann-photo-input"
              disabled={busy || photos.length >= MAX_PHOTOS}
              onChange={handlePhotoChange}
            />
            <p className="wc-help" data-testid="mod-ann-photo-count">
              {photos.length} of {MAX_PHOTOS} uploaded
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" data-testid="mod-ann-save" disabled={busy} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
