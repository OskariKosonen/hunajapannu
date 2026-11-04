import { memo, useMemo } from "react";
import Panel from "./ui/Panel";
import ShareBar from "./ui/ShareBar";
import { ErrorNotice, EmptyState, Skeleton } from "./ui/states";
import { formatNumber } from "../lib/format";
import { REMAINDER, SERIES } from "../lib/palette";
import { groupClients } from "../lib/sshClients";

/**
 * What connects, rather than from where.
 *
 * Addresses rotate; client software does not. The banner names the software
 * (a Go bot, libssh2, someone's OpenSSH), and the HASSH, a hash of the
 * key-exchange offer, pins down the exact build, so one fingerprint showing
 * up from thousands of addresses is one tool run from thousands of machines.
 */
const ClientsPanel = ({ data, loading, error, className = "" }) => {
  const parts = useMemo(() => {
    if (!data?.versions?.length) return [];
    const families = groupClients(data.versions, data.versioned);
    // Five named families at most; the rest fold into one neutral remainder.
    const named = families.filter((f) => f.id !== "other").slice(0, SERIES.length);
    const rest = families.filter((f) => !named.includes(f)).reduce((s, f) => s + f.sessions, 0);
    return [
      ...named.map((f, i) => ({
        key: f.id,
        label: f.label,
        title: f.label,
        hint: f.note,
        value: f.sessions,
        color: SERIES[i],
      })),
      ...(rest > 0 ? [{ key: "other", label: "Other", hint: "everything else", value: rest, color: REMAINDER }] : []),
    ];
  }, [data]);

  const top = data?.hassh?.[0];

  return (
    <Panel
      title="Attack tools"
      meta={data ? `Last ${data.days} days` : undefined}
      description="The SSH software that connected, from the version string it announces and the fingerprint of its key exchange."
      className={className}
    >
      {!data?.sessions ? (
        error ? (
          <ErrorNotice>Failed to load: {error}</ErrorNotice>
        ) : loading ? (
          <Skeleton rows={8} />
        ) : (
          <EmptyState title="No client fingerprints in this window." />
        )
      ) : (
        <div className="space-y-5">
          {parts.length > 0 && <ShareBar parts={parts} />}

          {top && (
            <div className="border-t border-line pt-4">
              <p className="text-sm text-fg-muted">
                <span className="text-fg tabular-nums">{formatNumber(data.ips)}</span> addresses, but only{" "}
                <span className="text-fg tabular-nums">{formatNumber(data.fingerprints)}</span> distinct client
                fingerprints. The most widespread one connected from{" "}
                <span className="font-medium text-fg tabular-nums">{formatNumber(top.ips)}</span> addresses in{" "}
                <span className="font-medium text-fg tabular-nums">{formatNumber(top.countries)}</span>{" "}
                {top.countries === 1 ? "country" : "countries"}: one tool, many machines.
              </p>
              <table className="mt-3 w-full table-fixed text-sm">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wider text-fg-subtle">
                    <th scope="col" className="pb-1.5 font-medium">Fingerprint</th>
                    <th scope="col" className="w-24 pb-1.5 text-right font-medium">Addresses</th>
                    <th scope="col" className="hidden w-24 pb-1.5 text-right font-medium sm:table-cell">Countries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {data.hassh.slice(0, 5).map((h) => (
                    <tr key={h.hassh}>
                      <td className="py-1.5 pr-3">
                        <div className="truncate font-mono text-[0.8125rem] text-fg" title={`HASSH ${h.hassh}`}>
                          {h.hassh.slice(0, 12)}…
                        </div>
                        <div className="truncate text-xs text-fg-subtle" title={h.client_version || undefined}>
                          {h.client_version || "no banner"}
                        </div>
                      </td>
                      <td className="py-1.5 text-right align-top tabular-nums text-fg">{formatNumber(h.ips)}</td>
                      <td className="hidden py-1.5 text-right align-top tabular-nums text-fg-muted sm:table-cell">
                        {formatNumber(h.countries)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

export default memo(ClientsPanel);
