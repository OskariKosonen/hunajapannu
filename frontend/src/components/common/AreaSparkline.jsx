import { memo, useId, useState, useRef, useLayoutEffect } from "react";

/**
 * Area chart for the hourly-events series.
 *
 * Replaces Recharts, which cost 317 kB (98 kB gzipped) — by a wide margin the
 * largest asset on the page — to draw twenty-four points.
 *
 * The SVG is rendered at the container's measured pixel size rather than a
 * fixed viewBox stretched to fit. The earlier version used
 * preserveAspectRatio="none", which scales the coordinate system unevenly on
 * each axis: text came out horizontally squashed, the hover dot rendered as an
 * ellipse, and dashed gridlines smeared. Measuring means one unit is one CSS
 * pixel, so nothing distorts at any width.
 *
 * @param {Array<{label: string, value: number}>} data
 * @param {number} [max] Lower bound for the y-axis; the axis never ends below it.
 */

/**
 * Picks gridlines for a peak: the smallest 1/2/2.5/5 x 10^n step that covers
 * it in at most five intervals. Rounding the maximum alone to 1/2/5 x 10^n
 * wasted up to half the plot: a peak of 2,258 got an axis to 5,000.
 */
const axisTicks = (value) => {
  const peak = Math.max(value, 1);
  // Counts are whole numbers, so steps are too.
  const magnitude = Math.max(1, 10 ** Math.floor(Math.log10(peak / 5)));
  for (const m of [1, 2, 2.5, 5, 10, 20]) {
    const step = m * magnitude;
    if (!Number.isInteger(step)) continue;
    const count = Math.ceil(peak / step);
    if (count <= 5) return Array.from({ length: count + 1 }, (_, i) => i * step);
  }
  return [0, peak];
};

const AreaSparkline = ({ data, max, height = 160 }) => {
  const gradientId = useId();
  const [hover, setHover] = useState(null);
  const containerRef = useRef(null);
  // Falls back to a sensible width until measured (and under jsdom, which has
  // no layout at all), so the geometry below never divides by zero.
  const [width, setWidth] = useState(600);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length === 0) return null;

  const W = width;
  const H = height;
  const PAD = { top: 12, right: 12, bottom: 22, left: 44 };
  const plotW = Math.max(W - PAD.left - PAD.right, 1);
  const plotH = Math.max(H - PAD.top - PAD.bottom, 1);

  const dataPeak = Math.max(...data.map((d) => d.value), 0);
  // Gridlines land on 0 / 500 / 1000 rather than 0 / 410 / 819.
  const ticks = axisTicks(Math.max(dataPeak, max || 0, 1));
  const axisMax = ticks[ticks.length - 1];

  const x = (i) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (v / axisMax) * plotH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");
  const baseline = (PAD.top + plotH).toFixed(1);
  const area = `${line} L${x(data.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;

  // Roughly 52px per label, so narrow screens thin them out instead of colliding.
  const maxLabels = Math.max(2, Math.floor(plotW / 60));
  const xStep = Math.max(1, Math.ceil(data.length / maxLabels));
  const colW = plotW / Math.max(data.length - 1, 1);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        // max-w-full stops the 600px fallback overflowing a narrower
        // container in the frame before the measurement lands.
        className="block max-w-full"
        role="img"
        aria-label={`Events per hour. Peak ${dataPeak}. ${data.length} points from ${data[0].label} to ${data[data.length - 1].label}.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const f = t / axisMax;
          const gy = PAD.top + plotH - f * plotH;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={gy}
                y2={gy}
                stroke="rgb(var(--line))"
                strokeDasharray={f === 0 ? undefined : "2 4"}
              />
              <text x={PAD.left - 8} y={gy + 4} textAnchor="end" fontSize="11" fill="rgb(var(--fg-subtle))">
                {t.toLocaleString("en-GB")}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} data-series="line" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.75" strokeLinejoin="round" />

        {data.map((d, i) => {
          if (i % xStep !== 0) return null;
          // Anchor the outermost labels inward; centred, they hang off the
          // edge of the viewBox and get clipped.
          const px = x(i);
          const anchor = px < PAD.left + 16 ? "start" : px > W - PAD.right - 16 ? "end" : "middle";
          return (
            <text key={`x${i}`} x={px} y={H - 5} textAnchor={anchor} fontSize="11" fill="rgb(var(--fg-subtle))">
              {d.label}
            </text>
          );
        })}

        {hover != null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="rgb(var(--fg-subtle))"
              strokeOpacity="0.5"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].value)}
              r="4"
              fill="rgb(var(--surface))"
              stroke="rgb(var(--accent))"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Invisible hit areas: one column per point, so hovering anywhere in
            the column selects it rather than requiring the line itself. */}
        {data.map((d, i) => (
          <rect
            key={`hit${i}`}
            x={x(i) - colW / 2}
            y={PAD.top}
            width={colW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover != null && (
        <div
          className="absolute pointer-events-none rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap -translate-x-1/2"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
        >
          <div className="text-fg-subtle">{data[hover].label}</div>
          <div className="font-medium text-fg tabular-nums">{data[hover].value.toLocaleString("en-GB")} events</div>
        </div>
      )}
    </div>
  );
};

export default memo(AreaSparkline);
