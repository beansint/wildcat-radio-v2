"use client";

/**
 * `/privacy` — the data-subject-rights centre (FE#11).
 *
 * Every right the Data Privacy Act gives a listener, in one place, in the order
 * someone actually wants them: see what is held, correct it, control the
 * optional consent, take a copy, and finally delete. Deletion is last and
 * visually separated because it is the only irreversible one.
 *
 * There is no prototype for this page. It follows the app-shell conventions
 * (`wc-container`, `wc-card`, shadcn primitives) and deliberately reads as
 * plain language rather than statute — a rights page that only a lawyer can
 * parse has failed at the thing it exists to do.
 *
 * The honesty rule this page is built around: it must describe what deletion
 * ACTUALLY does. Erasure here is anonymisation — moderation and audit records
 * survive without identifying you — and saying "we delete everything" would be
 * describing a product we did not build.
 */
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Download, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import {
  useListMyConsents,
  getListMyConsentsQueryKey,
  grantConsent,
  withdrawConsent,
  eraseMyData,
} from "@/lib/api/endpoints/compliance/compliance";
import type { ConsentRecordDto } from "@/lib/api/model";
import { API_BASE_URL } from "@/lib/api/fetcher";
import { getApiErrorMessage } from "@/lib/api/error-message";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DPO_EMAIL = "privacy@wildcatradio.example";
const ERASE_CONFIRMATION = "DELETE";

/** The latest grant wins, matching the server's rule. */
function isConsenting(consents: ConsentRecordDto[] | undefined): boolean {
  if (!consents) return false;
  const demographics = consents
    .filter((c) => c.scope === "DEMOGRAPHICS")
    .sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  return demographics[0] !== undefined && demographics[0].withdrawnAt === null;
}

export default function PrivacyCentrePage() {
  const queryClient = useQueryClient();
  const consentsQuery = useListMyConsents<ConsentRecordDto[]>();
  const [busy, setBusy] = useState<"consent" | "export" | "erase" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState("");

  const consenting = isConsenting(consentsQuery.data);

  async function toggleConsent(next: boolean) {
    setBusy("consent");
    setError(null);
    setStatus(null);
    try {
      if (next) await grantConsent({ body: JSON.stringify({ scope: "DEMOGRAPHICS" }) });
      else await withdrawConsent("DEMOGRAPHICS");
      await queryClient.invalidateQueries({ queryKey: getListMyConsentsQueryKey() });
      setStatus(
        next
          ? "Thanks — your year level, college and gender may now be counted in aggregate audience reports."
          : "Consent withdrawn. Your demographics will not be counted in any report from now on.",
      );
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    setBusy("export");
    setError(null);
    setStatus(null);
    try {
      // Not through the generated client: it parses every response as JSON to
      // return it, and this needs to reach the user as a downloaded file.
      const res = await fetch(`${API_BASE_URL}/api/me/data/export`, { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `wildcat-radio-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
      setStatus("Your data has been downloaded.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleErase() {
    setBusy("erase");
    setError(null);
    try {
      await eraseMyData();
      // The session is revoked server-side, so there is nothing to return to.
      window.location.href = "/";
    } catch (err) {
      setError(getApiErrorMessage(err));
      setBusy(null);
    }
  }

  return (
    // `pb-28`, matching every other (app) page. The bottom nav and the global
    // player are both fixed and stack to ~120px of chrome; `pb-16` left the
    // last control on the page — the destructive one — permanently unclickable
    // behind them.
    <main className="wc-container py-6 pb-28">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold">Your data</h1>
        <p className="wc-muted">
          What Wildcat Radio holds about you, and what you can do about it.
        </p>
      </header>

      {/* One alert region and one status region for the whole page, per the
          convention — three separate ones would fight for the screen reader. */}
      {error && (
        <p role="alert" className="wc-help mb-4 text-destructive" data-testid="privacy-error">
          {error}
        </p>
      )}
      {status && !error && (
        <p role="status" className="wc-help mb-4" data-testid="privacy-status">
          {status}
        </p>
      )}

      <div className="wc-stack">
        {/* ── Consent ─────────────────────────────────────────────────── */}
        <section className="wc-card wc-card-pad">
          <h2 className="font-bold">Optional demographics</h2>
          <p className="wc-muted mt-1 text-sm">
            Your year level, college and gender are optional. They are only ever reported as totals,
            never individually, and groups too small to be anonymous are withheld entirely. Listening
            figures are separate — those are anonymous and are never linked to your account.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <Switch
              id="privacy-consent"
              data-testid="privacy-consent-toggle"
              checked={consenting}
              disabled={busy !== null || consentsQuery.isLoading}
              onCheckedChange={(next) => toggleConsent(next)}
            />
            <Label htmlFor="privacy-consent">
              {consenting
                ? "You have agreed to your demographics being counted"
                : "Your demographics are not being counted"}
            </Label>
          </div>

          {consentsQuery.data && consentsQuery.data.length > 0 && (
            <details className="mt-4">
              <summary className="wc-help cursor-pointer">Consent history</summary>
              <ul className="mt-2 space-y-1" data-testid="privacy-consent-history">
                {consentsQuery.data.map((c) => (
                  <li key={c.id} className="wc-help">
                    {c.scope} · agreed {new Date(c.grantedAt).toLocaleDateString()} to notice{" "}
                    {c.noticeVersion}
                    {c.withdrawnAt
                      ? ` · withdrawn ${new Date(c.withdrawnAt).toLocaleDateString()}`
                      : " · active"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* ── Access / correction / portability ───────────────────────── */}
        <section className="wc-card wc-card-pad">
          <h2 className="font-bold">See and correct your data</h2>
          <p className="wc-muted mt-1 text-sm">
            Download everything we hold that identifies you, as a JSON file. To correct your profile
            details, edit them on your{" "}
            <Link href="/profile" className="font-semibold text-maroon underline">
              profile page
            </Link>
            .
          </p>
          <Button
            className="mt-4"
            variant="outline"
            data-testid="privacy-export"
            disabled={busy !== null}
            onClick={handleExport}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {busy === "export" ? "Preparing…" : "Download my data"}
          </Button>
        </section>

        {/* ── Contact ─────────────────────────────────────────────────── */}
        <section className="wc-card wc-card-pad">
          <h2 className="font-bold">Questions or complaints</h2>
          <p className="wc-muted mt-1 text-sm">
            Our Data Protection Officer can be reached at{" "}
            <a href={`mailto:${DPO_EMAIL}`} className="font-semibold text-maroon underline">
              {DPO_EMAIL}
            </a>
            . You also have the right to complain to the National Privacy Commission. Our{" "}
            <Link href="/legal/privacy" className="font-semibold text-maroon underline">
              privacy notice
            </Link>{" "}
            explains what we collect and why.
          </p>
        </section>

        {/* ── Deletion — last, and visually separated ─────────────────── */}
        <section
          className="wc-card wc-card-pad"
          style={{ borderColor: "var(--destructive)" }}
          data-testid="privacy-erase-section"
        >
          <h2 className="flex items-center gap-2 font-bold">
            <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            Delete my account
          </h2>
          {/* This paragraph is the honesty requirement, not boilerplate: erasure
              is anonymisation, and telling someone "we delete everything" when
              moderation records survive would be describing a different
              product. */}
          <p className="wc-muted mt-1 text-sm">
            This removes your name, email, handle and demographics, ends your sign-in, and stops your
            data being counted anywhere. Records that keep the station accountable — moderation
            decisions and staff audit entries — are kept, but they will no longer identify you. This
            cannot be undone, and you will not be able to sign in again.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            data-testid="privacy-erase-open"
            disabled={busy !== null}
            onClick={() => {
              setEraseConfirm("");
              setEraseOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account
          </Button>
        </section>
      </div>

      <Dialog open={eraseOpen} onOpenChange={setEraseOpen}>
        <DialogContent
          data-testid="privacy-erase-dialog"
          onCloseAutoFocus={(e) => {
            // Radix only restores focus to a DialogTrigger; this dialog opens
            // from page state, so focus would otherwise drop to <body>.
            e.preventDefault();
            document.querySelector<HTMLElement>('[data-testid="privacy-erase-open"]')?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Your personal details will be removed and you will be signed out permanently. Type{" "}
              <b>{ERASE_CONFIRMATION}</b> to confirm.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="privacy-erase-confirm">Confirmation</Label>
            <Input
              id="privacy-erase-confirm"
              data-testid="privacy-erase-confirm"
              value={eraseConfirm}
              autoComplete="off"
              onChange={(e) => setEraseConfirm(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEraseOpen(false)} disabled={busy === "erase"}>
              Keep my account
            </Button>
            <Button
              data-testid="privacy-erase-confirm-button"
              // Typing the word is the only gate, so it must be exact — a
              // confirm button that is merely a second click is not a
              // confirmation for something irreversible.
              disabled={eraseConfirm !== ERASE_CONFIRMATION || busy === "erase"}
              onClick={handleErase}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {busy === "erase" ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
