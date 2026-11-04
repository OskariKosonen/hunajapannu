import { memo, useState } from "react";
import Tabs from "./ui/Tabs";
import { LogoMark, PanelLeftIcon, RefreshIcon } from "./ui/icons";
import { cx } from "../lib/cx";
import { useNow } from "../hooks/useRefresh";
import { TIME_ZONE, TIME_ZONE_LABEL, formatClock, formatRelative } from "../lib/format";

// The sensor sees several events a minute. Ten quiet minutes means something
// upstream has stopped, which is exactly the failure that once went unnoticed
// for four days while every service reported healthy.
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Freshness and refresh as one control.
 *
 * These were a status pill ("Live · last event 3m ago") beside a button
 * reading "Updated 14:42": two clocks answering the same question. The pill
 * says how fresh the data is; the refresh is an icon on the end of it, and
 * when the page last refreshed is on its tooltip for whoever wants it.
 */
const LiveControl = ({ lastEventAt, lastUpdated, onRefresh, now }) => {
  const [spinning, setSpinning] = useState(false);
  const t = lastEventAt ? new Date(lastEventAt).getTime() : NaN;
  const known = Number.isFinite(t);
  const stale = known && now - t > STALE_AFTER_MS;

  // The long form does not fit beside the brand on a small phone, which
  // pushed the refresh button off the screen at 320px.
  const label = !known ? (
    "Connecting…"
  ) : stale ? (
    `No events for ${formatRelative(lastEventAt, now).replace(" ago", "")}`
  ) : (
    <>
      <span className="sm:hidden">Live · {formatRelative(lastEventAt, now)}</span>
      <span className="hidden sm:inline">Live · last event {formatRelative(lastEventAt, now)}</span>
    </>
  );

  const refreshTitle = lastUpdated
    ? `Refresh now · last refreshed ${formatClock(lastUpdated)}, automatic every 2 minutes`
    : "Refresh now";

  return (
    <div
      className={cx(
        "inline-flex h-8 items-center rounded-full border text-xs whitespace-nowrap tabular-nums",
        !known && "border-line text-fg-subtle",
        known && !stale && "border-accent/30 bg-accent/5 text-fg-muted",
        stale && "border-warn/40 bg-warn/10 text-warn"
      )}
    >
      <span
        role="status"
        title={known ? `Newest event: ${new Date(t).toISOString()}` : undefined}
        className="flex items-center gap-2 pl-3 pr-2.5"
      >
        <span className="relative flex h-2 w-2">
          {known && !stale && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          )}
          <span
            className={cx(
              "relative inline-flex h-2 w-2 rounded-full",
              !known ? "bg-fg-subtle" : stale ? "bg-warn" : "bg-accent"
            )}
          />
        </span>
        {label}
      </span>
      <button
        type="button"
        onClick={() => {
          onRefresh();
          setSpinning(true);
          setTimeout(() => setSpinning(false), 700);
        }}
        aria-label="Refresh data"
        title={refreshTitle}
        className="flex h-full items-center rounded-r-full border-l border-inherit px-2.5 opacity-80 hover:bg-surface-2 hover:opacity-100 transition-colors"
      >
        <RefreshIcon size={13} className={spinning ? "motion-safe:animate-spin" : ""} />
      </button>
    </div>
  );
};

const Controls = ({ lastEventAt, lastUpdated, onRefresh, now }) => (
  <div className="ml-auto flex items-center gap-3 min-w-0">
    <span
      className="hidden xl:inline text-xs text-fg-subtle whitespace-nowrap"
      title="All timestamps are shown in your local timezone"
    >
      Times in {TIME_ZONE}
      {TIME_ZONE_LABEL ? ` (${TIME_ZONE_LABEL})` : ""}
    </span>
    <LiveControl lastEventAt={lastEventAt} lastUpdated={lastUpdated} onRefresh={onRefresh} now={now} />
  </div>
);

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
  lastUpdated,
  onRefresh,
}) => {
  // Ticks here rather than in App, so "12s ago" re-renders the header alone.
  const now = useNow(15000);
  const controls = <Controls lastEventAt={lastEventAt} lastUpdated={lastUpdated} onRefresh={onRefresh} now={now} />;

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
            {active.description && (
              <span className="hidden truncate border-l border-line pl-3 text-sm text-fg-subtle 2xl:inline">
                {active.description}
              </span>
            )}
          </div>
          {controls}
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2.5 shrink-0" aria-label="hunajapannu.fi — home">
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
