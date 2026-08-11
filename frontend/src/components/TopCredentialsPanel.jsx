import LoadingSkeleton from "./common/LoadingSkeleton";
import ScrollShadow from "./common/ScrollShadow";

const TopCredentialsPanel = ({ creds, credsError, credsLoading }) => (
  <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-[320px] sm:min-w-0">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60">
      <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5">
        Top Credentials
      </span>
    </div>

    <div className="p-4 sm:p-5 text-[0.72rem] sm:text-[0.78rem] leading-tight">
      {credsError && creds.length === 0 && (
        <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1 mb-2">
          Failed to load credentials: {credsError}
        </div>
      )}

      {credsLoading && creds.length === 0 ? (
        <div className="text-[0.68rem] text-emerald-500">
          <LoadingSkeleton />
        </div>
      ) : creds.length > 0 ? (
        <ScrollShadow className="max-h-[16.5rem] overflow-y-auto border border-emerald-800/70 rounded-lg">
          <table className="w-full text-[0.68rem] sm:text-[0.72rem]">
            <thead className="bg-slate-950 sticky top-0 z-10 border-b border-emerald-800/70">
              <tr>
                {["Username", "Password", "Count", "IPs"].map((col) => (
                  <th
                    key={col}
                    className={`px-2.5 py-1.5 font-semibold text-emerald-100 bg-slate-950 ${
                      col === "Username" || col === "Password" ? "text-left" : "text-right"
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/70 bg-slate-950/80">
              {creds.map((row, idx) => (
                <tr
                  key={`${row.username}-${row.password}-${idx}`}
                  className="hover:bg-emerald-900/15 odd:bg-slate-950/50 transition-colors"
                >
                  <td className="px-2.5 py-1.5 text-emerald-200">{row.username}</td>
                  <td className="px-2.5 py-1.5 text-emerald-200">{row.password}</td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-200">{row.total}</td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-200">{row.unique_ips}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollShadow>
      ) : (
        !credsError && <div className="text-[0.6rem] text-emerald-500">No credentials data yet.</div>
      )}

      <p className="text-[0.68rem] text-emerald-400 mt-2">
        Aggregated from <span className="text-emerald-200">/api/public/cowrie/creds</span>
      </p>
    </div>
  </section>
);

export default TopCredentialsPanel;
