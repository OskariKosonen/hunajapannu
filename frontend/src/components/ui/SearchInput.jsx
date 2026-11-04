import { memo } from "react";
import { SearchIcon, XIcon } from "./icons";

/**
 * Panel search. The value is controlled by the parent and debounced before it
 * reaches the API, so typing does not fire a request per keystroke.
 */
const SearchInput = ({ value, onChange, placeholder, resultLabel, className = "" }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <div className="relative flex-1 min-w-0">
      <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-md border border-line bg-surface-2 pl-8 pr-8 text-sm text-fg placeholder:text-fg-subtle focus:border-accent/60 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg"
        >
          <XIcon size={12} />
        </button>
      )}
    </div>
    {resultLabel && <span className="text-xs text-fg-subtle whitespace-nowrap tabular-nums">{resultLabel}</span>}
  </div>
);

export default memo(SearchInput);
