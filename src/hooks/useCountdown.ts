import { useState, useEffect, useCallback } from "react";

/**
 * Live countdown hook. Returns a formatted string and an `ended` flag.
 * Updates every second while the auction is active, then stops.
 */
export function useCountdown(endTime: string | null | undefined) {
  const computeState = useCallback(() => {
    if (!endTime) return { text: "", ended: false, diff: 0 };
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return { text: "Ended", ended: true, diff: 0 };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    let text: string;
    if (days > 0) {
      text = `${days}d ${hours}h`;
    } else if (hours > 0) {
      text = `${hours}h ${mins}m`;
    } else {
      text = `${mins}m ${secs}s`;
    }
    return { text, ended: false, diff };
  }, [endTime]);

  const [state, setState] = useState(computeState);

  useEffect(() => {
    if (!endTime) return;
    // Immediately sync
    setState(computeState());

    const id = setInterval(() => {
      const next = computeState();
      setState(next);
      if (next.ended) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [endTime, computeState]);

  return state;
}
