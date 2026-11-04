import { createContext, useContext, useEffect } from "react";

/**
 * Lets a view describe what it is showing, for the browser tab.
 *
 * The shell owns document.title; a view only reports the part it knows
 * (a search, a filter), and that becomes the title.
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

// What a crowded tab bar shows before it truncates.
const TAB_BUDGET = 24;

/**
 * '“term” · Label', with the term cut to whatever room the label leaves, so
 * the whole title fits a tab whatever was typed.
 */
export const searchTitle = (term, label) => {
  const room = Math.max(4, TAB_BUDGET - label.length - 5); // quotes + " · "
  const t = String(term).trim();
  return `“${t.length > room ? `${t.slice(0, room - 1)}…` : t}” · ${label}`;
};
