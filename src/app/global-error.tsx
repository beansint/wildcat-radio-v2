"use client";

/**
 * FE#36 — last-resort boundary. Next replaces the ENTIRE root layout
 * (including <html>/<body>) when this fires, so it cannot rely on
 * `src/app/layout.tsx` or any provider tree — it renders standalone and
 * must supply its own <html>/<body>. This only fires for errors thrown
 * inside `src/app/layout.tsx` or `src/app/error.tsx` itself; almost all
 * real crashes are caught by `error.tsx` first.
 *
 * No console.error/warn here — see `src/app/error.tsx` header for why
 * (e2e/_console.ts `assertClean()` fails the suite on any console.error).
 * No raw `error.message`/stack is rendered — at most `error.digest`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0b0c",
          color: "#f5f5f5",
        }}
      >
        <div
          data-testid="global-error"
          role="alert"
          style={{
            maxWidth: 420,
            textAlign: "center",
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.75, margin: 0 }}>
            Wildcat Radio hit an unexpected error and couldn&apos;t load. Try again, or
            head back to the homepage.
          </p>
          {error.digest ? (
            <p style={{ opacity: 0.5, fontSize: "0.75rem", margin: 0 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              data-testid="global-error-retry"
              onClick={reset}
              style={{
                padding: "0.6rem 1.25rem",
                borderRadius: 999,
                border: "none",
                background: "#7a1f2b",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Deliberately a plain <a>, not next/link: this boundary only renders
                when the ROOT LAYOUT itself threw, so the React tree is already
                broken. A client-side <Link> navigation would re-enter that same
                broken tree and fail again; a hard document navigation is the only
                reliable way out. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              data-testid="global-error-home"
              style={{
                padding: "0.6rem 1.25rem",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.3)",
                color: "#f5f5f5",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Back to home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
