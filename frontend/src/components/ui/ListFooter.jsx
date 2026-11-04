import { formatNumber } from "../../lib/format";

/**
 * The line under a long table: how much of it is on screen, and a button for
 * the next page. Once every loaded row is showing and the server holds more,
 * it says so and points at the search, which is how to reach the rest.
 */
const ListFooter = ({ shown, loaded, total, onMore, step = 25, searchable = true }) => {
  const all = total ?? loaded;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="tabular-nums">
        Showing {formatNumber(shown)} of {formatNumber(all)}
        {shown >= loaded && all > loaded && searchable ? ". Search to find the rest." : ""}
      </span>
      {shown < loaded && (
        <button
          type="button"
          onClick={onMore}
          className="rounded-md px-2 py-1 -my-1 -mr-2 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
        >
          Show {formatNumber(Math.min(step, loaded - shown))} more
        </button>
      )}
    </div>
  );
};

export default ListFooter;
