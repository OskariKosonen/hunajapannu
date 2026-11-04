import { memo } from "react";
import Panel from "./ui/Panel";
import { ErrorNotice, EmptyState, Skeleton } from "./ui/states";
import { formatNumber } from "../lib/format";

/**
 * Attempts to use the box as a relay (SSH direct-tcpip): the attacker asks
 * the server to open a connection somewhere else on their behalf. Cowrie
 * refuses, but where they wanted to go says what the box was wanted for,
 * which is a kind of abuse command logs never show.
 */

const PORTS = {
  25: "email (SMTP)",
  465: "email (SMTPS)",
  587: "email submission",
  110: "email (POP3)",
  143: "email (IMAP)",
  993: "email (IMAPS)",
  995: "email (POP3S)",
  80: "web (HTTP)",
  443: "web (HTTPS)",
  8080: "web proxy",
  8443: "web (HTTPS alt)",
  53: "DNS",
  22: "SSH",
  23: "Telnet",
  3389: "remote desktop",
  1080: "SOCKS proxy",
  3306: "MySQL",
  5432: "PostgreSQL",
  6379: "Redis",
  6667: "IRC",
};
const purpose = (port) => PORTS[port] || "other";

const TunnelsPanel = ({ data, loading, error, className = "" }) => {
  const max = Math.max(1, ...(data?.ports ?? []).map((p) => p.requests));

  return (
    <Panel
      title="Relay attempts"
      meta={data ? `Last ${data.days} days` : undefined}
      description="Requests to open a connection through the box to somewhere else. All refused, but the destination shows what the box was wanted for."
      className={className}
    >
      {!data?.requests ? (
        error ? (
          <ErrorNotice>Failed to load: {error}</ErrorNotice>
        ) : loading ? (
          <Skeleton rows={8} />
        ) : (
          <EmptyState title="No relay attempts in this window." />
        )
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-fg-muted">
            <span className="text-fg tabular-nums">{formatNumber(data.requests)}</span> requests from{" "}
            <span className="text-fg tabular-nums">{formatNumber(data.sources)}</span>{" "}
            {data.sources === 1 ? "address" : "addresses"}, to{" "}
            <span className="text-fg tabular-nums">{formatNumber(data.destinations)}</span>{" "}
            {data.destinations === 1 ? "destination" : "destinations"}.
          </p>

          <ul className="space-y-2">
            {data.ports.map((p) => (
              <li key={p.dst_port ?? "none"}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-fg">
                    <span className="mr-2 inline-block w-12 font-mono text-[0.8125rem] text-fg-muted">
                      {p.dst_port ?? "?"}
                    </span>
                    {purpose(p.dst_port)}
                  </span>
                  <span className="tabular-nums text-fg-muted">{formatNumber(p.requests)}</span>
                </div>
                <div className="ml-14 mt-1 h-1 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${(p.requests / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>

          {data.hosts.length > 0 && (
            <div className="border-t border-line pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Most requested</h3>
              <ul className="mt-2 divide-y divide-line/70 text-sm">
                {data.hosts.slice(0, 6).map((h) => (
                  <li key={`${h.dst_host}:${h.dst_port}`} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate font-mono text-[0.8125rem] text-fg" title={h.dst_host}>
                      {h.dst_host}
                      <span className="text-fg-subtle">:{h.dst_port ?? "?"}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-fg-muted">{formatNumber(h.requests)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

export default memo(TunnelsPanel);
