import { memo, useEffect, useRef } from "react";
import LoadingSkeleton from "./common/LoadingSkeleton";

/** Classifies an event so the timeline can show what kind of step it was. */
function describe(ev) {
  if (ev.command) return { kind: "command", label: "cmd", text: ev.command };
  if (ev.username || ev.password) {
    return {
      kind: "login",
      label: "login",
      text: `${ev.username || "∅"} / ${ev.password || "∅"}`,
    };
  }
  return { kind: "connect", label: "conn", text: "session opened" };
}

const KIND_STYLES = {
  command: "border-cyan-400/60 text-cyan-100 bg-cyan-500/10",
  login: "border-amber-400/60 text-amber-100 bg-amber-500/10",
  connect: "border-emerald-400/60 text-emerald-100 bg-emerald-500/10",
};

/**
 * Full timeline for one session: connect, credentials tried, commands run —
 * in order, with the MITRE techniques each command matched.
 */
const SessionDrawer = ({
  data,
  loading,
  error,
  onClose,
  formatTimestamp,
  formatDuration,
  countryFlag,
  mitreById,
}) => {
  const session = data?.session || {};
  const events = data?.events || [];
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // A modal that opens without moving focus leaves keyboard and screen-reader
  // users still on the page behind it. Move focus in on open, keep Tab inside
  // while it is open, and hand focus back to whatever opened it on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // The page behind must not scroll under the open drawer.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1100] flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className="w-full sm:max-w-2xl h-full bg-slate-950 border-l border-emerald-700/60 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Session timeline"
      >
        <header className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3 border-b border-emerald-800/60 bg-slate-950/90">
          <div className="min-w-0">
            <div className="text-[0.68rem] uppercase tracking-[0.18em] text-emerald-400">
              Session timeline
            </div>
            <div className="text-emerald-100 text-sm mt-1 flex items-center gap-2 flex-wrap">
              <span aria-hidden="true">{countryFlag(session.country_iso)}</span>
              <span className="font-semibold">{session.src_ip || "—"}</span>
              <span className="text-[0.65rem] text-emerald-500 font-mono truncate">
                {session.session_id}
              </span>
            </div>
            <div className="text-[0.65rem] text-emerald-500 mt-0.5 truncate">
              {[session.city, session.org, session.asn && `AS${session.asn}`]
                .filter(Boolean)
                .join(" · ") || "—"}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close session timeline"
            className="text-emerald-400 hover:text-emerald-100 border border-emerald-800/70 hover:border-emerald-500/70 rounded-md px-2 py-1 text-[0.75rem] transition shrink-0"
          >
            ✕
          </button>
        </header>

        {!loading && events.length > 0 && (
          <div className="grid grid-cols-3 gap-px bg-emerald-900/40 border-b border-emerald-800/60 text-center">
            {[
              ["Events", session.events ?? events.length],
              ["Duration", formatDuration(session.duration_ms)],
              ["Started", formatTimestamp(session.started_at)],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-950 px-2 py-2">
                <div className="text-[0.58rem] uppercase tracking-[0.14em] text-emerald-500">
                  {label}
                </div>
                <div className="text-[0.72rem] text-emerald-100 mt-0.5 break-words">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-5 py-4">
          {error ? (
            <div className="text-[0.7rem] text-red-400 border border-red-500/50 rounded px-2 py-1">
              Failed to load session: {error}
            </div>
          ) : loading ? (
            <LoadingSkeleton />
          ) : events.length === 0 ? (
            <div className="text-[0.7rem] text-emerald-500">No events in this session.</div>
          ) : (
            <ol className="relative border-l border-emerald-800/70 ml-2 space-y-3">
              {events.map((ev, idx) => {
                const { kind, label, text } = describe(ev);
                return (
                  <li key={`${ev.timestamp}-${idx}`} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-950" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded-full border text-[0.58rem] uppercase tracking-wide ${KIND_STYLES[kind]}`}
                      >
                        {label}
                      </span>
                      <time className="text-[0.62rem] text-emerald-500 font-mono">
                        {formatTimestamp(ev.timestamp)}
                      </time>
                    </div>
                    <div
                      className={`mt-1 text-[0.75rem] break-words whitespace-pre-wrap ${
                        kind === "command" ? "text-emerald-100 font-mono" : "text-emerald-300"
                      }`}
                    >
                      {text}
                    </div>
                    {ev.tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ev.tags.map((id) => {
                          const sig = mitreById[id];
                          return (
                            <span
                              key={id}
                              title={sig?.description}
                              className={`inline-flex px-1.5 py-0.5 rounded-full border text-[0.6rem] ${
                                sig?.badgeColor || "border-emerald-400/60 text-emerald-100 bg-emerald-500/10"
                              }`}
                            >
                              {sig?.name || id}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {session.truncated && (
            <p className="mt-4 text-[0.62rem] text-amber-300/80">
              Timeline truncated — this session has more events than the display limit.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};

export default memo(SessionDrawer);
