import { memo } from "react";

/**
 * Panel search input. The value is controlled by the parent and debounced
 * before it reaches the API, so typing does not fire a request per keystroke.
 */
const SearchBox = ({ value, onChange, placeholder, resultLabel }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <div className="relative flex-1 min-w-[140px]">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-slate-950/80 border border-emerald-800/70 rounded-md pl-7 pr-7 py-1 text-[0.7rem] text-emerald-100 placeholder:text-emerald-700 focus:outline-none focus:border-emerald-500/80 transition"
      />
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-600 text-[0.7rem] pointer-events-none">
        ⌕
      </span>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-emerald-300 text-[0.7rem] px-1"
        >
          ✕
        </button>
      )}
    </div>
    {resultLabel && (
      <span className="text-[0.62rem] text-emerald-500 whitespace-nowrap">{resultLabel}</span>
    )}
  </div>
);

export default memo(SearchBox);
