import { memo, useState } from "react";

/**
 * The story, for someone who has thirty seconds and will not read code.
 *
 * Everything here is a fact about this system that is otherwise only visible
 * in commit messages or by reading the source — neither of which a recruiter
 * scanning a page will do. Collapsed by default so it never competes with the
 * live data; the summary line alone carries the headline.
 *
 * Numbers are hardcoded because they describe engineering decisions, not live
 * data. If they stop being true, they are wrong on the page — so keep them
 * few, and keep them checkable.
 */

const NOTES = [
  {
    title: "Trigger-maintained aggregates",
    body:
      "Leaderboards used to run unbounded GROUP BY scans over 7.7M events and starved the " +
      "connection pool — two slow queries took the whole API down. Aggregates are now kept " +
      "current by Postgres triggers. /summary went from 51s to 0.10s.",
  },
  {
    title: "k-anonymous password lookup",
    body:
      "The password check hashes in the browser and sends 3 hex characters, never the password. " +
      "3 rather than HIBP's 5 because the prefix has to be sized to the corpus: at 5 chars this " +
      "dataset returned exactly one hash — the caller's own — which is no anonymity at all.",
  },
  {
    title: "Server-side filtering and paging",
    body:
      "The dashboard used to pull ~894 KB of JSON every refresh to render panels showing a " +
      "scrollable window, and tagged 3,000 commands with 40 regexes in every browser. Filtering, " +
      "paging and ATT&CK tagging moved to the API: ~19 KB per refresh.",
  },
  {
    title: "Migrations with a ledger",
    body:
      "Every deploy used to replay every migration and swallow failures with `|| echo`. One " +
      "aborted mid-way and the deploy went green while an aggregate table sat empty for days. " +
      "Migrations now run once, are recorded with a checksum, and a failure fails the deploy.",
  },
  {
    title: "Deploys that undo themselves",
    body:
      "The deploy records the running commit before it resets, and restores it if the backend " +
      "fails its health check — or if a migration fails before pm2 has restarted, so the working " +
      "tree never drifts from what is actually serving.",
  },
  {
    title: "Ingestion that reports on itself",
    body:
      "The feed once died for four days while the API, database and both sensor services all " +
      "looked healthy. /health now reports how stale ingestion is and whether event timestamps " +
      "are ahead of our clock — a sensor in the wrong timezone otherwise looks like very fresh data.",
  },
];

const STACK = [
  "React 19", "Vite", "Tailwind", "Express 5", "Postgres 16",
  "Python forwarder", "GitHub Actions", "pm2 + nginx",
];

const EngineeringNotes = () => {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-emerald-800/50 rounded-xl bg-slate-950/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 text-left hover:bg-emerald-950/20 transition-colors rounded-xl"
      >
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-400">
            How it is built
          </p>
          <p className="text-[0.78rem] text-emerald-200">
            Raspberry Pi sensor → Python forwarder → Express API → Postgres 16 → React.{" "}
            <span className="text-emerald-500">
              113 tests · 66 live CI assertions · auto-rollback deploys
            </span>
          </p>
        </div>
        <span className="text-emerald-500 text-[0.7rem] shrink-0">
          {open ? "hide ▲" : "details ▼"}
        </span>
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {NOTES.map((n) => (
              <div
                key={n.title}
                className="border border-emerald-900/70 rounded-lg p-3 bg-black/30"
              >
                <p className="text-[0.72rem] font-semibold text-emerald-200">{n.title}</p>
                <p className="mt-1 text-[0.65rem] text-emerald-500 leading-relaxed">{n.body}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.6rem] uppercase tracking-[0.15em] text-emerald-600 mr-1">
              Stack
            </span>
            {STACK.map((t) => (
              <span
                key={t}
                className="text-[0.6rem] px-2 py-0.5 rounded-full border border-emerald-900/70 text-emerald-500"
              >
                {t}
              </span>
            ))}
          </div>

          <p className="text-[0.6rem] text-emerald-700">
            Sensor is a Raspberry Pi on Finnish consumer broadband, deliberately exposed. The
            database and API run on a separate VPS, so a compromised sensor cannot reach the data.
          </p>
        </div>
      )}
    </section>
  );
};

export default memo(EngineeringNotes);
