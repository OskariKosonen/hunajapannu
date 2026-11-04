import { memo } from "react";
import Panel from "./ui/Panel";
import DataTable from "./ui/DataTable";
import SearchInput from "./ui/SearchInput";
import ListFooter from "./ui/ListFooter";
import { useShowMore } from "../hooks/useShowMore";
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
    // Plain ink: when every password is red, red stops meaning anything.
    className: "text-fg break-all",
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

const TopCredentialsPanel = ({ creds, credsError, credsLoading, credsTotal, search, onSearch }) => {
  const page = useShowMore(creds, { resetKey: search, total: credsTotal });
  return (
    <Panel
      title="Top credentials"
      toolbar={
        <SearchInput
          value={search}
          onChange={onSearch}
          placeholder="Search username or password…"
          resultLabel={credsTotal ? `${formatNumber(credsTotal)} pairs` : null}
        />
      }
      footer={page.footer && <ListFooter {...page.footer} />}
      flush
    >
      <DataTable
        columns={COLUMNS}
        rows={page.shown}
        rowKey={(row, i) => `${row.username}-${row.password}-${i}`}
        loading={credsLoading}
        error={credsError}
        errorLabel="Failed to load credentials"
        emptyTitle={search ? "No credentials match that search." : "No credentials data yet."}
        maxHeight="none"
      />
    </Panel>
  );
};

export default memo(TopCredentialsPanel);
