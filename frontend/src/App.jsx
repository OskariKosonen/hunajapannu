import { useEffect, useState, useMemo, useCallback } from "react";
import DashboardHeader from "./components/DashboardHeader";
import ProjectSummary from "./components/ProjectSummary";
import EventsPanel from "./components/EventsPanel";
import FeaturedAttack from "./components/FeaturedAttack";
import TrendPanel from "./components/TrendPanel";
import TopCredentialsPanel from "./components/TopCredentialsPanel";
import PasswordCheck from "./components/PasswordCheck";
import IocExport from "./components/IocExport";
import PayloadInfraPanel from "./components/PayloadInfraPanel";
import CommandsPanel from "./components/CommandsPanel";
import TopMalwarePanel from "./components/TopMalwarePanel";
import OriginsPanel from "./components/OriginsPanel";
import AsciiTopology from "./components/AsciiTopology";
import SessionDrawer from "./components/SessionDrawer";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { useApi, useDebounced, useMediaQuery, useVisibleInterval, useRotatingWord, buildUrl } from "./hooks/useApi";
import { useUrlState } from "./hooks/useUrlState";
import { BOOT_MESSAGES, LOADING_WORDS, EMPTY_STATES } from "./lib/flavour";

// ============================================
// CONFIGURATION CONSTANTS
// ============================================
const CONFIG = {
  // API refresh intervals (milliseconds)
  REFRESH_INTERVAL: 120000, // 2 minutes

  // Events table display limits. The desktop feed is sized by the panel stack
  // beside it rather than by its own content, so this is only how much history
  // the feed holds — enough to scroll back through, not a lever for matching
  // the two column heights. (The API caps /latest at 200.)
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
    // Kept for the detail fetch below and for /sessions/featured; the
    // browsable list this used to drive is gone.
    SESSIONS: "/api/public/cowrie/sessions",
    FEATURED_SESSION: "/api/public/cowrie/sessions/featured",
    PASSWORD_RANGE: "/api/public/cowrie/passwords/range",
    IOCS: "/api/public/cowrie/iocs",
    PAYLOAD_HOSTS: "/api/public/cowrie/payload-hosts",
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

  // Rotating status word on the boot screen. Only ticks
  // while the boot screen is actually up.
  const bootWord = useRotatingWord(LOADING_WORDS, { active: true, intervalMs: 900 });

  // Polling pauses while the tab is hidden, so nothing arrives to count while
  // you are away — but the attackers do not stop. Say so in the tab title and
  // put it back on return.
  useEffect(() => {
    const original = document.title;
    const onVisibility = () => {
      document.title = document.hidden ? "they're still knocking…" : original;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = original;
    };
  }, []);

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
  const [commandFilter, setCommandFilter] = useUrlState("tag", "all");
  const [originView, setOriginView] = useUrlState("origins", "countries");
  const [openSessionId, setOpenSessionId] = useUrlState("session");

  const debouncedCommandSearch = useDebounced(commandSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedCredsSearch = useDebounced(credsSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedDownloadsSearch = useDebounced(downloadsSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedAsnSearch = useDebounced(asnSearch, CONFIG.SEARCH_DEBOUNCE_MS);

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
  const eventsApi = useApi(buildUrl(E.LATEST_EVENTS, { limit: eventLimit }));
  const trendApi = useApi(E.TRENDS);
  const countriesApi = useApi(buildUrl(E.TOP_COUNTRIES, { limit: CONFIG.PAGE_SIZE.COUNTRIES }));
  const summaryApi = useApi(E.SUMMARY);
  const mitreApi = useApi(E.MITRE);

  // The drawer is driven by the URL, so a shared link opens straight into it.
  // The busiest session of the past week, replayed on the front page. 404s
  // on a quiet week, which the panel treats as "nothing to show".
  const featuredApi = useApi(E.FEATURED_SESSION);
  const payloadHostsApi = useApi(buildUrl(E.PAYLOAD_HOSTS, { limit: 25 }));

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
  const summaryData = summaryApi.raw;
  const mitreSignatures = mitreApi.rows;

  // First paint waits on /summary alone.
  //
  // It used to wait on /summary AND /latest, so the whole page sat behind a
  // boot screen until the slower of the two returned — and the most striking
  // content on the page (7.7M attacks, 24k attackers) is entirely in the
  // summary. Once that lands, the header and hero render immediately and the
  // panels below fill in against the skeletons they already have.
  const loading = summaryApi.loading && summaryApi.raw == null;

  const refreshAll = useCallback(() => {
    eventsApi.refetch(); summaryApi.refetch(); commandsApi.refetch();
    credsApi.refetch(); filesApi.refetch(); trendApi.refetch();
    asnApi.refetch(); countriesApi.refetch();
    payloadHostsApi.refetch();
  }, [eventsApi, summaryApi, commandsApi, credsApi, filesApi, trendApi, asnApi, countriesApi,
      payloadHostsApi]);

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

  // Thousands separators. "203819" reads like an id; "203,819" reads like a
  // quantity, which is the whole point of putting it on the page.
  const formatNumber = useCallback((n) => {
    if (n == null) return "—";
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString(CONFIG.TIME_LOCALE) : "—";
  }, []);

  // Large lifetime counters, shortened so "7,682,298" does not dominate the
  // hero row it shares with four other figures.
  const formatCompact = useCallback((n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
    if (v >= 10_000) return `${Math.round(v / 1000)}k`;
    return v.toLocaleString(CONFIG.TIME_LOCALE);
  }, []);

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
      // Lifetime figures drive the hero strip. They were added to /summary and
      // to ProjectSummary's props but never threaded through here, so
      // summaryStats.lifetimeEvents was undefined, the `> 0` guard was false,
      // and the strip silently never rendered.
      lifetimeEvents: summaryData?.lifetimeEvents ?? 0,
      lifetimeUniqueIps: summaryData?.lifetimeUniqueIps ?? 0,
      lifetimeCountries: summaryData?.lifetimeCountries ?? 0,
      firstEventAt: summaryData?.firstEventAt ?? null,
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
            {/* The site name is the heading; the rotating word is status, not
                a title. It used to be the h1, which made the page's only
                top-level heading a verb that changed every 900ms. */}
            <h1 className="text-sm tracking-[0.3em] uppercase text-emerald-400 font-normal">hunajapannu.fi</h1>
            <p className="text-2xl font-semibold text-green-100" role="status" aria-live="polite">
              {bootWord}<span className="animate-pulse">…</span>
            </p>
            <p className="text-xs text-emerald-500">Pulling attack data out of PostgreSQL.</p>
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

      {/* The page is long and every panel is keyboard-reachable, so without
          this a keyboard user tabs through the whole header and live event
          feed before reaching anything they chose to visit. Hidden until
          focused, which is the first thing Tab lands on. */}
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[1001] focus:rounded focus:border focus:border-emerald-400 focus:bg-slate-950 focus:px-3 focus:py-2 focus:text-sm focus:text-green-200"
      >
        Skip to content
      </a>

      <main
        id="content"
        className="w-full px-5 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6 sm:max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[1760px] sm:mx-auto flex-1"
      >
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
         formatNumber={formatNumber}
         formatCompact={formatCompact}
         formatDate={formatDate}
         />
       </ErrorBoundary>

        {/* The counts above say how much; this says what. Sits directly under
            the hero because it is the most interesting thing on the page. */}
        <ErrorBoundary name="Featured attack">
          <FeaturedAttack
            // Remount on a new session so the replay restarts from the top.
            key={featuredApi.raw?.session?.session_id || "none"}
            data={featuredApi.raw}
            loading={featuredApi.loading}
            error={featuredApi.error}
            mitreById={mitreById}
            countryFlag={countryFlag}
            onOpenFull={openSession}
          />
        </ErrorBoundary>

        <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)] lg:items-stretch">
          {/* The feed must not size the row; the stack on the right does, and
              the feed fills whatever that comes to and scrolls the rest. Taking
              the panel out of flow at lg is what enforces it. While both
              columns were in flow the row took the taller of the two, so
              matching them meant hand-tuning the row count against a stack
              whose height changes whenever a panel is added — and whichever
              column lost ended in dead space. */}
          <div className="min-w-0 lg:relative">
            <div className="lg:absolute lg:inset-0">
              <ErrorBoundary name="Live events">
                <EventsPanel
                  events={events}
                  eventLimit={eventLimit}
                  formatTimestamp={formatTimestamp}
                  renderGeoPill={renderGeoPill}
                  isMobile={isMobile}
                />
              </ErrorBoundary>
            </div>
          </div>
          <div className="space-y-3.5 sm:space-y-4 min-w-0">
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
            <ErrorBoundary name="Payload hosts">
              <PayloadInfraPanel
                hosts={payloadHostsApi.rows}
                error={payloadHostsApi.error}
                loading={payloadHostsApi.loading}
                total={payloadHostsApi.total}
                formatNumber={formatNumber}
                formatDate={formatDate}
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
            <ErrorBoundary name="Origins">
              <OriginsPanel
                view={originView}
                onView={setOriginView}
                topCountries={topCountries}
                countriesError={countriesApi.error}
                countriesLoading={countriesApi.loading}
                countryFlag={countryFlag}
                topAsn={topAsn}
                asnError={asnApi.error}
                asnLoading={asnApi.loading}
                asnTotal={asnApi.total}
                search={asnSearch}
                onSearch={setAsnSearch}
                pageSize={CONFIG.PAGE_SIZE.ASN}
                formatNumber={formatNumber}
                isMobile={isMobile}
              />
            </ErrorBoundary>
            <ErrorBoundary name="Password check">
              <PasswordCheck
                endpoint={E.PASSWORD_RANGE}
                formatNumber={formatNumber}
                uniqueCredCount={summaryStats.uniqueCredCount}
              />
            </ErrorBoundary>
            <ErrorBoundary name="IOC export">
              <IocExport endpoint={E.IOCS} />
            </ErrorBoundary>
          </div>
        </div>

        <ErrorBoundary name="Topology">
          <AsciiTopology />
        </ErrorBoundary>
      </main>

      {/* Outside <main>: a footer is a sibling landmark, not page content. */}
      <footer className="w-full px-5 sm:px-6 lg:px-8 pb-6 mt-4 pt-3 border-t border-emerald-900/60 text-center text-[0.65rem] text-green-600">
        hunajapannu.fi
      </footer>

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
