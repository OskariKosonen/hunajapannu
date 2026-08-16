import { memo } from "react";
import LoadingSkeleton from "./common/LoadingSkeleton";
import ScrollShadow from "./common/ScrollShadow";
import SearchBox from "./common/SearchBox";

/**
 * Recent attacker sessions. Every event already carries a session_id, so
 * grouping by it turns the flat event stream back into individual visits —
 * click one to see what the attacker actually did, in order.
 */
const SessionsPanel = ({
  sessions,
  sessionsTotal,
  sessionsError,
  sessionsLoading,
  search,
  onSearch,
  onOpen,
  formatTimestamp,
  formatDuration,
  countryFlag,
  isMobile,
}) => (
  <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-[320px] sm:min-w-0">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
      <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
        Sessions
      </span>
      <span className="text-[0.62rem] text-emerald-500 whitespace-nowrap">last 24h</span>
    </div>

    <div className="p-4 sm:p-5 space-y-3">
      <SearchBox
        value={search}
        onChange={onSearch}
        placeholder="Search IP, country or username…"
        resultLabel={sessionsTotal ? `${sessionsTotal} sessions` : null}
      />

      {sessionsError && sessions.length === 0 && (
        <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1">
          Failed to load sessions: {sessionsError}
        </div>
      )}

      {sessionsLoading && sessions.length === 0 ? (
        <LoadingSkeleton />
      ) : sessions.length === 0 ? (
        !sessionsError && (
          <div className="text-[0.68rem] text-emerald-500">
            {search ? "No sessions match that search." : "No sessions in the last 24 hours."}
          </div>
        )
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2.5 max-h-[24rem] overflow-y-auto custom-scrollbar">
          {sessions.map((s) => (
            <button
              key={s.session_id}
              type="button"
              onClick={() => onOpen(s.session_id)}
              className="text-left border border-emerald-800/70 rounded-lg bg-slate-950/85 p-3 space-y-1.5 hover:border-emerald-500/70 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-emerald-100 text-[0.8rem]">
                  <span aria-hidden="true">{countryFlag(s.country_iso)}</span> {s.src_ip}
                </span>
                <span className="text-[0.62rem] text-emerald-500">{formatDuration(s.duration_ms)}</span>
              </div>
              <div className="text-[0.62rem] text-emerald-400 truncate">
                {[s.city, s.org].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="flex gap-3 text-[0.65rem] text-emerald-300">
                <span>{s.events} events</span>
                <span>{s.commands} cmds</span>
                <span>{s.logins} logins</span>
              </div>
              <div className="text-[0.6rem] text-emerald-600">{formatTimestamp(s.started_at)}</div>
            </button>
          ))}
        </div>
      ) : (
        <ScrollShadow className="max-h-[22rem] overflow-y-auto border border-emerald-800/70 rounded-lg">
          <table className="text-[0.7rem] w-full">
            <thead className="bg-slate-950 sticky top-0 z-10 border-b border-emerald-800/70">
              <tr>
                {["Source", "Started", "Duration", "Events", "Cmds", "Logins"].map((col, i) => (
                  <th
                    key={col}
                    className={`px-2.5 py-1.5 font-semibold text-emerald-100 bg-slate-950 whitespace-nowrap ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/70 bg-slate-950/80">
              {sessions.map((s) => (
                <tr
                  key={s.session_id}
                  onClick={() => onOpen(s.session_id)}
                  className="hover:bg-emerald-900/25 odd:bg-slate-950/50 transition-colors cursor-pointer focus-within:bg-emerald-900/30"
                >
                  <td className="px-2.5 py-1.5 text-emerald-200">
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden="true">{countryFlag(s.country_iso)}</span>
                      {/* The row is clickable for mouse users, but the button
                          is what makes it reachable by keyboard and what a
                          screen reader announces. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpen(s.session_id); }}
                        aria-label={`View timeline for session from ${s.src_ip}${s.country_iso ? `, ${s.country_iso}` : ""}, ${s.events} events`}
                        className="font-medium text-left hover:text-emerald-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded-sm"
                      >
                        {s.src_ip}
                      </button>
                    </div>
                    <div className="text-[0.6rem] text-emerald-500 truncate max-w-[16rem]">
                      {[s.city, s.org].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-300 whitespace-nowrap">
                    {formatTimestamp(s.started_at)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-300 whitespace-nowrap">
                    {formatDuration(s.duration_ms)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-200">{s.events}</td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-200">{s.commands}</td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-200">{s.logins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollShadow>
      )}

      <p className="text-[0.68rem] text-emerald-400">
        Grouped from <span className="text-emerald-200">/api/public/cowrie/sessions</span>
        {sessionsTotal > sessions.length && (
          <span className="text-emerald-600"> · showing {sessions.length} of {sessionsTotal}</span>
        )}
      </p>
    </div>
  </section>
);

export default memo(SessionsPanel);
