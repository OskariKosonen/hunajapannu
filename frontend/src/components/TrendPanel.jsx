import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
        hourLabel: formatHourLabel(point.hour),
        events: point.events || 0,
      })),
    [trend, formatHourLabel]
  );

  const hasData = chartData.length > 0;

  const tooltipStyles = {
    backgroundColor: "rgba(0,0,0,0.85)",
    border: "1px solid rgba(16,185,129,0.4)",
    borderRadius: "0.375rem",
    padding: "0.5rem 0.75rem",
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div style={tooltipStyles} className="text-emerald-100 text-[0.65rem]">
        <div className="font-semibold">{label}</div>
        <div>{payload[0].value} events</div>
      </div>
    );
  };

  return (
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-[320px] sm:min-w-0">
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
          <div className="relative h-32 sm:h-40 w-full min-w-0 bg-slate-950 border border-emerald-800/70 rounded-lg flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                <defs>
                  <linearGradient id="trendAreaGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#0f172a" strokeDasharray="3 3" />
                <XAxis
                  dataKey="hourLabel"
                  tick={{ fill: "#5eead4", fontSize: 9 }}
                  stroke="#1e293b"
                  interval={Math.max(1, Math.floor(chartData.length / 4))}
                />
                <YAxis
                  width={30}
                  tick={{ fill: "#5eead4", fontSize: 9 }}
                  stroke="#1e293b"
                  allowDecimals={false}
                  domain={[0, (dataMax) => Math.max(dataMax || 0, maxTrendEvents || 0)]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="events"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#trendAreaGradient)"
                  activeDot={{ r: 3, fill: "#f472b6" }}
                />
              </AreaChart>
            </ResponsiveContainer>
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

export default TrendPanel;
