import Image from "next/image";

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
