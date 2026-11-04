import { memo } from "react";
import { formatCompact, formatLongDate, formatNumber } from "../lib/format";

const daysSince = (ts) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? Math.max(1, Math.floor((Date.now() - t) / 86_400_000)) : null;
};

/** One tile: label, the figure, one line of context. */
const Tile = ({ label, value, title, hint, loading }) => (
  <div className="min-w-0 bg-surface px-4 py-3.5 sm:px-5 sm:py-4">
    <div className="text-sm text-fg-muted">{label}</div>
    {loading ? (
      <div className="mt-2 h-8 w-24 rounded bg-surface-3 animate-pulse" />
    ) : (
      <div
        className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums sm:text-[1.75rem] sm:leading-9"
        title={title}
      >
        {value}
      </div>
    )}
    {hint && <div className="mt-0.5 text-xs text-fg-subtle sm:truncate">{hint}</div>}
  </div>
);

/**
 * The all-time scale as one joined strip: tiles share their borders rather
 * than floating as separate cards, so the row reads as a single instrument.
 */
const KpiStrip = ({ summary: s, loading }) => (
  <section
    aria-label="All-time figures"
    className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4"
  >
    <Tile
      label="Attacks recorded"
      loading={loading}
      value={formatCompact(s?.lifetimeEvents)}
      title={`${formatNumber(s?.lifetimeEvents)} events`}
      hint={
        s?.firstEventAt
          ? `since ${formatLongDate(s.firstEventAt)} · ${formatNumber(daysSince(s.firstEventAt))} days`
          : "all time"
      }
    />
    <Tile
      label="Unique attacker IPs"
      loading={loading}
      value={formatNumber(s?.lifetimeUniqueIps)}
      hint={
        s?.lifetimeCountries != null ? (
          <>
            from <span className="text-fg-muted">{formatNumber(s.lifetimeCountries)}</span> countries
          </>
        ) : undefined
      }
    />
    <Tile
      label="Credential pairs tried"
      loading={loading}
      value={formatNumber(s?.uniqueCredCount)}
      hint={s?.uniqueCommands != null ? `${formatNumber(s.uniqueCommands)} distinct commands run` : undefined}
    />
    <Tile
      label="Malware samples"
      loading={loading}
      value={formatNumber(s?.malwareSamples)}
      hint="by SHA-256, checked on VirusTotal"
    />
  </section>
);

export default memo(KpiStrip);
