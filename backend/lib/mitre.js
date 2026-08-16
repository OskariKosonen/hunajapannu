const { LRUCache } = require('lru-cache');

// ============================================================================
// MITRE ATT&CK Command Tagging
// ============================================================================

/**
 * Signatures matched against captured commands. These used to live in the
 * frontend, which meant shipping all 3000+ commands to the browser just to
 * tag and count them. Tagging here lets the API filter by technique and
 * return only the page being displayed. Display metadata (colours) stays in
 * the frontend, keyed by id.
 *
 * Extracted from index.js so it can be tested without booting the server: a
 * wrong pattern mislabels attacks silently and forever — it never throws, so
 * no smoke test can see it.
 */
const MITRE_SIGNATURES = [
  { id: 'T1490', name: 'Impact (T1490)', description: 'Destructive cleanup',
    patterns: [/rm\s+-rf/i, /chattr\s+-i/i, /dd\s+if=/i] },
  { id: 'T1105', name: 'Ingress Tool Transfer (T1105)', description: 'wget/curl/scp drops',
    patterns: [/wget/i, /curl/i, /tftp/i, /ftp\s/i, /scp/i] },
  { id: 'T1021', name: 'Remote Services (T1021)', description: 'Pivot via SSH/Telnet',
    patterns: [/ssh\s/i, /telnet/i, /dropbear/i] },
  { id: 'T1098', name: 'Account Manipulation (T1098)', description: 'SSH key + password tampering',
    patterns: [/authorized_keys/i, /chattr/i, /lockr/i, /chpasswd/i, /mkdir\s+-p\s+~\/\.ssh/i] },
  { id: 'T1059', name: 'Cmd/Scripting (T1059)', description: 'Shells & interpreters',
    patterns: [/bash/i, /\bsh\b/i, /python/i, /perl/i, /busybox/i] },
  { id: 'T1562', name: 'Defense Evasion (T1562)', description: 'Cleanup + disabling protections',
    patterns: [/rm\s+-rf/i, /pkill/i, /echo\s+>\s+\/etc\/hosts\.deny/i, /clean\.sh/i] },
  { id: 'T1595', name: 'Reconnaissance (T1595)', description: 'Scanning & discovery',
    patterns: [/nmap/i, /masscan/i, /whois/i, /dig\s/i, /nslookup/i, /curl\s+http:\/\/\d+/i] },
  { id: 'T1082', name: 'System Info Discovery (T1082)', description: 'uname/lscpu/proc snooping',
    patterns: [/uname/i, /lscpu/i, /cat\s+\/proc\/cpuinfo/i, /cat\s+\/proc\/uptime/i,
               /df\s+-h/i, /free\s+-m/i, /nproc/i, /which\s+ls/i, /ps\s/i] },
];

const MITRE_IDS = new Set(MITRE_SIGNATURES.map((s) => s.id));

/**
 * Command strings are stable and few (one row per unique command), so the
 * regex result for a given string never changes — cache it rather than
 * re-running 40 patterns on every request.
 */
const mitreTagCache = new LRUCache({ max: 20000 });

function tagCommand(command) {
  if (!command) return [];
  const cached = mitreTagCache.get(command);
  if (cached) return cached;
  const tags = MITRE_SIGNATURES
    .filter((sig) => sig.patterns.some((p) => p.test(command)))
    .map((sig) => sig.id);
  mitreTagCache.set(command, tags);
  return tags;
}

module.exports = { MITRE_SIGNATURES, MITRE_IDS, tagCommand };
