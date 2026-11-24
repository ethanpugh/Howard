import { useCallback, useRef, useState } from 'react';

/**
 * Provides a re-entrancy ref + React state lock for async submit/mutation handlers.
 */
export function useActionLock() {
  const inFlightRef = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const runLocked = useCallback(async (fn) => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setIsPending(true);
    try {
      return await fn();
    } finally {
      inFlightRef.current = false;
      setIsPending(false);
    }
  }, []);

  return { isPending, isLockedRef: inFlightRef, runLocked };
}
