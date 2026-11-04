import { useState } from "react";

/**
 * Reveals a long list a page at a time instead of scrolling it inside a box.
 * Starts over whenever resetKey changes (a new search or filter), but not
 * when the same list refreshes, so a reader's place survives the refresh.
 *
 * `footer` is the ListFooter's props, or null when everything already fits,
 * so a panel draws no empty footer bar.
 */
export function useShowMore(rows, { step = 25, resetKey = "", total, searchable = true } = {}) {
  const [state, setState] = useState({ key: resetKey, count: step });
  const count = state.key === resetKey ? state.count : step;
  const shown = rows.slice(0, count);
  const all = total ?? rows.length;
  const needed = rows.length > 0 && (shown.length < rows.length || all > rows.length);
  return {
    shown,
    footer: needed
      ? {
          shown: shown.length,
          loaded: rows.length,
          total: all,
          step,
          searchable,
          onMore: () => setState({ key: resetKey, count: count + step }),
        }
      : null,
  };
}
