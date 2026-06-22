"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveStatus } from "@clipwise/shared";

export function useAutosave<T>(
  save: (payload: T) => Promise<void>,
  delayMs = 500,
) {
  const [status, setStatus] = useState<SaveStatus>("clean");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPayloadRef = useRef<T | null>(null);

  const persist = useCallback(async () => {
    if (latestPayloadRef.current === null) return;
    const payload = latestPayloadRef.current;
    setStatus("saving");

    try {
      await save(payload);
      setStatus("saved");
    } catch {
      setStatus("failed");
    }
  }, [save]);

  const schedule = useCallback(
    (payload: T) => {
      latestPayloadRef.current = payload;
      setStatus("dirty");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void persist();
      }, delayMs);
    },
    [delayMs, persist],
  );

  const retry = useCallback(async () => {
    await persist();
  }, [persist]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { status, schedule, retry };
}
