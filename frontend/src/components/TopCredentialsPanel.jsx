import { memo } from "react";
import Panel, { ApiLink } from "./ui/Panel";
import DataTable from "./ui/DataTable";
import SearchInput from "./ui/SearchInput";
import { formatNumber } from "../lib/format";

const COLUMNS = [
  {
    key: "username",
    header: "Username",
    mono: true,
    primary: true,
    className: "text-fg break-all",
    render: (row) => row.username || "—",
  },
  {
    key: "password",
    header: "Password",
    mono: true,
    className: "text-danger break-all",
    render: (row) => row.password || "—",
  },
  {
    key: "total",
    header: "Attempts",
    align: "right",
    width: "7.5rem",
    className: "text-fg",
    render: (row) => formatNumber(row.total),
  },
  {
    key: "unique_ips",
    header: "Source IPs",
    align: "right",
    width: "7.5rem",
    className: "text-fg-muted",
    render: (row) => formatNumber(row.unique_ips),
  },
];

const TopCredentialsPanel = ({ creds, credsError, credsLoading, credsTotal, search, onSearch, pageSize }) => (
  <Panel
    title="Top credentials"
    description="Username and password pairs tried against the honeypot's SSH and Telnet login."
    meta="All time"
    actions={<ApiLink href="/api/public/cowrie/creds?limit=100" />}
    toolbar={
      <SearchInput
        value={search}
        onChange={onSearch}
        placeholder="Search username or password…"
        resultLabel={credsTotal ? `${formatNumber(credsTotal)} pairs` : null}
      />
    }
    footer={
      credsTotal > creds.length
        ? `Showing the top ${formatNumber(Math.min(pageSize, creds.length))} of ${formatNumber(credsTotal)}`
        : undefined
    }
    flush
  >
    <DataTable
      columns={COLUMNS}
      rows={creds}
      rowKey={(row, i) => `${row.username}-${row.password}-${i}`}
      loading={credsLoading}
      error={credsError}
      errorLabel="Failed to load credentials"
      emptyTitle={search ? "No credentials match that search." : "No credentials data yet."}
      maxHeight="max(24rem, calc(100vh - 17rem))"
    />
  </Panel>
);

export default memo(TopCredentialsPanel);
