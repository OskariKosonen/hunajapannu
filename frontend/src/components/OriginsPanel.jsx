import { memo, useMemo } from "react";
import ListFooter from "./ui/ListFooter";
import { useShowMore } from "../hooks/useShowMore";
import Panel from "./ui/Panel";
import DataTable from "./ui/DataTable";
import SearchInput from "./ui/SearchInput";
import SegmentedControl from "./ui/SegmentedControl";
import { countryFlag, countryName, formatNumber } from "../lib/format";

/**
 * Where the traffic comes from, at two granularities: countries and networks
 * (ASNs) answer the same question at different resolutions, so one panel with
 * a toggle.
 */

/** A count with a thin bar showing it relative to the busiest row. */
const Volume = ({ value, max }) => (
  <div className="flex items-center justify-end gap-3">
    <div className="hidden sm:block h-1.5 w-24 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full bg-accent/70" style={{ width: `${max ? (Number(value) / max) * 100 : 0}%` }} />
    </div>
    <span className="w-24 text-right">{formatNumber(value)}</span>
  </div>
);

const OriginsPanel = ({
  view,
  onView,
  topCountries,
  countriesError,
  countriesLoading,
  topAsn,
  asnError,
  asnLoading,
  asnTotal,
  search,
  onSearch,
}) => {
  const isAsn = view === "asn";
  const rows = isAsn ? topAsn : topCountries;
  const page = useShowMore(rows, {
    resetKey: `${view}|${search}`,
    total: isAsn ? asnTotal : undefined,
    searchable: isAsn,
  });
  const max = useMemo(() => Math.max(0, ...rows.map((r) => Number(r.total) || 0)), [rows]);

  const columns = useMemo(
    () => [
      isAsn
        ? {
            key: "asn",
            header: "Network",
            primary: true,
            render: (row) => (
              <div className="min-w-0">
                <div className="font-mono text-[0.8125rem] text-fg">AS{row.asn || "?"}</div>
                <div className="text-xs text-fg-subtle truncate max-w-[22rem]">{row.org || "Unknown"}</div>
              </div>
            ),
          }
        : {
            key: "country",
            header: "Country",
            primary: true,
            render: (row) => (
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{countryFlag(row.country_iso)}</span>
                <span className="text-fg">{countryName(row.country_iso)}</span>
                <span className="font-mono text-xs text-fg-subtle">{row.country_iso}</span>
              </div>
            ),
          },
      {
        key: "total",
        header: "Events",
        align: "right",
        render: (row) => <Volume value={row.total} max={max} />,
      },
      {
        key: "unique_ips",
        header: "Source IPs",
        align: "right",
        className: "text-fg-muted w-28",
        render: (row) => formatNumber(row.unique_ips),
      },
    ],
    [isAsn, max]
  );

  // Two views in one panel hide half the errors: a failure in the view you
  // are not looking at is marked on its toggle so it stays discoverable.
  const options = [
    { value: "countries", label: "Countries", failed: Boolean(countriesError) },
    { value: "asn", label: "Networks", failed: Boolean(asnError) },
  ].map((o) => ({
    value: o.value,
    title: o.failed ? `Failed to load ${o.label.toLowerCase()}` : undefined,
    label: (
      <>
        {o.label}
        {o.failed && <span className="text-danger font-semibold">!</span>}
      </>
    ),
  }));

  return (
    <Panel
      title="Attack origins"
      actions={<SegmentedControl label="Origin granularity" options={options} value={view} onChange={onView} />}
      // Only networks are searchable server-side; countries arrive whole.
      toolbar={
        isAsn ? (
          <SearchInput
            value={search}
            onChange={onSearch}
            placeholder="Search network or AS number…"
            resultLabel={asnTotal ? `${formatNumber(asnTotal)} networks` : null}
          />
        ) : undefined
      }
      footer={page.footer && <ListFooter {...page.footer} />}
      flush
    >
      <DataTable
        columns={columns}
        rows={page.shown}
        rowKey={(row, i) => (isAsn ? `${row.asn}-${i}` : `${row.country_iso}-${i}`)}
        loading={isAsn ? asnLoading : countriesLoading}
        error={isAsn ? asnError : countriesError}
        errorLabel={isAsn ? "Failed to load networks" : "Failed to load countries"}
        emptyTitle={isAsn && search ? "No networks match that search." : "No origin data yet."}
        maxHeight="none"
      />
    </Panel>
  );
};

export default memo(OriginsPanel);
