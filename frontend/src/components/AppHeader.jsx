import { memo, useState } from "react";
import Tabs from "./ui/Tabs";
import { LogoMark, PanelLeftIcon, RefreshIcon } from "./ui/icons";
import { cx } from "../lib/cx";
import { useNow } from "../hooks/useRefresh";
import { formatClock, formatRelative, formatTimestamp } from "../lib/format";

// The sensor sees several events a minute. Ten quiet minutes means something
// upstream has stopped, which is exactly the failure that once went unnoticed
// for four days while every service reported healthy.
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * How fresh the data is, said as a sentence: "Last attack 1m ago".
 *
 * It used to be a tinted, bordered pill reading "Live · last event 1m ago"
 * with the refresh button fused onto its end, which is the stock status
 * badge of every generated dashboard. Plain text next to a small dot says the
 * same thing, and "attack" is the word the rest of the site uses.
 *
 * Ten quiet minutes means something upstream has stopped, which is exactly
 * the failure that once went unnoticed for four days, so then it turns amber
 * and says so.
 */
const Freshness = ({ lastEventAt, now, apiDown }) => {
  const t = lastEventAt ? new Date(lastEventAt).getTime() : NaN;
  const known = Number.isFinite(t);
  const stale = known && now - t > STALE_AFTER_MS;
  const ago = known ? formatRelative(lastEventAt, now) : "";

  return (
    <span
      role="status"
      title={known ? `Newest event at ${formatTimestamp(lastEventAt)}` : undefined}
      className={cx(
        "flex items-center gap-2 text-sm whitespace-nowrap tabular-nums",
        stale ? "text-warn" : "text-fg-subtle"
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          apiDown ? "bg-warn" : !known ? "bg-fg-subtle/50" : stale ? "bg-warn" : "bg-accent"
        )}
      />
      {apiDown ? (
        <span className="text-warn">API unreachable</span>
      ) : !known ? (
        "Connecting…"
      ) : stale ? (
        `No attacks for ${ago.replace(" ago", "")}`
      ) : (
        <span>
          <span className="hidden min-[380px]:inline">Last attack </span>
          <span className="text-fg-muted">{ago}</span>
        </span>
      )}
    </span>
  );
};

const Controls = ({ lastEventAt, apiDown, lastUpdated, onRefresh, now }) => {
  const [spinning, setSpinning] = useState(false);
  return (
    <div className="ml-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
      <Freshness lastEventAt={lastEventAt} now={now} apiDown={apiDown} />
      <button
        type="button"
        onClick={() => {
          onRefresh();
          setSpinning(true);
          setTimeout(() => setSpinning(false), 700);
        }}
        aria-label="Refresh data"
        title={
          lastUpdated
            ? `Refresh now. Last refreshed ${formatClock(lastUpdated)}; it also refreshes every 2 minutes.`
            : "Refresh now"
        }
        className="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg transition-colors"
      >
        <RefreshIcon size={15} className={spinning ? "motion-safe:animate-spin" : ""} />
      </button>
    </div>
  );
};

/**
 * The bar above the content.
 *
 * Desktop: the brand and the sections live in the sidebar, so this names the
 * view you are on (Grafana's dashboard title, more or less) and carries the
 * live status and refresh. Phone: no room for a sidebar, so it carries the
 * brand and the sections become a scrolling tab strip underneath.
 */
const AppHeader = ({
  desktop,
  tabs,
  active,
  onView,
  sidebarCollapsed,
  onToggleSidebar,
  lastEventAt,
  apiDown,
  lastUpdated,
  onRefresh,
}) => {
  // Ticks here rather than in App, so "12s ago" re-renders the header alone.
  const now = useNow(15000);
  const controls = <Controls lastEventAt={lastEventAt} apiDown={apiDown} lastUpdated={lastUpdated} onRefresh={onRefresh} now={now} />;

  if (desktop) {
    const Icon = active.Icon;
    return (
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="-ml-2 mr-1.5 flex h-8 w-8 items-center justify-center rounded-md border border-line text-fg-subtle hover:border-line-strong hover:bg-surface-2 hover:text-fg transition-colors"
            >
              <PanelLeftIcon size={16} />
            </button>
            <Icon size={18} className="text-fg-subtle" />
            <span className="text-base font-semibold text-fg whitespace-nowrap">{active.label}</span>
          </div>
          {controls}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 shrink-0" aria-label="hunajapannu.fi, home">
          <LogoMark size={24} />
          <h1 className="text-base font-semibold tracking-tight text-fg">hunajapannu.fi</h1>
        </a>
        {controls}
      </div>
      <nav aria-label="Dashboard sections" className="px-4 sm:px-6">
        <Tabs tabs={tabs} value={active.id} onChange={onView} label="Dashboard sections" idPrefix="view" />
      </nav>
    </header>
  );
};

export default memo(AppHeader);
