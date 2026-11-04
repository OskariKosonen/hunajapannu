import { memo, useMemo, useState } from "react";
import Panel, { ApiLink } from "./ui/Panel";
import DataTable from "./ui/DataTable";
import SearchInput from "./ui/SearchInput";
import TechniqueBadge from "./TechniqueBadge";
import { cx } from "../lib/cx";
import { formatNumber } from "../lib/format";
import { shortTechniqueName } from "../hooks/useCatalogue";

/** One filter chip per ATT&CK technique, with how many commands it matches. */
const TechniqueFilter = ({ techniques, counts, value, onChange }) => {
  const chip = (active, disabled) =>
    cx(
      "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs whitespace-nowrap transition-colors",
      active
        ? "border-accent/50 bg-accent/10 text-accent"
        : "border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg",
      disabled && "opacity-40 cursor-not-allowed hover:border-line hover:text-fg-muted"
    );

  return (
    <div
      role="group"
      aria-label="Filter by ATT&CK technique"
      className="flex gap-1.5 overflow-x-auto hide-native-scrollbar sm:flex-wrap"
    >
      <button type="button" aria-pressed={value === "all"} onClick={() => onChange("all")} className={chip(value === "all")}>
        All techniques
      </button>
      {techniques.map((sig) => {
        const count = counts[sig.id] || 0;
        const active = value === sig.id;
        return (
          <button
            key={sig.id}
            type="button"
            onClick={() => onChange(sig.id)}
            disabled={!count}
            aria-pressed={active}
            aria-label={`${sig.name}, ${count} ${count === 1 ? "command" : "commands"}`}
            title={sig.description}
            className={chip(active, !count)}
          >
            {shortTechniqueName(sig.name)}
            <span className="tabular-nums text-fg-subtle">{formatNumber(count)}</span>
          </button>
        );
      })}
    </div>
  );
};

// Some droppers are 2,000-character one-liners; past this they are clamped
// so a single row does not fill the screen.
const CLAMP_AT = 240;

const CommandCell = ({ row, mitreById }) => {
  const [open, setOpen] = useState(false);
  const long = (row.command?.length ?? 0) > CLAMP_AT;
  return (
    <div className="min-w-0">
      <div
        className={cx(
          "font-mono text-[0.8125rem] text-fg break-all whitespace-pre-wrap",
          long && !open && "line-clamp-3"
        )}
        title={long && !open ? row.command : undefined}
      >
        {row.command}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs text-fg-subtle hover:text-fg underline underline-offset-2"
        >
          {open ? "Show less" : `Show all ${formatNumber(row.command.length)} characters`}
        </button>
      )}
      {row.tags?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {row.tags.map((id) => (
            <TechniqueBadge key={id} id={id} technique={mitreById[id]} />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Top commands. Search and technique filtering are applied server-side, so
 * this renders one page of results rather than every command ever captured.
 */
const CommandsPanel = ({
  commands,
  commandsError,
  commandsLoading,
  commandsTotal,
  commandFilter = "all",
  setCommandFilter,
  commandTagCounts = {},
  mitreSignatures = [],
  mitreById = {},
  search,
  onSearch,
  pageSize,
}) => {
  const filtered = commandFilter !== "all" || Boolean(search);

  const columns = useMemo(
    () => [
      {
        key: "command",
        header: "Command",
        primary: true,
        render: (row) => <CommandCell row={row} mitreById={mitreById} />,
      },
      {
        key: "total",
        header: "Executions",
        align: "right",
        width: "8rem",
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
    ],
    [mitreById]
  );

  return (
    <Panel
      title="Top commands"
      description="Commands attackers ran after logging in, grouped by template and tagged with MITRE ATT&CK techniques."
      meta="All time"
      actions={<ApiLink href="/api/public/cowrie/commands?limit=100" />}
      toolbar={
        <>
          <SearchInput
            value={search}
            onChange={onSearch}
            placeholder="Search commands…"
            resultLabel={commandsTotal ? `${formatNumber(commandsTotal)} matching` : null}
          />
          {mitreSignatures.length > 0 && (
            <TechniqueFilter
              techniques={mitreSignatures}
              counts={commandTagCounts}
              value={commandFilter}
              onChange={setCommandFilter}
            />
          )}
        </>
      }
      footer={
        commandsTotal > commands.length
          ? `Showing the top ${formatNumber(Math.min(pageSize, commands.length))} of ${formatNumber(commandsTotal)}`
          : undefined
      }
      flush
    >
      <DataTable
        columns={columns}
        rows={commands}
        rowKey={(row, i) => `${row.command}-${i}`}
        loading={commandsLoading}
        error={commandsError}
        errorLabel="Failed to load commands"
        emptyTitle={filtered ? "No commands match the current search or filter." : "No command statistics yet."}
        maxHeight="max(24rem, calc(100vh - 21rem))"
      />
    </Panel>
  );
};

export default memo(CommandsPanel);
