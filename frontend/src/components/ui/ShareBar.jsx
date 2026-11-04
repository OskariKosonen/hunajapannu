import { memo } from "react";
import { formatNumber } from "../../lib/format";

const pct = (share) => `${(share * 100).toFixed(1)}%`;

/**
 * Parts of one whole: a thin segmented bar for the shape, then a legend that
 * carries every name and figure, so nothing rests on colour alone.
 *
 * @param {Array<{ key: string, label: React.ReactNode, title?: string,
 *                 hint?: React.ReactNode, value: number, color: string }>} parts
 */
const ShareBar = ({ parts, className = "" }) => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter((p) => p.value > 0);
  const share = (p) => (total ? p.value / total : 0);
  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded"
        role="img"
        aria-label={shown.map((p) => `${p.title || p.label} ${pct(share(p))}`).join(", ")}
      >
        {shown.map((p) => (
          <div
            key={p.key}
            title={`${p.title || p.label}: ${formatNumber(p.value)} (${pct(share(p))})`}
            style={{ width: `${share(p) * 100}%`, background: p.color }}
            className="h-full min-w-[3px]"
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-3 text-sm">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-fg">{p.label}</span>
              {p.hint && <span className="block text-xs text-fg-subtle">{p.hint}</span>}
            </span>
            <span className="tabular-nums text-fg-muted">{formatNumber(p.value)}</span>
            <span className="w-12 text-right tabular-nums text-fg-subtle">{pct(share(p))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default memo(ShareBar);
