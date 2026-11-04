import { memo } from "react";
import Tabs from "./ui/Tabs";
import Button from "./ui/Button";
import { LogoMark, RefreshIcon } from "./ui/icons";
import { cx } from "../lib/cx";
import { useNow } from "../hooks/useRefresh";
import { TIME_ZONE, TIME_ZONE_LABEL, formatClock, formatRelative } from "../lib/format";

// The sensor sees several events a minute. Ten quiet minutes means something
// upstream has stopped, which is exactly the failure that once went unnoticed
// for four days while every service reported healthy.
const STALE_AFTER_MS = 10 * 60 * 1000;

const StatusPill = ({ lastEventAt, now }) => {
  const t = lastEventAt ? new Date(lastEventAt).getTime() : NaN;
  const known = Number.isFinite(t);
  const stale = known && now - t > STALE_AFTER_MS;

  const label = !known
    ? "Connecting…"
    : stale
      ? `No events for ${formatRelative(lastEventAt, now).replace(" ago", "")}`
      : `Live · last event ${formatRelative(lastEventAt, now)}`;

  return (
    <span
      role="status"
      title={known ? `Newest event: ${new Date(t).toISOString()}` : undefined}
      className={cx(
        "inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs whitespace-nowrap tabular-nums",
        !known && "border-line text-fg-subtle",
        known && !stale && "border-accent/30 bg-accent/5 text-fg-muted",
        stale && "border-warn/40 bg-warn/10 text-warn"
      )}
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
  );
};

const AppHeader = ({ tabs, view, onView, lastEventAt, lastUpdated, onRefresh }) => {
  // Ticks here rather than in App, so "12s ago" re-renders the header alone.
  const now = useNow(15000);
  return (
  <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
      <div className="flex h-14 items-center gap-3 sm:gap-4">
        <a href="/" className="flex items-center gap-2.5 shrink-0" aria-label="hunajapannu.fi — home">
          <LogoMark />
          <h1 className="text-base font-semibold tracking-tight text-fg">hunajapannu.fi</h1>
        </a>
        <span className="hidden md:inline text-sm text-fg-subtle border-l border-line pl-4">
          SSH honeypot threat intelligence
        </span>

        <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
          <StatusPill lastEventAt={lastEventAt} now={now} />
          <span
            className="hidden lg:inline text-xs text-fg-subtle whitespace-nowrap"
            title="All timestamps are shown in your local timezone"
          >
            Times in {TIME_ZONE}
            {TIME_ZONE_LABEL ? ` (${TIME_ZONE_LABEL})` : ""}
          </span>
          <Button
            variant="ghost"
            onClick={onRefresh}
            title={lastUpdated ? `Last updated ${formatClock(lastUpdated)} · refreshes every 2 minutes` : "Refresh"}
            aria-label="Refresh data"
          >
            <RefreshIcon size={14} />
            <span className="hidden sm:inline tabular-nums">
              {lastUpdated ? `Updated ${formatClock(lastUpdated)}` : "Refresh"}
            </span>
          </Button>
        </div>
      </div>

      <nav aria-label="Dashboard sections">
        <Tabs tabs={tabs} value={view} onChange={onView} label="Dashboard sections" idPrefix="view" />
      </nav>
    </div>
  </header>
  );
};

export default memo(AppHeader);
