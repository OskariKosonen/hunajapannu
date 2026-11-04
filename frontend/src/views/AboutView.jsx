import { memo } from "react";
import Panel from "../components/ui/Panel";
import IocExport from "../components/IocExport";
import ApiReferencePanel from "../components/ApiReferencePanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { ExternalIcon } from "../components/ui/icons";
import { API } from "../lib/api";
import topologySvg from "../assets/topology.svg";

/**
 * How the project is built, how it ships, and what has gone wrong.
 *
 * The dashboard shows what the honeypot catches; this page shows the
 * engineering around it. The copy follows the README, which is the source of
 * truth for these facts: change one, change both.
 */

const PARTS = [
  {
    name: "Sensor",
    text: "Cowrie on a Raspberry Pi on a home broadband connection. It accepts SSH and Telnet logins and records every command, credential and download.",
  },
  {
    name: "Forwarder",
    text: "Python with no dependencies, under systemd. It tails Cowrie's JSON log and posts batches to the API, saving its file offset only after a successful post, so API downtime delays events instead of losing them. Rejected batches go to a dead-letter file with its own replay unit. It runs as its own user with `NoNewPrivileges`, `ProtectSystem=strict` and `PrivateTmp`, and can write to one directory.",
  },
  {
    name: "API and database",
    text: "Express 5 and PostgreSQL 16 on a VPS, behind nginx and Cloudflare, run by pm2. Events get GeoIP and VirusTotal enrichment, and commands are grouped into templates and tagged with MITRE ATT&CK techniques.",
  },
  {
    name: "This site",
    text: "React 19 and Vite. Everything on it comes from the public API listed below.",
  },
];

const SHIPPING = [
  "A push to main runs the integration checks against a real PostgreSQL 16 on a GitHub-hosted runner. If they pass, a self-hosted runner applies migrations, restarts the API and deploys the frontend.",
  "If the health check fails after a deploy, the code is rolled back automatically.",
  "Migrations are checksummed and applied once. Editing one that has already run fails the deploy.",
  "`/health` reports the age of the newest event and the clock skew between the Pi and the server. A scheduled workflow polls it, because the likely failure is everything running but no data arriving.",
];

const INCIDENTS = [
  {
    title: "Ingestion silently stopped for four days",
    text: "Every service looked healthy, but Cloudflare had started returning 403 to the default Python-urllib User-Agent. Fixed the header, then added the data-age health check and the watchdog so it cannot go unnoticed again.",
  },
  {
    title: "Twelve hours down because of one long command",
    text: "An attacker sent a 4,792-byte command. The table was indexed on the command text and PostgreSQL btree entries max out around 2.7 kB, so the insert failed, the whole batch rolled back, and the forwarder retried it every minute. The table is now keyed on `sha256(command)`.",
  },
  {
    title: "Green deploy over a failed migration",
    text: "The deploy script ended with `|| echo \"(skipped/failed)\"`, so a failed migration still reported success and an endpoint served an empty table for days. Migrations now fail the deploy and restore the previous revision.",
  },
  {
    title: "A migration filled the disk",
    text: "Updating 1.6M rows in one migration took PostgreSQL down at 100% disk. Every UPDATE writes a new row version, and two partial indexes on the column blocked HOT updates. Dropping those indexes during the migration took the extra disk use from 176 MB per 75k rows to zero.",
  },
];

const LINK = "inline-flex items-center gap-1 text-accent hover:underline underline-offset-2";

/** Renders `backticked` spans of the copy as inline code. */
const Prose = ({ text }) =>
  text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") ? (
      <code key={i} className="rounded bg-surface-3 px-1 py-px font-mono text-[0.8125rem] text-fg">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    )
  );

const AboutView = () => (
  <div className="space-y-4">
    <Panel title="How it is built">
      <div className="overflow-x-auto custom-scrollbar rounded-md border border-line bg-canvas p-3 sm:p-4">
        <img
          src={topologySvg}
          alt="Pipeline: botnets reach the Cowrie honeypot on a Raspberry Pi, a forwarder posts events to an Express API on a VPS, which stores them in PostgreSQL and serves this site through nginx."
          className="min-w-[640px] w-full h-auto"
        />
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {PARTS.map((p) => (
          <div key={p.name}>
            <dt className="text-sm font-medium text-fg">{p.name}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-fg-muted"><Prose text={p.text} /></dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a className={LINK} href="https://github.com/OskariKosonen/hunajapannu" target="_blank" rel="noreferrer">
          Source on GitHub <ExternalIcon size={12} />
        </a>
        <a className={LINK} href="https://github.com/cowrie/cowrie" target="_blank" rel="noreferrer">
          Cowrie <ExternalIcon size={12} />
        </a>
      </p>
    </Panel>

    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Panel title="Incidents" description="Things that broke in production, and what changed afterwards.">
        <ol className="space-y-4">
          {INCIDENTS.map((i) => (
            <li key={i.title}>
              <div className="text-sm font-medium text-fg">{i.title}</div>
              <p className="mt-0.5 text-sm leading-relaxed text-fg-muted"><Prose text={i.text} /></p>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Shipping and monitoring">
        <ul className="space-y-3">
          {SHIPPING.map((t) => (
            <li key={t} className="flex gap-3 text-sm leading-relaxed text-fg-muted">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg-subtle" aria-hidden="true" />
              <span><Prose text={t} /></span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>

    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <ErrorBoundary name="Export indicators">
        <IocExport endpoint={API.IOCS} />
      </ErrorBoundary>
      <ErrorBoundary name="Public API">
        <ApiReferencePanel />
      </ErrorBoundary>
    </div>
  </div>
);

export default memo(AboutView);
