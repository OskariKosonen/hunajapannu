/**
 * The dozen icons the UI needs, as inline SVG. An icon library would be the
 * second-largest dependency in the bundle to draw these.
 *
 * 24x24 grid, 1.75 stroke, currentColor, so they follow the text they sit in.
 */

const Svg = ({ size = 16, className = "", children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={`shrink-0 ${className}`}
    {...rest}
  >
    {children}
  </svg>
);

export const SearchIcon = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const XIcon = (p) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
export const RefreshIcon = (p) => (
  <Svg {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></Svg>
);
export const ExternalIcon = (p) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
);
export const ChevronRightIcon = (p) => (
  <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>
);
export const ChevronDownIcon = (p) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const CopyIcon = (p) => (
  <Svg {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></Svg>
);
export const CheckIcon = (p) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);
export const DownloadIcon = (p) => (
  <Svg {...p}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></Svg>
);
export const PlayIcon = (p) => (
  <Svg {...p}><path d="M7 5v14l11-7z" fill="currentColor" stroke="none" /></Svg>
);
export const PauseIcon = (p) => (
  <Svg {...p}><path d="M8 5v14M16 5v14" strokeWidth="3" /></Svg>
);
export const SkipIcon = (p) => (
  <Svg {...p}><path d="M5 5v14l9-7z" fill="currentColor" stroke="none" /><path d="M18 5v14" strokeWidth="2.5" /></Svg>
);
export const ReplayIcon = (p) => (
  <Svg {...p}><path d="M3 12a9 9 0 1 0 2.64-6.36" /><path d="M3 3v6h6" /></Svg>
);
export const AlertIcon = (p) => (
  <Svg {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></Svg>
);
export const CodeIcon = (p) => (
  <Svg {...p}><path d="m8 7-5 5 5 5M16 7l5 5-5 5" /></Svg>
);
export const TimelineIcon = (p) => (
  <Svg {...p}><path d="M4 6h10M4 12h16M4 18h7" /></Svg>
);

/** The brand mark: a hexagon cell with a dot — a honeycomb with something in it. */
export const LogoMark = ({ size = 22, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path
      d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z"
      fill="rgb(var(--accent) / 0.12)"
      stroke="rgb(var(--accent))"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.6" fill="rgb(var(--accent))" />
  </svg>
);
