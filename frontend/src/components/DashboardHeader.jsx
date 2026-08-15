import { memo } from "react";
const DashboardHeader = () => (
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
      </div>
    </div>
    <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 sm:gap-3 sm:items-center sm:justify-end">
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
