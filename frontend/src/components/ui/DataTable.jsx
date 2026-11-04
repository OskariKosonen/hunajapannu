import { memo } from "react";
import { cx } from "../../lib/cx";
import { useMediaQuery } from "../../hooks/useApi";
import { EmptyState, ErrorNotice, Skeleton } from "./states";

/**
 * The one table. Sticky header, numbers right-aligned in tabular figures,
 * optional click-through rows, and its own loading, empty and error states.
 *
 * Below the md breakpoint the same column config renders as stacked cards: a
 * five-column nowrap table on a 390px phone is a side-scrolling strip, and the
 * site is mostly opened from LinkedIn, i.e. on a phone.
 *
 * @param {Array<{
 *   key: string,
 *   header: React.ReactNode,
 *   align?: "left"|"right",
 *   mono?: boolean,
 *   nowrap?: boolean,
 *   className?: string,
 *   headerClassName?: string,
 *   render?: (row: any, index: number) => React.ReactNode,
 *   width?: string,         // fixes the column width (switches to table-layout: fixed)
 *   primary?: boolean,      // the card's headline on mobile
 *   hideOnMobile?: boolean,
 * }>} columns
 * @param {(row: any) => React.ReactNode} [renderCard]  Replaces the generic
 *   label/value card on mobile, for rows that read better as a sentence.
 * @param {string} [maxHeight]  Scroll inside the table past this height.
 *   "none" lets the table run the page's length instead, with its header
 *   sticking under the top bar: a scroll box inside a scrolling page is
 *   easy to get stuck in.
 */
const DataTable = ({
  columns,
  rows,
  rowKey,
  loading = false,
  error = "",
  errorLabel = "Failed to load",
  emptyTitle = "No data yet.",
  emptyHint,
  onRowClick,
  rowLabel,
  rowClassName,
  maxHeight = "28rem",
  renderCard,
  skeletonRows = 6,
  className = "",
}) => {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const scrolls = maxHeight !== "none";
  const keyOf = (row, i) => (rowKey ? rowKey(row, i) : i);
  const cell = (col, row, i) => (col.render ? col.render(row, i) : row[col.key] ?? "—");

  // Cards are plain divs, so they take role=button. Table rows keep their row
  // semantics; they are focusable and Enter opens them, and the label rides
  // along as a title.
  const clickProps = (row, asCard) =>
    onRowClick
      ? {
          onClick: () => onRowClick(row),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(row);
            }
          },
          tabIndex: 0,
          ...(asCard
            ? { role: "button", "aria-label": rowLabel ? rowLabel(row) : undefined }
            : { title: rowLabel ? rowLabel(row) : undefined }),
        }
      : {};

  let body;
  if (rows.length === 0) {
    if (error) {
      body = (
        <div className="p-4">
          <ErrorNotice>{errorLabel}: {error}</ErrorNotice>
        </div>
      );
    } else if (loading) {
      // Hold the table's full height while it loads, so the rows arriving do
      // not push everything below the panel down the page.
      body = (
        <div style={{ minHeight: scrolls ? maxHeight : undefined }}>
          <Skeleton rows={skeletonRows} className="p-4" />
        </div>
      );
    } else {
      body = <EmptyState title={emptyTitle} hint={emptyHint} />;
    }
    return <div className={className}>{body}</div>;
  }

  if (isMobile) {
    const primary = columns.find((c) => c.primary) || columns[0];
    const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
    return (
      <div
        className={cx("divide-y divide-line", scrolls && "overflow-y-auto custom-scrollbar", className)}
        style={scrolls ? { maxHeight } : undefined}
      >
        {rows.map((row, i) => (
          <div
            key={keyOf(row, i)}
            className={cx(
              "px-4 py-3 space-y-1.5",
              onRowClick && "cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2",
              rowClassName?.(row)
            )}
            {...clickProps(row, true)}
          >
            {renderCard ? (
              renderCard(row, i)
            ) : (
              <>
                <div className={cx("text-sm text-fg break-words", primary.mono && "font-mono")}>
                  {cell(primary, row, i)}
                </div>
                {rest.map((col) => (
                  <div key={col.key} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-fg-subtle shrink-0">{col.header}</span>
                    <span
                      className={cx(
                        "text-fg-muted text-right min-w-0 break-words tabular-nums",
                        col.mono && "font-mono"
                      )}
                    >
                      {cell(col, row, i)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Any fixed width switches the table to fixed layout, so one long unbroken
  // command cannot push the numeric columns off the edge.
  const fixed = columns.some((c) => c.width);

  return (
    <div
      className={cx(scrolls && "overflow-auto custom-scrollbar", className)}
      style={scrolls ? { maxHeight } : undefined}
    >
      <table className={cx("w-full text-sm", fixed && "table-fixed")}>
        <thead className={cx("sticky z-10 bg-surface", scrolls ? "top-0" : "top-14")}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cx(
                  "border-b border-line px-4 py-2 text-2xs font-medium uppercase tracking-wider text-fg-subtle whitespace-nowrap first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5",
                  col.align === "right" ? "text-right" : "text-left",
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {rows.map((row, i) => (
            <tr
              key={keyOf(row, i)}
              className={cx(
                "transition-colors hover:bg-surface-2",
                onRowClick && "cursor-pointer focus-visible:bg-surface-2 focus-visible:outline-none",
                rowClassName?.(row)
              )}
              {...clickProps(row, false)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    "px-4 py-2 align-top first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5",
                    col.align === "right" ? "text-right tabular-nums" : "text-left",
                    col.mono && "font-mono text-[0.8125rem]",
                    col.nowrap && "whitespace-nowrap",
                    col.className ?? "text-fg"
                  )}
                >
                  {cell(col, row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default memo(DataTable);
