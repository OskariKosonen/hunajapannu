import { useRotatingWord } from "../../hooks/useApi";
import { LOADING_WORDS } from "../../lib/flavour";

/**
 * Shimmer bars with a rotating status word above them, so a slow panel says
 * something rather than pulsing silently.
 */
const LoadingSkeleton = ({ label }) => {
  const word = useRotatingWord(LOADING_WORDS);
  return (
    <div className="space-y-2">
      <p className="text-[0.6rem] text-emerald-500 tabular-nums">
        {label || word}
        <span className="animate-pulse">…</span>
      </p>
      <div className="h-4 bg-slate-800 rounded animate-pulse" />
      <div className="h-4 bg-slate-800 rounded animate-pulse w-5/6" />
      <div className="h-4 bg-slate-800 rounded animate-pulse w-4/6" />
    </div>
  );
};

export default LoadingSkeleton;
