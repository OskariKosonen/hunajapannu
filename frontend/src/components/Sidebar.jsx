import { memo } from "react";
import { cx } from "../lib/cx";
import { ChevronRightIcon, GitHubIcon, LinkedInIcon, LogoMark } from "./ui/icons";

/**
 * Desktop navigation: sections grouped by what you are doing — watching,
 * investigating, or taking data away — with an icon each so the rail still
 * works collapsed.
 *
 * Items are real links (?view=...), so middle-click and "open in new tab"
 * behave; a plain click is intercepted to switch views without a reload.
 * Every item but the current one carries a chevron: you are here, those go
 * somewhere. The collapse toggle lives in the top bar, beside the view title.
 *
 * @param {Array<{id, label, group, Icon}>} items
 */

const LINKEDIN = "https://www.linkedin.com/in/oskari-kosonen-ba2589294/";
const GITHUB = "https://github.com/OskariKosonen/hunajapannu";

const NavItem = ({ item, active, collapsed, onGo }) => {
  const { id, label, Icon } = item;
  return (
    <li>
      <a
        href={id === "overview" ? "/" : `/?view=${id}`}
        onClick={(e) => onGo(e, id)}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={cx(
          "group flex h-10 items-center rounded-lg text-base transition-colors",
          collapsed ? "justify-center" : "gap-3 pl-3 pr-2",
          active
            ? "bg-accent/[0.14] text-fg font-medium ring-1 ring-inset ring-accent/25"
            : "text-fg-muted hover:bg-surface-2 hover:text-fg"
        )}
      >
        <Icon
          size={18}
          className={cx("transition-colors", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")}
        />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {!active && (
              <ChevronRightIcon
                size={15}
                className="text-fg-subtle/70 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted"
              />
            )}
          </>
        )}
        {collapsed && <span className="sr-only">{label}</span>}
      </a>
    </li>
  );
};

/** The author, as a compact row: initials, name, and the two links. */
const Author = ({ collapsed }) => {
  const avatar = (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-honey/15 text-2xs font-semibold text-honey ring-1 ring-inset ring-honey/25"
    >
      OK
    </span>
  );

  if (collapsed) {
    return (
      <a href={LINKEDIN} target="_blank" rel="noreferrer" title="Oskari Kosonen on LinkedIn" aria-label="Oskari Kosonen on LinkedIn">
        {avatar}
      </a>
    );
  }

  const iconLink = "flex h-7 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg transition-colors";
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
      {avatar}
      <div className="min-w-0 flex-1 leading-tight mr-0.5">
        <div className="truncate text-sm font-medium text-fg">Oskari Kosonen</div>
        <div className="text-xs text-fg-subtle">Built this</div>
      </div>
      <a href={LINKEDIN} target="_blank" rel="noreferrer" className={iconLink} title="LinkedIn" aria-label="Oskari Kosonen on LinkedIn">
        <LinkedInIcon size={14} />
      </a>
      <a href={GITHUB} target="_blank" rel="noreferrer" className={iconLink} title="Source on GitHub" aria-label="Source on GitHub">
        <GitHubIcon size={14} />
      </a>
    </div>
  );
};

const Sidebar = ({ items, groups, view, onView, collapsed }) => {
  const go = (e, id) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onView(id);
  };

  return (
    <aside
      className={cx(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-canvas transition-[width] duration-200",
        collapsed ? "w-[4.5rem]" : "w-64"
      )}
    >
      <div className={cx("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
        <a href="/" className="flex items-center gap-2.5 min-w-0" aria-label="hunajapannu.fi — home">
          <LogoMark size={28} />
          <h1 className={cx("text-lg font-semibold tracking-tight text-fg", collapsed && "sr-only")}>
            hunajapannu.fi
          </h1>
        </a>
      </div>

      <nav
        aria-label="Dashboard sections"
        className={cx("flex-1 overflow-y-auto hide-native-scrollbar pb-4", collapsed ? "px-3" : "px-3.5")}
      >
        {groups.map((group, i) => (
          <div key={group} className={i === 0 ? "mt-3" : "mt-6"}>
            {collapsed ? (
              // A hairline where the heading was keeps the groups apart in the rail.
              i > 0 && <div className="mx-2 mb-3 border-t border-line" aria-hidden="true" />
            ) : null}
            <div className={cx("mb-2 px-3 text-xs font-medium text-fg-subtle", collapsed && "sr-only")}>{group}</div>
            <ul className="space-y-1">
              {items
                .filter((item) => item.group === group)
                .map((item) => (
                  <NavItem key={item.id} item={item} active={item.id === view} collapsed={collapsed} onGo={go} />
                ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cx("shrink-0 border-t border-line p-3", collapsed && "flex justify-center")}>
        <Author collapsed={collapsed} />
      </div>
    </aside>
  );
};

export default memo(Sidebar);
