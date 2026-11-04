import { memo } from "react";
import BotnetPeersPanel from "../components/BotnetPeersPanel";
import ProbePanel from "../components/ProbePanel";
import ClientsPanel from "../components/ClientsPanel";
import TunnelsPanel from "../components/TunnelsPanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { useApi, buildUrl } from "../hooks/useApi";
import { API } from "../lib/api";

/**
 * The machinery behind the attacks: the botnet's own mesh, what it checks
 * before it commits, the software it connects with, and what it tries to
 * use the box for besides malware.
 */
const BotnetView = () => {
  const peersApi = useApi(buildUrl(API.PEERS, { limit: 100 }));
  const probesApi = useApi(buildUrl(API.PROBES, { limit: 50 }));
  const clientsApi = useApi(API.CLIENTS);
  const tunnelsApi = useApi(API.TUNNELS);

  // A quiet month has no relay attempts; the tools panel then takes the row.
  const noTunnels = !tunnelsApi.loading && !tunnelsApi.error && !tunnelsApi.raw?.requests;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
        <ErrorBoundary name="Botnet peers">
          <BotnetPeersPanel data={peersApi.raw} loading={peersApi.loading} error={peersApi.error} />
        </ErrorBoundary>
        <ErrorBoundary name="Honeypot detection attempts">
          <ProbePanel data={probesApi.raw} loading={probesApi.loading} error={probesApi.error} />
        </ErrorBoundary>
      </div>
      <div className={noTunnels ? "" : "grid gap-4 xl:grid-cols-2 xl:items-start"}>
        <ErrorBoundary name="Attack tools">
          <ClientsPanel data={clientsApi.raw} loading={clientsApi.loading} error={clientsApi.error} />
        </ErrorBoundary>
        {!noTunnels && (
          <ErrorBoundary name="Relay attempts">
            <TunnelsPanel data={tunnelsApi.raw} loading={tunnelsApi.loading} error={tunnelsApi.error} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
};

export default memo(BotnetView);
