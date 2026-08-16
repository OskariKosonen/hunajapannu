import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardHeader from "./components/DashboardHeader";
import ProjectSummary from "./components/ProjectSummary";
import EventsPanel from "./components/EventsPanel";
import TrendPanel from "./components/TrendPanel";
import TopCredentialsPanel from "./components/TopCredentialsPanel";
import TopCountriesPanel from "./components/TopCountriesPanel";
import CommandsPanel from "./components/CommandsPanel";
import TopMalwarePanel from "./components/TopMalwarePanel";
import TopAsnPanel from "./components/TopAsnPanel";
import AsciiTopology from "./components/AsciiTopology";
import SessionsPanel from "./components/SessionsPanel";
import SessionDrawer from "./components/SessionDrawer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { useApi, useDebounced, useMediaQuery, useVisibleInterval, buildUrl } from "./hooks/useApi";
import { useUrlState } from "./hooks/useUrlState";

// ============================================
// CONFIGURATION CONSTANTS
// ============================================
const CONFIG = {
  // API refresh intervals (milliseconds)
  REFRESH_INTERVAL: 120000, // 2 minutes

  // Events table display limits. The desktop feed sits beside a column of six
  // stacked panels and stretches to their combined height, so 58 rows left the
  // terminal part-empty on a tall viewport; 100 fills it and scrolls past that.
  // (The API caps /latest at 200.)
  MOBILE_EVENT_LIMIT: 20,
  DESKTOP_EVENT_LIMIT: 100,
  MOBILE_BREAKPOINT: 768, // Tailwind md breakpoint in pixels

  // Wait for typing to settle before hitting the API
  SEARCH_DEBOUNCE_MS: 300,

  // Page sizes. These used to be limit=3000/1000, which pulled ~894 KB of JSON
  // on every refresh to render panels that show a scrollable window. Filtering
  // and paging now happen server-side, so we fetch only what is displayed.
  PAGE_SIZE: {
    COMMANDS: 100,
    CREDS: 100,
    FILES: 50,
    ASN: 50,
    COUNTRIES: 50,
    SESSIONS: 40,
  },

  // API endpoint paths
  API_ENDPOINTS: {
    LATEST_EVENTS: "/api/public/cowrie/latest",
    COMMANDS: "/api/public/cowrie/commands",
    CREDENTIALS: "/api/public/cowrie/creds",
    FILES: "/api/public/cowrie/files",
    TRENDS: "/api/public/cowrie/events-per-hour?hours=24",
    TOP_ASN: "/api/public/cowrie/top-asn",
    TOP_COUNTRIES: "/api/public/cowrie/top-countries",
    SUMMARY: "/api/public/cowrie/summary",
    SESSIONS: "/api/public/cowrie/sessions",
    MITRE: "/api/public/cowrie/mitre",
  },

  // Every timestamp is rendered in the viewer's own timezone; this is only
  // the fallback for when the browser will not report one.
  DEFAULT_TIMEZONE: "Europe/Helsinki",

  // One locale for every time rendering. en-GB gives 24-hour, colon-separated
  // times; mixing it with fi-FI previously meant the events table showed
  // "22:21:57" while the chart axis showed "22.21" on the same screen.
  TIME_LOCALE: "en-GB",
};

// Technique badge colours, keyed by ATT&CK id. The matching patterns and the
// names live in the backend (GET /api/public/cowrie/mitre) so commands are
// tagged once server-side instead of re-running 40 regexes over every row in
// every browser on every refresh.
const MITRE_COLORS = {
  T1490: "border-rose-400/60 text-rose-100 bg-rose-500/10",
  T1105: "border-amber-400/60 text-amber-100 bg-amber-500/10",
  T1021: "border-purple-400/60 text-purple-100 bg-purple-500/10",
  T1098: "border-orange-400/60 text-orange-100 bg-orange-500/10",
  T1059: "border-cyan-400/60 text-cyan-100 bg-cyan-500/10",
  T1562: "border-slate-400/60 text-slate-100 bg-slate-500/10",
  T1595: "border-blue-400/60 text-blue-100 bg-blue-500/10",
  T1082: "border-lime-400/60 text-lime-100 bg-lime-500/10",
};
const MITRE_FALLBACK_COLOR = "border-emerald-400/60 text-emerald-100 bg-emerald-500/10";


const BOOT_MESSAGES = [
  { label: "Tip #404", detail: "uname -s -v -n -m? Red flag fr fr." },
  { label: "NPC Behavior", detail: "cat /proc/uptime" },
  { label: "🚨 SUS ALERT", detail: "Why is bro echoing base64 again?" },
  { label: "Pro Hacker Tip", detail: "root:root" },
  { label: "Loading", detail: "Trust the process." },
  { label: "Pro Hacker Tip", detail: "rm -rf /var/log/*" },
  { label: "Pro Tip", detail: "cat /etc/passwd | grep root" },
];


/**
 * Get the user's local timezone
 * Falls back to Europe/Helsinki if detection fails
 */
const getLocalTimeZone = () => {
  if (typeof Intl === "undefined") return "";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
};

/**
 * Short offset label for the zone in use ("UTC+3"), so the dashboard can say
 * which clock its timestamps are on. Attack times are only useful if you know
 * what to correlate them against.
 */
const getTimeZoneLabel = (timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
};

function App() {
  // Lazy initialiser so the tip is picked once on mount rather than being a
  // side effect of rendering.
  const [loadingTip] = useState(
    () => BOOT_MESSAGES[Math.floor(Math.random() * BOOT_MESSAGES.length)] || null
  );

  // Breakpoint via matchMedia: fires only when the breakpoint is crossed,
  // rather than re-rendering the tree on every pixel of a window drag.
  const isMobile = useMediaQuery(`(max-width: ${CONFIG.MOBILE_BREAKPOINT - 1}px)`);
  const eventLimit = isMobile ? CONFIG.MOBILE_EVENT_LIMIT : CONFIG.DESKTOP_EVENT_LIMIT;

  // Resolved once: resolvedOptions() is not free and this feeds both formatters.
  const localTimeZone = useMemo(() => getLocalTimeZone() || CONFIG.DEFAULT_TIMEZONE, []);
  const timeZoneLabel = useMemo(() => getTimeZoneLabel(localTimeZone), [localTimeZone]);

  // Search boxes and the open session live in the query string, so a filtered
  // view or a specific attacker session can be linked, bookmarked and reloaded.
  const [commandSearch, setCommandSearch] = useUrlState("cmd");
  const [credsSearch, setCredsSearch] = useUrlState("cred");
  const [downloadsSearch, setDownloadsSearch] = useUrlState("file");
  const [asnSearch, setAsnSearch] = useUrlState("asn");
  const [sessionSearch, setSessionSearch] = useUrlState("q");
  const [commandFilter, setCommandFilter] = useUrlState("tag", "all");
  const [openSessionId, setOpenSessionId] = useUrlState("session");

  const debouncedCommandSearch = useDebounced(commandSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedCredsSearch = useDebounced(credsSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedDownloadsSearch = useDebounced(downloadsSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedAsnSearch = useDebounced(asnSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedSessionSearch = useDebounced(sessionSearch, CONFIG.SEARCH_DEBOUNCE_MS);

  // One line per panel: each manages its own rows, total, loading, error and
  // request cancellation. Adding a panel no longer means adding six pieces of
  // state and a fetch callback to this file.
  const E = CONFIG.API_ENDPOINTS;

  const [commandTagCounts, setCommandTagCounts] = useState({});
  const commandsApi = useApi(
    buildUrl(E.COMMANDS, { limit: CONFIG.PAGE_SIZE.COMMANDS, search: debouncedCommandSearch, tag: commandFilter }),
    { onData: (d) => d?.counts && setCommandTagCounts(d.counts) }
  );
  const credsApi = useApi(buildUrl(E.CREDENTIALS, { limit: CONFIG.PAGE_SIZE.CREDS, search: debouncedCredsSearch }));
  const filesApi = useApi(buildUrl(E.FILES, { limit: CONFIG.PAGE_SIZE.FILES, search: debouncedDownloadsSearch }));
  const asnApi = useApi(buildUrl(E.TOP_ASN, { limit: CONFIG.PAGE_SIZE.ASN, search: debouncedAsnSearch }));
  const sessionsApi = useApi(buildUrl(E.SESSIONS, { limit: CONFIG.PAGE_SIZE.SESSIONS, search: debouncedSessionSearch }));
  const eventsApi = useApi(buildUrl(E.LATEST_EVENTS, { limit: eventLimit }));
  const trendApi = useApi(E.TRENDS);
  const countriesApi = useApi(buildUrl(E.TOP_COUNTRIES, { limit: CONFIG.PAGE_SIZE.COUNTRIES }));
  const summaryApi = useApi(E.SUMMARY);
  const mitreApi = useApi(E.MITRE);

  // The drawer is driven by the URL, so a shared link opens straight into it.
  const sessionDetailApi = useApi(
    openSessionId ? `${E.SESSIONS}/${encodeURIComponent(openSessionId)}` : null,
    { enabled: Boolean(openSessionId) }
  );

  const openSession = useCallback((id) => setOpenSessionId(id || ""), [setOpenSessionId]);
  const closeSession = useCallback(() => setOpenSessionId(""), [setOpenSessionId]);

  const events = eventsApi.rows;
  const commands = commandsApi.rows;
  const creds = credsApi.rows;
  const downloads = filesApi.rows;
  const trend = trendApi.rows;
  const topAsn = asnApi.rows;
  const topCountries = countriesApi.rows;
  const sessions = sessionsApi.rows;
  const summaryData = summaryApi.raw;
  const mitreSignatures = mitreApi.rows;

  // First paint waits only on the two panels above the fold.
  const loading = eventsApi.loading && events.length === 0 && summaryApi.raw == null;

  const refreshAll = useCallback(() => {
    eventsApi.refetch(); summaryApi.refetch(); commandsApi.refetch();
    credsApi.refetch(); filesApi.refetch(); trendApi.refetch();
    asnApi.refetch(); countriesApi.refetch(); sessionsApi.refetch();
  }, [eventsApi, summaryApi, commandsApi, credsApi, filesApi, trendApi, asnApi, countriesApi, sessionsApi]);

  useVisibleInterval(refreshAll, CONFIG.REFRESH_INTERVAL);

  // Close the session drawer on Escape.
  useEffect(() => {
    if (!openSessionId) return;
    const onKey = (e) => { if (e.key === "Escape") closeSession(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSessionId, closeSession]);

  // Track scroll position for the progress indicator.
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(scrollHeight > 0 ? (window.scrollY / scrollHeight) * 100 : 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const countryFlag = useCallback((country) => {
    if (!country || country.length !== 2) return "🌐";
    const code = country.toUpperCase();
    const OFFSET = 127397;
    return String.fromCodePoint(code.charCodeAt(0) + OFFSET, code.charCodeAt(1) + OFFSET);
  }, []);

    // FORMATTING UTILITIES
  // Convert ISO timestamp to localized datetime string, respecting user timezone
  const formatTimestamp = useCallback((ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;

    return d.toLocaleString(CONFIG.TIME_LOCALE, {
      timeZone: localTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }, [localTimeZone]);

  // Date without the time, for columns that only need the day. Formatted
  // directly rather than string-splitting a full timestamp on its comma.
  const formatDate = useCallback((ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleDateString(CONFIG.TIME_LOCALE, {
      timeZone: localTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }, [localTimeZone]);

  // Convert byte size to human-readable format (B, KB, MB, GB)
  const formatBytes = (bytes) => {
    if (bytes == null) return "—";
    const b = Number(bytes);
    if (Number.isNaN(b)) return String(bytes);
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  // Session length, in the largest unit that still reads naturally
  const formatDuration = useCallback((ms) => {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return "—";
    if (n < 1000) return "<1s";
    const secs = Math.round(n / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }, []);

  // Format hour label for trend chart axis in local time
  const formatHourLabel = useCallback((iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString(CONFIG.TIME_LOCALE, {
      timeZone: localTimeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, [localTimeZone]);

  // Sum all events across 24-hour window
  const totalTrendEvents = useMemo(
    () => trend.reduce((sum, p) => sum + (p.events || 0), 0),
    [trend]
  );

  // Find the hour with maximum events
  const peak = useMemo(
    () =>
      trend.reduce(
        (acc, p) => (!acc || (p.events || 0) > acc.events ? p : acc),
        null
      ),
    [trend]
  );

  // Extract maximum event count for normalization
  const maxTrendEvents = useMemo(() => (peak ? peak.events : 0), [peak]);

  const peakHourLabel = useMemo(
    () => (peak ? formatHourLabel(peak.hour) : ""),
    [peak, formatHourLabel]
  );

  const summaryStats = useMemo(
    () => ({
      attacks24h: summaryData?.attacks24h ?? totalTrendEvents,
      malwareSamples: summaryData?.malwareSamples ?? filesApi.total,
      uniqueCommands: summaryData?.uniqueCommands ?? commandsApi.total,
      topCredential: creds[0]
        ? `${creds[0].username} / ${creds[0].password}`
        : "N/A",
      uniqueIpPercent: summaryData?.uniqueIpPercent ?? null,
      uniqueCredCount: summaryData?.uniqueCredCount ?? null,
    }),
    [summaryData, totalTrendEvents, filesApi.total, commandsApi.total, creds]
  );

  // Technique catalogue from the API, with local badge colours attached.
  const mitreCatalogue = useMemo(
    () =>
      mitreSignatures.map((sig) => ({
        ...sig,
        badgeColor: MITRE_COLORS[sig.id] || MITRE_FALLBACK_COLOR,
      })),
    [mitreSignatures]
  );

  // id -> technique, for turning the tag ids on each row into badges.
  const mitreById = useMemo(
    () => Object.fromEntries(mitreCatalogue.map((sig) => [sig.id, sig])),
    [mitreCatalogue]
  );

  const attacksTrendDown = useMemo(() => {
    if (!trend || trend.length < 2) return false;
    const last = trend[trend.length - 1]?.events || 0;
    const prev = trend[trend.length - 2]?.events || 0;
    return last < prev;
  }, [trend]);

  const isCommandFilterActive = commandFilter !== "all";

  const renderGeoPill = useCallback((ev) => {
    const flag = countryFlag(ev.country_iso);
    const parts = [];
    if (ev.city) parts.push(ev.city);
    if (ev.country_iso) parts.push(ev.country_iso);
    const geoText = parts.length ? parts.join(" · ") : "Unknown";
    const asnText = ev.asn ? `AS${ev.asn}` : "AS?";
    const orgText = ev.org || "";

    return (
      <div className="flex flex-col text-[0.65rem] leading-tight">
        <div className="flex items-center gap-1 text-emerald-200">
          <span>{flag}</span>
          <span className="truncate">{geoText}</span>
        </div>
        <div className="text-emerald-500 truncate">
          {asnText} {orgText && `· ${orgText}`}
        </div>
      </div>
    );
  }, [countryFlag]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center px-4">
        <div className="loading-grid absolute inset-0 opacity-60" />
        <div className="relative z-10 w-full max-w-2xl space-y-6 border border-green-500/40 bg-slate-950/70 backdrop-blur-sm rounded-2xl px-6 py-8 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
          <div className="text-center space-y-2">
            <p className="text-sm tracking-[0.3em] uppercase text-emerald-400">hunajapannu.fi</p>
            <h1 className="text-2xl font-semibold text-green-100">Loading attack data from PostgreSQL</h1>
            <p className="text-xs text-emerald-500">Preparing dashboard...</p>
          </div>

          <div className="loading-bar h-1 rounded-full bg-emerald-900/40 overflow-hidden">
            <span className="loading-bar__indicator" />
          </div>

          {loadingTip && (
            <div className="grid grid-cols-1 gap-3 text-[0.65rem] text-left">
              <div className="border border-emerald-800/60 rounded-lg px-3 py-2 bg-black/40 text-emerald-200 animate-fadeIn">
                <p className="uppercase tracking-[0.2em] text-[0.55rem] text-emerald-400">
                  {loadingTip.label}
                </p>
                <p className="mt-0.5 text-emerald-100">{loadingTip.detail}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  if (eventsApi.error && events.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900 border border-red-500 text-red-400 px-4 py-3 rounded font-mono">
            <strong className="font-bold">ERROR: </strong>
            <span className="block sm:inline">{eventsApi.error}</span>
          </div>
          <button
            onClick={eventsApi.refetch}
            className="mt-4 bg-green-600 hover:bg-green-500 text-black font-bold py-2 px-4 rounded font-mono border border-green-400"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono overflow-hidden flex flex-col">
      {/* Scroll progress indicator */}
      <div
        className="fixed top-0 left-0 h-0.5 bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 shadow-lg"
        style={{
          width: `${scrollProgress}%`,
          zIndex: 1000,
          transition: "width 0.1s ease-out",
        }}
      />

      <div className="w-full px-5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6 sm:max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[1760px] sm:mx-auto flex-1">
        <DashboardHeader timeZone={localTimeZone} timeZoneLabel={timeZoneLabel} />
       <ErrorBoundary name="Summary">
         <ProjectSummary
         summaryStats={summaryStats}
         attacksTrendDown={attacksTrendDown}
         peakEvents={peak?.events}
         peakHourLabel={peakHourLabel}
         ipStatsLoading={summaryApi.loading}
         ipStatsError={summaryApi.error}
         uniqueCredsLoading={summaryApi.loading}
         uniqueCredsError={summaryApi.error}
         />
       </ErrorBoundary>
        <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)] overflow-x-auto sm:overflow-visible">
          <ErrorBoundary name="Live events">
            <EventsPanel
            events={events}
            eventLimit={eventLimit}
            formatTimestamp={formatTimestamp}
            renderGeoPill={renderGeoPill}
            />
          </ErrorBoundary>
          <div className="space-y-3.5 sm:space-y-4 min-w-[320px] sm:min-w-0">
            <ErrorBoundary name="Events (24h)">
              <TrendPanel
                trend={trend}
                maxTrendEvents={maxTrendEvents}
                formatHourLabel={formatHourLabel}
                trendError={trendApi.error}
                trendLoading={trendApi.loading}
                totalTrendEvents={totalTrendEvents}
                peakHourLabel={peakHourLabel}
              />
            </ErrorBoundary>

            <ErrorBoundary name="Sessions">
              <SessionsPanel
              sessions={sessions}
              sessionsTotal={sessionsApi.total}
              sessionsError={sessionsApi.error}
              sessionsLoading={sessionsApi.loading}
              search={sessionSearch}
              onSearch={setSessionSearch}
              onOpen={openSession}
              formatTimestamp={formatTimestamp}
              formatDuration={formatDuration}
              countryFlag={countryFlag}
              isMobile={isMobile}
              />
            </ErrorBoundary>
            <ErrorBoundary name="Top countries">
              <TopCountriesPanel
              topCountries={topCountries}
              countriesError={countriesApi.error}
              countriesLoading={countriesApi.loading}
              countryFlag={countryFlag}
              />
            </ErrorBoundary>
            <ErrorBoundary name="Top commands">
              <CommandsPanel
              commands={commands}
              commandsError={commandsApi.error}
              commandsLoading={commandsApi.loading}
              commandsTotal={commandsApi.total}
              commandFilter={commandFilter}
              setCommandFilter={setCommandFilter}
              isCommandFilterActive={isCommandFilterActive}
              commandTagCounts={commandTagCounts}
              mitreSignatures={mitreCatalogue}
              mitreById={mitreById}
              search={commandSearch}
              onSearch={setCommandSearch}
              pageSize={CONFIG.PAGE_SIZE.COMMANDS}
              isMobile={isMobile}
              />
            </ErrorBoundary>
            <ErrorBoundary name="Top malware">
              <TopMalwarePanel
              downloads={downloads}
              downloadsError={filesApi.error}
              downloadsLoading={filesApi.loading}
              downloadsTotal={filesApi.total}
              search={downloadsSearch}
              onSearch={setDownloadsSearch}
              pageSize={CONFIG.PAGE_SIZE.FILES}
              formatBytes={formatBytes}
              formatTimestamp={formatTimestamp}
              formatDate={formatDate}
              isMobile={isMobile}
              />
            </ErrorBoundary>
            <ErrorBoundary name="Top credentials">
              <TopCredentialsPanel
              creds={creds}
              credsError={credsApi.error}
              credsLoading={credsApi.loading}
              credsTotal={credsApi.total}
              search={credsSearch}
              onSearch={setCredsSearch}
              pageSize={CONFIG.PAGE_SIZE.CREDS}
              />
            </ErrorBoundary>
            <ErrorBoundary name="Top ASNs">
              <TopAsnPanel
              topAsn={topAsn}
              asnError={asnApi.error}
              asnLoading={asnApi.loading}
              asnTotal={asnApi.total}
              search={asnSearch}
              onSearch={setAsnSearch}
              pageSize={CONFIG.PAGE_SIZE.ASN}
              isMobile={isMobile}
              />
            </ErrorBoundary>
          </div>
        </div>

        <ErrorBoundary name="Topology">
          <AsciiTopology />
        </ErrorBoundary>
        <footer className="mt-4 pt-3 border-t border-emerald-900/60 text-center text-[0.65rem] text-green-600">
          hunajapannu.fi
        </footer>
      </div>

      {openSessionId && (
        <SessionDrawer
          data={sessionDetailApi.raw}
          loading={sessionDetailApi.loading}
          error={sessionDetailApi.error}
          onClose={closeSession}
          formatTimestamp={formatTimestamp}
          formatDuration={formatDuration}
          countryFlag={countryFlag}
          mitreById={mitreById}
        />
      )}
    </div>
  );
}

export default App;
