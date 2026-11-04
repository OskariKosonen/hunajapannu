import { memo, useMemo } from "react";
import Panel, { ApiLink } from "./ui/Panel";
import AreaSparkline from "./common/AreaSparkline";
import { ErrorNotice, EmptyState } from "./ui/states";
import { formatHourLabel, formatNumber, formatPercent } from "../lib/format";

/**
 * The last 24 hours, as figures and a chart in one panel.
 *
 * These used to be a row of five stat cards stacked over a full-width,
 * 220px chart. Together they filled a laptop screen, so the featured session
 * and the live feed started exactly at the fold with nothing to suggest the
 * page went on. Side by side they take half the height and say the same.
 */

const Figure = ({ label, value, suffix, title, loading }) => (
  <div className="min-w-0" title={title}>
    <div className="text-xs text-fg-subtle">{label}</div>
    {loading ? (
      <div className="mt-1 h-7 w-20 rounded bg-surface-3 animate-pulse" />
    ) : (
      <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-xl font-semibold tracking-tight text-fg tabular-nums">{value}</span>
        {suffix && <span className="text-xs text-fg-subtle">{suffix}</span>}
      </div>
    )}
  </div>
);

const DayPanel = ({ summary, summaryLoading, trend, trendLoading, trendError, onNavigate }) => {
  const chartData = useMemo(
    () => trend.map((p) => ({ label: formatHourLabel(p.hour), value: p.events || 0 })),
    [trend]
  );
  const peak = useMemo(
    () => chartData.reduce((acc, p) => (!acc || p.value > acc.value ? p : acc), null),
    [chartData]
  );

  return (
    <Panel
      title="Last 24 hours"
      meta="Events per hour"
      actions={<ApiLink href="/api/public/cowrie/events-per-hour?hours=24" />}
      onOpen={() => onNavigate("activity")}
      openLabel="Open live activity"
      className="h-full"
    >
      <div className="grid gap-4 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8">
        <div className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:content-start lg:gap-3.5">
          <Figure label="Attacks" loading={summaryLoading} value={formatNumber(summary?.attacks24h)} />
          <Figure
            label="Busiest hour"
            loading={trendLoading && !peak}
            value={peak ? formatNumber(peak.value) : "—"}
            suffix={peak ? `at ${peak.label}` : undefined}
          />
          <Figure
            label="Distinct IP ratio"
            loading={summaryLoading}
            value={summary?.uniqueIpPercent != null ? formatPercent(summary.uniqueIpPercent, 2) : "—"}
            title="Distinct source IPs per 100 events"
          />
        </div>

        <div className="min-w-0">
          {trendError && trend.length === 0 ? (
            <ErrorNotice>Failed to load trend: {trendError}</ErrorNotice>
          ) : trendLoading && trend.length === 0 ? (
            <div className="h-[184px] rounded bg-surface-2 animate-pulse" />
          ) : chartData.length > 0 ? (
            <AreaSparkline data={chartData} height={184} />
          ) : (
            <EmptyState title="No events in the last 24 hours." />
          )}
        </div>
      </div>
    </Panel>
  );
};

export default memo(DayPanel);
