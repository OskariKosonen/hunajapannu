import { useCallback, useEffect, useState } from "react";

/**
 * Keeps a piece of UI state in the query string.
 *
 * Without this nothing on the dashboard is linkable: you cannot send someone
 * a specific attacker session or a filtered view, and a refresh silently drops
 * every search box. Uses replaceState so typing in a search field does not
 * stack up history entries, and listens for popstate so Back still works.
 *
 * @param {string} key      Query-string parameter name.
 * @param {string} fallback Value used when the parameter is absent.
 * @param {object} [options]
 * @param {boolean} [options.push=false] Add a history entry instead of
 *   replacing the current one. For navigation (switching views) Back should
 *   undo the change; for a search box it should not undo every keystroke.
 */
export function useUrlState(key, fallback = "", { push = false } = {}) {
  const read = useCallback(() => {
    if (typeof window === "undefined") return fallback;
    return new URLSearchParams(window.location.search).get(key) ?? fallback;
  }, [key, fallback]);

  const [value, setValue] = useState(read);

  // Back/forward should move the UI, not just the address bar.
  useEffect(() => {
    const onPop = () => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const update = useCallback(
    (next) => {
      setValue(next);
      const params = new URLSearchParams(window.location.search);
      if (next === fallback || next === "" || next == null) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const qs = params.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (push && nextUrl !== current) {
        window.history.pushState(null, "", nextUrl);
      } else {
        window.history.replaceState(null, "", nextUrl);
      }
    },
    [key, fallback, push]
  );

  return [value, update];
}
