import { memo, useCallback, useState } from "react";

/**
 * Take the indicators away.
 *
 * Every other panel answers "what does this dashboard show?". This one
 * answers "what can I actually use?", which is the only question an analyst
 * looking at someone else's honeypot really has. Plain text for a block list,
 * CSV for a spreadsheet or a ticket, defanged for anywhere a live IP would be
 * clicked, linkified or eaten by a link scanner.
 */

const WINDOWS = [
  { hours: 24, label: "24h" },
  { hours: 168, label: "7d" },
];

const IocExport = ({ endpoint }) => {
  const [hours, setHours] = useState(24);
  const [copied, setCopied] = useState("");

  const url = useCallback(
    (params) => {
      const q = new URLSearchParams({ hours: String(hours), ...params });
      return `${endpoint}?${q}`;
    },
    [endpoint, hours]
  );

  const copy = useCallback(
    async (label, params) => {
      try {
        const res = await fetch(url({ format: "txt", ...params }));
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const text = await res.text();
        // Strip the provenance header when copying to the clipboard: pasting
        // into a block list wants indicators, not comments. The downloads
        // keep it, because a file outlives the context it came from.
        const body = text.split("\n").filter((l) => l && !l.startsWith("#")).join("\n");
        await navigator.clipboard.writeText(body);
        setCopied(label);
        setTimeout(() => setCopied(""), 2000);
      } catch {
        setCopied("failed");
        setTimeout(() => setCopied(""), 2000);
      }
    },
    [url]
  );

  const btn =
    "px-2.5 py-1 rounded-md border border-emerald-700/70 text-emerald-300 hover:border-emerald-500 hover:text-emerald-100 transition text-[0.68rem] whitespace-nowrap";

  return (
    <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-emerald-800/60 bg-black/40">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-400">Take it with you</p>
          <h2 className="text-base sm:text-lg font-semibold text-green-200">Export indicators</h2>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => setHours(w.hours)}
              aria-pressed={hours === w.hours}
              className={`px-2.5 py-1 rounded-md border text-[0.68rem] transition ${
                hours === w.hours
                  ? "border-emerald-400 text-emerald-100 bg-emerald-500/15"
                  : "border-emerald-800/70 text-emerald-500 hover:border-emerald-600"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <div className="space-y-2">
          <p className="text-[0.6rem] uppercase tracking-[0.15em] text-emerald-500">Attacker IPs</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => copy("ips", {})}>
              {copied === "ips" ? "✓ Copied" : "Copy IPs"}
            </button>
            <button type="button" className={btn} onClick={() => copy("defanged", { defang: "1" })}>
              {copied === "defanged" ? "✓ Copied" : "Copy defanged IPs"}
            </button>
            <a className={btn} href={url({ format: "csv" })} download>
              CSV
            </a>
            <a className={btn} href={url({ format: "txt" })} download>
              .txt
            </a>
          </div>
        </div>

        {/* Behavioural rather than atomic — you grep for these, you do not
            block them — but it is the material people most often want to take
            away, and the leaderboard panel only ever shows a page of it.
            Defanging rewrites any payload URL inside the command, so a wget
            line survives being pasted into a ticket. */}
        <div className="space-y-2">
          <p className="text-[0.6rem] uppercase tracking-[0.15em] text-emerald-500">Attacker commands</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => copy("commands", { type: "commands" })}>
              {copied === "commands" ? "✓ Copied" : "Copy commands"}
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => copy("commands-defanged", { type: "commands", defang: "1" })}
            >
              {copied === "commands-defanged" ? "✓ Copied" : "Copy defanged commands"}
            </button>
            <a className={btn} href={url({ type: "commands", format: "csv" })} download>
              CSV
            </a>
            <a className={btn} href={url({ type: "commands", format: "txt" })} download>
              .txt
            </a>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[0.6rem] uppercase tracking-[0.15em] text-emerald-500">Malware hashes</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => copy("hashes", { type: "hashes" })}>
              {copied === "hashes" ? "✓ Copied" : "Copy SHA-256"}
            </button>
            <a className={btn} href={url({ type: "hashes", format: "csv" })} download>
              CSV
            </a>
          </div>
        </div>

        {copied === "failed" && (
          <p role="alert" className="text-[0.65rem] text-red-400">
            Could not copy — the download links still work.
          </p>
        )}

        <p className="text-[0.6rem] text-emerald-600 leading-relaxed">
          Defanged output writes <code className="text-emerald-500">1.2.3[.]4</code>, so indicators
          survive being pasted into a ticket or chat without becoming a live link. Downloads carry a
          comment header with the window and generation time — an indicator list with no provenance
          is close to useless a week later. Straight from{" "}
          <span className="text-emerald-500">/api/public/cowrie/iocs</span>, no auth.
        </p>
      </div>
    </section>
  );
};

export default memo(IocExport);
