import { memo, useState } from "react";
import Panel from "./ui/Panel";
import Badge from "./ui/Badge";
import { EmptyState, ErrorNotice, Skeleton } from "./ui/states";
import { formatNumber } from "../lib/format";

/**
 * Commands that look like someone checking whether the box is real.
 *
 * Commands are clamped to two lines and expand on click: one of them is a
 * 2,000-character `export PATH=...` one-liner.
 *
 * The score is shown rather than a verdict, because the evidence genuinely
 * varies: naming a hypervisor is decisive, reading /proc/cpuinfo is also just
 * recon. The strongest rule is promoted to a readable label.
 */

// Strongest first. The first match is what the row is really about.
const KIND = [
  { rule: "explicit-honeypot-string", label: "names the honeypot", tone: "danger" },
  { rule: "hypervisor-by-name", label: "hypervisor check", tone: "warn" },
  { rule: "virt-detection-tool", label: "hypervisor check", tone: "warn" },
  { rule: "dmi-identity", label: "firmware identity", tone: "warn" },
  { rule: "writability-probe", label: "capability probe", tone: "neutral" },
  { rule: "shell-capability-probe", label: "capability probe", tone: "neutral" },
  { rule: "echo-roundtrip", label: "capability probe", tone: "neutral" },
];

const kindOf = (rules = []) => KIND.find((k) => rules.includes(k.rule)) ?? { label: "fingerprinting", tone: "muted" };

const ProbeRow = ({ row }) => {
  const [open, setOpen] = useState(false);
  const kind = kindOf(row.probe_rules);
  const long = (row.command?.length ?? 0) > 150;

  return (
    <li className="px-4 py-3 sm:px-5 hover:bg-surface-2/60">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded bg-surface-3 px-1 text-xs font-semibold text-fg tabular-nums"
          title="Accumulated rule weight"
        >
          {row.probe_score}
        </span>
        <Badge tone={kind.tone}>{kind.label}</Badge>
        {/* The rule names are the auditability of the score; the count
            carries them on hover rather than as eight chips per row. */}
        <span className="ml-auto text-xs text-fg-subtle tabular-nums" title={(row.probe_rules ?? []).join(", ")}>
          {row.probe_rules?.length ?? 0} rules · {formatNumber(row.total)} hits · {formatNumber(row.unique_ips)} IPs
        </span>
      </div>

      {/* No `block` with line-clamp: Tailwind emits .block after
          .line-clamp-2, so display:block would win and the clamp would
          silently do nothing. */}
      <code
        className={`mt-1.5 font-mono text-[0.8125rem] text-fg-muted break-all leading-snug ${
          open ? "block" : "line-clamp-2"
        }`}
      >
        {row.command}
      </code>

      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs text-fg-subtle hover:text-fg underline underline-offset-2"
        >
          {open ? "Show less" : `Show all ${formatNumber(row.command.length)} characters`}
        </button>
      )}
    </li>
  );
};

const ProbePanel = ({ data, loading, error }) => {
  const rows = data?.rows ?? [];

  return (
    <Panel
      title="Honeypot detection attempts"
      description="Commands that check whether the machine is real before the attacker commits a payload. A higher score means more, or more deliberate, checks."
      meta={data ? `${rows.length} commands · score ≥ ${data.threshold}` : undefined}
      flush
      className="h-full"
    >
      {rows.length === 0 ? (
        <div className="p-4 sm:p-5">
          {error ? (
            <ErrorNotice>Failed to load probes: {error}</ErrorNotice>
          ) : loading ? (
            <Skeleton rows={6} />
          ) : (
            <EmptyState title="Nothing has scored above the threshold yet." />
          )}
        </div>
      ) : (
        <ul className="max-h-[34rem] overflow-y-auto custom-scrollbar divide-y divide-line/70">
          {rows.map((r) => (
            <ProbeRow key={r.command} row={r} />
          ))}
        </ul>
      )}
    </Panel>
  );
};

export default memo(ProbePanel);
