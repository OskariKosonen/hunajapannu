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
  
  // API endpoint paths
  API_ENDPOINTS: {
    LATEST_EVENTS: "/api/public/cowrie/latest",
    COMMANDS: "/api/public/cowrie/commands?limit=3000",
    CREDENTIALS: "/api/public/cowrie/creds?limit=1000",
    FILES: "/api/public/cowrie/files?limit=1000",
    TRENDS: "/api/public/cowrie/events-per-hour?hours=24",
    TOP_ASN: "/api/public/cowrie/top-asn?limit=1000",
    TOP_COUNTRIES: "/api/public/cowrie/top-countries?limit=1000",
    SUMMARY: "/api/public/cowrie/summary",
  },
  
  // Chart dimensions and calculations
  CHART: {
    SVG_VIEWBOX: "0 0 100 40",
    VERTICAL_RANGE: 22,
    VERTICAL_PADDING: 30,
    VERTICAL_MIDPOINT: 18,
  },
  
  // Default timezone
  DEFAULT_TIMEZONE: "Europe/Helsinki",
};

const MITRE_SIGNATURES = [
  {
    id: "T1490",
    name: "Impact (T1490)",
    description: "Destructive cleanup",
    patterns: [/rm\s+-rf/i, /chattr\s+-i/i, /dd\s+if=/i],
    badgeColor: "border-rose-400/60 text-rose-100 bg-rose-500/10",
  },
  {
    id: "T1105",
    name: "Ingress Tool Transfer (T1105)",
    description: "wget/curl/scp drops",
    patterns: [/wget/i, /curl/i, /tftp/i, /ftp\s/i, /scp/i],
    badgeColor: "border-amber-400/60 text-amber-100 bg-amber-500/10",
  },
  {
    id: "T1021",
    name: "Remote Services (T1021)",
    description: "Pivot via SSH/Telnet",
    patterns: [/ssh\s/i, /telnet/i, /dropbear/i],
    badgeColor: "border-purple-400/60 text-purple-100 bg-purple-500/10",
  },
  {
    id: "T1098",
    name: "Account Manipulation (T1098)",
    description: "SSH key + password tampering",
    patterns: [
      /authorized_keys/i,
      /chattr/i,
      /lockr/i,
      /chpasswd/i,
      /mkdir\s+-p\s+~\/\.ssh/i,
    ],
    badgeColor: "border-orange-400/60 text-orange-100 bg-orange-500/10",
  },
  {
    id: "T1059",
    name: "Cmd/Scripting (T1059)",
    description: "Shells & interpreters",
    patterns: [/bash/i, /\bsh\b/i, /python/i, /perl/i, /busybox/i],
    badgeColor: "border-cyan-400/60 text-cyan-100 bg-cyan-500/10",
  },
  {
    id: "T1562",
    name: "Defense Evasion (T1562)",
    description: "Cleanup + disabling protections",
    patterns: [/rm\s+-rf/i, /pkill/i, /echo\s+>\s+\/etc\/hosts\.deny/i, /clean\.sh/i],
    badgeColor: "border-slate-400/60 text-slate-100 bg-slate-500/10",
  },
  {
    id: "T1595",
    name: "Reconnaissance (T1595)",
    description: "Scanning & discovery",
    patterns: [/nmap/i, /masscan/i, /whois/i, /dig\s/i, /nslookup/i, /curl\s+http:\/\/\d+/i],
    badgeColor: "border-blue-400/60 text-blue-100 bg-blue-500/10",
  },
  {
    id: "T1082",
    name: "System Info Discovery (T1082)",
    description: "uname/lscpu/proc snooping",
    patterns: [
      /uname/i,
      /lscpu/i,
      /cat\s+\/proc\/cpuinfo/i,
      /cat\s+\/proc\/uptime/i,
      /df\s+-h/i,
      /free\s+-m/i,
      /nproc/i,
      /which\s+ls/i,
      /ps\s/i,
    ],
    badgeColor: "border-lime-400/60 text-lime-100 bg-lime-500/10",
  },
];


const BOOT_MESSAGES = [
  { label: "Tip #404", detail: "uname -s -v -n -m? Red flag fr fr." },
  { label: "NPC Behavior", detail: "cat /proc/uptime" },
  { label: "🚨 SUS ALERT", detail: "Why is bro echoing base64 again?" },
  { label: "Pro Hacker Tip", detail: "root:root" },
  { label: "Loading", detail: "Trust the process." },
  { label: "Pro Hacker Tip", detail: "rm -rf /var/log/*" },
  { label: "Pro Tip", detail: "cat /etc/passwd | grep root" },
];

const formatRelativeTime = (input) => {
  if (!input) return "";
  const ts =
    typeof input === "number" ? input : new Date(input).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSeconds < 60) return `${diffSeconds || 1}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};


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

  const localTimeZone = getLocalTimeZone();

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

  // Load all data on mount and set up refresh interval
  useEffect(() => {
    (async () => {
      // Kick off secondary panels without blocking initial paint
      fetchCommands();
      fetchCreds();
      fetchDownloads();
      fetchTrend();
      fetchTopAsn();
      fetchTopCountries();

      try {
        await Promise.all([fetchEvents(), fetchSummary()]);
      } finally {
        setLoading(false);
      }
    })();

    const interval = setInterval(() => {
      fetchEvents();
      fetchSummary();
      fetchCommands();
      fetchCreds();
      fetchDownloads();
      fetchTrend();
      fetchTopAsn();
      fetchTopCountries();
    }, CONFIG.REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // Maintain window width state for responsive breakpoint checks
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // API FETCH FUNCTIONS
  // Factory pattern for reusable fetch wrappers with consistent error/loading handling
  const createFetch = (url, setter, errorSetter, loadingSetter) => async () => {
    try {
      if (loadingSetter) loadingSetter(true);
      errorSetter("");
      const resolvedUrl = typeof url === "function" ? url() : url;
      const res = await fetch(resolvedUrl);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setter(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      errorSetter(err.message || "Failed to fetch");
    } finally {
      if (loadingSetter) loadingSetter(false);
    }
  };

  const fetchEvents = createFetch(
    () => `${CONFIG.API_ENDPOINTS.LATEST_EVENTS}?limit=${eventLimit}`,
    setEvents,
    setError
  );
  const fetchCommands = createFetch(CONFIG.API_ENDPOINTS.COMMANDS, setCommands, setCommandsError, setCommandsLoading);
  const fetchCreds = createFetch(CONFIG.API_ENDPOINTS.CREDENTIALS, setCreds, setCredsError, setCredsLoading);
  const fetchDownloads = createFetch(CONFIG.API_ENDPOINTS.FILES, setDownloads, setDownloadsError, setDownloadsLoading);
  const fetchTrend = createFetch(CONFIG.API_ENDPOINTS.TRENDS, setTrend, setTrendError, setTrendLoading);
  const fetchTopAsn = createFetch(CONFIG.API_ENDPOINTS.TOP_ASN, setTopAsn, setAsnError, setAsnLoading);
  const fetchTopCountries = createFetch(CONFIG.API_ENDPOINTS.TOP_COUNTRIES, setTopCountries, setCountriesError, setCountriesLoading);

  const fetchSummary = async () => {
    try {
      setSummaryLoading(true);
      setSummaryError("");
      const res = await fetch(CONFIG.API_ENDPOINTS.SUMMARY);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setSummaryData(data || null);
    } catch (err) {
      console.error(err);
      setSummaryError(err.message || "Failed to fetch summary");
      setSummaryData(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  // FORMATTING UTILITIES
  // Convert ISO timestamp to localized datetime string, respecting user timezone
  const formatTimestamp = useCallback((ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;

    return d.toLocaleString("en-GB", {
      timeZone: localTimeZone || CONFIG.DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
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

  // Format hour label for trend chart axis in local time
  const formatHourLabel = useCallback((iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("fi-FI", {
      timeZone: localTimeZone || CONFIG.DEFAULT_TIMEZONE,
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
    [peak]
  );

  const eventLimit = useMemo(
    () => (isMobile ? CONFIG.MOBILE_EVENT_LIMIT : CONFIG.DESKTOP_EVENT_LIMIT),
    [isMobile]
  );

  const summaryStats = useMemo(
    () => ({
      attacks24h: summaryData?.attacks24h ?? totalTrendEvents,
      malwareSamples: summaryData?.malwareSamples ?? downloads.length,
      uniqueCommands: summaryData?.uniqueCommands ?? commands.length,
      topCredential: creds[0]
        ? `${creds[0].username} / ${creds[0].password}`
        : "N/A",
      uniqueIpPercent: summaryData?.uniqueIpPercent ?? null,
      uniqueCredCount: summaryData?.uniqueCredCount ?? null,
    }),
    [summaryData, totalTrendEvents, downloads, commands, creds]
  );

  const enrichedCommands = useMemo(
    () =>
      commands.map((row) => ({
        ...row,
        tags: MITRE_SIGNATURES.filter((sig) =>
          sig.patterns.some((pattern) => pattern.test(row.command || ""))
        ),
      })),
    [commands]
  );

  const mitreTaggedCommandCount = useMemo(
    () => enrichedCommands.filter((row) => row.tags.length > 0).length,
    [enrichedCommands]
  );

  const commandTagCounts = useMemo(() => {
    const counts = {};
    MITRE_SIGNATURES.forEach((sig) => {
      counts[sig.id] = 0;
    });
    enrichedCommands.forEach((row) => {
      row.tags.forEach((tag) => {
        counts[tag.id] = (counts[tag.id] || 0) + 1;
      });
    });
    return counts;
  }, [enrichedCommands]);

  const filteredCommands = useMemo(() => {
    if (commandFilter === "all") return enrichedCommands;
    return enrichedCommands.filter((row) =>
      row.tags.some((tag) => tag.id === commandFilter)
    );
  }, [enrichedCommands, commandFilter]);

  const attacksTrendDown = useMemo(() => {
    if (!trend || trend.length < 2) return false;
    const last = trend[trend.length - 1]?.events || 0;
    const prev = trend[trend.length - 2]?.events || 0;
    return last < prev;
  }, [trend]);

  const lastEventTimestamp = useMemo(() => {
    if (!events || events.length === 0) return null;
    return events.reduce((latest, ev) => {
      const ts = new Date(ev.timestamp).getTime();
      if (!Number.isFinite(ts)) return latest;
      if (latest == null || ts > latest) return ts;
      return latest;
    }, null);
  }, [events]);

  const lastEventAgo = lastEventTimestamp ? formatRelativeTime(lastEventTimestamp) : "";
  const attackActive =
    lastEventTimestamp != null &&
    Date.now() - lastEventTimestamp < 5 * 60 * 1000;
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
        <DashboardHeader />
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
            <TrendPanel
              trend={trend}
              maxTrendEvents={maxTrendEvents}
              formatHourLabel={formatHourLabel}
              trendError={trendError}
              trendLoading={trendLoading}
              totalTrendEvents={totalTrendEvents}
              peakHourLabel={peakHourLabel}
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
              filteredCommands={filteredCommands}
              commandFilter={commandFilter}
              setCommandFilter={setCommandFilter}
              isCommandFilterActive={isCommandFilterActive}
              commandTagCounts={commandTagCounts}
              mitreSignatures={MITRE_SIGNATURES}
            />

            <TopMalwarePanel
              downloads={downloads}
              downloadsError={downloadsError}
              downloadsLoading={downloadsLoading}
              formatBytes={formatBytes}
              formatTimestamp={formatTimestamp}
            />

            <TopCredentialsPanel
              creds={creds}
              credsError={credsError}
              credsLoading={credsLoading}
            />

            <TopAsnPanel topAsn={topAsn} asnError={asnError} asnLoading={asnLoading} />
          </div>
        </div>

        <AsciiTopology />

        <footer className="mt-4 pt-3 border-t border-emerald-900/60 text-center text-[0.65rem] text-green-600">
          hunajapannu.fi 
        </footer>
      </div>
    </div>
  );
}

export default App;
