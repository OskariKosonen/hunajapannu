import { memo } from "react";
import { ChevronRightIcon, ExternalIcon } from "./ui/icons";
import { formatLongDate, formatNumber } from "../lib/format";

/**
 * What this page is, in one screen.
 *
 * The site is linked from a CV, so the first visit is often someone who has
 * never heard of Cowrie and has thirty seconds. The page header says what it
 * is and who built it; the KPI strip under it gives the all-time scale; the
 * panels below are the live detail.
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

const OverviewHero = ({ summary, onNavigate }) => {
  const days = daysSince(summary?.firstEventAt);

  return (
    <section aria-labelledby="overview-title">
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

        <h2 id="overview-title" className="mt-1.5 text-xl font-semibold tracking-tight text-fg sm:text-2xl">
          Real attacks against a real server, captured live
        </h2>
        <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-fg-muted">
          A Raspberry Pi on a Finnish home connection pretends to be a poorly secured Linux server. Bots find it
          within minutes. Every login attempt, command and malware download is recorded, enriched and published
          here as it happens.
        </p>
      </div>

      <ol className="mt-3 grid max-w-3xl grid-cols-3 gap-2" aria-label="How it works">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-2 sm:gap-2.5 sm:px-3"
          >
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 text-2xs font-semibold text-accent">
              {s.n}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{s.title}</span>
              <span className="hidden truncate text-xs text-fg-subtle sm:block">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
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
    </section>
  );
};

export default memo(OverviewHero);
