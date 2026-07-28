/**
 * Public-surface content helpers: relative/absolute publish-date labels,
 * plain-text paragraph splitting (never HTML — the caller renders these as
 * text, never through dangerouslySetInnerHTML), query-error classification
 * matched to what `src/lib/api/fetcher.ts` actually throws, and an allowed-
 * image-host guard so `next/image` never gets handed an unconfigured host.
 */
import { formatDate } from "@/components/standing/format";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { MEDIA_HOST } from "@/lib/content/media-host";

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
const RELATIVE_WINDOW_MS = 7 * MS_DAY;

function relativeLabel(diffMs: number): string {
  if (diffMs < MS_MINUTE) return "Just now";
  if (diffMs < MS_HOUR) {
    const minutes = Math.floor(diffMs / MS_MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < MS_DAY) {
    const hours = Math.floor(diffMs / MS_HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(diffMs / MS_DAY);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** `publishedAt` is contractually nullable; never crashes, never "Invalid Date". */
export function formatPublishedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const diff = Date.now() - d.getTime();
  if (diff >= 0 && diff < RELATIVE_WINDOW_MS) {
    return relativeLabel(diff);
  }
  return formatDate(iso);
}

/**
 * Plain text — no rich editor. Splits on blank lines into paragraphs while
 * keeping single line breaks inside each paragraph; the result is always
 * plain strings for the caller to render as text.
 */
export function toParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function extractStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/^(\d{3})\s/);
  return match ? Number(match[1]) : null;
}

export interface QueryErrorClassification {
  rateLimited: boolean;
  notFound: boolean;
  message: string;
}

export function classifyQueryError(error: unknown): QueryErrorClassification {
  const status = extractStatus(error);
  return {
    rateLimited: status === 429,
    notFound: status === 404,
    message: getApiErrorMessage(error),
  };
}

/** The only host `next/image` is configured for — anything else throws at runtime if passed through. */
export function isAllowedImageHost(url: string): boolean {
  try {
    return new URL(url).host === MEDIA_HOST;
  } catch {
    return false;
  }
}

export function filterAllowedPhotoUrls(urls: readonly string[]): string[] {
  return urls.filter(isAllowedImageHost);
}
