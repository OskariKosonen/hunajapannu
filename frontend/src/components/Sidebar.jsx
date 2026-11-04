import { memo } from "react";
import { cx } from "../lib/cx";
import { GitHubIcon, LinkedInIcon, LogoMark, PanelLeftIcon } from "./ui/icons";

/**
 * Desktop navigation: sections grouped by what you are doing — watching,
 * investigating, or taking data away — with an icon each so the rail still
 * works collapsed.
 *
 * Items are real links (?view=...), so middle-click and "open in new tab"
 * behave; a plain click is intercepted to switch views without a reload.
 *
 * @param {Array<{id, label, group, Icon}>} items
 */
const Sidebar = ({ items, groups, view, onView, collapsed, onToggle }) => {
  const go = (e, id) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onView(id);
  };

  return (
    <aside
      className={cx(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-canvas transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className={cx("flex h-14 shrink-0 items-center gap-2.5", collapsed ? "justify-center" : "px-5")}>
        <a href="/" className="flex items-center gap-2.5 min-w-0" aria-label="hunajapannu.fi — home">
          <LogoMark size={24} />
          <h1 className={cx("text-base font-semibold tracking-tight text-fg", collapsed && "sr-only")}>
            hunajapannu.fi
          </h1>
        </a>
      </div>

      <nav aria-label="Dashboard sections" className="flex-1 overflow-y-auto hide-native-scrollbar px-3 pb-4">
        {groups.map((group) => (
          <div key={group} className="mt-4 first:mt-2">
            <div
              className={cx(
                "mb-1.5 px-2.5 text-2xs font-medium uppercase tracking-wider text-fg-subtle",
                collapsed && "sr-only"
              )}
            >
              {group}
            </div>
            <ul className="space-y-0.5">
              {items
                .filter((item) => item.group === group)
                .map((item) => {
                  const { id, label, Icon } = item;
                  const active = id === view;
                  return (
                    <li key={id}>
                      <a
                        href={id === "overview" ? "/" : `/?view=${id}`}
                        onClick={(e) => go(e, id)}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? label : undefined}
                        className={cx(
                          "group relative flex h-9 items-center gap-3 rounded-md text-sm transition-colors",
                          collapsed ? "justify-center" : "px-2.5",
                          active
                            ? "bg-accent/10 text-fg font-medium"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" aria-hidden="true" />
                        )}
                        <Icon size={17} className={active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted"} />
                        <span className={cx(collapsed && "sr-only")}>{label}</span>
                      </a>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cx("shrink-0 border-t border-line p-3 space-y-2", collapsed && "flex flex-col items-center")}>
        {!collapsed && (
          <div className="rounded-md border border-line bg-surface px-3 py-2.5">
            <div className="text-2xs text-fg-subtle">Built by</div>
            <div className="text-sm font-medium text-fg">Oskari Kosonen</div>
            <div className="mt-1.5 flex gap-3 text-xs">
              <a
                href="https://www.linkedin.com/in/oskari-kosonen-ba2589294/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
              >
                <LinkedInIcon size={12} /> LinkedIn
              </a>
              <a
                href="https://github.com/OskariKosonen/hunajapannu"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-fg-muted hover:text-fg"
              >
                <GitHubIcon size={12} /> Source
              </a>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cx(
            "flex h-8 items-center gap-2 rounded-md text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg transition-colors",
            collapsed ? "w-10 justify-center" : "w-full px-2.5"
          )}
        >
          <PanelLeftIcon size={16} />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
};

export default memo(Sidebar);
