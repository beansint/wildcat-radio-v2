"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { classifyEngagementError } from "@/lib/realtime/engagement-error";
import { cn } from "@/lib/utils";

interface EngagementErrorNoticeProps {
  /** Raw error (string or Error) from a chat/vote/request/reaction attempt. */
  error: unknown;
  /** `dark` sits on the maroon stage; `light` on cards. */
  tone?: "light" | "dark";
  /** Visually hidden but still announced — for tight inline composers. */
  srOnly?: boolean;
  className?: string;
}

function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((n) => {
        if (n <= 1) window.clearInterval(id);
        return Math.max(0, n - 1);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  // The live region announces the start and the end, not every tick.
  return left > 0 ? (
    <span>
      {" "}Try again in <span className="tnum" aria-hidden="true">{left}s</span>
      <span className="sr-only">{seconds} seconds</span>.
    </span>
  ) : (
    <span> You can try again now.</span>
  );
}

/**
 * One accessible renderer for every engagement refusal (FE#65): each kind
 * gets a sentence plus the action that resolves it, inside role="alert" so
 * screen readers hear it the moment it appears.
 */
export function EngagementErrorNotice({ error, tone = "light", srOnly, className }: EngagementErrorNoticeProps) {
  const pathname = usePathname();
  if (error == null || error === "") return null;
  const e = classifyEngagementError(error);
  const link = tone === "dark" ? "font-bold underline text-gold" : "font-bold underline text-maroon";

  return (
    <div
      role="alert"
      data-testid="engagement-error"
      data-kind={e.kind}
      className={cn(
        srOnly ? "sr-only" : "text-xs font-semibold",
        !srOnly && (tone === "dark" ? "text-white/85" : "text-destructive"),
        className,
      )}
    >
      {e.message}
      {e.reason && <span className="font-normal"> Reason: {e.reason}.</span>}
      {e.kind === "rate-limited" && e.retryAfterSec ? <Countdown seconds={e.retryAfterSec} /> : null}
      {e.kind === "auth-required" && (
        <>
          {" "}
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={link}>
            Sign in
          </Link>
        </>
      )}
      {e.kind === "verify-email" && (
        <>
          {" "}
          <Link href="/verify-email" className={link}>
            Verify now
          </Link>
        </>
      )}
      {(e.kind === "muted" || e.kind === "banned") && (
        <>
          {" "}
          <Link href="/profile/standing" className={link}>
            See your standing
          </Link>
        </>
      )}
    </div>
  );
}
