import LoadingSkeleton from "./common/LoadingSkeleton";
import ScrollShadow from "./common/ScrollShadow";

const TopAsnPanel = ({ topAsn, asnError, asnLoading }) => (
  <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-[320px] sm:min-w-0">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60">
      <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5">
        Top ASNs
      </span>
    </div>

    <div className="p-4 sm:p-5 text-[0.72rem] sm:text-[0.78rem] leading-tight max-h-[60vh] sm:max-h-none overflow-y-auto sm:overflow-visible custom-scrollbar">
      {asnError && topAsn.length === 0 && (
        <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1 mb-2">
          Failed to load ASNs: {asnError}
        </div>
      )}

      {asnLoading && topAsn.length === 0 ? (
        <div className="text-[0.68rem] text-emerald-500">
          <LoadingSkeleton />
        </div>
      ) : topAsn.length > 0 ? (
        <>
          <ScrollShadow className="hidden sm:block max-h-[16.5rem] overflow-y-auto border border-emerald-800/70 rounded-lg">
            <table className="w-full text-[0.68rem] sm:text-[0.72rem]">
              <thead className="bg-slate-950 sticky top-0 z-10 border-b border-emerald-800/70">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-semibold text-emerald-100 bg-slate-950">
                    ASN / Org
                  </th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-emerald-100 bg-slate-950">
                    Events
                  </th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-emerald-100 bg-slate-950">
                    IPs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/70 bg-slate-950/80">
                {topAsn.map((row, idx) => (
                  <tr
                    key={`${row.asn}-${idx}`}
                    className="hover:bg-emerald-900/15 odd:bg-slate-950/50 transition-colors"
                  >
                    <td className="px-2.5 py-1.5 text-emerald-200 whitespace-nowrap">
                      <div className="flex flex-col leading-tight">
                        <span className="text-emerald-100">AS{row.asn || "?"}</span>
                        <span className="text-emerald-500 truncate">{row.org || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-200">{row.total}</td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-200">{row.unique_ips}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollShadow>

          <div className="sm:hidden grid grid-cols-1 gap-2.5">
            {topAsn.map((row, idx) => (
              <div
                key={`${row.asn}-${idx}`}
                className="border border-emerald-800/70 rounded-lg bg-slate-950/85 p-3 shadow-inner space-y-1.5"
              >
                <div className="text-[0.8rem] text-emerald-100 leading-snug">
                  AS{row.asn || "?"}
                </div>
                <div className="text-[0.68rem] text-emerald-300 truncate">
                  {row.org || "Unknown"}
                </div>
                <div className="flex items-center justify-between text-[0.7rem] text-emerald-200">
                  <span>Events</span>
                  <span className="font-semibold">{row.total}</span>
                </div>
                <div className="flex items-center justify-between text-[0.7rem] text-emerald-200">
                  <span>IPs</span>
                  <span className="font-semibold">{row.unique_ips}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        !asnError && <div className="text-[0.6rem] text-emerald-500">No ASN data yet.</div>
      )}

      <p className="text-[0.68rem] text-emerald-400 mt-2">/api/public/cowrie/top-asn</p>
    </div>
  </section>
);

export default TopAsnPanel;
