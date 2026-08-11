const ProjectSummary = ({
  summaryStats,
  attacksTrendDown,
  peakEvents,
  peakHourLabel,
  ipStatsLoading,
  ipStatsError,
  uniqueCredsLoading,
  uniqueCredsError,
}) => (
  <section className="relative overflow-hidden border border-green-500/60 rounded-xl bg-gradient-to-r from-slate-950 via-emerald-950/60 to-black shadow-xl backdrop-blur-[2px] hero-grid">
    <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.3),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(74,222,128,0.25),transparent_30%)] animate-heroGlow" />
    <div className="relative p-5 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-400">
              Project Summary
            </p>
            <h2 className="text-lg sm:text-xl font-semibold text-green-200">
              Live SSH Attacks. Cyber Threat Intelligence. Much Wow.
            </h2>
            <p className="text-[0.65rem] text-emerald-500 max-w-md mt-1">
              Sensor running in Finland on Telia's consumer network.
            </p>
          </div>
          <span className="inline-flex items-center text-[0.65rem] px-3 py-1 rounded-full text-emerald-300 bg-black/40 border border-red-400 w-fit">
            Data updates every 2 minutes
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Attacks / 24h</div>
          <div className="flex items-center gap-2">
            <div className="text-xl font-bold text-green-100">
              {summaryStats.attacks24h ?? "—"}
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
            Peak {peakEvents ?? "—"} at {peakHourLabel || "local time"}
          </div>
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Unique source IPs / 24h</div>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-green-100">
              {summaryStats.uniqueIpPercent != null
                ? `${summaryStats.uniqueIpPercent.toFixed(2)}%`
                : "—"}
            </div>
            {ipStatsLoading && (
              <span className="text-[0.6rem] text-emerald-500">updating...</span>
            )}
          </div>
          <div className="text-[0.6rem] text-emerald-500">Attacks from new IPs</div>
          {ipStatsError && (
            <div className="mt-1 text-[0.55rem] text-red-400">{ipStatsError}</div>
          )}
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Malware captured</div>
          <div className="text-xl font-bold text-green-100">
            {summaryStats.malwareSamples ?? "—"}
          </div>
          <div className="text-[0.6rem] text-emerald-500">SHA256 fingerprinted binaries</div>
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Unique commands</div>
          <div className="text-xl font-bold text-green-100">
            {summaryStats.uniqueCommands ?? "—"}
          </div>
          <div className="text-[0.6rem] text-emerald-500">Mapped to IP diversity</div>
        </div>

        <div className="border border-emerald-700/60 bg-slate-950/80 rounded-lg p-3">
          <div className="text-[0.65rem] text-emerald-400">Unique credentials</div>
          <div className="flex items-baseline gap-2">
            <div className="text-xl font-bold text-green-100">
              {summaryStats.uniqueCredCount != null ? summaryStats.uniqueCredCount : "—"}
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

export default ProjectSummary;
