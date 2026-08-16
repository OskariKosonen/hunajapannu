import { memo } from "react";
const DashboardHeader = ({ timeZone, timeZoneLabel }) => (
  <header className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-5 rounded-xl shadow-lg border border-emerald-500/80 ring-1 ring-emerald-500/20">
    <div className="space-y-1 w-full">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-emerald-400 text-xl sm:text-2xl">▮▯</span>
          <h1 className="text-xl sm:text-2xl text-green-300 font-bold tracking-tight leading-tight">
            hunajapannu.fi
          </h1>
        </div>
        <span className="text-[0.65rem] px-2 py-0.5 rounded-full border border-emerald-500/70 text-emerald-300 bg-black/40">
          Built by Oskari Kosonen
        </span>
        {timeZone && (
          <span
            title={`All timestamps are shown in your local timezone (${timeZone})`}
            className="text-[0.65rem] px-2 py-0.5 rounded-full border border-emerald-800/70 text-emerald-400 bg-black/40 whitespace-nowrap"
          >
             times in {timeZone}
            {timeZoneLabel ? ` · ${timeZoneLabel}` : ""}
          </span>
        )}
      </div>
    </div>
    <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 sm:gap-3 sm:items-center sm:justify-end">
      {/* Anyone evaluating this technically wants the source before the
          profile, so the repo goes first and is not hidden in the footer. */}
      <a
        href="https://github.com/OskariKosonen/hunajapannu"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 text-xs sm:text-sm px-3 py-2 rounded-md border border-emerald-500/70 text-emerald-200 bg-black/40 hover:border-emerald-400 hover:text-emerald-100 transition-colors font-semibold w-full sm:w-auto"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
        Source on GitHub
      </a>
      <a
        href="https://www.linkedin.com/in/oskari-kosonen-ba2589294/"
        target="_blank"
        rel="noreferrer"
        className="text-xs sm:text-sm px-3 py-2 rounded-md border border-emerald-400 text-slate-950 bg-emerald-200 hover:bg-emerald-100 transition-colors font-semibold shadow-md w-full sm:w-auto text-center"
      >
        Check my LinkedIn
      </a>
    </div>
  </header>
);

export default memo(DashboardHeader);
