import { memo } from "react";
import ScrollShadow from "./common/ScrollShadow";

const EventsPanel = ({ events, eventLimit, formatTimestamp, renderGeoPill }) => (
  // flex column + h-full: the right-hand column stacks six panels and is far
  // taller than this one's rows, and grid items stretch, so the terminal frame
  // was being drawn full height with the table stopping partway and a large
  // dead area beneath it. The table region is now the flex child that grows.
  <div className="relative flex flex-col h-full overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-[320px] sm:min-w-0">
    <div className="flex items-center px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 shrink-0">
      <div className="flex space-x-2">
        <span className="w-3 h-3 rounded-full bg-red-500" />
        <span className="w-3 h-3 rounded-full bg-yellow-500" />
        <span className="w-3 h-3 rounded-full bg-green-500" />
      </div>
      <div className="ml-4 text-[0.8rem] text-green-300 tracking-[0.08em] uppercase">
        hunajapannu-terminal
      </div>
    </div>

    <div className="flex flex-col flex-1 min-h-0 p-4 sm:p-5 w-full space-y-2">
      <p className="shrink-0 text-[0.95rem] sm:text-[1rem] text-green-300">
        <span className="text-green-500">$</span> ./hunajapannu-dashboard.sh
      </p>

      <ScrollShadow
        containerClassName="flex flex-col flex-1 min-h-0"
        className="w-full min-w-0 flex-1"
        topScrollbar
      >
        <table className="text-[0.72rem] sm:text-[0.78rem] w-full">
          <thead className="bg-slate-950 border-b border-emerald-800/60 sticky top-0 z-10">
            <tr>
              {["Timestamp", "Src IP", "Geo / ASN", "Dst Port", "User", "Pass", "Command"].map(
                (col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left font-semibold text-emerald-100 uppercase tracking-[0.14em] bg-slate-950"
                  >
                    {col}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-900/70 bg-slate-950">
            {events.slice(0, eventLimit).map((ev) => (
              <tr
                key={ev.id || `${ev.timestamp}-${ev.src_ip}-${ev.session_id || ""}`}
                className="hover:bg-emerald-900/15 odd:bg-slate-950/50 transition-colors"
              >
                <td className="px-3 py-2 whitespace-nowrap text-green-400">
                  {formatTimestamp(ev.timestamp)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-cyan-400">{ev.src_ip}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[180px]">{renderGeoPill(ev)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-yellow-300 text-right">
                  {ev.dest_port ?? 22}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-red-400">
                  {ev.username || "NULL"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-red-400">
                  {ev.password ?? "NULL"}
                </td>
                <td className="px-3 py-2 max-w-xs truncate text-emerald-200">
                  {ev.command || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollShadow>

      {events.length === 0 && (
        <div className="shrink-0 py-6 text-center text-xs text-green-500">
          <span className="text-green-400">$</span> No events yet – waiting for attackers...
        </div>
      )}
    </div>
  </div>
);

export default memo(EventsPanel);
