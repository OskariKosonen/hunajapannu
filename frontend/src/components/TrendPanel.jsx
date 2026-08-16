import { useMemo, memo } from "react";
import AreaSparkline from "./common/AreaSparkline";

const TrendPanel = ({
  trend,
  maxTrendEvents,
  formatHourLabel,
  trendError,
  trendLoading,
  totalTrendEvents,
  peakHourLabel,
}) => {
  const chartData = useMemo(
    () =>
      trend.map((point) => ({
        label: formatHourLabel(point.hour),
        value: point.events || 0,
      })),
    [trend, formatHourLabel]
  );

  const hasData = chartData.length > 0;

  return (
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
        <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
          Events (24h)
        </span>
        <span className="text-[0.68rem] text-emerald-400 whitespace-nowrap">
          total: {totalTrendEvents}{" "}
          {trend.length > 0 && (
            <span className="ml-1">
              · peak {maxTrendEvents || "—"} at {peakHourLabel || "local time"}
            </span>
          )}
        </span>
      </div>

      <div className="p-4 sm:p-5 text-[0.72rem] sm:text-[0.78rem] leading-tight space-y-3">
        {trendError && trend.length === 0 && (
          <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1 mb-2">
            Failed to load trend: {trendError}
          </div>
        )}

        {trendLoading && trend.length === 0 ? (
          <div className="h-32 sm:h-36 bg-slate-950 border border-emerald-800/70 rounded-lg p-3 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400" />
              <span className="text-[0.6rem] text-emerald-500">Loading chart...</span>
            </div>
          </div>
        ) : hasData ? (
          <div className="relative w-full min-w-0 bg-slate-950 border border-emerald-800/70 rounded-lg p-2">
            <AreaSparkline data={chartData} max={maxTrendEvents} height={150} />
          </div>
        ) : (
          !trendError && <div className="text-[0.6rem] text-emerald-500">No trend data yet.</div>
        )}

        <p className="text-[0.6rem] text-emerald-500">
          Aggregated from <span className="text-emerald-300">/api/public/cowrie/events-per-hour</span>
        </p>
      </div>
    </section>
  );
};

export default memo(TrendPanel);
