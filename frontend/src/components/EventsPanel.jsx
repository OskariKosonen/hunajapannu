import { memo } from "react";
import ScrollShadow from "./common/ScrollShadow";
import { EMPTY_STATES } from "../lib/flavour";

/**
 * The live event feed.
 *
 * Two things this has to get right that it previously did not:
 *
 * 1. Not every row is equally interesting. The overwhelming majority are a bot
 *    connecting and trying one password; a handful actually ran commands. They
 *    used to render identically, so the most interesting thing on the page was
 *    hidden in a hundred rows of noise. Rows are now weighted by what happened.
 *
 * 2. It has to work on a phone. This is a seven-column table of nowrap cells,
 *    and the site is shared from LinkedIn, where most clicks open in a phone
 *    browser. The table became a horizontally-scrolling strip. Narrow viewports
 *    now get cards instead, the same approach SessionsPanel already used.
 */

/** connect < login < command, in increasing order of "worth reading". */
const classify = (ev) => {
  if (ev.command) return "command";
  if (ev.username || ev.password) return "login";
  return "connect";
};

const ROW_TONE = {
  command: "bg-emerald-500/[0.07]",
  login: "",
  connect: "opacity-55",
};

const EventsPanel = ({ events, eventLimit, formatTimestamp, renderGeoPill, isMobile }) => {
  const shown = events.slice(0, eventLimit);

  return (
    <section className="relative flex flex-col h-full overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 shrink-0">
        <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
          Live Events
        </span>
      </div>

      <div className="flex flex-col flex-1 min-h-0 p-4 sm:p-5 w-full space-y-2">
        {isMobile ? (
          // Cards: a nowrap table cannot be read on a 390px screen, and
          // side-scrolling the page to see the command column is worse than
          // dropping the grid entirely.
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2">
            {shown.map((ev) => {
              const kind = classify(ev);
              return (
                <div
                  key={ev.id || `${ev.timestamp}-${ev.src_ip}-${ev.session_id || ""}`}
                  className={`border rounded-lg p-2.5 space-y-1 ${
                    kind === "command"
                      ? "border-emerald-600/60 bg-emerald-500/[0.06]"
                      : "border-emerald-900/70 bg-slate-950/80"
                  } ${kind === "connect" ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-cyan-400 text-[0.78rem]">{ev.src_ip}</span>
                    <span className="text-[0.6rem] text-green-600 tabular-nums shrink-0">
                      {formatTimestamp(ev.timestamp)}
                    </span>
                  </div>
                  <div className="text-[0.62rem]">{renderGeoPill(ev)}</div>
                  {kind === "command" && (
                    <div className="text-[0.68rem] text-emerald-100 break-all">
                      <span className="text-green-500">$ </span>
                      {ev.command}
                    </div>
                  )}
                  {kind === "login" && (
                    <div className="text-[0.68rem] text-red-400 break-all">
                      {ev.username || "—"} / {ev.password ?? "—"}
                    </div>
                  )}
                  {kind === "connect" && (
                    <div className="text-[0.62rem] text-emerald-700">
                      connection only · port {ev.dest_port ?? 22}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
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
                {shown.map((ev) => {
                  const kind = classify(ev);
                  return (
                    <tr
                      key={ev.id || `${ev.timestamp}-${ev.src_ip}-${ev.session_id || ""}`}
                      className={`hover:bg-emerald-900/15 transition-colors ${ROW_TONE[kind]}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-green-400 tabular-nums">
                        {formatTimestamp(ev.timestamp)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-cyan-400">{ev.src_ip}</td>
                      <td className="px-3 py-2 whitespace-nowrap max-w-[180px]">
                        {renderGeoPill(ev)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-yellow-300 text-right tabular-nums">
                        {ev.dest_port ?? 22}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-red-400">
                        {ev.username || "NULL"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-red-400">
                        {ev.password ?? "NULL"}
                      </td>
                      <td
                        className={`px-3 py-2 max-w-xs truncate ${
                          kind === "command" ? "text-emerald-100" : "text-emerald-200"
                        }`}
                        title={ev.command || undefined}
                      >
                        {ev.command || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollShadow>
        )}

        {events.length === 0 && (
          <div className="shrink-0 py-6 text-center text-xs text-green-500 space-y-1">
            <div>
              <span className="text-green-400">$</span> {EMPTY_STATES.events.line}
            </div>
            <div className="text-[0.65rem] text-emerald-700">{EMPTY_STATES.events.hint}</div>
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(EventsPanel);
