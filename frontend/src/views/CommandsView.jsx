import { memo, useState } from "react";
import CommandsPanel from "../components/CommandsPanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, useDebounced, buildUrl } from "../hooks/useApi";
import { useUrlState } from "../hooks/useUrlState";
import { useCatalogue, shortTechniqueName } from "../hooks/useCatalogue";
import { useTitleDetail, quoted } from "../hooks/useTitle";
import { API, PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../lib/api";

const CommandsView = () => {
  const { techniques, byId } = useCatalogue();
  const [search, setSearch] = useUrlState("cmd");
  const [tag, setTag] = useUrlState("tag", "all");
  const debounced = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const [counts, setCounts] = useState({});

  const technique = tag !== "all" ? shortTechniqueName(byId[tag]?.name || tag) : "";
  useTitleDetail(
    debounced && technique
      ? `${quoted(debounced)} in ${technique}`
      : debounced
        ? `Commands matching ${quoted(debounced)}`
        : technique
          ? `${technique} commands`
          : ""
  );

  const api = useApi(buildUrl(API.COMMANDS, { limit: PAGE_SIZE.COMMANDS, search: debounced, tag }), {
    onData: (d) => d?.counts && setCounts(d.counts),
  });

  return (
    <ErrorBoundary name="Top commands">
      <CommandsPanel
        commands={api.rows}
        commandsError={api.error}
        commandsLoading={api.loading}
        commandsTotal={api.total}
        commandFilter={tag}
        setCommandFilter={setTag}
        commandTagCounts={counts}
        mitreSignatures={techniques}
        mitreById={byId}
        search={search}
        onSearch={setSearch}
        pageSize={PAGE_SIZE.COMMANDS}
      />
    </ErrorBoundary>
  );
};

export default memo(CommandsView);
