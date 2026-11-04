import { cx } from "../../lib/cx";
import { AlertIcon } from "./icons";
import { useApiDown } from "../../hooks/useApiStatus";

/** Placeholder bars while a panel's first response is in flight. */
export const Skeleton = ({ rows = 4, className = "" }) => (
  <div className={cx("space-y-2.5", className)} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <div
        key={i}
        className="h-4 rounded bg-surface-3 animate-pulse"
        style={{ width: `${100 - ((i * 17) % 40)}%` }}
      />
    ))}
  </div>
);

/** Nothing to show, said plainly, with an optional second line. */
export const EmptyState = ({ title, hint, className = "" }) => (
  <div className={cx("py-8 text-center", className)}>
    <p className="text-sm text-fg-muted">{title}</p>
    {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
  </div>
);

/**
 * A failed request. Inline, not a modal: the rest of the page still works.
 * When the whole API is down the shell already says so once, at the top, so
 * each panel stays quiet instead of repeating the error.
 */
export const ErrorNotice = ({ children, className = "" }) => {
  const apiDown = useApiDown();
  if (apiDown) return <p className={cx("text-sm text-fg-subtle", className)}>Not available right now.</p>;
  return (
    <div
      className={cx(
        "flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger",
        className
      )}
    >
      <AlertIcon size={14} className="mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};
