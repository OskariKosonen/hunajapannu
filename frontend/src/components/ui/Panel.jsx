import { cx } from "../../lib/cx";
import { ArrowRightIcon } from "./icons";

/**
 * The card every panel sits in: a titled header with room for context and
 * controls, then the body.
 *
 * @param {React.ReactNode} title        Rendered as the panel's <h2>.
 * @param {React.ReactNode} [description] One line under the title.
 * @param {React.ReactNode} [meta]        Small right-aligned context ("Last 24 hours").
 * @param {React.ReactNode} [actions]     Controls on the right of the header.
 * @param {React.ReactNode} [toolbar]     A row between header and body (search, filters).
 * @param {React.ReactNode} [footer]      Small print under the body.
 * @param {boolean} [flush]               Body without padding, for edge-to-edge tables.
 * @param {function} [onOpen]             Shows a → in the header that drills into the full view.
 * @param {string} [openLabel]            Accessible name for that →.
 */
const Panel = ({
  title,
  description,
  meta,
  actions,
  toolbar,
  footer,
  flush = false,
  onOpen,
  openLabel,
  className = "",
  bodyClassName = "",
  children,
  ...rest
}) => (
  <section
    className={cx("flex flex-col min-w-0 rounded-lg border border-line bg-surface", className)}
    {...rest}
  >
    {(title || actions || meta || onOpen) && (
      // Title and controls share one row; the description runs full width
      // underneath, so a long explanation never squeezes into the gap left
      // beside the controls.
      <header className="px-4 pt-3.5 pb-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="min-w-0 text-base font-semibold text-fg">{title}</h2>}
          {(meta || actions || onOpen) && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {meta && <span className="text-xs text-fg-subtle whitespace-nowrap tabular-nums">{meta}</span>}
              {actions}
              {onOpen && (
                <button
                  type="button"
                  onClick={onOpen}
                  aria-label={openLabel || "Open full view"}
                  title={openLabel || "Open full view"}
                  className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg transition-colors"
                >
                  <ArrowRightIcon size={16} />
                </button>
              )}
            </div>
          )}
        </div>
        {description && <p className="mt-1 max-w-4xl text-sm text-fg-muted">{description}</p>}
      </header>
    )}
    {toolbar && <div className="px-4 pb-3 sm:px-5 space-y-3">{toolbar}</div>}
    <div
      className={cx(
        "flex-1 min-h-0",
        flush ? "border-t border-line" : "px-4 pb-4 sm:px-5 sm:pb-5",
        bodyClassName
      )}
    >
      {children}
    </div>
    {footer && (
      <footer className="border-t border-line px-4 py-2.5 sm:px-5 text-xs text-fg-subtle">{footer}</footer>
    )}
  </section>
);

export default Panel;
