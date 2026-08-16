import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Builds a query string, dropping empties so the URL stays readable and the
 * cache key on the server stays stable. "all" is the sentinel the filter
 * chips use for "no filter".
 */
export function buildUrl(base, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== "" && v != null && v !== "all") qs.set(k, v);
  }
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

/** The list endpoints answer { rows, total, ... }; the simple ones a bare array. */
const asRows = (data) => (Array.isArray(data) ? data : data?.rows ?? []);
const asTotal = (data) => (Array.isArray(data) ? data.length : Number(data?.total ?? 0));

/**
 * One API-backed panel: data, totals, loading and error, with the previous
 * request aborted whenever a new one starts.
 *
 * Fast typing in a search box would otherwise leave responses racing, and the
 * slowest — not the newest — could land last. Every call aborts its
 * predecessor, and an aborted request is not an error to report.
 *
 * @param {string} url        Request URL; refetches whenever it changes.
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]  Skip fetching while false.
 * @param {function} [options.onData]       Extra handling for the raw payload.
 */
export function useApi(url, { enabled = true, onData } = {}) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const controllerRef = useRef(null);
  // Kept in a ref so a caller passing an inline arrow does not retrigger the
  // effect on every render.
  const onDataRef = useRef(onData);
  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  const run = useCallback(async () => {
    if (!enabled || !url) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (controller.signal.aborted) return;
      setRaw(data);
      setRows(asRows(data));
      setTotal(asTotal(data));
      onDataRef.current?.(data);
    } catch (err) {
      if (err.name === "AbortError") return; // replaced on purpose
      console.error(err);
      setError(err.message || "Failed to fetch");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, [url, enabled]);

  useEffect(() => {
    run();
  }, [run]);

  // Abort whatever is in flight when the panel goes away.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { rows, total, raw, loading, error, refetch: run };
}

/** Delays a rapidly-changing value (a search box) so it can drive requests. */
export function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Breakpoint state via matchMedia, which fires only when the breakpoint is
 * actually crossed — tracking window.innerWidth in state re-rendered the whole
 * tree continuously while a window was being dragged.
 */
export function useMediaQuery(query) {
  // useSyncExternalStore rather than state synced by an effect: matchMedia is
  // an external store, and subscribing to it directly avoids the extra render
  // that mirroring it into state causes.
  const subscribe = useCallback(
    (onStoreChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Refreshes on an interval, but only while the tab is visible, and refreshes
 * once immediately on return. Background tabs previously polled every endpoint
 * every two minutes indefinitely.
 */
export function useVisibleInterval(callback, intervalMs) {
  const savedRef = useRef(callback);
  // Assigned in an effect, not during render: the interval always calls the
  // latest callback without the interval itself being torn down and rebuilt.
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let timer = null;
    const tick = () => {
      if (!document.hidden) savedRef.current();
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(tick, intervalMs);
    };

    start();
    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        savedRef.current();
        start();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}

/**
 * Cycles through a list of words, in the spirit of Claude Code's rotating
 * loading verbs. Starts on a random entry so two panels loading at once do
 * not chant in unison, and stops entirely when the caller is not loading —
 * an idle timer firing every 1.4s forever is not free.
 */
export function useRotatingWord(words, { active = true, intervalMs = 1400 } = {}) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * words.length));

  useEffect(() => {
    if (!active || words.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => clearInterval(id);
  }, [active, words.length, intervalMs]);

  return words[index % words.length];
}
