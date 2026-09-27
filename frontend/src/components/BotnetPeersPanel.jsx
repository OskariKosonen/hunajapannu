import { memo } from "react";

/**
 * The Panchan mesh as this one sensor has seen it.
 *
 * Leads with the distribution rather than the table, because the shape is the
 * finding: most peers are handed out once and a small core has been in every
 * other list for the better part of a year. A hundred rows of addresses
 * cannot show that, and the first version was exactly that — an unbounded
 * dump that added a thousand pixels to the page and said nothing.
 */

const BAR = [
  { key: "once", label: "1 list", hint: "seen once" },
  { key: "few", label: "2–4", hint: "occasional" },
  { key: "some", label: "5–14", hint: "recurring" },
  { key: "core", label: "15+", hint: "persistent core" },
];

const BotnetPeersPanel = ({ data, loading, error, countryFlag, formatDate }) => {
  const rows = data?.rows ?? [];
  const dist = data?.distribution;
  const distTotal = dist ? dist.once + dist.few + dist.some + dist.core : 0;

  return (
    <section className="flex flex-col overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
        <h2 className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
          Botnet peers
        </h2>
        {data && (
          <span className="text-[0.6rem] text-emerald-500 tabular-nums">
            {data.total?.toLocaleString()} peers · {data.lists} lists
          </span>
        )}
      </div>

      <p className="px-4 pt-2.5 text-[0.62rem] text-emerald-400 leading-relaxed">
        Addresses an SSH worm was handed so it could join its peer-to-peer mesh.
        These are infected machines, not targets.
        {data && (
          <span className="text-emerald-600">
            {" "}
            {data.lists} lists captured ({data.emptyLists} empty).
          </span>
        )}
      </p>

      {/* The distribution, as a bar. One glance says what a table of addresses
          takes a minute to suggest. */}
      {dist && distTotal > 0 && (
        <div className="px-4 pt-2.5 pb-3">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-emerald-950">
            {BAR.map(({ key }, i) => (
              <div
                key={key}
                style={{ width: `${(dist[key] / distTotal) * 100}%` }}
                className={["bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-green-300"][i]}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {BAR.map(({ key, label, hint }, i) => (
              <span key={key} className="flex items-center gap-1 text-[0.58rem] text-emerald-500">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    ["bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-green-300"][i]
                  }`}
                />
                <span className="text-emerald-300 tabular-nums">{dist[key].toLocaleString()}</span>
                <span>{label}</span>
                <span className="text-emerald-700">· {hint}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <div className="px-4 py-3 text-[0.7rem] text-red-400">{error}</div>}
      {loading && !rows.length && <div className="px-4 py-3 text-[0.7rem] text-emerald-500">loading…</div>}

      {/* Capped and scrolled. The first version let the list set the page
          height, which is how two panels added a thousand pixels between
          them. */}
      {!!rows.length && (
        <div className="max-h-[19rem] overflow-y-auto custom-scrollbar border-t border-emerald-900/50">
          <table className="w-full text-[0.66rem]">
            <thead className="sticky top-0 z-10 bg-slate-950 text-emerald-400 uppercase tracking-wider text-[0.56rem]">
              <tr className="border-b border-emerald-900/60">
                <th className="text-left font-normal px-4 py-1.5">Peer</th>
                <th className="text-left font-normal px-2 py-1.5">Network</th>
                <th className="text-right font-normal px-2 py-1.5">Lists</th>
                <th className="text-right font-normal px-4 py-1.5 hidden sm:table-cell">Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.peer_ip} className="border-b border-emerald-900/25 hover:bg-emerald-500/5">
                  <td className="px-4 py-1 text-green-200 tabular-nums whitespace-nowrap">
                    {countryFlag?.(r.country_iso)} {r.peer_ip}
                  </td>
                  <td className="px-2 py-1 text-emerald-600 truncate max-w-[13rem]" title={r.org ?? ""}>
                    {r.org || (r.asn ? `AS${r.asn}` : "—")}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    <span
                      className={
                        r.list_count >= 15
                          ? "text-green-200 font-semibold"
                          : r.list_count >= 5
                            ? "text-emerald-300"
                            : "text-emerald-600"
                      }
                    >
                      {r.list_count}
                    </span>
                  </td>
                  <td className="px-4 py-1 text-right text-emerald-700 tabular-nums whitespace-nowrap hidden sm:table-cell">
                    {formatDate ? formatDate(r.last_seen) : r.last_seen}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default memo(BotnetPeersPanel);
