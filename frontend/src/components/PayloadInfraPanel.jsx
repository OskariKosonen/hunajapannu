import { memo } from "react";
import LoadingSkeleton from "./common/LoadingSkeleton";
import ScrollShadow from "./common/ScrollShadow";
import { defangUrl } from "../lib/defang";

/**
 * The machines serving the second stage.
 *
 * Attackers who get a shell almost always fetch something, and the URL is
 * sitting in plain text in the captured commands — where it was rendered as
 * part of a command string and nothing more. This is the same data read as
 * infrastructure: which host, whose network, how many payloads.
 *
 * URLs are defanged on display. These are live malware URLs; rendering them
 * clickable on a page a security person might have open at work would be a
 * poor thing to do.
 */

// defangUrl lives in lib/defang.js: a component file that also exports a
// helper breaks fast refresh, and the helper is shared with the IOC export.

/** Cloud providers are worth calling out: hosting here defeats IP reputation. */
const CLOUD = /google|amazon|aws|azure|microsoft|digitalocean|oracle|linode|vultr|hetzner|ovh/i;

const PayloadInfraPanel = ({ hosts, error, loading, total, formatNumber, formatDate }) => (
  <section className="relative overflow-hidden border border-emerald-700/50 rounded-xl bg-slate-950/70 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-sm min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-950/70 border-b border-emerald-800/60">
      <span className="text-[0.68rem] uppercase tracking-[0.18em] px-2 py-1 rounded-full border border-emerald-600/60 text-emerald-200 bg-emerald-500/5">
        Payload hosts
      </span>
      {total > 0 && (
        <span className="text-[0.62rem] text-emerald-500">
          {formatNumber(total)} serving second stages
        </span>
      )}
    </div>

    <div className="p-4 sm:p-5 text-[0.72rem] sm:text-[0.78rem] leading-tight">
      {error && hosts.length === 0 && (
        <div className="text-[0.6rem] text-red-400 border border-red-500/50 rounded px-2 py-1 mb-2">
          Failed to load payload hosts: {error}
        </div>
      )}

      {loading && hosts.length === 0 ? (
        <LoadingSkeleton />
      ) : hosts.length === 0 ? (
        !error && (
          <div className="text-[0.6rem] text-emerald-500">
            No download URLs captured yet.
          </div>
        )
      ) : (
        <ScrollShadow className="max-h-[20rem] overflow-y-auto space-y-2">
          <div className="space-y-2 pr-1">
            {hosts.map((h) => {
              const cloud = CLOUD.test(h.org || "");
              return (
                <div
                  key={h.host}
                  className="border border-emerald-800/70 rounded-lg bg-slate-950/85 p-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-emerald-100 text-[0.8rem] break-all">
                        {defangUrl(h.host)}
                      </div>
                      <div className="text-[0.62rem] text-emerald-500 truncate">
                        {[h.asn ? `AS${h.asn}` : null, h.org, h.country_iso]
                          .filter(Boolean)
                          .join(" · ") || (h.is_ip ? "unattributed" : "hostname")}
                      </div>
                    </div>
                    {h.is_ip && (
                      <a
                        href={`https://www.virustotal.com/gui/ip-address/${h.host}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[0.6rem] px-2 py-0.5 rounded-md border border-emerald-700/70 text-emerald-400 hover:border-emerald-500 hover:text-emerald-200 transition"
                      >
                        VT ↗
                      </a>
                    )}
                  </div>

                  {cloud && (
                    <div className="text-[0.6rem] text-amber-300/90 border border-amber-500/40 bg-amber-500/5 rounded px-1.5 py-0.5 inline-block">
                      hosted on commercial cloud — IP reputation will not flag this
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.65rem] text-emerald-300">
                    <span>
                      <span className="text-emerald-600">payloads </span>
                      <span className="tabular-nums">{formatNumber(h.url_count)}</span>
                    </span>
                    <span>
                      <span className="text-emerald-600">fetch attempts </span>
                      <span className="tabular-nums">{formatNumber(h.attempts)}</span>
                    </span>
                    {h.first_seen && (
                      <span className="text-emerald-600">since {formatDate(h.first_seen)}</span>
                    )}
                  </div>

                  <details className="text-[0.62rem]">
                    <summary className="cursor-pointer text-emerald-600 hover:text-emerald-400">
                      show URLs
                    </summary>
                    <ul className="mt-1 space-y-0.5 font-mono text-emerald-400">
                      {h.urls.map((u) => (
                        <li key={u} className="break-all">
                          {defangUrl(u)}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              );
            })}
          </div>
        </ScrollShadow>
      )}

      <p className="text-[0.68rem] text-emerald-400 mt-2">
        /api/public/cowrie/payload-hosts
        <span className="text-emerald-600"> · URLs defanged; export via /iocs?type=urls</span>
      </p>
    </div>
  </section>
);

export default memo(PayloadInfraPanel);
