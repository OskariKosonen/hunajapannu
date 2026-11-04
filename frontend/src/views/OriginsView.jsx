import { memo } from "react";
import OriginsPanel from "../components/OriginsPanel";
import ConcentrationPanel from "../components/ConcentrationPanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, useDebounced, buildUrl } from "../hooks/useApi";
import { useUrlState } from "../hooks/useUrlState";
import { useTitleDetail, searchTitle } from "../hooks/useTitle";
import { API, PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../lib/api";

const OriginsView = () => {
  const [view, setView] = useUrlState("origins", "countries");
  const [search, setSearch] = useUrlState("asn");
  const debounced = useDebounced(search, SEARCH_DEBOUNCE_MS);
  // The search only applies to networks, so it only shows in that view.
  useTitleDetail(
    view === "asn" ? (debounced ? searchTitle(debounced, "Networks") : "Networks") : ""
  );
  const countriesApi = useApi(buildUrl(API.TOP_COUNTRIES, { limit: PAGE_SIZE.COUNTRIES }));
  const asnApi = useApi(buildUrl(API.TOP_ASN, { limit: PAGE_SIZE.ASN, search: debounced }));
  const concentrationApi = useApi(API.CONCENTRATION);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:items-start">
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
        />
      </ErrorBoundary>
      {/* The overview already shows each country's share; this side answers
          the question a defender asks next. */}
      <ErrorBoundary name="Concentration">
        <ConcentrationPanel
          data={concentrationApi.raw}
          loading={concentrationApi.loading}
          error={concentrationApi.error}
          className="xl:sticky xl:top-[4.5rem]"
        />
      </ErrorBoundary>
    </div>
  );
};

export default memo(OriginsView);
