import { memo, useMemo } from "react";
import Panel from "./ui/Panel";
import { ErrorNotice, EmptyState, Skeleton } from "./ui/states";
import { countryFlag, countryName, formatNumber } from "../lib/format";
import { REMAINDER, SERIES } from "../lib/palette";

/**
 * Share of all attacks by source country: one thin segmented bar for the
 * shape, and a list underneath that carries the figures.
 *
 * Not a donut. The list already gives every name and number, and adjacent
 * segments on one baseline compare more exactly than arcs of a ring.
 *
 * Colours are a fixed categorical order validated against this surface for
 * colour-vision deficiency (worst adjacent ΔE 8.4); identity never rests on
 * colour alone, because every swatch has its name beside it. The remainder is
 * neutral, not a sixth hue.
 */
const OTHER = REMAINDER;

const OriginsShare = ({ countries, lifetimeEvents, loading, error, onOpen, className = "h-full" }) => {
  const parts = useMemo(() => {
    const top = countries.slice(0, SERIES.length).map((c, i) => ({
      key: c.country_iso || `?${i}`,
      iso: c.country_iso,
      label: countryName(c.country_iso),
      value: Number(c.total) || 0,
      color: SERIES[i],
    }));
    // Without the countries there is no breakdown to show; a lone
    // "everywhere else" bar would hide a failed request behind a full bar.
    if (top.length === 0) return [];
    const topSum = top.reduce((s, p) => s + p.value, 0);
    // The remainder against the all-time total. Events with no GeoIP match
    // land here too, which is why it is "everywhere else", not "other countries".
    const rest = Math.max(0, (Number(lifetimeEvents) || 0) - topSum);
    const all = rest > 0 ? [...top, { key: "other", label: "Everywhere else", value: rest, color: OTHER }] : top;
    const total = all.reduce((s, p) => s + p.value, 0);
    return all.map((p) => ({ ...p, share: total ? p.value / total : 0 }));
  }, [countries, lifetimeEvents]);

  return (
    <Panel
      title={onOpen ? "Attack origins" : "Share of all attacks"}
      onOpen={onOpen}
      openLabel="Open attack origins"
      className={className}
    >
      {parts.length === 0 ? (
        error ? (
          <ErrorNotice>Failed to load countries: {error}</ErrorNotice>
        ) : loading ? (
          <Skeleton rows={5} />
        ) : (
          <EmptyState title="No origin data yet." />
        )
      ) : (
        <>
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded" role="img" aria-label={parts.map((p) => `${p.label} ${(p.share * 100).toFixed(1)}%`).join(", ")}>
            {parts.map((p) => (
              <div
                key={p.key}
                title={`${p.label}: ${formatNumber(p.value)} (${(p.share * 100).toFixed(1)}%)`}
                style={{ width: `${p.share * 100}%`, background: p.color }}
                className="h-full min-w-[3px]"
              />
            ))}
          </div>

          <ul className="mt-4 space-y-2.5">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-3 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-fg">
                  {p.iso && (
                    <span aria-hidden="true" className="mr-1.5">
                      {countryFlag(p.iso)}
                    </span>
                  )}
                  {p.label}
                </span>
                <span className="tabular-nums text-fg-muted">{formatNumber(p.value)}</span>
                <span className="w-12 text-right tabular-nums text-fg-subtle">{(p.share * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
};

export default memo(OriginsShare);
