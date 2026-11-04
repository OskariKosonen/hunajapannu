import { memo } from "react";
import Panel from "./ui/Panel";
import DataTable from "./ui/DataTable";
import ListFooter from "./ui/ListFooter";
import { useShowMore } from "../hooks/useShowMore";
import { countryFlag, formatDate, formatNumber } from "../lib/format";

/**
 * The Panchan mesh as this one sensor has seen it.
 *
 * Leads with the distribution rather than the table, because the shape is the
 * finding: most peers are handed out once and a small core has been in every
 * other list for the better part of a year.
 */

const BUCKETS = [
  { key: "once", label: "1 list", hint: "seen once", tone: "bg-accent/20" },
  { key: "few", label: "2–4 lists", hint: "occasional", tone: "bg-accent/40" },
  { key: "some", label: "5–14 lists", hint: "recurring", tone: "bg-accent/70" },
  { key: "core", label: "15+ lists", hint: "persistent core", tone: "bg-accent" },
];

const COLUMNS = [
  {
    key: "peer",
    header: "Peer",
    primary: true,
    nowrap: true,
    width: "11.5rem",
    render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden="true">{countryFlag(r.country_iso)}</span>
        <span className="font-mono text-[0.8125rem] text-info">{r.peer_ip}</span>
      </span>
    ),
  },
  {
    key: "network",
    header: "Network",
    className: "text-fg-muted truncate",
    render: (r) => <span title={r.org ?? ""}>{r.org || (r.asn ? `AS${r.asn}` : "—")}</span>,
  },
  {
    key: "lists",
    header: "Lists",
    align: "right",
    width: "4.5rem",
    render: (r) => (
      <span className={r.list_count >= 15 ? "font-semibold text-accent" : r.list_count >= 5 ? "text-fg" : "text-fg-muted"}>
        {r.list_count}
      </span>
    ),
  },
  {
    key: "last",
    header: "Last seen",
    align: "right",
    width: "7rem",
    nowrap: true,
    hideOnMobile: true,
    className: "text-fg-subtle",
    render: (r) => formatDate(r.last_seen),
  },
];

const BotnetPeersPanel = ({ data, loading, error }) => {
  const rows = data?.rows ?? [];
  const dist = data?.distribution;
  const distTotal = dist ? dist.once + dist.few + dist.some + dist.core : 0;
  // Ten at a time keeps the table level with the detection list beside it.
  const page = useShowMore(rows, { step: 10, total: data?.total, searchable: false });

  return (
    <Panel
      title="Botnet peers"
      description={
        <>
          Addresses a peer-to-peer SSH worm (Panchan) was given so it could join its mesh. They are infected
          machines, not targets.
          {data && (
            <span className="text-fg-subtle">
              {" "}
              {data.lists} lists captured ({data.emptyLists} empty).
            </span>
          )}
        </>
      }
      meta={data ? `${formatNumber(data.total)} peers · ${data.lists} lists` : undefined}
      toolbar={
        dist && distTotal > 0 ? (
          <div>
            <div className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-3">
              {BUCKETS.map(({ key, tone }) => (
                <div key={key} style={{ width: `${(dist[key] / distTotal) * 100}%` }} className={tone} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {BUCKETS.map(({ key, label, hint, tone }) => (
                <span key={key} className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <span className={`inline-block h-2 w-2 rounded-sm ${tone}`} />
                  <span className="text-fg tabular-nums">{formatNumber(dist[key])}</span>
                  <span>{label}</span>
                  <span className="hidden sm:inline">· {hint}</span>
                </span>
              ))}
            </div>
          </div>
        ) : undefined
      }
      footer={page.footer && <ListFooter {...page.footer} />}
      flush
      className="h-full"
    >
      <DataTable
        columns={COLUMNS}
        rows={page.shown}
        rowKey={(r) => r.peer_ip}
        loading={loading}
        error={error}
        errorLabel="Failed to load peers"
        emptyTitle="No peer lists captured yet."
        maxHeight="none"
        skeletonRows={10}
      />
    </Panel>
  );
};

export default memo(BotnetPeersPanel);
