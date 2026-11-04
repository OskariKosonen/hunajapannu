import { memo } from "react";
import { ChevronRightIcon, ExternalIcon } from "./ui/icons";
import { formatCompact, formatLongDate, formatNumber } from "../lib/format";

/**
 * What this page is, in one screen.
 *
 * The site is linked from a CV, so the first visit is often someone who has
 * never heard of Cowrie and has thirty seconds. Before this, the overview
 * opened on a row of counters with no subject: "11,151 attacks" — on what,
 * by whom, why is it here? The hero answers that, and gives the all-time
 * scale; the panels below are the live detail.
 */

const STEPS = [
  { n: "1", title: "Capture", detail: "Cowrie on a Raspberry Pi" },
  { n: "2", title: "Enrich", detail: "GeoIP · VirusTotal · ATT&CK" },
  { n: "3", title: "Publish", detail: "Public API + dashboard" },
];

const LINK = "inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg transition-colors";

const daysSince = (ts) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? Math.max(1, Math.floor((Date.now() - t) / 86_400_000)) : null;
};

const Figure = ({ value, label, title }) => (
  <div className="min-w-0">
    <div className="text-xl font-semibold tracking-tight text-fg tabular-nums sm:text-2xl lg:text-[1.75rem] lg:leading-9" title={title}>
      {value}
    </div>
    <div className="text-xs text-fg-subtle">{label}</div>
  </div>
);

const OverviewHero = ({ summary, loading, onNavigate }) => {
  const days = daysSince(summary?.firstEventAt);

  return (
    <section
      aria-labelledby="overview-title"
      className="relative overflow-hidden rounded-lg border border-line bg-surface"
    >
      {/* One static wash of the accent, top-right. The old hero animated a
          grid and a pulsing glow; this keeps the colour, not the motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_20rem_at_100%_0%,rgb(var(--accent)/0.08),transparent_60%)]"
      />

      <div className="relative grid gap-6 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10 lg:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
            <span className="inline-flex items-center gap-1.5 font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Live SSH honeypot
            </span>
            {summary?.firstEventAt && (
              <span>
                Running since {formatLongDate(summary.firstEventAt)}
                {days ? ` · ${formatNumber(days)} days` : ""}
              </span>
            )}
          </div>

          <h2 id="overview-title" className="mt-2 text-xl font-semibold tracking-tight text-fg sm:text-2xl">
            Real attacks against a real server, captured live
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted sm:text-base sm:leading-relaxed">
            A Raspberry Pi on a Finnish home connection pretends to be a poorly secured Linux server. Bots find
            it within minutes. Every login attempt, command and malware download is recorded, enriched and
            published here as it happens.
          </p>

          <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="How it works">
            {STEPS.map((s) => (
              <li key={s.n} className="flex items-center gap-2 rounded-md border border-line bg-canvas/40 px-2.5 py-2 sm:gap-2.5 sm:px-3">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 text-2xs font-semibold text-accent">
                  {s.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{s.title}</span>
                  <span className="hidden text-xs text-fg-subtle sm:block">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-sm text-fg-subtle">
              Built by{" "}
              <a
                className="font-medium text-fg hover:text-accent transition-colors"
                href="https://www.linkedin.com/in/oskari-kosonen-ba2589294/"
                target="_blank"
                rel="noreferrer"
              >
                Oskari Kosonen
              </a>
            </span>
            <a className={LINK} href="https://github.com/OskariKosonen/hunajapannu" target="_blank" rel="noreferrer">
              Source on GitHub
              <ExternalIcon size={12} />
            </a>
            <button type="button" className={LINK} onClick={() => onNavigate("data")}>
              Architecture and API
              <ChevronRightIcon size={13} />
            </button>
          </div>
        </div>

        <div className="min-w-0 lg:flex lg:flex-col lg:justify-center lg:border-l lg:border-line lg:pl-10">
          <div className="text-xs font-medium text-fg-subtle">All time</div>
          {loading ? (
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-8 w-20 rounded bg-surface-3 animate-pulse" />
                  <div className="h-3 w-24 rounded bg-surface-3 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-4 sm:gap-x-6 sm:gap-y-5">
              <Figure
                value={formatCompact(summary?.lifetimeEvents)}
                title={`${formatNumber(summary?.lifetimeEvents)} events`}
                label="attacks recorded"
              />
              <Figure value={formatNumber(summary?.lifetimeUniqueIps)} label="unique attacker IPs" />
              <Figure value={formatNumber(summary?.lifetimeCountries)} label="source countries" />
              <Figure value={formatNumber(summary?.uniqueCredCount)} label="credential pairs tried" />
              <Figure value={formatNumber(summary?.uniqueCommands)} label="distinct commands" />
              <Figure value={formatNumber(summary?.malwareSamples)} label="malware samples" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default memo(OverviewHero);
