import Image from "next/image";
import Link from "next/link";

/** Minimal Facebook icon (inline SVG — lucide-react 1.x doesn't ship Facebook). */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="wc-grad-ink text-white/80 mt-4">
      <div className="wc-container py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/logo-mascot-mark.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8"
            aria-hidden="true"
          />
          <span>Wildcat Radio · CIT-U Campus Radio</span>
        </div>
        {/* Legal links live here because this is where people look for them.
            The footer is rendered by the public shell rather than by a single
            page, so a privacy notice is reachable from every public surface —
            a notice nobody can find is not much of a notice. */}
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-4">
          <Link href="/legal/privacy" className="hover:text-white" data-testid="footer-privacy">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-white" data-testid="footer-terms">
            Terms
          </Link>
          <Link href="/attribution" className="hover:text-white" data-testid="footer-attribution">
            Music credits
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <FacebookIcon className="w-4 h-4" />
            CIT-U Wildcat Radio
          </span>
          <Image
            src="/brand/logo-citu-seal.png"
            alt="Cebu Institute of Technology University"
            width={32}
            height={32}
            className="h-8 w-8"
          />
        </div>
      </div>
    </footer>
  );
}
