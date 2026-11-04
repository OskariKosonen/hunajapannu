import { memo, useMemo } from "react";
import Panel from "./ui/Panel";
import { EmptyState, ErrorNotice, Skeleton } from "./ui/states";
import { shortTechniqueName } from "../hooks/useCatalogue";
import { formatNumber } from "../lib/format";

/**
 * How many distinct commands matched each ATT&CK technique, ranked. Bars on
 * one baseline in one hue: the job is ranking, so colour would add nothing.
 */
const TechniquesPanel = ({ counts, techniques, loading, error, onOpen }) => {
  const rows = useMemo(
    () =>
      techniques
        .map((t) => ({ id: t.id, name: shortTechniqueName(t.name), value: Number(counts?.[t.id]) || 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    [counts, techniques]
  );
  const max = rows[0]?.value || 0;

  return (
    <Panel
      title="Techniques observed"
      meta="Distinct commands"
      onOpen={onOpen}
      openLabel="Open commands by technique"
      className="h-full"
    >
      {rows.length === 0 ? (
        error ? (
          <ErrorNotice>Failed to load techniques: {error}</ErrorNotice>
        ) : loading || !counts ? (
          <Skeleton rows={5} />
        ) : (
          <EmptyState title="No tagged commands yet." />
        )
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-fg">
                  {r.name} <span className="font-mono text-xs text-fg-subtle">{r.id}</span>
                </span>
                <span className="shrink-0 tabular-nums text-fg-muted">{formatNumber(r.value)}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full bg-accent/60" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};

export default memo(TechniquesPanel);
