"use client";

/**
 * App-wide toast host — ONE queue, ONE host.
 *
 * This used to be a `useToast()` hook where every caller got its own private
 * `toast` state AND its own `ToastHost`, each portalling to `document.body` at
 * the *same* fixed coordinates (`left:50%`, `bottom:88px`, `z-index:9999`).
 * With one caller that was fine. Once the stream context started raising
 * toasts from the root layout there were several hosts live on the same
 * screen, and two toasts firing at once rendered exactly on top of each other
 * — unreadable, and invisible to any test that only checks "a toast appeared".
 *
 * So the queue is module-level and `ToastHost` is mounted exactly once (in
 * `StreamProvider`, which wraps every route). `pushToast` is a plain function
 * rather than a hook return value, so non-component code — the HLS error path
 * in `stream-context.tsx`, for instance — can raise a toast without wiring a
 * hook through props.
 */
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface ToastState {
  id: number;
  message: string;
}

const TOAST_MS = 2600;

let toasts: ToastState[] = [];
let counter = 0;
const listeners = new Set<() => void>();

/** Stable empty snapshot for SSR — a new array each call would loop forever. */
const EMPTY: ToastState[] = [];

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Must return a referentially STABLE value between changes — `toasts` is only
 * ever reassigned inside `pushToast`/`dismiss`, never rebuilt per call.
 */
function getSnapshot(): ToastState[] {
  return toasts;
}

function getServerSnapshot(): ToastState[] {
  return EMPTY;
}

function dismiss(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

/**
 * Show a toast. Safe to call from anywhere, including outside React.
 * Multiple toasts stack rather than overwrite — the previous behaviour
 * cleared the pending timer and replaced the message, so a second event
 * silently swallowed the first.
 */
export function pushToast(message: string): void {
  counter += 1;
  const id = counter;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => dismiss(id), TOAST_MS);
}

/** Test/reset seam — clears the queue without waiting out the timers. */
export function clearToasts(): void {
  toasts = [];
  emit();
}

/**
 * Renders the toast stack. Mount exactly once, near the root.
 */
export function ToastHost() {
  // `useSyncExternalStore` is the purpose-built hook for exactly this: the
  // queue lives outside React. Subscribing via useEffect+setState instead
  // would both trip the compiler's cascading-render rule and miss any toast
  // raised between render and effect commit.
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (items.length === 0) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "88px",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "center",
        gap: ".5rem",
        pointerEvents: "none",
      }}
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          data-testid="app-toast"
          style={{
            background: "var(--success, #16a34a)",
            color: "#fff",
            fontWeight: 700,
            padding: ".7rem 1rem",
            borderRadius: "999px",
            whiteSpace: "nowrap",
            animation: "wc-toast-in .18s ease",
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Back-compat shim for call sites that still destructure `{ pushToast }`.
 * Returns the shared `pushToast`; it deliberately does NOT hand back a
 * `ToastHost`, because rendering a second host is the bug this file fixes.
 */
export function useToast(): { pushToast: (message: string) => void } {
  return { pushToast };
}
