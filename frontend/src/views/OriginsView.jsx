import { memo } from "react";
import OriginsPanel from "../components/OriginsPanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, useDebounced, buildUrl } from "../hooks/useApi";
import { useUrlState } from "../hooks/useUrlState";
import { API, PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../lib/api";

const OriginsView = () => {
  const [view, setView] = useUrlState("origins", "countries");
  const [search, setSearch] = useUrlState("asn");
  const debounced = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const countriesApi = useApi(buildUrl(API.TOP_COUNTRIES, { limit: PAGE_SIZE.COUNTRIES }));
  const asnApi = useApi(buildUrl(API.TOP_ASN, { limit: PAGE_SIZE.ASN, search: debounced }));

  return (
    <div className="mx-auto max-w-5xl">
      <ErrorBoundary name="Attack origins">
        <OriginsPanel
          view={view}
          onView={setView}
          topCountries={countriesApi.rows}
          countriesError={countriesApi.error}
          countriesLoading={countriesApi.loading}
          topAsn={asnApi.rows}
          asnError={asnApi.error}
          asnLoading={asnApi.loading}
          asnTotal={asnApi.total}
          search={search}
          onSearch={setSearch}
          pageSize={PAGE_SIZE.ASN}
        />
      </ErrorBoundary>
    </div>
  );
};

export default memo(OriginsView);
