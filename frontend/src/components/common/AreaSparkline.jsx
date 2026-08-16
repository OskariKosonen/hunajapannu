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

/** Rounds an axis maximum up to a 1/2/5 x 10^n step so tick labels read cleanly. */
const niceCeil = (value) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
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
  const PAD = { top: 10, right: 10, bottom: 20, left: 40 };
  const plotW = Math.max(W - PAD.left - PAD.right, 1);
  const plotH = Math.max(H - PAD.top - PAD.bottom, 1);

  const dataPeak = Math.max(...data.map((d) => d.value), 0);
  // Round the axis up so gridlines land on 0 / 500 / 1000 rather than 0 / 410 / 819.
  const axisMax = niceCeil(Math.max(dataPeak, max || 0, 1));

  const x = (i) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (v / axisMax) * plotH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");
  const baseline = (PAD.top + plotH).toFixed(1);
  const area = `${line} L${x(data.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  // Roughly 52px per label, so narrow screens thin them out instead of colliding.
  const maxLabels = Math.max(2, Math.floor(plotW / 52));
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
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {yTicks.map((f) => {
          const gy = PAD.top + plotH - f * plotH;
          return (
            <g key={f}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={gy}
                y2={gy}
                stroke="#0f172a"
                strokeDasharray="3 3"
              />
              <text x={PAD.left - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#5eead4">
                {Math.round(axisMax * f).toLocaleString()}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="#34d399" strokeWidth="2" />

        {data.map((d, i) => {
          if (i % xStep !== 0) return null;
          // Anchor the outermost labels inward; centred, they hang off the
          // edge of the viewBox and get clipped.
          const px = x(i);
          const anchor = px < PAD.left + 16 ? "start" : px > W - PAD.right - 16 ? "end" : "middle";
          return (
            <text key={`x${i}`} x={px} y={H - 5} textAnchor={anchor} fontSize="9" fill="#5eead4">
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
              stroke="#34d399"
              strokeOpacity="0.4"
            />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="3.5" fill="#f472b6" />
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
          className="absolute pointer-events-none px-2 py-1 rounded-md border border-emerald-500/40 bg-black/85 text-emerald-100 text-[0.65rem] whitespace-nowrap -translate-x-1/2"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}
        >
          <div className="font-semibold">{data[hover].label}</div>
          <div>{data[hover].value.toLocaleString()} events</div>
        </div>
      )}
    </div>
  );
};

export default memo(AreaSparkline);
