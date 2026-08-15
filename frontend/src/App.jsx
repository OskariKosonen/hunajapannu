import { useEffect, useState, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import DashboardHeader from "./components/DashboardHeader";
import ProjectSummary from "./components/ProjectSummary";
import EventsPanel from "./components/EventsPanel";
// Recharts is ~60% of the bundle and only this panel needs it, so it loads
// on demand instead of blocking first paint.
const TrendPanel = lazy(() => import("./components/TrendPanel"));
import TopCredentialsPanel from "./components/TopCredentialsPanel";
import TopCountriesPanel from "./components/TopCountriesPanel";
import CommandsPanel from "./components/CommandsPanel";
import TopMalwarePanel from "./components/TopMalwarePanel";
import TopAsnPanel from "./components/TopAsnPanel";
import AsciiTopology from "./components/AsciiTopology";
import SessionsPanel from "./components/SessionsPanel";
import SessionDrawer from "./components/SessionDrawer";

// ============================================
// CONFIGURATION CONSTANTS
// ============================================
const CONFIG = {
  // API refresh intervals (milliseconds)
  REFRESH_INTERVAL: 120000, // 2 minutes

  // Events table display limits
  MOBILE_EVENT_LIMIT: 20,
  DESKTOP_EVENT_LIMIT: 58,
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
    TOP_COUNTRIES: "/api/public/cowrie/top-countries?limit=1000",
    SUMMARY: "/api/public/cowrie/summary",
    SESSIONS: "/api/public/cowrie/sessions",
    MITRE: "/api/public/cowrie/mitre",
  },

  // Chart dimensions and calculations
  CHART: {
    SVG_VIEWBOX: "0 0 100 40",
    VERTICAL_RANGE: 22,
    VERTICAL_PADDING: 30,
    VERTICAL_MIDPOINT: 18,
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

/** Delays a rapidly-changing value (a search box) so it can drive requests. */
function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}


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
  // Data state: API responses for each data type
  const [events, setEvents] = useState([]);
  const [commands, setCommands] = useState([]);
  const [creds, setCreds] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [trend, setTrend] = useState([]);
  const [topAsn, setTopAsn] = useState([]);
  const [topCountries, setTopCountries] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [commandFilter, setCommandFilter] = useState("all");

  // Server-driven metadata and totals
  const [mitreSignatures, setMitreSignatures] = useState([]);
  const [commandTagCounts, setCommandTagCounts] = useState({});
  const [commandsTotal, setCommandsTotal] = useState(0);
  const [credsTotal, setCredsTotal] = useState(0);
  const [downloadsTotal, setDownloadsTotal] = useState(0);
  const [asnTotal, setAsnTotal] = useState(0);

  // Search boxes. Raw value drives the input, the debounced value drives the
  // request, so typing does not fire one fetch per keystroke.
  const [commandSearch, setCommandSearch] = useState("");
  const [credsSearch, setCredsSearch] = useState("");
  const [downloadsSearch, setDownloadsSearch] = useState("");
  const [asnSearch, setAsnSearch] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");

  // Session drill-down
  const [sessions, setSessions] = useState([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [activeSessionLoading, setActiveSessionLoading] = useState(false);
  const [activeSessionError, setActiveSessionError] = useState("");
  const loadingTip = useMemo(() => {
    if (!BOOT_MESSAGES.length) return null;
    const randomIndex = Math.floor(Math.random() * BOOT_MESSAGES.length);
    return BOOT_MESSAGES[randomIndex];
  }, []);

  // Global loading/error states (only events uses global, others use panel-level)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commandsError, setCommandsError] = useState("");
  const [credsError, setCredsError] = useState("");
  const [downloadsError, setDownloadsError] = useState("");
  const [trendError, setTrendError] = useState("");
  const [asnError, setAsnError] = useState("");
  const [countriesError, setCountriesError] = useState("");
  const [summaryError, setSummaryError] = useState("");

  // Per-panel loading states for granular UX feedback
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);
  const [downloadsLoading, setDownloadsLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [asnLoading, setAsnLoading] = useState(false);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // UI state
  const [scrollProgress, setScrollProgress] = useState(0);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isMobile = useMemo(
    () => windowWidth < CONFIG.MOBILE_BREAKPOINT,
    [windowWidth]
  );

  // Declared here because the fetch callbacks below close over them.
  const eventLimit = useMemo(
    () => (isMobile ? CONFIG.MOBILE_EVENT_LIMIT : CONFIG.DESKTOP_EVENT_LIMIT),
    [isMobile]
  );

  const debouncedCommandSearch = useDebounced(commandSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedCredsSearch = useDebounced(credsSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedDownloadsSearch = useDebounced(downloadsSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedAsnSearch = useDebounced(asnSearch, CONFIG.SEARCH_DEBOUNCE_MS);
  const debouncedSessionSearch = useDebounced(sessionSearch, CONFIG.SEARCH_DEBOUNCE_MS);

  const countryFlag = useCallback((country) => {
    if (!country || country.length !== 2) return "🌐";
    const code = country.toUpperCase();
    // Convert ASCII A-Z to regional indicator symbols
    const OFFSET = 127397;
    return String.fromCodePoint(
      code.charCodeAt(0) + OFFSET,
      code.charCodeAt(1) + OFFSET
    );
  }, []);

  // Resolved once, not on every render: resolvedOptions() is not free, and
  // this feeds the dependency array of both time formatters.
  const localTimeZone = useMemo(
    () => getLocalTimeZone() || CONFIG.DEFAULT_TIMEZONE,
    []
  );
  const timeZoneLabel = useMemo(() => getTimeZoneLabel(localTimeZone), [localTimeZone]);

  // EFFECTS
  // Track scroll position for visual progress indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = window.scrollY;
      const progress = scrollHeight > 0 ? (scrolled / scrollHeight) * 100 : 0;
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Maintain window width state for responsive breakpoint checks
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // API FETCH FUNCTIONS
  // Every in-flight request is registered here so a refresh, a new search or
  // unmount can abort the previous one instead of racing it.
  const inFlight = useRef(new Map());

  const request = useCallback(async (key, url, { onData, onError, onLoading }) => {
    inFlight.current.get(key)?.abort();
    const controller = new AbortController();
    inFlight.current.set(key, controller);

    try {
      if (onLoading) onLoading(true);
      if (onError) onError("");
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      onData(await res.json());
    } catch (err) {
      // An aborted request was replaced on purpose; not a failure to report.
      if (err.name === "AbortError") return;
      console.error(err);
      if (onError) onError(err.message || "Failed to fetch");
    } finally {
      if (inFlight.current.get(key) === controller) {
        inFlight.current.delete(key);
        if (onLoading) onLoading(false);
      }
    }
  }, []);

  // The list endpoints answer { rows, total, ... }; the simple ones still
  // answer a bare array.
  const asRows = (data) => (Array.isArray(data) ? data : data?.rows ?? []);
  const asTotal = (data) => (Array.isArray(data) ? data.length : Number(data?.total ?? 0));

  const buildUrl = useCallback((base, params) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== "" && v != null && v !== "all") qs.set(k, v);
    }
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
  }, []);

  const fetchEvents = useCallback(
    () =>
      request("events", buildUrl(CONFIG.API_ENDPOINTS.LATEST_EVENTS, { limit: eventLimit }), {
        onData: (d) => setEvents(asRows(d)),
        onError: setError,
      }),
    [request, buildUrl, eventLimit]
  );

  const fetchCommands = useCallback(
    () =>
      request(
        "commands",
        buildUrl(CONFIG.API_ENDPOINTS.COMMANDS, {
          limit: CONFIG.PAGE_SIZE.COMMANDS,
          search: debouncedCommandSearch,
          tag: commandFilter,
        }),
        {
          onData: (d) => {
            setCommands(asRows(d));
            setCommandsTotal(asTotal(d));
            if (d?.counts) setCommandTagCounts(d.counts);
          },
          onError: setCommandsError,
          onLoading: setCommandsLoading,
        }
      ),
    [request, buildUrl, debouncedCommandSearch, commandFilter]
  );

  const fetchCreds = useCallback(
    () =>
      request(
        "creds",
        buildUrl(CONFIG.API_ENDPOINTS.CREDENTIALS, {
          limit: CONFIG.PAGE_SIZE.CREDS,
          search: debouncedCredsSearch,
        }),
        {
          onData: (d) => { setCreds(asRows(d)); setCredsTotal(asTotal(d)); },
          onError: setCredsError,
          onLoading: setCredsLoading,
        }
      ),
    [request, buildUrl, debouncedCredsSearch]
  );

  const fetchDownloads = useCallback(
    () =>
      request(
        "files",
        buildUrl(CONFIG.API_ENDPOINTS.FILES, {
          limit: CONFIG.PAGE_SIZE.FILES,
          search: debouncedDownloadsSearch,
        }),
        {
          onData: (d) => { setDownloads(asRows(d)); setDownloadsTotal(asTotal(d)); },
          onError: setDownloadsError,
          onLoading: setDownloadsLoading,
        }
      ),
    [request, buildUrl, debouncedDownloadsSearch]
  );

  const fetchTopAsn = useCallback(
    () =>
      request(
        "asn",
        buildUrl(CONFIG.API_ENDPOINTS.TOP_ASN, {
          limit: CONFIG.PAGE_SIZE.ASN,
          search: debouncedAsnSearch,
        }),
        {
          onData: (d) => { setTopAsn(asRows(d)); setAsnTotal(asTotal(d)); },
          onError: setAsnError,
          onLoading: setAsnLoading,
        }
      ),
    [request, buildUrl, debouncedAsnSearch]
  );

  const fetchSessions = useCallback(
    () =>
      request(
        "sessions",
        buildUrl(CONFIG.API_ENDPOINTS.SESSIONS, {
          limit: CONFIG.PAGE_SIZE.SESSIONS,
          search: debouncedSessionSearch,
        }),
        {
          onData: (d) => { setSessions(asRows(d)); setSessionsTotal(asTotal(d)); },
          onError: setSessionsError,
          onLoading: setSessionsLoading,
        }
      ),
    [request, buildUrl, debouncedSessionSearch]
  );

  const fetchTrend = useCallback(
    () =>
      request("trend", CONFIG.API_ENDPOINTS.TRENDS, {
        onData: (d) => setTrend(asRows(d)),
        onError: setTrendError,
        onLoading: setTrendLoading,
      }),
    [request]
  );

  const fetchTopCountries = useCallback(
    () =>
      request("countries", CONFIG.API_ENDPOINTS.TOP_COUNTRIES, {
        onData: (d) => setTopCountries(asRows(d)),
        onError: setCountriesError,
        onLoading: setCountriesLoading,
      }),
    [request]
  );

  const fetchSummary = useCallback(
    () =>
      request("summary", CONFIG.API_ENDPOINTS.SUMMARY, {
        onData: (d) => setSummaryData(d || null),
        onError: (msg) => { setSummaryError(msg); if (msg) setSummaryData(null); },
        onLoading: setSummaryLoading,
      }),
    [request]
  );

  // Open one session's full timeline.
  const openSession = useCallback(
    (sessionId) => {
      if (!sessionId) return;
      setActiveSession({ session: { session_id: sessionId }, events: [] });
      request("session-detail", `${CONFIG.API_ENDPOINTS.SESSIONS}/${encodeURIComponent(sessionId)}`, {
        onData: (d) => setActiveSession(d),
        onError: setActiveSessionError,
        onLoading: setActiveSessionLoading,
      });
    },
    [request]
  );

  const closeSession = useCallback(() => {
    inFlight.current.get("session-detail")?.abort();
    setActiveSession(null);
    setActiveSessionError("");
  }, []);

  // EFFECTS - data loading
  // The technique catalogue is static; fetch it once.
  useEffect(() => {
    request("mitre", CONFIG.API_ENDPOINTS.MITRE, {
      onData: (d) => setMitreSignatures(Array.isArray(d) ? d : []),
      onError: () => {},
    });
  }, [request]);

  // Initial load. Secondary panels start immediately but do not gate paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      fetchCommands();
      fetchCreds();
      fetchDownloads();
      fetchTrend();
      fetchTopAsn();
      fetchTopCountries();
      fetchSessions();
      try {
        await Promise.all([fetchEvents(), fetchSummary()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Runs once; the search-driven effects below handle subsequent refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch the search-driven panels whenever their query changes. Each of
  // these aborts its own previous request, so fast typing cannot leave a stale
  // response to land last.
  useEffect(() => { fetchCommands(); }, [debouncedCommandSearch, commandFilter, fetchCommands]);
  useEffect(() => { fetchCreds(); }, [debouncedCredsSearch, fetchCreds]);
  useEffect(() => { fetchDownloads(); }, [debouncedDownloadsSearch, fetchDownloads]);
  useEffect(() => { fetchTopAsn(); }, [debouncedAsnSearch, fetchTopAsn]);
  useEffect(() => { fetchSessions(); }, [debouncedSessionSearch, fetchSessions]);

  // Periodic refresh, paused while the tab is hidden. Previously this polled
  // all eight endpoints every two minutes forever, including in background
  // tabs nobody was looking at.
  useEffect(() => {
    const refreshAll = () => {
      if (document.hidden) return;
      fetchEvents();
      fetchSummary();
      fetchCommands();
      fetchCreds();
      fetchDownloads();
      fetchTrend();
      fetchTopAsn();
      fetchTopCountries();
      fetchSessions();
    };

    let interval = setInterval(refreshAll, CONFIG.REFRESH_INTERVAL);

    // Coming back to a hidden tab, refresh once immediately and restart the
    // timer so the next tick is a full interval away.
    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        refreshAll();
        clearInterval(interval);
        interval = setInterval(refreshAll, CONFIG.REFRESH_INTERVAL);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    fetchEvents, fetchSummary, fetchCommands, fetchCreds, fetchDownloads,
    fetchTrend, fetchTopAsn, fetchTopCountries, fetchSessions,
  ]);

  // Abort anything still in flight on unmount.
  useEffect(() => {
    const pending = inFlight.current;
    return () => { for (const c of pending.values()) c.abort(); };
  }, []);

  // Close the session drawer on Escape.
  useEffect(() => {
    if (!activeSession) return;
    const onKey = (e) => { if (e.key === "Escape") closeSession(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeSession, closeSession]);

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
      malwareSamples: summaryData?.malwareSamples ?? downloadsTotal,
      uniqueCommands: summaryData?.uniqueCommands ?? commandsTotal,
      topCredential: creds[0]
        ? `${creds[0].username} / ${creds[0].password}`
        : "N/A",
      uniqueIpPercent: summaryData?.uniqueIpPercent ?? null,
      uniqueCredCount: summaryData?.uniqueCredCount ?? null,
    }),
    [summaryData, totalTrendEvents, downloadsTotal, commandsTotal, creds]
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

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-900 border border-red-500 text-red-400 px-4 py-3 rounded font-mono">
            <strong className="font-bold">ERROR: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
          <button
            onClick={fetchEvents}
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
       <ProjectSummary
         summaryStats={summaryStats}
         attacksTrendDown={attacksTrendDown}
        peakEvents={peak?.events}
        peakHourLabel={peakHourLabel}
        ipStatsLoading={summaryLoading}
        ipStatsError={summaryError}
       uniqueCredsLoading={summaryLoading}
       uniqueCredsError={summaryError}
      />
        <div className="grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)] overflow-x-auto sm:overflow-visible">
          <EventsPanel
            events={events}
            eventLimit={eventLimit}
            formatTimestamp={formatTimestamp}
            renderGeoPill={renderGeoPill}
          />

          <div className="space-y-3.5 sm:space-y-4 min-w-[320px] sm:min-w-0">
            <Suspense
              fallback={
                <div className="border border-emerald-700/50 rounded-xl bg-slate-950/70 p-4 text-[0.68rem] text-emerald-500">
                  Loading chart…
                </div>
              }
            >
              <TrendPanel
                trend={trend}
                maxTrendEvents={maxTrendEvents}
                formatHourLabel={formatHourLabel}
                trendError={trendError}
                trendLoading={trendLoading}
                totalTrendEvents={totalTrendEvents}
                peakHourLabel={peakHourLabel}
              />
            </Suspense>

            <SessionsPanel
              sessions={sessions}
              sessionsTotal={sessionsTotal}
              sessionsError={sessionsError}
              sessionsLoading={sessionsLoading}
              search={sessionSearch}
              onSearch={setSessionSearch}
              onOpen={openSession}
              formatTimestamp={formatTimestamp}
              formatDuration={formatDuration}
              countryFlag={countryFlag}
              isMobile={isMobile}
            />

            <TopCountriesPanel
              topCountries={topCountries}
              countriesError={countriesError}
              countriesLoading={countriesLoading}
              countryFlag={countryFlag}
            />

            <CommandsPanel
              commands={commands}
              commandsError={commandsError}
              commandsLoading={commandsLoading}
              commandsTotal={commandsTotal}
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

            <TopMalwarePanel
              downloads={downloads}
              downloadsError={downloadsError}
              downloadsLoading={downloadsLoading}
              downloadsTotal={downloadsTotal}
              search={downloadsSearch}
              onSearch={setDownloadsSearch}
              pageSize={CONFIG.PAGE_SIZE.FILES}
              formatBytes={formatBytes}
              formatTimestamp={formatTimestamp}
              formatDate={formatDate}
              isMobile={isMobile}
            />

            <TopCredentialsPanel
              creds={creds}
              credsError={credsError}
              credsLoading={credsLoading}
              credsTotal={credsTotal}
              search={credsSearch}
              onSearch={setCredsSearch}
              pageSize={CONFIG.PAGE_SIZE.CREDS}
            />

            <TopAsnPanel
              topAsn={topAsn}
              asnError={asnError}
              asnLoading={asnLoading}
              asnTotal={asnTotal}
              search={asnSearch}
              onSearch={setAsnSearch}
              pageSize={CONFIG.PAGE_SIZE.ASN}
              isMobile={isMobile}
            />
          </div>
        </div>

        <AsciiTopology />

        <footer className="mt-4 pt-3 border-t border-emerald-900/60 text-center text-[0.65rem] text-green-600">
          hunajapannu.fi
        </footer>
      </div>

      {activeSession && (
        <SessionDrawer
          data={activeSession}
          loading={activeSessionLoading}
          error={activeSessionError}
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
