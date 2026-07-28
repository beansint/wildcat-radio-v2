/**
 * Client-side photo validation mirrors the server (Slice B AC-B3) so a
 * rejection surfaces before an upload round-trip, and the presigned-PUT
 * upload issues the exact headers R2 checks against the presign call — a
 * Content-Length/Content-Type mismatch is what R2 actually rejects.
 */
export const ANNOUNCEMENT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AnnouncementPhotoType = (typeof ANNOUNCEMENT_PHOTO_TYPES)[number];

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 4;

export interface PhotoCandidate {
  type: string;
  size: number;
  existingCount: number;
}

export type PhotoValidation = { ok: true } | { ok: false; message: string };

export function validatePhoto(candidate: PhotoCandidate): PhotoValidation {
  if (candidate.existingCount >= MAX_PHOTOS) {
    return { ok: false, message: `Up to ${MAX_PHOTOS} photos per announcement.` };
  }
  if (!(ANNOUNCEMENT_PHOTO_TYPES as readonly string[]).includes(candidate.type)) {
    return { ok: false, message: `Unsupported file type "${candidate.type}" — use JPEG, PNG, or WebP.` };
  }
  if (candidate.size <= 0) {
    return { ok: false, message: "That file is empty." };
  }
  if (candidate.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: "That file is larger than the 5 MB limit." };
  }
  return { ok: true };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Structural over `File` so unit tests can pass a stub, but callers MUST pass
 * the real `File` from the picker: R2 signed a specific Content-Length, so the
 * request body has to be those exact bytes — passing a `{type, size}` shape
 * would send an empty body against a signed length and fail at R2.
 */
export interface UploadablePhoto {
  type: string;
  size: number;
}

/**
 * PUT the file straight to the presigned R2 URL — no auth cookie belongs on
 * that request (`credentials: 'omit'`), and Content-Type/Content-Length must
 * match exactly what was declared to the presign call.
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  file: UploadablePhoto,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const response = await fetchImpl(uploadUrl, {
    method: "PUT",
    credentials: "omit",
    headers: {
      "Content-Type": file.type,
      "Content-Length": String(file.size),
    },
    body: file as unknown as BodyInit,
  });

  if (!response.ok) {
    throw new Error(`Photo upload failed (${response.status}). Try again.`);
  }
}
