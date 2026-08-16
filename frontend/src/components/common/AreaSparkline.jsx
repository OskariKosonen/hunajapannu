import { memo, useId, useState } from "react";

/**
 * Area chart for the hourly-events series.
 *
 * Replaces Recharts, which cost 317 kB (98 kB gzipped) — by a wide margin the
 * largest asset on the page — to draw twenty-four points. This is plain SVG
 * scaled by viewBox, so it is responsive without measuring anything, and it
 * keeps the parts that were actually used: gridlines, axis labels, and a
 * tooltip on hover.
 *
 * @param {Array<{label: string, value: number}>} data
 * @param {number} [max] Upper bound for the y-axis; defaults to the data max.
 */
const AreaSparkline = ({ data, max, height = 160 }) => {
  const gradientId = useId();
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) return null;

  // A fixed coordinate space, stretched to the container by preserveAspectRatio.
  const W = 600;
  const H = 200;
  const PAD = { top: 12, right: 8, bottom: 22, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const peak = Math.max(max || 0, ...data.map((d) => d.value), 1);
  const x = (i) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (v / peak) * plotH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${PAD.top + plotH} L${x(0).toFixed(1)},${PAD.top + plotH} Z`;

  // Four y-gridlines, and at most six x-labels so they never collide.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(peak * f));
  const xStep = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
        role="img"
        aria-label={`Events per hour. Peak ${peak}. ${data.length} points from ${data[0].label} to ${data[data.length - 1].label}.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const gy = PAD.top + plotH - (i / (yTicks.length - 1)) * plotH;
          return (
            <g key={t + "-" + i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="#0f172a" strokeDasharray="3 3" />
              {/* vectorEffect keeps text from stretching with preserveAspectRatio="none" */}
              <text x={PAD.left - 6} y={gy + 3} textAnchor="end" fontSize="9" fill="#5eead4">
                {t}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />

        {data.map((d, i) =>
          i % xStep === 0 ? (
            <text key={`x${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#5eead4">
              {d.label}
            </text>
          ) : null
        )}

        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#34d399" strokeOpacity="0.4" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="3.5" fill="#f472b6" />
          </g>
        )}

        {/* Invisible hit areas: one column per point, so hovering anywhere in
            the column selects it rather than requiring the line itself. */}
        {data.map((d, i) => (
          <rect
            key={`hit${i}`}
            x={x(i) - plotW / (2 * Math.max(data.length - 1, 1))}
            y={PAD.top}
            width={plotW / Math.max(data.length - 1, 1)}
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
          <div>{data[hover].value} events</div>
        </div>
      )}
    </div>
  );
};

export default memo(AreaSparkline);
