/**
 * SSH client banners, grouped into the software behind them.
 *
 * The banner is whatever the client says it is, so this is identification
 * by self-description, not proof. It is still the clearest signal of what
 * connected: bots overwhelmingly use a library (Go's x/crypto/ssh, libssh2)
 * and never bother to disguise it, while OpenSSH or PuTTY suggests a script
 * driving a stock client, or a person.
 */
const FAMILIES = [
  { id: "go", label: "Go", note: "bots built on Go's SSH library", test: /^SSH-2\.0-Go\b/i },
  { id: "libssh2", label: "libssh2", note: "C library behind many scanners", test: /libssh2/i },
  { id: "libssh", label: "libssh", note: "C library", test: /libssh/i },
  { id: "paramiko", label: "Paramiko", note: "Python scripts", test: /paramiko/i },
  { id: "asyncssh", label: "AsyncSSH", note: "Python scripts", test: /asyncssh/i },
  { id: "twisted", label: "Twisted Conch", note: "Python", test: /twisted|conch/i },
  { id: "jsch", label: "JSch", note: "Java", test: /jsch/i },
  { id: "russh", label: "russh", note: "Rust", test: /russh|thrussh/i },
  { id: "node", label: "Node.js ssh2", note: "JavaScript", test: /ssh2js|ssh2-js|nodejs/i },
  { id: "putty", label: "PuTTY", note: "Windows client, often a person", test: /putty|kitty/i },
  { id: "openssh", label: "OpenSSH", note: "the stock client: a script or a person", test: /openssh/i },
  { id: "dropbear", label: "Dropbear", note: "routers, cameras and other devices", test: /dropbear/i },
  { id: "scanner", label: "Scanners", note: "internet-wide survey tools", test: /zgrab|nmap|masscan|censys|shodan/i },
];

export const OTHER_FAMILY = { id: "other", label: "Other", note: "everything else, and banners outside the top 40" };

/** The family a banner belongs to, or OTHER_FAMILY. */
export function clientFamily(version) {
  if (!version) return OTHER_FAMILY;
  return FAMILIES.find((f) => f.test.test(version)) || OTHER_FAMILY;
}

/**
 * Banner counts -> families, busiest first, with whatever the top-N list
 * left out added to "Other" so the parts sum to every versioned session.
 */
export function groupClients(versions, versioned) {
  const byId = new Map();
  let listed = 0;
  for (const v of versions) {
    const f = clientFamily(v.client_version);
    const entry = byId.get(f.id) || { ...f, sessions: 0, banners: [] };
    entry.sessions += v.sessions;
    entry.banners.push(v.client_version);
    byId.set(f.id, entry);
    listed += v.sessions;
  }
  const rest = Math.max((versioned || 0) - listed, 0);
  if (rest > 0) {
    const other = byId.get("other") || { ...OTHER_FAMILY, sessions: 0, banners: [] };
    other.sessions += rest;
    byId.set("other", other);
  }
  const families = [...byId.values()];
  families.sort((a, b) => (a.id === "other") - (b.id === "other") || b.sessions - a.sessions);
  return families;
}
