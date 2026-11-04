import { memo, useMemo } from "react";
import Panel from "./ui/Panel";
import ShareBar from "./ui/ShareBar";
import { ErrorNotice, EmptyState, Skeleton } from "./ui/states";
import { formatCompact, formatNumber } from "../lib/format";
import { REMAINDER, SERIES } from "../lib/palette";

/**
 * What the bots guess, across every login attempt rather than the top of the
 * leaderboard: the shape of the password list, and the length that half of
 * all guesses stay under. The categories come from the API and do not
 * overlap, so they add up to the whole.
 */

const KINDS = [
  { key: "same", label: "The username again", hint: "admin / admin" },
  { key: "digits", label: "Digits only", hint: "123456" },
  { key: "letters", label: "Letters only", hint: "password, qwerty" },
  { key: "mixed", label: "A mix", hint: "admin123, P@ssw0rd" },
  { key: "empty", label: "No password", hint: "an empty string", neutral: true },
];

/** The length at which the running total of attempts first reaches half. */
const medianLength = (lengths, attempts) => {
  let running = 0;
  for (const { length, attempts: n } of lengths) {
    running += n;
    if (running * 2 >= attempts) return length;
  }
  return null;
};

const PasswordAnatomy = ({ data, loading, error, className = "" }) => {
  const parts = useMemo(() => {
    if (!data?.kinds) return [];
    let colour = 0;
    return KINDS.map((k) => ({
      key: k.key,
      label: k.label,
      hint: <span className="font-mono">{k.hint}</span>,
      value: data.kinds[k.key] || 0,
      color: k.neutral ? REMAINDER : SERIES[colour++],
    }));
  }, [data]);

  const median = data?.attempts ? medianLength(data.lengths || [], data.attempts) : null;
  const long = data?.attempts
    ? (data.lengths || []).filter((l) => l.length >= 12).reduce((s, l) => s + l.attempts, 0) / data.attempts
    : 0;
  const users = data?.topUsernames ?? [];

  return (
    <Panel
      title="What bots guess"
      meta={data?.attempts ? `${formatCompact(data.attempts)} login attempts` : undefined}
      description="Every password tried here, sorted by its shape."
      className={className}
    >
      {!data?.attempts ? (
        error ? (
          <ErrorNotice>Failed to load: {error}</ErrorNotice>
        ) : loading ? (
          <Skeleton rows={6} />
        ) : (
          <EmptyState title="No login attempts yet." />
        )
      ) : (
        <div className="space-y-5">
          <ShareBar parts={parts} />

          {median != null && (
            <p className="text-sm text-fg-muted">
              Half of all guesses are{" "}
              <span className="font-medium text-fg">
                {median >= 20 ? "20 or more" : median} characters
              </span>{" "}
              or shorter, and{" "}
              <span className="font-medium text-fg">{(long * 100).toFixed(1)}%</span> are 12 or longer.
            </p>
          )}

          {users.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Usernames tried most</h3>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {users.map((u) => (
                  <li key={u.username} className="flex items-baseline justify-between gap-3 min-w-0">
                    <span className="truncate font-mono text-[0.8125rem] text-fg" title={u.username}>
                      {u.username || "(empty)"}
                    </span>
                    <span className="tabular-nums text-xs text-fg-subtle" title={`${formatNumber(u.total)} attempts`}>
                      {((u.total / data.attempts) * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

export default memo(PasswordAnatomy);
