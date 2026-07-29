import { AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "@/lib/api/fetcher";
import type { LegalNoticeDto } from "@/lib/api/model";

/**
 * Renders a versioned legal notice.
 *
 * A **server** component that fetches on the server, deliberately. Client-only
 * fetching left the Terms and the Privacy Notice absent from the SSR HTML —
 * invisible to crawlers, reader modes and anyone without JS — and coupled the
 * availability of the one document that must always be readable 1:1 to API
 * uptime with no retry.
 *
 * There is no design basis for this page (the prototype has no legal surfaces),
 * so it follows the public-page conventions and borrows its reading measure
 * from the announcement detail page.
 *
 * The one thing it must never do is present unreviewed text as binding terms.
 */

async function fetchNotice(document: "tos" | "privacy"): Promise<LegalNoticeDto | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/legal/${document}`, {
      // Revalidated rather than cached forever: a notice is versioned, and a
      // new version has to be able to reach readers without a redeploy.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as LegalNoticeDto;
  } catch {
    return null;
  }
}

export async function LegalDocument({ document }: { document: "tos" | "privacy" }) {
  const notice = await fetchNotice(document);

  if (!notice) {
    return (
      <div className="wc-container py-10">
        <p role="alert" className="wc-card wc-card-pad text-center font-semibold text-destructive">
          This document couldn&apos;t be loaded right now. Please try again shortly.
        </p>
      </div>
    );
  }

  const lines = notice.body.split("\n");

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
          {renderBody(lines)}
        </div>
      </article>
    </div>
  );
}

/**
 * Numbered requirement lines become a real `<ol>` rather than sibling
 * paragraphs, so the structure a screen reader announces matches the structure
 * a sighted reader sees.
 */
function renderBody(lines: string[]) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = (key: string) => {
    if (list.length === 0) return;
    out.push(
      <ol key={`list-${key}`} className="list-decimal space-y-2 pl-6">
        {list.map((item, i) => (
          <li key={i}>{item.replace(/^\d+\.\s*/, "")}</li>
        ))}
      </ol>,
    );
    list = [];
  };

  lines.forEach((line, i) => {
    if (/^\d+\.\s/.test(line)) {
      list.push(line);
      return;
    }
    flush(String(i));
    if (line.trim() === "") {
      out.push(<div key={i} aria-hidden="true" className="h-1" />);
      return;
    }
    out.push(
      // Plain text, never dangerouslySetInnerHTML — the body is prose from the
      // API and must not be able to inject markup. The PLACEHOLDER preamble is
      // NOT dimmed: it is the most load-bearing sentence on the page.
      <p key={i} className={line.startsWith("PLACEHOLDER") ? "font-semibold" : undefined}>
        {line}
      </p>,
    );
  });

  flush("end");
  return out;
}
