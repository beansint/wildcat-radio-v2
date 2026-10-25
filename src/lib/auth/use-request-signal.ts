'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Downloads outlive React state unless their request is canceled when its owner unmounts. */
export function useRequestSignal() {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  return useCallback(() => controller.current?.signal, []);
}
