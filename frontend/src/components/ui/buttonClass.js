import { cx } from "../../lib/cx";

const VARIANTS = {
  primary:
    "bg-accent text-accent-fg border-accent hover:bg-accent/90 disabled:hover:bg-accent font-semibold",
  secondary:
    "bg-surface-2 text-fg border-line-strong hover:bg-surface-3 hover:border-fg-subtle/60",
  ghost: "bg-transparent text-fg-muted border-transparent hover:bg-surface-2 hover:text-fg",
};

const SIZES = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

const base =
  "inline-flex items-center justify-center rounded-md border whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

/** Button classes, shared by <Button> and by links that should look like one. */
export const buttonClass = ({ variant = "secondary", size = "sm", className = "" } = {}) =>
  cx(base, VARIANTS[variant], SIZES[size], className);
