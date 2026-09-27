import { memo } from "react";
import ScrollShadow from "./common/ScrollShadow";

/**
 * Commands that look like someone checking whether the box is real.
 *
 * The score is shown rather than a verdict, because the evidence genuinely
 * varies in strength: naming a hypervisor is decisive, reading /proc/cpuinfo
 * is also just recon. The rules that fired are listed so a reader can judge
 * rather than trust.
 */
const ProbePanel = ({ data, loading, error }) => {
  const rows = data?.rows ?? [];
  return (
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
        <h2 className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
          Am I in a honeypot?
        </h2>
        {data && (
          <span className="text-[0.6rem] text-emerald-500">
            {rows.length} commands · threshold {data.threshold}
          </span>
        )}
      </div>

      <div className="px-4 py-2 border-b border-emerald-900/50 text-[0.62rem] text-emerald-400 leading-relaxed">
        Attackers sometimes check whether a box is real before committing a payload.
        A higher score means more, or more deliberate, checks in one command.
      </div>

      {error && <div className="px-4 py-3 text-[0.7rem] text-red-400">{error}</div>}
      {loading && !rows.length && <div className="px-4 py-3 text-[0.7rem] text-emerald-500">loading…</div>}

      {!!rows.length && (
        <ScrollShadow className="flex-1 min-h-0">
          <div className="divide-y divide-emerald-900/30">
            {rows.map((r) => (
              <div key={r.command} className="px-4 py-2 hover:bg-emerald-500/5">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-[0.62rem] px-1.5 py-0.5 rounded border border-emerald-600/60 text-green-200 tabular-nums shrink-0"
                    title="Accumulated rule weight"
                  >
                    {r.probe_score}
                  </span>
                  <code className="text-[0.68rem] text-green-300 break-all">{r.command}</code>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(r.probe_rules ?? []).map((rule) => (
                    <span key={rule} className="text-[0.55rem] px-1.5 py-0.5 rounded-full border border-emerald-800/70 text-emerald-500">
                      {rule}
                    </span>
                  ))}
                  <span className="text-[0.55rem] text-emerald-700 ml-auto tabular-nums">
                    {r.total} hits · {r.unique_ips} IPs
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollShadow>
      )}
    </section>
  );
};

export default memo(ProbePanel);
