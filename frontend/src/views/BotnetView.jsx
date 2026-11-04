import { memo } from "react";
import BotnetPeersPanel from "../components/BotnetPeersPanel";
import ProbePanel from "../components/ProbePanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, buildUrl } from "../hooks/useApi";
import { API } from "../lib/api";

/**
 * Two views of the same thing: what the botnet is, and what it checks before
 * it commits.
 */
const BotnetView = () => {
  const peersApi = useApi(buildUrl(API.PEERS, { limit: 100 }));
  const probesApi = useApi(buildUrl(API.PROBES, { limit: 50 }));

  return (
    <div className="grid gap-5 sm:gap-6 xl:grid-cols-2 xl:items-stretch">
      <ErrorBoundary name="Botnet peers">
        <BotnetPeersPanel data={peersApi.raw} loading={peersApi.loading} error={peersApi.error} />
      </ErrorBoundary>
      <ErrorBoundary name="Honeypot detection attempts">
        <ProbePanel data={probesApi.raw} loading={probesApi.loading} error={probesApi.error} />
      </ErrorBoundary>
    </div>
  );
};

export default memo(BotnetView);
