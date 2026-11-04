import { useId } from "react";

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

export const ArrowRightIcon = (p) => (
  <Svg {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Svg>
);
export const PanelLeftIcon = (p) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Svg>
);

// Section icons for the navigation.
export const GridIcon = (p) => (
  <Svg {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></Svg>
);
export const ActivityIcon = (p) => (
  <Svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>
);
export const TerminalIcon = (p) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12 15h5" /></Svg>
);
export const KeyIcon = (p) => (
  <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></Svg>
);
export const BugIcon = (p) => (
  <Svg {...p}><rect x="7" y="7" width="10" height="13" rx="5" /><path d="M9 7a3 3 0 0 1 6 0M12 11v9M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2" /></Svg>
);
export const GlobeIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Svg>
);
export const NetworkIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M10.8 7.2 6.2 16.8M13.2 7.2l4.6 9.6M7.5 19h9" /></Svg>
);
export const DatabaseIcon = (p) => (
  <Svg {...p}><ellipse cx="12" cy="5.5" rx="8" ry="2.5" /><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5" /></Svg>
);
export const GitHubIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`} fill="currentColor">
    <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49l-.01-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9l-.01 2.81c0 .27.18.6.69.49A10.1 10.1 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
  </svg>
);
export const LinkedInIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`} fill="currentColor">
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
  </svg>
);

/**
 * The brand mark: a honey pot with a shell prompt cut out of its belly.
 * Hunajapannu is Finnish for honey pot, and what this one catches is typed
 * into a terminal.
 *
 * Constructed on a 48 grid rather than drawn: the body is one circle
 * (r 15.5) cut flat at the opening and the base, the rim a 26-unit bar a
 * fixed gap above it, and a 1.6 stroke in the fill colour gives every corner
 * the same small radius. Honey amber is the one colour in the brand that is
 * not the UI's emerald. The prompt is a mask, so it shows the surface beneath.
 */
const LOGO_BODY = "M13.29 15H34.71A15.5 15.5 0 0 1 31.44 39.8H16.56A15.5 15.5 0 0 1 13.29 15Z";
const LOGO_PROMPT = "M17.2 22.6l4.8 4.2-4.8 4.2M25.6 31h5.6";

export const LogoMark = ({ size = 22, className = "" }) => {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={`shrink-0 ${className}`}>
      <mask id={id}>
        <rect width="48" height="48" fill="#fff" />
        <path
          d={LOGO_PROMPT}
          fill="none"
          stroke="#000"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <g
        fill="rgb(var(--honey))"
        stroke="rgb(var(--honey))"
        strokeWidth="1.6"
        strokeLinejoin="round"
        mask={`url(#${id})`}
      >
        <rect x="11" y="7.6" width="26" height="4" rx="1.2" />
        <path d={LOGO_BODY} />
      </g>
    </svg>
  );
};
