import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import TechniqueBadge from "./TechniqueBadge";
import { Skeleton } from "./ui/states";
import { ChevronDownIcon, ChevronRightIcon, PauseIcon, PlayIcon, ReplayIcon, SkipIcon, TimelineIcon } from "./ui/icons";
import { countryFlag, networkLabel } from "../lib/format";

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
 *
 * It animates once per featured session, then stops. A typing animation is
 * good the first time and an obstacle every time after: on a repeat visit you
 * already know the story and just want to read it. The session id is recorded
 * in localStorage on first view, so a first-time visitor gets the animation,
 * anyone coming back gets the finished transcript immediately, and a genuinely
 * new featured session animates once more. Replay is always one click away,
 * and playback can be skipped rather than only paused.
 *
 * That same record also collapses the panel on a return visit. This is the
 * tallest thing on the page, and a viewer who has already read it should not
 * have to scroll past it to reach the panels underneath. It folds down to its
 * header, one click reopens it, and a genuinely new featured session arrives
 * expanded like any first view.
 */

const SEEN_KEY = "hunajapannu:replayed-session";

const hasSeen = (sessionId) => {
  try {
    return window.localStorage.getItem(SEEN_KEY) === sessionId;
  } catch {
    // Private mode, disabled storage: fall back to animating. Better to
    // over-play than to throw.
    return false;
  }
};

const markSeen = (sessionId) => {
  try {
    window.localStorage.setItem(SEEN_KEY, sessionId);
  } catch {
    /* ignore */
  }
};

// Real gap -> replay gap. Long pauses collapse, but ordering and the sense of
// "thinking, then acting" survive.
const gapFor = (ms) => Math.min(Math.max(Math.sqrt(Math.max(ms, 0)) * 14, 260), 1500);

// Droppers often push a whole binary through `echo` as one base64 line. Left
// whole, a single command filled the transcript and the rest of the
// session scrolled out of sight. Long commands show their opening, which is
// where the intent is, and say how much was left out. The full text is on hover.
const MAX_COMMAND_CHARS = 180;

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

const FeaturedAttack = ({ data, loading, error, mitreById, onOpenFull, className = "" }) => {
  const session = data?.session;

  // One display line per event, precomputed so the replay loop only advances
  // an index rather than reformatting on every tick.
  const lines = useMemo(() => {
    if (!data?.events?.length) return [];

    // Collapse exact duplicates — same instant, same content. Some historical
    // sessions were ingested more than once (one from 2026-08-09 holds twelve
    // identical copies of every event), and replaying "cd ~; chattr -ia .ssh"
    // twelve times in a row reads as a broken page rather than an attack. A
    // genuine re-run of the same command has a different timestamp and is
    // kept.
    const seenEvent = new Set();
    const events = data.events.filter((ev) => {
      const key = `${ev.timestamp}|${ev.command ?? ""}|${ev.username ?? ""}|${ev.password ?? ""}`;
      if (seenEvent.has(key)) return false;
      seenEvent.add(key);
      return true;
    });

    const t0 = new Date(events[0].timestamp).getTime();
    return events.map((ev, i) => {
      const at = new Date(ev.timestamp).getTime();
      const prev = i === 0 ? at : new Date(events[i - 1].timestamp).getTime();
      const kind = ev.command ? "command" : ev.username ? "login" : "connect";
      const full =
        kind === "command"
          ? ev.command
          : kind === "login"
            ? `${ev.username} / ${ev.password ?? ""}`
            : "connection opened";
      const clamp = kind === "command" && full.length > MAX_COMMAND_CHARS;
      return {
        kind,
        offset: at - t0,
        gap: at - prev,
        tags: ev.tags || [],
        full,
        text: clamp ? full.slice(0, MAX_COMMAND_CHARS) : full,
        omitted: clamp ? full.length - MAX_COMMAND_CHARS : 0,
      };
    });
  }, [data]);

  // Both decisions come out of a single localStorage read, taken before
  // markSeen overwrites it: whether to animate, and whether to open collapsed.
  // Recorded on view rather than when playback finishes — a viewer who left
  // early has still seen it, and marking on view rather than on play is what
  // lets a reduced-motion visitor, who never animates, still be recognised
  // when they come back.
  const [{ autoplay, seenBefore }] = useState(() => {
    const id = data?.session?.session_id;
    if (!id) return { autoplay: false, seenBefore: false };
    const seen = hasSeen(id);
    markSeen(id);
    return { autoplay: !seen && !prefersReducedMotion(), seenBefore: seen };
  });

  const [collapsed, setCollapsed] = useState(seenBefore);
  const bodyId = useId();
  const [rawStep, setStep] = useState(() => (autoplay ? 0 : Number.MAX_SAFE_INTEGER));
  const [typed, setTyped] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const scrollRef = useRef(null);

  // Clamp here rather than tracking lines.length in state.
  const step = Math.min(rawStep, lines.length);

  useEffect(() => {
    if (!playing || lines.length === 0 || step >= lines.length) return;

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
  }, [playing, step, typed, lines]);

  // Keep the newest line in view without yanking the whole page around.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step, typed]);

  if (loading && !data) {
    return (
      <section className={`rounded-lg border border-line bg-surface p-5 ${className}`} aria-label="Featured session">
        <Skeleton rows={6} />
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
  const duration = relativeTime(lines[lines.length - 1].offset).slice(1);

  return (
    // Expanded, it stretches to the height of whatever shares its row (the
    // live feed on the overview) and the transcript takes up the slack.
    // Collapsed, it keeps to its header instead of stretching into an empty
    // box.
    <section
      className={`flex flex-col min-w-0 rounded-lg border border-line bg-surface ${
        collapsed ? "self-start" : ""
      } ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5 pb-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="accent">Featured session</Badge>
            <span className="text-xs text-fg-subtle">Busiest of the past week</span>
          </div>
          <h2 className="mt-2 flex items-center gap-2 text-base font-semibold text-fg min-w-0">
            <span aria-hidden="true">{countryFlag(session.country_iso)}</span>
            <span className="font-mono text-info">{session.src_ip}</span>
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted truncate">
            {networkLabel(session)}
            {session.city ? ` · ${session.city}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {commandCount} {commandCount === 1 ? "command" : "commands"} over {duration}, replayed in
            order
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!collapsed && (
            <>
              <Button
                className="w-[5.5rem]"
                onClick={() => {
                  if (done) {
                    setStep(0);
                    setTyped(0);
                    setPlaying(true);
                  } else {
                    setPlaying((p) => !p);
                  }
                }}
              >
                {done ? <ReplayIcon size={13} /> : playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                {done ? "Replay" : playing ? "Pause" : "Play"}
              </Button>
              {!done && (
                <Button
                  onClick={() => {
                    setPlaying(false);
                    setStep(lines.length);
                    setTyped(0);
                  }}
                >
                  <SkipIcon size={13} />
                  Skip
                </Button>
              )}
            </>
          )}
          {onOpenFull && (
            <Button onClick={() => onOpenFull(session.session_id)}>
              <TimelineIcon size={13} />
              Full timeline
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              // Stop playback on the way down, or the replay keeps ticking
              // behind a closed panel and is half over when it is reopened.
              if (!collapsed) setPlaying(false);
              setCollapsed((c) => !c);
            }}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
          >
            {collapsed ? <ChevronRightIcon size={13} /> : <ChevronDownIcon size={13} />}
            {collapsed ? "Show" : "Hide"}
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        id={bodyId}
        hidden={collapsed}
        className="mx-4 mb-4 sm:mx-5 h-[16rem] xl:h-auto xl:min-h-[14rem] xl:flex-1 xl:basis-0 overflow-y-auto custom-scrollbar fade-scroll-top rounded-md border border-line bg-canvas px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed"
      >
        {visible.map((line, i) => {
          const isCurrent = i === step && !done;
          const shown =
            isCurrent && line.kind === "command" ? line.text.slice(0, typed) : line.text;
          return (
            <div key={i} className="flex gap-3">
              <span className="text-fg-subtle/70 tabular-nums shrink-0 hidden sm:inline w-14 text-right">
                {relativeTime(line.offset)}
              </span>
              <span className="min-w-0 break-all">
                {line.kind === "connect" && <span className="text-fg-subtle">{shown}</span>}
                {line.kind === "login" && (
                  <>
                    <span className="text-fg-subtle">login </span>
                    <span className="text-danger">{shown}</span>
                  </>
                )}
                {line.kind === "command" && (
                  <>
                    <span className="text-accent">$ </span>
                    <span className="text-fg" title={line.omitted ? line.full : undefined}>
                      {shown}
                    </span>
                    {line.omitted > 0 && (!isCurrent || typed >= line.text.length) && (
                      <span className="text-fg-subtle"> … +{line.omitted.toLocaleString("en-GB")} characters</span>
                    )}
                    {isCurrent && (
                      <span className="inline-block w-[0.5em] h-[1em] align-text-bottom bg-accent animate-pulse ml-0.5" />
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
        {done && (
          <div className="text-fg-subtle mt-2">session ended after {duration}</div>
        )}
      </div>

      {!collapsed && techniques.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-3 sm:px-5">
          <span className="text-xs text-fg-subtle mr-1">Techniques</span>
          {techniques.map((id) => (
            <TechniqueBadge
              key={id}
              id={id}
              technique={mitreById?.[id] ? { name: mitreById[id].name } : undefined}
              active={seen.has(id)}
              dim={!seen.has(id)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default memo(FeaturedAttack);
