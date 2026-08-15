import { memo } from "react";
import LoadingSkeleton from "./common/LoadingSkeleton";
import ScrollShadow from "./common/ScrollShadow";
import SearchBox from "./common/SearchBox";

/** Technique badges for one row. Rows carry tag ids; names/colours come from the catalogue. */
const TagBadges = ({ tags, mitreById, keyPrefix }) => (
  <div className="mt-1 flex flex-wrap gap-1">
    {tags.map((id) => {
      const sig = mitreById[id];
      return (
        <span
          key={`${keyPrefix}-${id}`}
          title={sig?.description}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[0.62rem] ${
            sig?.badgeColor || "border-emerald-400/60 text-emerald-100 bg-emerald-500/10"
          }`}
        >
          {sig?.name || id}
        </span>
      );
    })}
  </div>
);

/**
 * Top commands. Search and technique filtering are applied server-side, so
 * this renders one page of results rather than every command ever captured.
 * Only the layout matching the current breakpoint is mounted — rendering both
 * and hiding one with CSS doubled the DOM for no benefit.
 */
const CommandsPanel = ({
  commands,
  commandsError,
  commandsLoading,
  commandsTotal,
  commandFilter,
  setCommandFilter,
  isCommandFilterActive,
  commandTagCounts,
  mitreSignatures,
  mitreById,
  search,
  onSearch,
  pageSize,
  isMobile,
}) => (
  <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-[320px] sm:min-w-0 sm:overflow-visible overflow-x-auto custom-scrollbar">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
      <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
        Top Commands
      </span>
    </div>

    <div className="p-4 sm:p-5 text-[0.72rem] sm:text-[0.78rem] leading-tight space-y-3 w-full min-w-0">
      {commandsError && commands.length === 0 && (
        <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1 mb-2">
          Failed to load commands: {commandsError}
        </div>
      )}

      <SearchBox
        value={search}
        onChange={onSearch}
        placeholder="Search commands…"
        resultLabel={commandsTotal ? `${commandsTotal} matching` : null}
      />

      <div className="flex gap-2 text-[0.65rem] w-full overflow-x-auto sm:overflow-visible flex-nowrap sm:flex-wrap custom-scrollbar pb-2">
        <button
          type="button"
          onClick={() => setCommandFilter("all")}
          className={`px-2.5 py-1 rounded-full border whitespace-nowrap transition ${
            !isCommandFilterActive
              ? "border-emerald-500/80 bg-emerald-500/10 text-emerald-100"
              : "border-emerald-800/70 text-emerald-300 hover:border-emerald-500/70"
          }`}
        >
          All
        </button>
        {mitreSignatures.map((sig) => {
          const count = commandTagCounts[sig.id] || 0;
          const active = commandFilter === sig.id;
          return (
            <button
              key={sig.id}
              type="button"
              onClick={() => setCommandFilter(sig.id)}
              disabled={!count}
              title={sig.description}
              className={`px-2.5 py-1 rounded-full border whitespace-nowrap transition ${
                active ? `${sig.badgeColor} border-opacity-100` : "border-emerald-800/60 text-emerald-300 hover:border-emerald-500/70"
              } ${!count ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {sig.name} ({count})
            </button>
          );
        })}
      </div>

      <div className="max-h-[65vh] sm:max-h-none overflow-y-auto sm:overflow-visible custom-scrollbar space-y-3">
        {commandsLoading && commands.length === 0 ? (
          <div className="text-[0.68rem] text-emerald-500">
            <LoadingSkeleton />
          </div>
        ) : commands.length === 0 ? (
          !commandsError && (
            <div className="text-[0.68rem] text-emerald-500">
              {search || isCommandFilterActive
                ? "No commands match the current search or filter."
                : "No command statistics yet."}
            </div>
          )
        ) : isMobile ? (
          <div className="grid grid-cols-1 gap-3">
            {commands.map((row, idx) => (
              <div
                key={`${row.command}-${idx}`}
                className="border border-emerald-800/70 rounded-lg bg-slate-950/85 p-3 shadow-inner space-y-2"
              >
                <div className="text-[0.68rem] uppercase tracking-[0.14em] text-emerald-400">Command</div>
                <div className="text-[0.85rem] text-emerald-100 leading-snug whitespace-pre-wrap break-words" title={row.command}>
                  {row.command}
                </div>

                {row.tags?.length > 0 && (
                  <TagBadges tags={row.tags} mitreById={mitreById} keyPrefix={`m-${idx}`} />
                )}

                <div className="flex items-center justify-between text-[0.72rem] text-emerald-200">
                  <span>Count</span>
                  <span className="font-semibold">{row.total}</span>
                </div>
                <div className="flex items-center justify-between text-[0.72rem] text-emerald-200">
                  <span>IPs</span>
                  <span className="font-semibold">{row.unique_ips}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ScrollShadow className="max-h-[28rem] sm:max-h-[32rem] overflow-y-auto border border-emerald-800/70 rounded-lg min-w-0">
            <table className="text-[0.68rem] sm:text-[0.72rem] w-full">
              <thead className="bg-slate-950 sticky top-0 z-10 border-b border-emerald-800/70">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-semibold text-emerald-100 bg-slate-950">
                    Command
                  </th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-emerald-100 whitespace-nowrap bg-slate-950">
                    Count
                  </th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-emerald-100 whitespace-nowrap bg-slate-950">
                    IPs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/70 bg-slate-950/80">
                {commands.map((row, idx) => (
                  <tr
                    key={`${row.command}-${idx}`}
                    className="hover:bg-emerald-900/15 odd:bg-slate-950/50 transition-colors"
                  >
                    <td className="px-2.5 py-1.5 text-emerald-200 whitespace-normal break-words max-w-xs" title={row.command}>
                      {row.command}
                      {row.tags?.length > 0 && (
                        <TagBadges tags={row.tags} mitreById={mitreById} keyPrefix={`d-${idx}`} />
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-200">{row.total}</td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-200">{row.unique_ips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollShadow>
        )}
      </div>

      <p className="text-[0.68rem] text-emerald-400">
        Aggregated from <span className="text-emerald-200">/api/public/cowrie/commands</span>
        {commandsTotal > commands.length && (
          <span className="text-emerald-600"> · showing top {Math.min(pageSize, commands.length)} of {commandsTotal}</span>
        )}
      </p>
    </div>
  </section>
);

export default memo(CommandsPanel);
