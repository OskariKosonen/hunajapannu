import { memo } from "react";
import Panel from "./ui/Panel";
import Badge from "./ui/Badge";
import { EmptyState, ErrorNotice, Skeleton } from "./ui/states";
import { ExternalIcon } from "./ui/icons";
import { defangUrl } from "../lib/defang";
import { formatDate, formatNumber } from "../lib/format";

/**
 * The machines serving the second stage.
 *
 * Attackers who get a shell almost always fetch something, and the URL is
 * sitting in plain text in the captured commands. This is the same data read
 * as infrastructure: which host, whose network, how many payloads.
 *
 * URLs are defanged on display. These are live malware URLs; rendering them
 * clickable on a page a security person might have open at work would be a
 * poor thing to do.
 */

/** Cloud providers are worth calling out: hosting here defeats IP reputation. */
const CLOUD = /google|amazon|aws|azure|microsoft|digitalocean|oracle|linode|vultr|hetzner|ovh/i;

const Fact = ({ label, children }) => (
  <div>
    <dt className="text-xs text-fg-subtle">{label}</dt>
    <dd className="text-sm text-fg tabular-nums">{children}</dd>
  </div>
);

const HostCard = ({ h }) => {
  const cloud = CLOUD.test(h.org || "");
  return (
    <div className="rounded-md border border-line bg-surface-2/50 p-3.5 space-y-2.5 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm text-fg break-all">{defangUrl(h.host)}</div>
          <div className="mt-0.5 text-xs text-fg-subtle truncate">
            {[h.asn ? `AS${h.asn}` : null, h.org, h.country_iso].filter(Boolean).join(" · ") ||
              (h.is_ip ? "unattributed" : "hostname")}
          </div>
        </div>
        {h.is_ip && (
          <a
            href={`https://www.virustotal.com/gui/ip-address/${h.host}`}
            target="_blank"
            rel="noreferrer"
            title="Look up this address on VirusTotal"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-2xs text-fg-muted hover:border-line-strong hover:text-fg"
          >
            VirusTotal
            <ExternalIcon size={11} />
          </a>
        )}
      </div>

      {cloud && <Badge tone="warn">Commercial cloud: IP reputation will not flag this</Badge>}

      <dl className="grid grid-cols-3 gap-2">
        <Fact label="Payloads">{formatNumber(h.url_count)}</Fact>
        <Fact label="Fetch attempts">{formatNumber(h.attempts)}</Fact>
        <Fact label="First seen">{h.first_seen ? formatDate(h.first_seen) : "—"}</Fact>
      </dl>

      <details className="group text-xs">
        <summary className="cursor-pointer select-none text-fg-muted hover:text-fg">show URLs</summary>
        <ul className="mt-1.5 space-y-0.5 font-mono text-fg-muted">
          {h.urls.map((u) => (
            <li key={u} className="break-all">
              {defangUrl(u)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};

const PayloadInfraPanel = ({ hosts, error, loading, total }) => (
  <Panel
    title="Payload hosts"
    description="Servers the attackers downloaded payloads from, taken from captured wget and curl commands. URLs are defanged."
    meta={total > 0 ? `${formatNumber(total)} hosts` : undefined}
  >
    {hosts.length === 0 ? (
      error ? (
        <ErrorNotice>Failed to load payload hosts: {error}</ErrorNotice>
      ) : loading ? (
        <Skeleton rows={5} />
      ) : (
        <EmptyState title="No download URLs captured yet." />
      )
    ) : (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {hosts.map((h) => (
          <HostCard key={h.host} h={h} />
        ))}
      </div>
    )}
  </Panel>
);

export default memo(PayloadInfraPanel);
