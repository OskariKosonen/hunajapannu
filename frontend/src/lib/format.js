/**
 * Every number, date and duration on the page goes through here.
 *
 * These used to be useCallbacks in App.jsx, handed down as props to every
 * panel. They depend on nothing but the viewer's timezone, which is fixed for
 * the life of the page, so plain module functions do the same job without the
 * prop chains.
 */

// One locale for every rendering. en-GB gives 24-hour, colon-separated times;
// mixing it with fi-FI once meant the events table showed "22:21:57" while the
// chart axis showed "22.21" on the same screen.
export const LOCALE = "en-GB";

// Only the fallback for a browser that will not report a timezone.
const DEFAULT_TIMEZONE = "Europe/Helsinki";

const detectTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

export const TIME_ZONE = detectTimeZone();

/** "UTC+3": says which clock the timestamps are on. */
export const TIME_ZONE_LABEL = (() => {
  try {
    const parts = new Intl.DateTimeFormat(LOCALE, {
      timeZone: TIME_ZONE,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
})();

const toDate = (ts) => {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 03/11/2026, 14:32:07 */
export function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = toDate(ts);
  if (!d) return String(ts);
  return d.toLocaleString(LOCALE, {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** 14:32:07 — for feeds where the date is almost always today. */
export function formatTime(ts) {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleTimeString(LOCALE, {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * "14:32:07" for today, "3 Nov, 14:32:07" otherwise. The live feed is almost
 * all today, and repeating 04/11/2026 on every row made the one column a
 * reader scans by the hardest to scan.
 */
export function formatEventTime(ts, now = new Date()) {
  const d = toDate(ts);
  if (!d) return "—";
  const day = (x) => x.toLocaleDateString(LOCALE, { timeZone: TIME_ZONE });
  if (day(d) === day(now)) return formatTime(d);
  const date = d.toLocaleDateString(LOCALE, { timeZone: TIME_ZONE, day: "numeric", month: "short" });
  return `${date}, ${formatTime(d)}`;
}

/** 14:32 — for status lines. */
export function formatClock(ts) {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleTimeString(LOCALE, {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 3 Nov, or 3 Nov 2025 for an earlier year. */
export function formatDate(ts, now = new Date()) {
  if (!ts) return "—";
  const d = toDate(ts);
  if (!d) return String(ts);
  // "3 Nov" this year, "3 Nov 2025" before it: the same style as the event
  // times, where 03/11/2026 read like a form field and, to half the world,
  // like the eleventh of March.
  const year = (x) => x.toLocaleDateString(LOCALE, { timeZone: TIME_ZONE, year: "numeric" });
  return d.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "short",
    ...(year(d) === year(now) ? {} : { year: "numeric" }),
  });
}

/** 24 Nov 2025 — for prose, where 24/11/2025 reads like a form field. */
export function formatLongDate(ts) {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleDateString(LOCALE, {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** 14:00 — chart axis labels. */
export const formatHourLabel = formatClock;

/** 203819 -> "203,819". A bare 203819 reads like an id, not a quantity. */
export function formatNumber(n) {
  if (n == null || n === "") return "—";
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString(LOCALE) : "—";
}

/** 7682298 -> "7.7M", 24122 -> "24k". For headline figures only. */
export function formatCompact(n) {
  const v = Number(n);
  if (n == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  return v.toLocaleString(LOCALE);
}

export function formatBytes(bytes) {
  if (bytes == null) return "—";
  const b = Number(bytes);
  if (Number.isNaN(b)) return String(bytes);
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Session length, in the largest unit that still reads naturally. */
export function formatDuration(ms) {
  const n = Number(ms);
  if (ms == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return "<1s";
  const secs = Math.round(n / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

/** "12s ago", "4m ago", "3h ago", "2d ago". */
export function formatRelative(ts, now = Date.now()) {
  const d = toDate(ts);
  if (!d) return "—";
  const secs = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** "CN" -> regional-indicator flag; anything else gets a globe. */
export function countryFlag(country) {
  if (!country || country.length !== 2) return "🌐";
  const code = country.toUpperCase();
  const OFFSET = 127397;
  return String.fromCodePoint(code.charCodeAt(0) + OFFSET, code.charCodeAt(1) + OFFSET);
}

let regionNames = null;
try {
  regionNames = new Intl.DisplayNames(["en"], { type: "region" });
} catch {
  /* very old browser: fall back to the ISO code alone */
}

/** "CN" -> "China". */
export function countryName(iso) {
  if (!iso) return "Unknown";
  try {
    return regionNames?.of(iso.toUpperCase()) || iso;
  } catch {
    return iso;
  }
}

/** "Beijing · CN" for an event or session row. */
export function placeLabel(row) {
  return [row?.city, row?.country_iso].filter(Boolean).join(" · ") || "Unknown";
}

/** "AS4134 · Chinanet" for an event or session row. */
export function networkLabel(row) {
  const asn = row?.asn ? `AS${row.asn}` : "";
  return [asn, row?.org].filter(Boolean).join(" · ") || "Unknown network";
}
