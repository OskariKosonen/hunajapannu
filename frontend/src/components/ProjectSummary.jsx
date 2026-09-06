import { memo } from "react";
const ProjectSummary = ({
  summaryStats,
  attacksTrendDown,
  peakEvents,
  peakHourLabel,
  ipStatsLoading,
  ipStatsError,
  uniqueCredsLoading,
  uniqueCredsError,
  formatNumber,
  formatCompact,
  formatDate,
}) => (
  <section className="relative overflow-hidden border border-green-500/60 rounded-xl bg-gradient-to-r from-slate-950 via-emerald-950/60 to-black shadow-xl backdrop-blur-[2px] hero-grid">
    <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.3),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(74,222,128,0.25),transparent_30%)] animate-heroGlow" />
    <div className="relative p-5 sm:p-6 space-y-4">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-400">
          Project Summary
        </p>
        <h2 className="text-lg sm:text-xl font-semibold text-green-200">
          Live SSH Attacks. Cyber Threat Intelligence. Much&nbsp;Wow.
        </h2>
        <p className="text-[0.65rem] text-emerald-500 max-w-md mt-1">
          Sensor running in Finland on Telia's consumer network.
        </p>
      </div>

      {/* Lifetime scale. The 24h cards below are the live pulse, but they
          undersell the sensor on their own: 7,023 today against 7.7M since
          March is the difference between "a demo" and "a system that has been
          running for months". */}
      {summaryStats.lifetimeEvents > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-y border-emerald-800/50 py-3">
          <div className="flex items-baseline gap-2">
            <span
              className="text-2xl sm:text-3xl font-bold text-green-100 tabular-nums"
              title={`${formatNumber(summaryStats.lifetimeEvents)} events`}
            >
              {formatCompact(summaryStats.lifetimeEvents)}
            </span>
            <span className="text-[0.7rem] text-emerald-400">attacks recorded</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-semibold text-green-200 tabular-nums">
              {formatNumber(summaryStats.lifetimeUniqueIps)}
            </span>
            <span className="text-[0.7rem] text-emerald-400">unique attackers</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-semibold text-green-200 tabular-nums">
              {formatNumber(summaryStats.lifetimeCountries)}
            </span>
            <span className="text-[0.7rem] text-emerald-400">countries</span>
          </div>
          {summaryStats.firstEventAt && (
            <span className="text-[0.65rem] text-emerald-500">
              since {formatDate(summaryStats.firstEventAt)}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Attacks / 24h</div>
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold text-green-100 tabular-nums">
              {formatNumber(summaryStats.attacks24h)}
            </div>
            <span
              className={`text-lg font-bold ${
                attacksTrendDown ? "text-red-400" : "text-green-300"
              }`}
              title={`Trend vs prev hour: ${attacksTrendDown ? "down" : "up"}`}
            >
              {attacksTrendDown ? "▼" : "▲"}
            </span>
          </div>
          <div className="text-[0.6rem] text-emerald-500">
            Peak {formatNumber(peakEvents)} at {peakHourLabel || "local time"}
          </div>
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          {/* The value is uniqueIps/totalEvents as a percentage, so a label
              reading "Unique source IPs" sat above a % and promised a count.
              The old sub-label was wrong too: these are distinct IPs, not
              first-time ones — nothing here tracks whether an IP is new. */}
          <div className="text-[0.65rem] text-emerald-400">Unique IP share / 24h</div>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-green-100 tabular-nums">
              {summaryStats.uniqueIpPercent != null
                ? `${summaryStats.uniqueIpPercent.toFixed(2)}%`
                : "—"}
            </div>
            {ipStatsLoading && (
              <span className="text-[0.6rem] text-emerald-500">updating...</span>
            )}
          </div>
          <div className="text-[0.6rem] text-emerald-500">Distinct IPs as a share of all events</div>
          {ipStatsError && (
            <div className="mt-1 text-[0.55rem] text-red-400">{ipStatsError}</div>
          )}
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Malware captured</div>
          <div className="text-xl font-bold text-green-100 tabular-nums">
            {formatNumber(summaryStats.malwareSamples)}
          </div>
          <div className="text-[0.6rem] text-emerald-500">SHA256 fingerprinted binaries</div>
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Unique commands</div>
          <div className="text-xl font-bold text-green-100 tabular-nums">
            {formatNumber(summaryStats.uniqueCommands)}
          </div>
          <div className="text-[0.6rem] text-emerald-500">Mapped to IP diversity</div>
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Unique credentials</div>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-green-100 tabular-nums">
              {formatNumber(summaryStats.uniqueCredCount)}
            </div>
            {uniqueCredsLoading && (
              <span className="text-[0.6rem] text-emerald-500">updating...</span>
            )}
          </div>
          <div className="text-[0.6rem] text-emerald-500">
            Distinct username/password combos seen
          </div>
          {uniqueCredsError && (
            <div className="mt-1 text-[0.55rem] text-red-400">{uniqueCredsError}</div>
          )}
        </div>
      </div>
    </div>
  </section>
);

export default memo(ProjectSummary);
