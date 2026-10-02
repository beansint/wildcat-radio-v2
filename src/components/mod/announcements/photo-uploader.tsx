"use client";

/**
 * Announcement photo uploader — drop zone + thumbnail grid around the
 * unchanged AC-5 flow (validate -> presign -> PUT -> confirm, one file at a
 * time). Replaces the bare native file input.
 *
 * INV-2 still holds: this component never renders its own `role="alert"`.
 * Failures go to `onError`, which the dialog funnels into its single alert
 * region; the failed tile only carries a visual marker.
 *
 * There is no remove-photo API, so persisted photos have no remove control —
 * only a failed selection can be dismissed.
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { AlertCircle, ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENT_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  uploadToPresignedUrl,
  validatePhoto,
} from "@/lib/announcements/photos";
import { filterAllowedPhotoUrls } from "@/lib/content/format";
import { humanizeAnnouncementError } from "@/lib/announcements/errors";
import type { PhotoUploadHandlers } from "./announcement-form-dialog";

interface PendingPhoto {
  id: string;
  name: string;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  error?: string;
  /** For `done`: the server photo count that makes this tile redundant. */
  settlesAt?: number;
}

interface PhotoUploaderProps {
  photos: readonly string[];
  handlers?: PhotoUploadHandlers;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
}

const MAX_MB = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));

export function PhotoUploader({ photos, handlers, disabled, onBusyChange, onError }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [dragging, setDragging] = useState(false);

  // Revoke every preview URL on unmount (dialog close).
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      for (const p of pendingRef.current) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  // A `done` tile stands in for its photo until the refetched DTO includes it.
  const visiblePending = pending.filter((p) => !(p.status === "done" && photos.length >= (p.settlesAt ?? 0)));
  const inFlight = visiblePending.filter((p) => p.status !== "error").length;
  const used = photos.length + inFlight;
  const uploading = pending.some((p) => p.status === "uploading");
  const full = used >= MAX_PHOTOS;
  const zoneDisabled = !!disabled || uploading || full || !handlers;
  const persisted = filterAllowedPhotoUrls(photos);

  function update(id: string, patch: Partial<PendingPhoto>) {
    setPending((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function dismiss(id: string) {
    setPending((list) => {
      const hit = list.find((p) => p.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return list.filter((p) => p.id !== id);
    });
    onError(null);
  }

  async function uploadFiles(files: File[]) {
    if (!handlers || files.length === 0) return;
    onError(null);
    let count = used;
    onBusyChange(true);
    try {
      for (const file of files) {
        const validation = validatePhoto({ type: file.type, size: file.size, existingCount: count });
        if (!validation.ok) {
          onError(validation.message);
          // Over the cap: stop rather than flag every remaining file.
          if (count >= MAX_PHOTOS) break;
          continue;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setPending((list) => [
          ...list,
          { id, name: file.name, previewUrl: URL.createObjectURL(file), status: "uploading" },
        ]);
        try {
          const presigned = await handlers.requestUpload({ contentType: file.type, sizeBytes: file.size });
          await uploadToPresignedUrl(presigned.uploadUrl, file);
          await handlers.confirmUpload(presigned.key);
          count += 1;
          update(id, { status: "done", settlesAt: count });
        } catch (err) {
          const message = humanizeAnnouncementError(err, "validation");
          update(id, { status: "error", error: message });
          onError(message);
        }
      }
    } finally {
      onBusyChange(false);
    }
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setDragging(false);
    if (zoneDisabled) return;
    void uploadFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        id="mod-ann-photo-input"
        type="file"
        accept={ANNOUNCEMENT_PHOTO_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        data-testid="mod-ann-photo-input"
        disabled={zoneDisabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void uploadFiles(files);
        }}
      />

      {(persisted.length > 0 || visiblePending.length > 0) && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" aria-label="Announcement photos">
          {persisted.map((src, i) => (
            <li key={src} className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
              <Image src={src} alt={`Photo ${i + 1}`} fill sizes="120px" unoptimized className="object-cover" />
            </li>
          ))}
          {visiblePending.map((p) => (
            <li
              key={p.id}
              className={cn(
                "relative aspect-square overflow-hidden rounded-xl border bg-muted",
                p.status === "error" && "border-destructive",
              )}
              data-testid="mod-ann-photo-pending"
              data-status={p.status}
            >
              <Image src={p.previewUrl} alt={p.name} fill sizes="120px" unoptimized className="object-cover" />
              {p.status === "uploading" && (
                <div className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                  <Loader2 className="size-6 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Uploading {p.name}</span>
                </div>
              )}
              {p.status === "error" && (
                <>
                  <div
                    className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-destructive/90 px-1.5 py-1 text-[11px] font-semibold text-white"
                    title={p.error}
                  >
                    <AlertCircle className="size-3.5 flex-none" aria-hidden="true" />
                    <span className="truncate">Upload failed</span>
                  </div>
                  <button
                    type="button"
                    className="absolute right-0 top-0 grid size-11 place-items-center"
                    aria-label={`Dismiss failed upload ${p.name}`}
                    onClick={() => dismiss(p.id)}
                  >
                    <span className="grid size-7 place-items-center rounded-full bg-black/60 text-white">
                      <X className="size-4" aria-hidden="true" />
                    </span>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        data-testid="mod-ann-photo-dropzone"
        disabled={zoneDisabled}
        aria-describedby="mod-ann-photo-count"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!zoneDisabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon",
          dragging ? "border-maroon bg-accent" : "border-border hover:border-maroon/60 hover:bg-muted/60",
          zoneDisabled && "cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent",
        )}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="text-sm font-semibold">
          {uploading
            ? "Uploading…"
            : full
              ? "Photo limit reached"
              : dragging
                ? "Drop to upload"
                : "Add photos — click or drag & drop"}
        </span>
        <span className="text-xs text-muted-foreground">JPEG, PNG or WebP · up to {MAX_MB} MB each</span>
      </button>

      <p id="mod-ann-photo-count" className="wc-help" data-testid="mod-ann-photo-count">
        {photos.length} of {MAX_PHOTOS} uploaded
      </p>
    </div>
  );
}
