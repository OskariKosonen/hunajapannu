import { useCallback, useEffect, useMemo } from "react";
import AppHeader from "./components/AppHeader";
import SessionDrawer from "./components/SessionDrawer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import OverviewView from "./views/OverviewView";
import ActivityView from "./views/ActivityView";
import CommandsView from "./views/CommandsView";
import CredentialsView from "./views/CredentialsView";
import MalwareView from "./views/MalwareView";
import OriginsView from "./views/OriginsView";
import BotnetView from "./views/BotnetView";
import DataView from "./views/DataView";
import { useApi, buildUrl, RefreshTickContext } from "./hooks/useApi";
import { useUrlState } from "./hooks/useUrlState";
import { RefreshContext, useRefresh, useRefreshClock } from "./hooks/useRefresh";
import { CatalogueContext } from "./hooks/useCatalogue";
import { API, REFRESH_INTERVAL_MS } from "./lib/api";

/**
 * The shell: header, tabs, the active view, and the session drawer.
 *
 * Each view owns its own data. Only the active one is mounted, so only its
 * endpoints are fetched — the single-page version requested fifteen endpoints
 * on load to fill panels most visitors never scrolled to.
 */

const TABS = [
  { id: "overview", label: "Overview", Component: OverviewView },
  { id: "activity", label: "Live activity", Component: ActivityView },
  { id: "commands", label: "Commands", Component: CommandsView },
  { id: "credentials", label: "Credentials", Component: CredentialsView },
  { id: "malware", label: "Malware", Component: MalwareView },
  { id: "origins", label: "Origins", Component: OriginsView },
  { id: "botnet", label: "Botnet", Component: BotnetView },
  { id: "data", label: "Data & API", Component: DataView },
];
const TAB_LIST = TABS.map(({ id, label }) => ({ id, label }));

function Shell() {
  const { lastUpdated, refresh } = useRefresh();

  // The view and the open session live in the query string, so any screen —
  // a filtered command list, a specific attacker session — can be linked.
  // Views push history entries so Back moves between them.
  const [rawView, setView] = useUrlState("view", "overview", { push: true });
  const [openSessionId, setOpenSessionId] = useUrlState("session");
  const active = TABS.find((t) => t.id === rawView) || TABS[0];

  const navigate = useCallback(
    (id) => {
      setView(id);
      if (typeof window !== "undefined" && window.scrollY > 0) window.scrollTo({ top: 0 });
    },
    [setView]
  );

  // Newest event, for the live/stale indicator in the header.
  const pulseApi = useApi(buildUrl(API.LATEST_EVENTS, { limit: 1 }));
  const lastEventAt = pulseApi.rows[0]?.timestamp ?? null;

  // The technique catalogue, read by every panel that renders badges.
  const mitreApi = useApi(API.MITRE);
  const catalogue = useMemo(
    () => ({
      techniques: mitreApi.rows,
      byId: Object.fromEntries(mitreApi.rows.map((t) => [t.id, t])),
    }),
    [mitreApi.rows]
  );

  const sessionApi = useApi(
    openSessionId ? `${API.SESSIONS}/${encodeURIComponent(openSessionId)}` : null,
    { enabled: Boolean(openSessionId) }
  );
  const openSession = useCallback((id) => setOpenSessionId(id || ""), [setOpenSessionId]);
  const closeSession = useCallback(() => setOpenSessionId(""), [setOpenSessionId]);

  useEffect(() => {
    if (!openSessionId) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeSession();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSessionId, closeSession]);

  const View = active.Component;

  return (
    <CatalogueContext.Provider value={catalogue}>
      <div className="min-h-screen flex flex-col">
        {/* Hidden until focused; the first thing Tab lands on. */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-fg"
        >
          Skip to content
        </a>

        <AppHeader
          tabs={TAB_LIST}
          view={active.id}
          onView={navigate}
          lastEventAt={lastEventAt}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
        />

        <main
          id="content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 focus:outline-none"
        >
          <div role="tabpanel" id="view-panel" aria-labelledby={`view-${active.id}`}>
            <ErrorBoundary key={active.id} name={active.label}>
              <View onOpenSession={openSession} onNavigate={navigate} />
            </ErrorBoundary>
          </div>
        </main>

        {/* Outside <main>: a footer is a sibling landmark, not page content. */}
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-5 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <span>
              Built by{" "}
              <a
                className="text-fg-muted hover:text-fg"
                href="https://www.linkedin.com/in/oskari-kosonen-ba2589294/"
                target="_blank"
                rel="noreferrer"
              >
                Oskari Kosonen
              </a>{" "}
              · MIT licensed · <em>Hunajapannu</em> is Finnish for honeypot
            </span>
            <span className="flex gap-4">
              <a className="hover:text-fg" href="https://github.com/OskariKosonen/hunajapannu" target="_blank" rel="noreferrer">
                GitHub
              </a>
              <button type="button" className="hover:text-fg" onClick={() => navigate("data")}>
                API
              </button>
              <a className="hover:text-fg" href="/.well-known/security.txt">
                security.txt
              </a>
            </span>
          </div>
        </footer>

        {openSessionId && (
          <SessionDrawer
            data={sessionApi.raw}
            loading={sessionApi.loading}
            error={sessionApi.error}
            onClose={closeSession}
            mitreById={catalogue.byId}
          />
        )}
      </div>
    </CatalogueContext.Provider>
  );
}

function App() {
  // One clock for every panel: each useApi refetches when the tick moves.
  const clock = useRefreshClock(REFRESH_INTERVAL_MS);
  return (
    <RefreshContext.Provider value={clock}>
      <RefreshTickContext.Provider value={clock.tick}>
        <Shell />
      </RefreshTickContext.Provider>
    </RefreshContext.Provider>
  );
}

export default App;
