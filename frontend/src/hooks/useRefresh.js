import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useVisibleInterval } from "./useApi";

/**
 * One clock for the whole dashboard.
 *
 * App used to keep a hand-written list of every panel's refetch function and
 * call them in turn every two minutes. The list drifted: four endpoints added
 * later were never in it, so those panels never refreshed. Now every useApi
 * subscribes to this tick, so a panel refreshes by existing.
 */
export const RefreshContext = createContext({ tick: 0, lastUpdated: null, refresh: () => {} });

export function useRefreshClock(intervalMs) {
  const [tick, setTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    setLastUpdated(new Date());
  }, []);

  useVisibleInterval(refresh, intervalMs);

  return useMemo(() => ({ tick, lastUpdated, refresh }), [tick, lastUpdated, refresh]);
}

export const useRefresh = () => useContext(RefreshContext);

/** The current time, re-read every `intervalMs`, for "12s ago" labels. */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
