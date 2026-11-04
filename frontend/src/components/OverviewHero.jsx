import { memo } from "react";
import { ChevronRightIcon, ExternalIcon } from "./ui/icons";

/**
 * What this page is, said once.
 *
 * The site is linked from a CV, so the first visitor may never have heard of
 * a honeypot. A title, one sentence and a byline are enough to orient them;
 * the KPI strip below gives the scale and the live status sits in the top
 * bar. An earlier version also had an eyebrow, a "running since" line and a
 * three-step pipeline here, all of which repeated something said elsewhere
 * on the same screen.
 */

const LINK = "inline-flex items-center gap-1 text-fg-muted hover:text-fg transition-colors";

const OverviewHero = ({ onNavigate }) => (
  <section aria-labelledby="overview-title" className="pt-1">
    <h2 id="overview-title" className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">
      Real attacks against a real server, captured live
    </h2>
    <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-muted sm:text-base sm:leading-relaxed">
      A Raspberry Pi in Finland poses as a poorly secured Linux server. Every login attempt, command and malware
      download it attracts is recorded and published here.
    </p>
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-subtle">
      <span>
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
      <span aria-hidden="true">·</span>
      <a className={LINK} href="https://github.com/OskariKosonen/hunajapannu" target="_blank" rel="noreferrer">
        Source
        <ExternalIcon size={12} />
      </a>
      <span aria-hidden="true">·</span>
      <button type="button" className={LINK} onClick={() => onNavigate("data")}>
        How it works
        <ChevronRightIcon size={13} />
      </button>
    </div>
  </section>
);

export default memo(OverviewHero);
