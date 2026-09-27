import { memo, useState } from "react";

/**
 * Commands that look like someone checking whether the box is real.
 *
 * The first version printed each command in full. One of them is a 2,000
 * character `export PATH=...` one-liner, so the panel became an unreadable
 * wall of shell that buried the thing it was meant to show. Commands are
 * clamped to two lines and expand on click.
 *
 * The score is shown rather than a verdict, because the evidence genuinely
 * varies: naming a hypervisor is decisive, reading /proc/cpuinfo is also just
 * recon. The strongest rule is promoted to a readable label so the row says
 * what kind of check it was without needing the full rule list.
 */

// Strongest first. The first match is what the row is really about.
const KIND = [
  { rule: "explicit-honeypot-string", label: "names the honeypot", tone: "text-green-200 border-green-400/60" },
  { rule: "hypervisor-by-name", label: "hypervisor check", tone: "text-emerald-200 border-emerald-400/60" },
  { rule: "virt-detection-tool", label: "hypervisor check", tone: "text-emerald-200 border-emerald-400/60" },
  { rule: "dmi-identity", label: "firmware identity", tone: "text-emerald-200 border-emerald-400/60" },
  { rule: "writability-probe", label: "capability probe", tone: "text-emerald-300 border-emerald-600/60" },
  { rule: "shell-capability-probe", label: "capability probe", tone: "text-emerald-300 border-emerald-600/60" },
  { rule: "echo-roundtrip", label: "capability probe", tone: "text-emerald-300 border-emerald-600/60" },
];

const kindOf = (rules = []) =>
  KIND.find((k) => rules.includes(k.rule)) ?? {
    label: "fingerprinting",
    tone: "text-emerald-500 border-emerald-800/70",
  };

const ProbeRow = ({ row }) => {
  const [open, setOpen] = useState(false);
  const kind = kindOf(row.probe_rules);
  const long = (row.command?.length ?? 0) > 150;

  return (
    <div className="px-4 py-2 hover:bg-emerald-500/5">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="text-[0.6rem] px-1.5 py-0.5 rounded border border-emerald-600/60 text-green-200 tabular-nums shrink-0"
          title="Accumulated rule weight"
        >
          {row.probe_score}
        </span>
        <span className={`text-[0.58rem] px-1.5 py-0.5 rounded-full border ${kind.tone}`}>{kind.label}</span>
        {/* The rule names are the auditability of the score, but printing
            eight chips per row was most of what made this panel unreadable.
            The count carries them on hover instead. */}
        <span
          className="text-[0.55rem] text-emerald-700 tabular-nums ml-auto"
          title={(row.probe_rules ?? []).join(", ")}
        >
          {row.probe_rules?.length ?? 0} rules · {row.total} hits · {row.unique_ips} IPs
        </span>
      </div>

      {/* No `block` here. Tailwind emits .block after .line-clamp-2, so
          display:block wins the cascade and the clamp silently does nothing —
          which is exactly what happened in the first attempt at this fix.
          line-clamp-2 sets display:-webkit-box itself; when expanded, `block`
          is applied instead. */}
      <code
        className={`mt-1 text-[0.65rem] text-emerald-300/90 break-all leading-snug ${
          open ? "block" : "line-clamp-2"
        }`}
      >
        {row.command}
      </code>

      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-[0.55rem] text-emerald-600 hover:text-emerald-300 underline underline-offset-2"
        >
          {open ? "show less" : `show all ${row.command.length} characters`}
        </button>
      )}
    </div>
  );
};

const ProbePanel = ({ data, loading, error }) => {
  const rows = data?.rows ?? [];

  return (
    <section className="flex flex-col overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60 gap-2">
        <h2 className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5 whitespace-nowrap">
          Am I in a honeypot?
        </h2>
        {data && (
          <span className="text-[0.6rem] text-emerald-500 tabular-nums">
            {rows.length} commands · score ≥ {data.threshold}
          </span>
        )}
      </div>

      <p className="px-4 py-2.5 text-[0.62rem] text-emerald-400 leading-relaxed border-b border-emerald-900/50">
        Some attackers check whether a machine is real before committing a payload.
        A higher score means more, or more deliberate, checks in one command.
      </p>

      {error && <div className="px-4 py-3 text-[0.7rem] text-red-400">{error}</div>}
      {loading && !rows.length && <div className="px-4 py-3 text-[0.7rem] text-emerald-500">loading…</div>}
      {!loading && !error && !rows.length && (
        <div className="px-4 py-3 text-[0.7rem] text-emerald-600">Nothing has scored above the threshold yet.</div>
      )}

      {!!rows.length && (
        <div className="max-h-[19rem] overflow-y-auto custom-scrollbar divide-y divide-emerald-900/25">
          {rows.map((r) => (
            <ProbeRow key={r.command} row={r} />
          ))}
        </div>
      )}
    </section>
  );
};

export default memo(ProbePanel);
