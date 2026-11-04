import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "./components/AppHeader";
import Sidebar from "./components/Sidebar";
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
import { useApi, buildUrl, useMediaQuery, RefreshTickContext } from "./hooks/useApi";
import { cx } from "./lib/cx";
import {
  ActivityIcon,
  BugIcon,
  DatabaseIcon,
  GlobeIcon,
  GridIcon,
  KeyIcon,
  NetworkIcon,
  TerminalIcon,
} from "./components/ui/icons";
import { useUrlState } from "./hooks/useUrlState";
import { RefreshContext, useRefresh, useRefreshClock } from "./hooks/useRefresh";
import { CatalogueContext } from "./hooks/useCatalogue";
import { TitleContext } from "./hooks/useTitle";
import { API, REFRESH_INTERVAL_MS } from "./lib/api";

/**
 * The shell: header, tabs, the active view, and the session drawer.
 *
 * Each view owns its own data. Only the active one is mounted, so only its
 * endpoints are fetched — the single-page version requested fifteen endpoints
 * on load to fill panels most visitors never scrolled to.
 */

const GROUPS = ["Monitor", "Investigate", "Resources"];

const TABS = [
  { id: "overview", label: "Overview", group: "Monitor", Icon: GridIcon, Component: OverviewView,
    description: "What the honeypot is seeing, at a glance" },
  { id: "activity", label: "Live activity", group: "Monitor", Icon: ActivityIcon, Component: ActivityView,
    description: "Every connection, login and command as it arrives" },
  { id: "commands", label: "Commands", group: "Investigate", Icon: TerminalIcon, Component: CommandsView,
    description: "What attackers run once they are in, tagged with MITRE ATT&CK" },
  { id: "credentials", label: "Credentials", group: "Investigate", Icon: KeyIcon, Component: CredentialsView,
    description: "The usernames and passwords bots try" },
  { id: "malware", label: "Malware", group: "Investigate", Icon: BugIcon, Component: MalwareView,
    description: "Captured samples and the hosts serving them" },
  { id: "origins", label: "Origins", group: "Investigate", Icon: GlobeIcon, Component: OriginsView,
    description: "Where the traffic comes from, by country and network" },
  { id: "botnet", label: "Botnet", group: "Investigate", Icon: NetworkIcon, Component: BotnetView,
    description: "A P2P worm's peer mesh, and attackers checking for honeypots" },
  { id: "data", label: "Data & API", group: "Resources", Icon: DatabaseIcon, Component: DataView,
    description: "Indicator exports, the public API and how it is built" },
];
const TAB_LIST = TABS.map(({ id, label }) => ({ id, label }));

const SIDEBAR_KEY = "hunajapannu:sidebar-collapsed";
const readCollapsed = () => {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
};

// The browser tab. A tab shows ~20 characters, so a title says what is on
// screen and nothing else: the favicon already says which site it is. The
// overview is the site's name; a view is its name, plus its search or filter
// in short form, so filtered views can still be told apart in history.
const SITE = "Hunajapannu.fi";
const titleFor = (tab, detail, session) => {
  if (session) return session.src_ip ? `Session ${session.src_ip}` : "Session";
  if (detail) return detail;
  if (tab.id === "overview") return SITE;
  return tab.label;
};

function Shell() {
  const { lastUpdated, refresh } = useRefresh();

  // Sidebar on a desktop, a tab strip on anything narrower. Decided in JS
  // rather than CSS so only one set of navigation exists in the page.
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {
        /* preference just will not persist */
      }
      return !c;
    });
  }, []);

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

  const [titleDetail, setTitleDetail] = useState("");
  const sessionForTitle = openSessionId ? sessionApi.raw?.session || {} : null;
  const pageTitle = titleFor(active, titleDetail, sessionForTitle);
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  const View = active.Component;

  return (
    <CatalogueContext.Provider value={catalogue}>
      <TitleContext.Provider value={setTitleDetail}>
        {desktop && (
          <Sidebar
            items={TABS}
            groups={GROUPS}
            view={active.id}
            onView={navigate}
            collapsed={collapsed}
          />
        )}
        <div
          className={cx(
            "min-h-screen flex flex-col transition-[padding] duration-200",
            desktop && (collapsed ? "pl-[4.5rem]" : "pl-64")
          )}
        >
          {/* Hidden until focused; the first thing Tab lands on. */}
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-fg"
          >
            Skip to content
          </a>

          <AppHeader
            desktop={desktop}
            tabs={TAB_LIST}
            active={active}
            onView={navigate}
            sidebarCollapsed={collapsed}
            onToggleSidebar={toggleSidebar}
            lastEventAt={lastEventAt}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
          />

          <main
            id="content"
            tabIndex={-1}
            aria-label={active.label}
            className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 focus:outline-none"
          >
            {/* With the phone's tab strip, the view is that tablist's panel. */}
            <div {...(desktop ? {} : { role: "tabpanel", id: "view-panel", "aria-labelledby": `view-${active.id}` })}>
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
      </TitleContext.Provider>
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
