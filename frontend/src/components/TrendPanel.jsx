import { useMemo, memo } from "react";
import Panel, { ApiLink } from "./ui/Panel";
import AreaSparkline from "./common/AreaSparkline";
import { ErrorNotice, EmptyState } from "./ui/states";
import { formatHourLabel, formatNumber } from "../lib/format";

const TrendPanel = ({ trend, trendError, trendLoading, height = 200 }) => {
  const chartData = useMemo(
    () => trend.map((p) => ({ label: formatHourLabel(p.hour), value: p.events || 0 })),
    [trend]
  );
  const total = useMemo(() => chartData.reduce((s, p) => s + p.value, 0), [chartData]);
  const peak = useMemo(
    () => chartData.reduce((acc, p) => (!acc || p.value > acc.value ? p : acc), null),
    [chartData]
  );

  return (
    <Panel
      title="Events per hour"
      meta="Last 24 hours"
      actions={<ApiLink href="/api/public/cowrie/events-per-hour?hours=24" />}
    >
      {chartData.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-fg-muted">
            Total <span className="font-medium text-fg tabular-nums">{formatNumber(total)}</span>
          </span>
          {peak && (
            <span className="text-fg-muted">
              Peak <span className="font-medium text-fg tabular-nums">{formatNumber(peak.value)}</span> at{" "}
              <span className="tabular-nums">{peak.label}</span>
            </span>
          )}
        </div>
      )}

      {trendError && trend.length === 0 ? (
        <ErrorNotice>Failed to load trend: {trendError}</ErrorNotice>
      ) : trendLoading && trend.length === 0 ? (
        <div className="rounded bg-surface-2 animate-pulse" style={{ height }} />
      ) : chartData.length > 0 ? (
        <AreaSparkline data={chartData} height={height} />
      ) : (
        <EmptyState title="No trend data yet." />
      )}
    </Panel>
  );
};

export default memo(TrendPanel);
