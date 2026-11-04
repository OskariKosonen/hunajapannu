import { memo, useEffect, useRef } from "react";
import Badge from "./ui/Badge";
import TechniqueBadge from "./TechniqueBadge";
import { ErrorNotice, Skeleton, EmptyState } from "./ui/states";
import { XIcon } from "./ui/icons";
import { countryFlag, formatDuration, formatTimestamp, networkLabel } from "../lib/format";

/** Classifies an event so the timeline can show what kind of step it was. */
function describe(ev) {
  if (ev.command) return { kind: "command", label: "Command", text: ev.command };
  if (ev.username || ev.password) {
    return {
      kind: "login",
      label: "Login",
      text: `${ev.username || "∅"} / ${ev.password || "∅"}`,
    };
  }
  return { kind: "connect", label: "Connect", text: "session opened" };
}

const KIND_TONE = { command: "accent", login: "danger", connect: "muted" };

/**
 * Full timeline for one session: connect, credentials tried, commands run —
 * in order, with the MITRE techniques each command matched.
 */
const SessionDrawer = ({ data, loading, error, onClose, mitreById = {} }) => {
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

  const facts = [
    ["Events", session.events ?? events.length],
    ["Duration", formatDuration(session.duration_ms)],
    ["Started", formatTimestamp(session.started_at)],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={panelRef}
        className="flex h-full w-full flex-col border-l border-line-strong bg-surface shadow-2xl sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Session timeline"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-fg-subtle">Session timeline</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-fg">
              <span aria-hidden="true">{countryFlag(session.country_iso)}</span>
              <span className="font-mono text-info">{session.src_ip || "—"}</span>
            </div>
            <div className="mt-0.5 text-sm text-fg-muted truncate">
              {[session.city, networkLabel(session)].filter(Boolean).join(" · ")}
            </div>
            {session.session_id && (
              <div className="mt-1 font-mono text-xs text-fg-subtle truncate">{session.session_id}</div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close session timeline"
            className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors shrink-0"
          >
            <XIcon size={18} />
          </button>
        </header>

        {!loading && events.length > 0 && (
          <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
            {facts.map(([label, value]) => (
              <div key={label} className="px-5 py-3">
                <dt className="text-xs text-fg-subtle">{label}</dt>
                <dd className="mt-0.5 text-sm text-fg tabular-nums break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5">
          {error ? (
            <ErrorNotice>Failed to load session: {error}</ErrorNotice>
          ) : loading ? (
            <Skeleton rows={8} />
          ) : events.length === 0 ? (
            <EmptyState title="No events in this session." />
          ) : (
            <ol className="relative ml-1.5 space-y-4 border-l border-line">
              {events.map((ev, idx) => {
                const { kind, label, text } = describe(ev);
                return (
                  <li key={`${ev.timestamp}-${idx}`} className="relative pl-5">
                    <span
                      className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ring-4 ring-surface ${
                        kind === "command" ? "bg-accent" : kind === "login" ? "bg-danger" : "bg-fg-subtle"
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={KIND_TONE[kind]}>{label}</Badge>
                      <time className="text-xs text-fg-subtle tabular-nums">{formatTimestamp(ev.timestamp)}</time>
                    </div>
                    <div
                      className={`mt-1.5 text-sm break-words whitespace-pre-wrap ${
                        kind === "connect" ? "text-fg-subtle" : "font-mono text-fg"
                      }`}
                    >
                      {text}
                    </div>
                    {ev.tags?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ev.tags.map((id) => (
                          <TechniqueBadge key={id} id={id} technique={mitreById[id]} />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {session.truncated && (
            <p className="mt-5 text-xs text-warn">
              Timeline truncated. This session has more events than can be shown.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};

export default memo(SessionDrawer);
