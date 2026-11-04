import { cx } from "../../lib/cx";

/**
 * A small set of mutually exclusive options. Buttons with aria-pressed rather
 * than radios, so each option can carry extra content (a count, an error mark).
 *
 * @param {Array<{value: string, label: React.ReactNode, title?: string}>} options
 */
const SegmentedControl = ({ options, value, onChange, label, size = "sm", className = "" }) => (
  <div
    role="group"
    aria-label={label}
    className={cx("inline-flex items-center rounded-md border border-line bg-surface-2 p-0.5", className)}
  >
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          aria-pressed={active}
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cx(
            "inline-flex items-center gap-1 rounded px-2.5 whitespace-nowrap transition-colors",
            size === "sm" ? "h-6 text-xs" : "h-8 text-sm",
            active ? "bg-surface-3 text-fg shadow-sm" : "text-fg-muted hover:text-fg"
          )}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;
