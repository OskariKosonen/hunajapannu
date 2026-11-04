import { memo, useCallback, useState } from "react";
import Panel from "./ui/Panel";
import Button from "./ui/Button";
import SegmentedControl from "./ui/SegmentedControl";
import { buttonClass } from "./ui/buttonClass";
import { CheckIcon, CopyIcon, DownloadIcon } from "./ui/icons";

/**
 * Take the indicators away.
 *
 * Plain text for a block list, CSV for a spreadsheet or a ticket, defanged
 * for anywhere a live IP would be clicked, linkified or eaten by a link
 * scanner.
 */

const WINDOWS = [
  { value: "24", label: "24h" },
  { value: "168", label: "7d" },
];

const IocExport = ({ endpoint }) => {
  const [hours, setHours] = useState("24");
  const [copied, setCopied] = useState("");

  const url = useCallback(
    (params) => {
      const q = new URLSearchParams({ hours, ...params });
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

  const copyButton = (id, params, label) => (
    <Button key={id} onClick={() => copy(id, params)}>
      {copied === id ? <CheckIcon size={13} className="text-accent" /> : <CopyIcon size={13} />}
      {copied === id ? "Copied" : label}
    </Button>
  );

  const download = (params, label) => (
    <a key={`${params.type || "ips"}-${label}`} className={buttonClass({ variant: "ghost" })} href={url(params)} download>
      <DownloadIcon size={13} />
      {label}
    </a>
  );

  // Commands are behavioural rather than atomic — you grep for these, you do
  // not block them — but they are what people most often want to take away.
  // Defanging rewrites any payload URL inside the command, so a wget line
  // survives being pasted into a ticket.
  const rows = [
    {
      title: "Attacker IPs",
      detail: "Source addresses seen in the window, one per line.",
      actions: (
        <>
          {copyButton("ips", {}, "Copy IPs")}
          {copyButton("defanged", { defang: "1" }, "Copy defanged IPs")}
          {download({ format: "csv" }, "CSV")}
          {download({ format: "txt" }, ".txt")}
        </>
      ),
    },
    {
      title: "Attacker commands",
      detail: "Distinct commands run after login.",
      actions: (
        <>
          {copyButton("commands", { type: "commands" }, "Copy commands")}
          {copyButton("commands-defanged", { type: "commands", defang: "1" }, "Copy defanged commands")}
          {download({ type: "commands", format: "csv" }, "CSV")}
          {download({ type: "commands", format: "txt" }, ".txt")}
        </>
      ),
    },
    {
      title: "Malware hashes",
      detail: "SHA-256 of captured files.",
      actions: (
        <>
          {copyButton("hashes", { type: "hashes" }, "Copy SHA-256")}
          {download({ type: "hashes", format: "csv" }, "CSV")}
        </>
      ),
    },
  ];

  return (
    <Panel
      title="Export indicators"
      description="Indicators of compromise for a block list, a SIEM or a ticket."
      actions={<SegmentedControl label="Time window" options={WINDOWS} value={hours} onChange={setHours} />}
      flush
      footer={
        <>
          Defanged output writes <code className="font-mono text-fg-muted">1.2.3[.]4</code>, so indicators survive
          being pasted into a ticket or chat without becoming a live link. Downloads carry a comment header with the
          window and generation time. Served by <code className="font-mono text-fg-muted">/api/public/cowrie/iocs</code>,
          no key required.
        </>
      }
    >
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.title} className="flex flex-col gap-2.5 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">{r.title}</div>
              <div className="text-xs text-fg-subtle">{r.detail}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">{r.actions}</div>
          </li>
        ))}
      </ul>
      {copied === "failed" && (
        <p role="alert" className="px-4 pb-3 sm:px-5 text-sm text-danger">
          Could not copy. The download links still work.
        </p>
      )}
    </Panel>
  );
};

export default memo(IocExport);
