/**
 * Defanging indicators for display.
 *
 * Kept in step with backend/lib/urls.js, which is where the same logic is unit
 * tested. The two builds share no module, so the guard against drift is that
 * both sides assert the same cases.
 */

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** 1.2.3.4 -> 1.2.3[.]4 — last dot only, the usual convention for addresses. */
export const defangIp = (ip) => String(ip).replace(/\.(?=[^.]*$)/, "[.]");

/**
 * hxxp://1.2.3[.]4:8080/bins.sh — safe to read, and safe to paste into a
 * ticket, on a page a security person may well have open at work.
 *
 * Only the host is bracketed. Mangling the path too ("bins[.]sh") makes the
 * indicator harder to read and harder to re-fang for use.
 *
 * The port is split off before deciding address-or-name, because it arrives in
 * the same capture group as the host. Left attached, "1.2.3.4:6819" failed the
 * address test and fell through to the name branch, so a host that happened to
 * carry a port bracketed every dot while the same address without one bracketed
 * only the last — both shapes shipped in a single export.
 */
export function defangUrl(value) {
  const str = String(value);
  const m = str.match(/^([a-z]+):\/\/([^/?#]*)(.*)$/i);
  const hostPort = m ? m[2] : str;
  const portAt = hostPort.lastIndexOf(":");
  const host = portAt === -1 ? hostPort : hostPort.slice(0, portAt);
  const port = portAt === -1 ? "" : hostPort.slice(portAt);
  const bracketed = IPV4.test(host) ? defangIp(host) : host.replace(/\./g, "[.]");
  if (!m) return `${bracketed}${port}`;
  return `${m[1].replace(/^http/i, "hxxp")}://${bracketed}${port}${m[3]}`;
}
