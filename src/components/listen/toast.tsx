"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ToastState {
  id: number;
  message: string;
}

interface UseToastReturn {
  pushToast: (msg: string) => void;
  ToastHost: React.FC;
}

export function useToast(): UseToastReturn {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterRef = useRef(0);

  const pushToast = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    counterRef.current += 1;
    setToast({ id: counterRef.current, message: msg });
    timerRef.current = setTimeout(() => {
      setToast(null);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const ToastHost: React.FC = useCallback(() => {
    if (!toast) return null;
    if (typeof document === "undefined") return null;
    return createPortal(
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "88px",
          transform: "translateX(-50%)",
          background: "var(--success, #16a34a)",
          color: "#fff",
          fontWeight: 700,
          padding: ".7rem 1rem",
          borderRadius: "999px",
          zIndex: 9999,
          whiteSpace: "nowrap",
          animation: "wc-toast-in .18s ease",
          pointerEvents: "none",
        }}
      >
        {toast.message}
      </div>,
      document.body,
    );
  }, [toast]);

  return { pushToast, ToastHost };
}
