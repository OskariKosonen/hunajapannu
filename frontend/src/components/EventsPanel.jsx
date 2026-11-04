import { memo, useMemo, useState } from "react";
import Panel, { ApiLink } from "./ui/Panel";
import DataTable from "./ui/DataTable";
import SegmentedControl from "./ui/SegmentedControl";
import { EMPTY_STATES } from "../lib/flavour";
import { countryFlag, formatEventTime, formatTimestamp, networkLabel, placeLabel } from "../lib/format";

/**
 * The live event feed.
 *
 * Not every row is equally interesting. The overwhelming majority are a bot
 * connecting and trying one password; a handful actually ran commands. Rows
 * are weighted by what happened: commands are tinted, bare connects recede.
 *
 * A row opens its session's full timeline, so the feed is a way in rather
 * than a wall of text.
 */

/** connect < login < command, in increasing order of "worth reading". */
const classify = (ev) => {
  if (ev.command) return "command";
  if (ev.username || ev.password) return "login";
  return "connect";
};

const ROW_TONE = {
  command: "bg-accent/[0.04]",
  login: "",
  connect: "opacity-60",
};

const KIND_FILTERS = [
  { value: "all", label: "All" },
  { value: "login", label: "Logins" },
  { value: "command", label: "Commands" },
];

const Source = ({ ev }) => (
  <div className="min-w-0">
    <div className="font-mono text-[0.8125rem] text-info">{ev.src_ip}</div>
    <div className="mt-0.5 flex items-center gap-1 text-xs text-fg-subtle truncate">
      <span aria-hidden="true">{countryFlag(ev.country_iso)}</span>
      <span className="truncate">{placeLabel(ev)}</span>
    </div>
  </div>
);

// overflow-wrap:anywhere rather than break-all: a long token still wraps,
// but "uname -s -v -n -r -m" no longer splits its last flag onto a line of
// its own. In the compact feed a command is one line, cut with an ellipsis.
const Activity = ({ ev, compact }) => {
  const kind = classify(ev);
  if (kind === "command") {
    return (
      <div
        className={`font-mono text-[0.8125rem] text-fg ${compact ? "truncate" : "line-clamp-2 [overflow-wrap:anywhere]"}`}
        title={ev.command}
      >
        <span className="text-accent">$ </span>
        {ev.command}
      </div>
    );
  }
  if (kind === "login") {
    return (
      <div className={`font-mono text-[0.8125rem] text-danger ${compact ? "truncate" : "[overflow-wrap:anywhere]"}`}>
        {`${ev.username || "—"} / ${ev.password ?? "—"}`}
      </div>
    );
  }
  return <div className="text-xs text-fg-subtle">Connection only · port {ev.dest_port ?? 22}</div>;
};

const EventsPanel = ({
  events,
  eventLimit,
  loading = false,
  error = "",
  onOpenSession,
  compact = false,
  onViewAll,
  className = "",
}) => {
  const [kind, setKind] = useState("all");

  const shown = useMemo(() => {
    const limited = events.slice(0, eventLimit);
    return kind === "all" ? limited : limited.filter((ev) => classify(ev) === kind);
  }, [events, eventLimit, kind]);

  const columns = useMemo(
    () => [
      {
        key: "time",
        header: "Time",
        nowrap: true,
        className: "text-fg-muted tabular-nums",
        render: (ev) => (
          <span title={formatTimestamp(ev.timestamp)}>{formatEventTime(ev.timestamp)}</span>
        ),
        hideOnMobile: false,
      },
      {
        key: "source",
        header: "Source",
        primary: true,
        className: "w-[13rem]",
        render: (ev) => <Source ev={ev} />,
      },
      ...(compact
        ? []
        : [
            {
              key: "network",
              header: "Network",
              className: "text-fg-muted max-w-[14rem] truncate",
              render: (ev) => <span title={networkLabel(ev)}>{networkLabel(ev)}</span>,
            },
            {
              key: "port",
              header: "Port",
              align: "right",
              className: "text-fg-muted",
              hideOnMobile: true,
              render: (ev) => ev.dest_port ?? 22,
            },
          ]),
      {
        key: "activity",
        header: "Activity",
        className: compact ? "max-w-0 w-full" : undefined,
        render: (ev) => <Activity ev={ev} compact={compact} />,
      },
    ],
    [compact]
  );

  const filtered = kind !== "all";

  return (
    <Panel
      title="Live events"
      description={compact ? undefined : "Every connection, login attempt and command, newest first. Select a row to open its session."}
      meta={compact ? "Newest first" : `Latest ${events.length.toLocaleString("en-GB")}`}
      actions={
        <>
          {!compact && (
            <SegmentedControl label="Event type" options={KIND_FILTERS} value={kind} onChange={setKind} />
          )}
          {!compact && <ApiLink href="/api/public/cowrie/latest?limit=100" />}

        </>
      }
      onOpen={compact ? onViewAll : undefined}
      openLabel="Open live activity"
      flush
      className={className}
    >
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(ev, i) => ev.id || `${ev.timestamp}-${ev.src_ip}-${ev.session_id || ""}-${i}`}
        loading={loading}
        error={error}
        errorLabel="Failed to load events"
        emptyTitle={filtered ? "No events of this type in the latest batch." : EMPTY_STATES.events.line}
        emptyHint={filtered ? undefined : EMPTY_STATES.events.hint}
        rowClassName={(ev) => ROW_TONE[classify(ev)]}
        onRowClick={onOpenSession ? (ev) => ev.session_id && onOpenSession(ev.session_id) : undefined}
        rowLabel={(ev) => `Open session from ${ev.src_ip}`}
        maxHeight={compact ? "27rem" : "calc(100vh - 16rem)"}
        skeletonRows={compact ? 8 : 12}
      />
    </Panel>
  );
};

export default memo(EventsPanel);
