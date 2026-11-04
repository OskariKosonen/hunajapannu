import { cx } from "../../lib/cx";
import { CodeIcon } from "./icons";

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
 */
const Panel = ({
  title,
  description,
  meta,
  actions,
  toolbar,
  footer,
  flush = false,
  className = "",
  bodyClassName = "",
  children,
  ...rest
}) => (
  <section
    className={cx("flex flex-col min-w-0 rounded-lg border border-line bg-surface", className)}
    {...rest}
  >
    {(title || actions || meta) && (
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-3 sm:px-5">
        <div className="min-w-0">
          {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
        {(meta || actions) && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {meta && <span className="text-xs text-fg-subtle whitespace-nowrap tabular-nums">{meta}</span>}
            {actions}
          </div>
        )}
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

/**
 * The panel's data source, one click away. Replaces the "Aggregated from
 * /api/..." footers: the endpoint is still discoverable, and now it opens.
 */
export const ApiLink = ({ href }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    title={`Open ${href} as JSON`}
    className="inline-flex h-6 items-center gap-1 rounded border border-line px-1.5 text-2xs font-medium text-fg-subtle hover:border-line-strong hover:text-fg transition-colors"
  >
    <CodeIcon size={12} />
    API
  </a>
);

export default Panel;
