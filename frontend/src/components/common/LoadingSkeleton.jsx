const LoadingSkeleton = () => (
  <div className="space-y-2">
    <div className="h-4 bg-slate-800 rounded animate-pulse" />
    <div className="h-4 bg-slate-800 rounded animate-pulse w-5/6" />
    <div className="h-4 bg-slate-800 rounded animate-pulse w-4/6" />
  </div>
);

export default LoadingSkeleton;
