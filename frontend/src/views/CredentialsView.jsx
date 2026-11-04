import { memo } from "react";
import TopCredentialsPanel from "../components/TopCredentialsPanel";
import PasswordCheck from "../components/PasswordCheck";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, useDebounced, buildUrl } from "../hooks/useApi";
import { useUrlState } from "../hooks/useUrlState";
import { API, PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../lib/api";

const CredentialsView = () => {
  const [search, setSearch] = useUrlState("cred");
  const debounced = useDebounced(search, SEARCH_DEBOUNCE_MS);
  const credsApi = useApi(buildUrl(API.CREDENTIALS, { limit: PAGE_SIZE.CREDS, search: debounced }));
  const summaryApi = useApi(API.SUMMARY);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <ErrorBoundary name="Top credentials">
        <TopCredentialsPanel
          creds={credsApi.rows}
          credsError={credsApi.error}
          credsLoading={credsApi.loading}
          credsTotal={credsApi.total}
          search={search}
          onSearch={setSearch}
          pageSize={PAGE_SIZE.CREDS}
        />
      </ErrorBoundary>
      <ErrorBoundary name="Password check">
        <PasswordCheck
          endpoint={API.PASSWORD_RANGE}
          uniqueCredCount={summaryApi.raw?.uniqueCredCount}
          className="lg:sticky lg:top-32"
        />
      </ErrorBoundary>
    </div>
  );
};

export default memo(CredentialsView);
