import { memo } from "react";
import Panel from "../components/ui/Panel";
import IocExport from "../components/IocExport";
import ApiReferencePanel from "../components/ApiReferencePanel";
import ArchitecturePanel from "../components/ArchitecturePanel";
import ErrorBoundary from "../components/common/ErrorBoundary";
import { ExternalIcon } from "../components/ui/icons";
import { API } from "../lib/api";

const LINK = "inline-flex items-center gap-1 text-accent hover:underline underline-offset-2";

const About = () => (
  <Panel title="About">
    <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
      <p>
        A <a className={LINK} href="https://github.com/cowrie/cowrie" target="_blank" rel="noreferrer">Cowrie</a>{" "}
        honeypot has been running on a Raspberry Pi on a Finnish consumer connection since November 2025. It
        pretends to be a poorly secured Linux server; bots log in, run commands and drop malware, and every event is
        forwarded here.
      </p>
      <p>
        Commands are normalised into templates and tagged with MITRE ATT&amp;CK techniques server-side, samples are
        enriched from VirusTotal, and source addresses are geolocated. <em>Hunajapannu</em> is Finnish for honeypot.
      </p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
        <a className={LINK} href="https://github.com/OskariKosonen/hunajapannu" target="_blank" rel="noreferrer">
          Source on GitHub <ExternalIcon size={12} />
        </a>
        <a
          className={LINK}
          href="https://www.linkedin.com/in/oskari-kosonen-ba2589294/"
          target="_blank"
          rel="noreferrer"
        >
          Oskari Kosonen on LinkedIn <ExternalIcon size={12} />
        </a>
      </div>
    </div>
  </Panel>
);

const DataView = () => (
  <div className="space-y-5 sm:space-y-6">
    <div className="grid gap-5 sm:gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-5 sm:space-y-6 min-w-0">
        <ErrorBoundary name="Export indicators">
          <IocExport endpoint={API.IOCS} />
        </ErrorBoundary>
        <About />
      </div>
      <ErrorBoundary name="Public API">
        <ApiReferencePanel />
      </ErrorBoundary>
    </div>
    <ErrorBoundary name="Architecture">
      <ArchitecturePanel />
    </ErrorBoundary>
  </div>
);

export default memo(DataView);
