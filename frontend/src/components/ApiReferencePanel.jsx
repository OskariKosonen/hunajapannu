import { memo, useState } from "react";
import Panel from "./ui/Panel";
import { CheckIcon, CopyIcon, ExternalIcon } from "./ui/icons";

const BASE = "https://hunajapannu.fi";

/** Every public endpoint, with the query that shows it off best. */
const ENDPOINTS = [
  { path: "/api/public/cowrie/summary", what: "Headline figures: 24h and lifetime counts." },
  { path: "/api/public/cowrie/latest?limit=20", what: "Newest events, up to 200." },
  { path: "/api/public/cowrie/events-per-hour?hours=24", what: "Hourly event counts." },
  { path: "/api/public/cowrie/commands?limit=50&tag=T1105", what: "Command leaderboard; search, tag filter." },
  { path: "/api/public/cowrie/creds?limit=50", what: "Credential pairs tried, by attempts." },
  { path: "/api/public/cowrie/files?limit=50", what: "Captured samples with VirusTotal verdicts." },
  { path: "/api/public/cowrie/top-countries?limit=50", what: "Events by source country." },
  { path: "/api/public/cowrie/top-asn?limit=50", what: "Events by source network." },
  { path: "/api/public/cowrie/payload-hosts?limit=25", what: "Hosts serving second-stage payloads." },
  { path: "/api/public/cowrie/iocs?type=ips&hours=24&format=txt&defang=1", what: "Indicators as JSON, CSV or text." },
  { path: "/api/public/cowrie/sessions/featured", what: "The busiest recent session, with its events." },
  { path: "/api/public/cowrie/peers?limit=100", what: "Botnet peers from captured peer lists." },
  { path: "/api/public/cowrie/probes?limit=50", what: "Commands that probe for a honeypot." },
  { path: "/api/public/cowrie/mitre", what: "The ATT&CK technique catalogue used for tagging." },
  { path: "/api/public/cowrie/passwords/range/8d9", what: "Password hashes sharing a 3-char SHA-256 prefix." },
];

const Row = ({ path, what }) => {
  const [copied, setCopied] = useState(false);
  const curl = `curl '${BASE}${path}'`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the command is still on screen to select */
    }
  };
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5 hover:bg-surface-2/60">
      <div className="min-w-0 flex-1">
        <code className="block font-mono text-[0.8125rem] text-fg break-all">
          <span className="text-accent">GET </span>
          {path}
        </code>
        <div className="text-xs text-fg-subtle">{what}</div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        title="Copy as curl"
        aria-label={`Copy curl command for ${path}`}
        className="rounded p-1.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
      >
        {copied ? <CheckIcon size={14} className="text-accent" /> : <CopyIcon size={14} />}
      </button>
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        title="Open"
        aria-label={`Open ${path}`}
        className="rounded p-1.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
      >
        <ExternalIcon size={14} />
      </a>
    </li>
  );
};

const ApiReferencePanel = () => (
  <Panel
    title="Public API"
    description="Everything on this dashboard comes from these endpoints. JSON, no key, rate-limited."
    flush
  >
    <ul className="divide-y divide-line/70">
      {ENDPOINTS.map((e) => (
        <Row key={e.path} {...e} />
      ))}
    </ul>
  </Panel>
);

export default memo(ApiReferencePanel);
