import { memo } from "react";
import ScrollShadow from "./common/ScrollShadow";

/**
 * The Panchan mesh as this one sensor has seen it.
 *
 * Ranked by how many separate bootstrap lists an address has appeared in,
 * because that is the column that separates infrastructure from noise: most
 * peers show up once, a handful have been handed out for most of a year.
 */
const BotnetPeersPanel = ({ data, loading, error, countryFlag, formatDate }) => {
  const rows = data?.rows ?? [];
  return (
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
        <h2 className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
          Botnet peers
        </h2>
        {data && (
          <span className="text-[0.6rem] text-emerald-500 truncate">
            {data.total?.toLocaleString()} peers · {data.lists} lists ({data.emptyLists} empty)
          </span>
        )}
      </div>

      <div className="px-4 py-2 border-b border-emerald-900/50 text-[0.62rem] text-emerald-400 leading-relaxed">
        Addresses the SSH worm was handed to join its peer-to-peer mesh. These are
        infected nodes, not targets — a peer appearing in many lists has been part
        of the network for a long time.
      </div>

      {error && <div className="px-4 py-3 text-[0.7rem] text-red-400">{error}</div>}
      {loading && !rows.length && <div className="px-4 py-3 text-[0.7rem] text-emerald-500">loading…</div>}

      {!!rows.length && (
        <ScrollShadow className="flex-1 min-h-0">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-[0.68rem]">
              <thead className="text-emerald-400 uppercase tracking-wider text-[0.6rem]">
                <tr className="border-b border-emerald-900/60">
                  <th className="text-left font-normal px-4 py-1.5">Peer</th>
                  <th className="text-left font-normal px-2 py-1.5">Network</th>
                  <th className="text-right font-normal px-2 py-1.5">Lists</th>
                  <th className="text-right font-normal px-4 py-1.5">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.peer_ip} className="border-b border-emerald-900/30 hover:bg-emerald-500/5">
                    <td className="px-4 py-1.5 text-green-200 tabular-nums whitespace-nowrap">
                      {countryFlag?.(r.country_iso)} {r.peer_ip}
                    </td>
                    <td className="px-2 py-1.5 text-emerald-500 truncate max-w-[16rem]" title={r.org ?? ""}>
                      {r.asn ? `AS${r.asn}` : "—"} {r.org ? `· ${r.org}` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right text-green-300 tabular-nums">{r.list_count}</td>
                    <td className="px-4 py-1.5 text-right text-emerald-600 tabular-nums whitespace-nowrap">
                      {formatDate ? formatDate(r.last_seen) : r.last_seen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollShadow>
      )}
    </section>
  );
};

export default memo(BotnetPeersPanel);
