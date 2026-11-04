import { cx } from "../../lib/cx";

const TONES = {
  neutral: "border-line-strong bg-surface-2 text-fg-muted",
  accent: "border-accent/40 bg-accent/10 text-accent",
  danger: "border-danger/40 bg-danger/10 text-danger",
  warn: "border-warn/40 bg-warn/10 text-warn",
  info: "border-info/40 bg-info/10 text-info",
  muted: "border-line bg-transparent text-fg-subtle",
};

/** Small status/label chip. */
const Badge = ({ tone = "neutral", className = "", children, ...rest }) => (
  <span
    className={cx(
      "inline-flex items-center gap-1 rounded border px-1.5 py-px text-2xs font-medium whitespace-nowrap",
      TONES[tone],
      className
    )}
    {...rest}
  >
    {children}
  </span>
);

export default Badge;
