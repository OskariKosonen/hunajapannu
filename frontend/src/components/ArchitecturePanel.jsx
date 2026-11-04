import { memo } from "react";
import Panel from "./ui/Panel";
import topologySvg from "../assets/topology.svg";

/** The pipeline from the Pi on a home network to this page. */
const ArchitecturePanel = () => (
  <Panel
    title="Architecture"
    description="Cowrie on a Raspberry Pi forwards events to an Express + PostgreSQL API on a VPS, behind nginx and Cloudflare."
  >
    {/* Landscape, 1280x400; scrolls sideways on a phone rather than shrinking
        to an unreadable strip. */}
    <div className="overflow-x-auto custom-scrollbar rounded-md border border-line bg-canvas p-3 sm:p-4">
      <img src={topologySvg} alt="Network topology diagram" className="min-w-[640px] w-full h-auto" />
    </div>
  </Panel>
);

export default memo(ArchitecturePanel);
