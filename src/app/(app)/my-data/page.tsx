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
import { useRef, useState } from "react";
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
  // Rendered INSIDE the dialog. The page-level alert sits behind the modal's
  // scrim on an aria-hidden subtree, so a failed erasure was announced to
  // nobody and visible to nobody — the only signal was the button label
  // reverting.
  const [eraseError, setEraseError] = useState<string | null>(null);
  const eraseTriggerRef = useRef<HTMLButtonElement>(null);

  const consenting = isConsenting(consentsQuery.data);
  // A failed read means we do NOT know the state. Rendering the switch as off
  // would tell a listener who HAS consented that their data is not being
  // counted — a privacy centre stating the wrong processing status is worse
  // than one that admits it cannot tell.
  const consentUnknown = consentsQuery.isError;

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
          ? "Thanks — these details may now be counted in aggregate audience reports."
          : "Consent withdrawn. These details will not be counted in any report from now on.",
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
      // Hand-rolled because the generated client types this route as
      // `Promise<void>` (the OpenAPI response has no schema), so it discards
      // the body we need. NOT because it "parses JSON" — it does, and that is
      // fine; the earlier comment here was simply wrong.
      //
      // The error body is read out the way `customFetch` does, so a failure
      // shows the server's reason rather than a bare status code.
      const res = await fetch(`${API_BASE_URL}/api/me/data/export`, { credentials: "include" });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
      }
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
      // "Started" rather than "downloaded": the click only dispatches, and a
      // user who cancels the browser's save dialog was being told it completed.
      setStatus("Your data is ready — check your downloads.");
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleErase() {
    setBusy("erase");
    setEraseError(null);
    try {
      await eraseMyData();
      // The session is revoked server-side, so there is nothing to return to.
      // A full navigation rather than a router push, to drop all cached state.
      window.location.href = "/";
    } catch {
      // The request may well have SUCCEEDED and only the response been lost —
      // erasure revokes the session, so a dropped reply and a real failure look
      // identical from here. Telling the user "it failed" could be a lie about
      // an irreversible action, so the copy says what we actually know and the
      // recovery is a reload, which resolves it either way.
      setEraseError(
        "We couldn't confirm whether your account was deleted. Reload the page to check — if you " +
          "are signed out, the deletion went through.",
      );
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
            Your year level, college, gender and whether you are a campus or guest listener are
            optional details. They are only ever reported as totals, never individually, and groups
            too small to be anonymous are withheld entirely. Listening figures are separate — those
            are anonymous and are never linked to your account.
          </p>

          {consentUnknown ? (
            <div className="mt-4" data-testid="privacy-consent-unknown">
              <p className="wc-help text-destructive">
                We couldn&apos;t load your current setting, so it isn&apos;t shown. Reload to try
                again — nothing has changed.
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                data-testid="privacy-consent-retry"
                onClick={() => void consentsQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
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
                  ? "You have agreed to these details being counted"
                  : "These details are not being counted"}
              </Label>
            </div>
          )}

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
          {/* The address is a reserved `.example` domain and can never receive
              mail. Presenting it as a working contact would send a §16 request
              into a black hole — on the one route a person uses to exercise a
              right. It is shown as pending rather than as a mailto. */}
          <p className="wc-muted mt-1 text-sm" data-testid="privacy-dpo">
            Our Data Protection Officer&apos;s contact address is still being confirmed by the
            university and is not yet live. In the meantime, please reach the station through its
            usual channels. You also have the right to complain to the National Privacy Commission.
            Our{" "}
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
            className="mt-4 wc-btn-danger"
            data-testid="privacy-erase-open"
            ref={eraseTriggerRef}
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

      <Dialog
        open={eraseOpen}
        // Non-dismissible while the request is in flight: Escape would close
        // the confirmation while the DELETE continued, leaving every control
        // disabled with nothing on screen explaining why.
        onOpenChange={(open) => {
          if (busy === "erase") return;
          if (!open) setEraseError(null);
          setEraseOpen(open);
        }}
      >
        <DialogContent
          data-testid="privacy-erase-dialog"
          onCloseAutoFocus={(e) => {
            // Radix only restores focus to a DialogTrigger; this dialog opens
            // from page state, so focus would otherwise drop to <body>. A ref
            // rather than a test-id lookup — shipped focus management should
            // not depend on a QA attribute surviving.
            e.preventDefault();
            eraseTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Your personal details will be removed and you will be signed out permanently. Type{" "}
              <b>{ERASE_CONFIRMATION}</b> to confirm.
            </DialogDescription>
          </DialogHeader>

          {eraseError && (
            <p role="alert" className="wc-help text-destructive" data-testid="privacy-erase-error">
              {eraseError}
            </p>
          )}

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
