"use client";

/**
 * Renders a versioned legal notice from `GET /api/legal/:document`.
 *
 * There is no design basis for this page — the prototype has no legal surfaces
 * — so it follows the public-page conventions (`wc-container`, `wc-card`) and
 * borrows the reading measure from the announcement detail page, which is the
 * only other long-form text surface in the product.
 *
 * The one thing this component must never do is present unreviewed text as
 * binding terms. The API marks placeholder documents with `isPlaceholder`, and
 * that flag is rendered as a prominent banner rather than a footnote.
 */
import { useGetLegalNotice } from "@/lib/api/endpoints/compliance/compliance";
import type { LegalNoticeDto } from "@/lib/api/model";
import { AlertTriangle } from "lucide-react";
import { PublicGenericError } from "@/components/public/public-states";

export function LegalDocument({ document }: { document: "tos" | "privacy" }) {
  const query = useGetLegalNotice<LegalNoticeDto>(document, { query: { retry: false } });

  if (query.isLoading) {
    return <p className="wc-container py-10 wc-muted">Loading…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="wc-container py-10">
        <PublicGenericError message="Couldn't load this document." />
      </div>
    );
  }

  const notice = query.data;
  const paragraphs = notice.body.split("\n");

  return (
    <div className="wc-container py-6 pb-16">
      <article className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-extrabold">{notice.title}</h1>
        <p className="wc-help mt-1" data-testid="legal-version">
          Version {notice.version} · effective {notice.effectiveDate}
        </p>

        {notice.isPlaceholder && (
          <div
            role="note"
            data-testid="legal-placeholder-banner"
            className="wc-card wc-card-pad mt-4 flex gap-3"
            style={{ borderColor: "var(--amber)" }}
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-maroon" aria-hidden="true" />
            <div>
              <p className="font-bold">This document is a draft, not binding terms.</p>
              <p className="wc-muted text-sm">
                It has not yet been reviewed by the university legal office. It is published so the
                structure can be checked; do not rely on it.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3 leading-relaxed" data-testid="legal-body">
          {paragraphs.map((line, i) =>
            line.trim() === "" ? (
              <div key={i} aria-hidden="true" className="h-1" />
            ) : (
              // Plain text, never dangerouslySetInnerHTML — the body is served
              // as prose and must not be able to inject markup.
              <p key={i} className={line.startsWith("PLACEHOLDER") ? "wc-help" : undefined}>
                {line}
              </p>
            ),
          )}
        </div>
      </article>
    </div>
  );
}
