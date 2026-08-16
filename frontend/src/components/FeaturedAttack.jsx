import { memo, useEffect, useMemo, useRef, useState } from "react";

/**
 * Replays one real attacker session as a terminal.
 *
 * Every other panel on this page is a count. This is the thing the counts are
 * counting: somebody guessed a password, looked around, pulled a binary down
 * and tried to clean up after themselves. Commands appear in the order they
 * were actually run, typed out, with each MITRE technique lighting up as the
 * command that triggers it lands.
 *
 * The timing is compressed rather than real: gaps between commands range from
 * milliseconds to minutes, and a faithful replay would mostly be a still
 * image. The elapsed clock shows the true offset so the real pace is still
 * legible.
 */

// Real gap -> replay gap. Long pauses collapse, but ordering and the sense of
// "thinking, then acting" survive.
const gapFor = (ms) => Math.min(Math.max(Math.sqrt(Math.max(ms, 0)) * 14, 260), 1500);

const relativeTime = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "+0.0s";
  if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  return `+${m}m${Math.round((ms % 60_000) / 1000)}s`;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FeaturedAttack = ({ data, loading, error, mitreById, countryFlag, onOpenFull }) => {
  const session = data?.session;

  // One display line per event, precomputed so the replay loop only advances
  // an index rather than reformatting on every tick.
  const lines = useMemo(() => {
    if (!data?.events?.length) return [];
    const t0 = new Date(data.events[0].timestamp).getTime();
    return data.events.map((ev, i) => {
      const at = new Date(ev.timestamp).getTime();
      const prev = i === 0 ? at : new Date(data.events[i - 1].timestamp).getTime();
      const kind = ev.command ? "command" : ev.username ? "login" : "connect";
      return {
        kind,
        offset: at - t0,
        gap: at - prev,
        tags: ev.tags || [],
        text:
          kind === "command"
            ? ev.command
            : kind === "login"
              ? `${ev.username} / ${ev.password ?? ""}`
              : "connection opened",
      };
    });
  }, [data]);

  // Reduced motion is a one-time read: the whole session renders at once and
  // the loop below never starts. The parent keys this component by session id,
  // so a new session remounts it rather than needing a reset effect.
  const [reduced] = useState(() => prefersReducedMotion());
  const [rawStep, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const scrollRef = useRef(null);

  const step = reduced ? lines.length : rawStep;

  useEffect(() => {
    if (reduced || !playing || lines.length === 0 || step >= lines.length) return;

    const line = lines[step];
    // Commands type out; connect/login lines land whole.
    if (line.kind === "command" && typed < line.text.length) {
      // Long one-liner droppers would take forever at a fixed rate, so the
      // per-character delay shrinks as the command grows.
      const perChar = Math.min(Math.max(700 / line.text.length, 6), 26);
      const id = setTimeout(() => setTyped((t) => t + 1), perChar);
      return () => clearTimeout(id);
    }
    const id = setTimeout(
      () => {
        setStep((s) => s + 1);
        setTyped(0);
      },
      step === 0 ? 400 : gapFor(line.gap)
    );
    return () => clearTimeout(id);
  }, [playing, step, typed, lines, reduced]);

  // Keep the newest line in view without yanking the whole page around.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step, typed]);

  if (loading && !data) {
    return (
      <section className="border border-emerald-700/50 rounded-xl bg-slate-950/70 p-5">
        <div className="flex items-center gap-2 text-[0.7rem] text-emerald-500">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400" />
          Loading a captured session…
        </div>
      </section>
    );
  }

  // A quiet week (404) is not worth an error box; just stand down.
  if (error || !session || lines.length === 0) return null;

  const visible = lines.slice(0, Math.min(step + 1, lines.length));
  const done = step >= lines.length;
  const commandCount = lines.filter((l) => l.kind === "command").length;
  const techniques = [...new Set(lines.flatMap((l) => l.tags))];
  // Techniques already revealed at this point in the replay.
  const seen = new Set(visible.flatMap((l, i) => (i < step ? l.tags : typed > 0 ? l.tags : [])));

  return (
    <section className="relative overflow-hidden border border-emerald-600/60 rounded-xl bg-gradient-to-br from-slate-950 via-emerald-950/25 to-black shadow-[0_10px_35px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-emerald-800/60 bg-black/40">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-400">
            Anatomy of an attack
          </p>
          <h2 className="text-base sm:text-lg font-semibold text-green-200 truncate">
            {countryFlag ? `${countryFlag(session.country_iso)} ` : ""}
            {session.src_ip}
            <span className="text-emerald-500 font-normal text-[0.8rem]">
              {session.org ? ` · ${session.org}` : ""}
              {session.city ? ` · ${session.city}` : ""}
            </span>
          </h2>
          <p className="text-[0.65rem] text-emerald-500 mt-0.5">
            {commandCount} commands over {relativeTime(lines[lines.length - 1].offset).slice(1)} —
            replayed at the pace it happened
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (done) {
                setStep(0);
                setTyped(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
            className="px-2.5 py-1 rounded-md border border-emerald-700/70 text-emerald-300 hover:border-emerald-500 hover:text-emerald-100 transition text-[0.68rem] w-[4.6rem]"
          >
            {done ? "↻ Replay" : playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          {onOpenFull && (
            <button
              type="button"
              onClick={() => onOpenFull(session.session_id)}
              className="px-2.5 py-1 rounded-md border border-emerald-700/70 text-emerald-300 hover:border-emerald-500 hover:text-emerald-100 transition text-[0.68rem]"
            >
              Full timeline
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="p-4 sm:p-5 font-mono text-[0.72rem] sm:text-[0.78rem] leading-relaxed h-[15rem] sm:h-[17rem] overflow-y-auto custom-scrollbar"
      >
        {visible.map((line, i) => {
          const isCurrent = i === step && !done;
          const shown =
            isCurrent && line.kind === "command" ? line.text.slice(0, typed) : line.text;
          return (
            <div key={i} className="flex gap-2 sm:gap-3">
              <span className="text-emerald-800 tabular-nums shrink-0 hidden sm:inline">
                {relativeTime(line.offset)}
              </span>
              <span className="min-w-0 break-all">
                {line.kind === "connect" && (
                  <span className="text-emerald-600">— {shown} —</span>
                )}
                {line.kind === "login" && (
                  <>
                    <span className="text-emerald-600">login </span>
                    <span className="text-red-400">{shown}</span>
                  </>
                )}
                {line.kind === "command" && (
                  <>
                    <span className="text-green-500">$ </span>
                    <span className="text-emerald-100">{shown}</span>
                    {isCurrent && (
                      <span className="inline-block w-[0.5em] h-[1em] align-text-bottom bg-emerald-400 animate-pulse ml-0.5" />
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
        {done && (
          <div className="text-emerald-700 mt-2">
            — session ended after {relativeTime(lines[lines.length - 1].offset).slice(1)} —
          </div>
        )}
      </div>

      {techniques.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 py-3 border-t border-emerald-800/60 bg-black/30">
          <span className="text-[0.6rem] uppercase tracking-[0.15em] text-emerald-500 mr-1">
            Techniques
          </span>
          {techniques.map((id) => {
            const t = mitreById?.[id];
            const lit = seen.has(id);
            return (
              <span
                key={id}
                title={t?.name || id}
                className={`text-[0.6rem] px-2 py-0.5 rounded-full border transition-colors duration-300 ${
                  lit
                    ? "border-emerald-400/70 text-emerald-200 bg-emerald-500/15"
                    : "border-emerald-900/70 text-emerald-800"
                }`}
              >
                {t?.name || id}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default memo(FeaturedAttack);
