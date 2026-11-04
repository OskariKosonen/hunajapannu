import { useEffect, useRef } from "react";
import { cx } from "../../lib/cx";

/**
 * Top-level navigation between views. A tablist with roving focus: Tab lands
 * on the active tab, arrows move between them, Home/End jump to the ends.
 *
 * @param {Array<{id: string, label: string}>} tabs
 */
const Tabs = ({ tabs, value, onChange, label, idPrefix = "tab" }) => {
  const refs = useRef({});

  // On a phone the strip scrolls sideways, so a link straight to a later
  // view (?view=botnet) used to open with its tab out of sight. "nearest"
  // only moves the strip, never the page.
  useEffect(() => {
    refs.current[value]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [value]);

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next == null) return;
    e.preventDefault();
    const id = tabs[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex items-end gap-1 overflow-x-auto hide-native-scrollbar -mb-px"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${t.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative h-10 shrink-0 px-3 text-sm whitespace-nowrap transition-colors border-b-2",
              active
                ? "border-accent text-fg font-medium"
                : "border-transparent text-fg-muted hover:text-fg hover:border-line-strong"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
