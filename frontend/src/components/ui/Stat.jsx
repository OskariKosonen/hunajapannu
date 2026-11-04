import { cx } from "../../lib/cx";

/**
 * One headline figure.
 *
 * @param {React.ReactNode} label
 * @param {React.ReactNode} value
 * @param {React.ReactNode} [hint]   Context under the value.
 * @param {{direction: "up"|"down", text: string}} [delta]
 */
const Stat = ({ label, value, hint, delta, loading, title, className = "" }) => (
  <div className={cx("min-w-0 rounded-lg border border-line bg-surface px-4 py-3.5", className)}>
    <div className="text-xs font-medium text-fg-muted">{label}</div>
    <div className="mt-1.5 flex items-baseline gap-2 min-w-0">
      {loading ? (
        <div className="h-7 w-24 rounded bg-surface-3 animate-pulse" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums truncate" title={title}>
          {value}
        </span>
      )}
      {delta && !loading && (
        <span
          className={cx(
            "text-xs font-medium tabular-nums whitespace-nowrap",
            delta.direction === "up" ? "text-accent" : "text-fg-subtle"
          )}
        >
          {delta.direction === "up" ? "▲" : "▼"} {delta.text}
        </span>
      )}
    </div>
    {hint && <div className="mt-1 text-xs text-fg-subtle truncate">{hint}</div>}
  </div>
);

export default Stat;
