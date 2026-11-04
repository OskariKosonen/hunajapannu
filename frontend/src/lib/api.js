/** Endpoint paths and page sizes, shared by the views. */

export const API = {
  LATEST_EVENTS: "/api/public/cowrie/latest",
  COMMANDS: "/api/public/cowrie/commands",
  CREDENTIALS: "/api/public/cowrie/creds",
  FILES: "/api/public/cowrie/files",
  TRENDS: "/api/public/cowrie/events-per-hour?hours=24",
  TOP_ASN: "/api/public/cowrie/top-asn",
  TOP_COUNTRIES: "/api/public/cowrie/top-countries",
  SUMMARY: "/api/public/cowrie/summary",
  SESSIONS: "/api/public/cowrie/sessions",
  FEATURED_SESSION: "/api/public/cowrie/sessions/featured",
  PEERS: "/api/public/cowrie/peers",
  PROBES: "/api/public/cowrie/probes",
  PASSWORD_RANGE: "/api/public/cowrie/passwords/range",
  IOCS: "/api/public/cowrie/iocs",
  PAYLOAD_HOSTS: "/api/public/cowrie/payload-hosts",
  MITRE: "/api/public/cowrie/mitre",
  CREDS_ANATOMY: "/api/public/cowrie/creds/anatomy",
  CONCENTRATION: "/api/public/cowrie/origins/concentration",
  CLIENTS: "/api/public/cowrie/clients",
  TUNNELS: "/api/public/cowrie/tunnels",
};

// Only what is displayed is fetched. These used to be limit=3000/1000, which
// pulled ~894 KB of JSON on every refresh to render scrollable windows.
export const PAGE_SIZE = {
  COMMANDS: 100,
  CREDS: 100,
  FILES: 50,
  ASN: 50,
  COUNTRIES: 200, // every country, revealed a page at a time
  EVENTS: 100, // the API caps /latest at 200
  PREVIEW: 5,
};

// Wait for typing to settle before hitting the API.
export const SEARCH_DEBOUNCE_MS = 300;

// Every panel refreshes on one shared clock.
export const REFRESH_INTERVAL_MS = 120_000;
