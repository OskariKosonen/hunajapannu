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
      {/* LinkedIn blue, but the dark end of it. Brand #0A66C2 as a solid fill
          was the most saturated thing on a page that is otherwise black and
          emerald, which put a vanity link at the top of the visual hierarchy
          and above the data. #004182 is LinkedIn's own darker shade, so this
          still reads as LinkedIn while sitting at the same depth as the
          slate-950 panels; the brand blue moves to hover, which is the right
          direction on a dark UI. nowrap because "Check my LinkedIn" was
          breaking across two lines in the desktop header. */}
      <a
        href="https://www.linkedin.com/in/oskari-kosonen-ba2589294/"
        target="_blank"
        rel="noreferrer"
        className="text-xs sm:text-sm px-3 py-2 rounded-md border border-[#0A66C2]/70 hover:border-[#0A66C2] text-sky-50 bg-[#004182] hover:bg-[#0A66C2] transition-colors font-semibold shadow-md w-full sm:w-auto text-center whitespace-nowrap"
      >
        Check my LinkedIn
      </a>
    </div>
  </header>
);

export default memo(DashboardHeader);
