import { createContext, useContext, useEffect } from "react";

/**
 * Lets a view describe what it is showing, for the browser tab.
 *
 * The shell owns document.title; a view only reports the part it knows
 * (a search, a filter) and the shell assembles "<that> · hunajapannu.fi".
 * A filtered view and the unfiltered one used to share a title, so a
 * bookmark or a history entry could not tell them apart.
 */
export const TitleContext = createContext(() => {});

export function useTitleDetail(detail) {
  const setDetail = useContext(TitleContext);
  useEffect(() => {
    setDetail(detail || "");
    return () => setDetail("");
  }, [detail, setDetail]);
}

/** Quotes a search term for a title, cut short so the site name survives. */
export const quoted = (s, max = 28) => {
  const t = String(s).trim();
  return `“${t.length > max ? `${t.slice(0, max - 1)}…` : t}”`;
};
