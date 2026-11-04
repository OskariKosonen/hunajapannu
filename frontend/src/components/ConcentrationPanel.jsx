import { memo } from "react";
import Panel from "./ui/Panel";
import { ErrorNotice, EmptyState, Skeleton } from "./ui/states";
import { formatNumber } from "../lib/format";

/**
 * "How many networks would I have to block to stop half of this?"
 *
 * A defender's question, and the answer is the finding: attacks come from
 * thousands of networks, but a handful of them carry most of the traffic.
 * Each row's bar is the running total, so the list visibly crosses the
 * halfway mark at the row that answers the question.
 */

const SHARE_LABEL = { 0.5: "Half", 0.8: "80%", 0.9: "90%" };

const ConcentrationPanel = ({ data, loading, error, className = "" }) => {
  const half = data?.thresholds?.find((t) => t.share === 0.5);

  return (
    <Panel
      title="Concentration"
      description="How many networks you would have to block to stop this much of everything recorded here."
      className={className}
    >
      {!data?.events ? (
        error ? (
          <ErrorNotice>Failed to load: {error}</ErrorNotice>
        ) : loading ? (
          <Skeleton rows={7} />
        ) : (
          <EmptyState title="No origin data yet." />
        )
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
            {data.thresholds.map((t) => (
              <div key={t.share} className="bg-surface px-3 py-2.5">
                <dt className="text-xs text-fg-subtle">{SHARE_LABEL[t.share] ?? `${t.share * 100}%`}</dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{formatNumber(t.networks)}</dd>
                <dd className="text-xs text-fg-subtle">{t.networks === 1 ? "network" : "networks"}</dd>
              </div>
            ))}
          </dl>

          <p className="text-sm text-fg-muted">
            Out of <span className="text-fg tabular-nums">{formatNumber(data.networks)}</span> networks seen,{" "}
            {half && (
              <>
                the busiest <span className="font-medium text-fg">{formatNumber(half.networks)}</span> sent half of
                all attacks.
              </>
            )}
          </p>

          <ol className="space-y-2.5">
            {data.top.map((n, i) => {
              const own = n.total / data.events;
              return (
                <li key={n.asn ?? i}>
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums text-fg-subtle">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-fg" title={n.org || undefined}>
                      {n.org || "Unknown"}
                      <span className="ml-1.5 font-mono text-xs text-fg-subtle">AS{n.asn ?? "?"}</span>
                    </span>
                    <span className="tabular-nums text-fg-muted">{(own * 100).toFixed(1)}%</span>
                  </div>
                  {/* Running total, with the halfway mark drawn across every row. */}
                  <div
                    className="relative ml-7 mt-1 h-1 rounded-full bg-surface-3"
                    title={`${(n.cumulative * 100).toFixed(1)}% of all attacks from networks 1–${i + 1}`}
                  >
                    <div
                      className={`h-full rounded-full ${n.cumulative >= 0.5 ? "bg-accent" : "bg-accent/45"}`}
                      style={{ width: `${Math.min(n.cumulative, 1) * 100}%` }}
                    />
                    <div className="absolute inset-y-[-3px] left-1/2 w-px bg-fg-subtle/60" aria-hidden="true" />
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-fg-subtle">Bars show the running total. The line marks half.</p>
        </div>
      )}
    </Panel>
  );
};

export default memo(ConcentrationPanel);
