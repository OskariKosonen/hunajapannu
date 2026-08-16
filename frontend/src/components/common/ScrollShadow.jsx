import { useEffect, useMemo, useRef, useState } from "react";

/**
 * @param {string} [className]          classes for the scrolling element itself
 * @param {string} [containerClassName] classes for the positioned wrapper, so a
 *   caller can make the whole thing a flex child that fills its parent
 */
const ScrollShadow = ({ children, className = "", containerClassName = "", topScrollbar = false }) => {
  const scrollRef = useRef(null);
  const topScrollRef = useRef(null);
  const [hasShadow, setHasShadow] = useState({ left: false, right: false });
  const [scrollWidth, setScrollWidth] = useState(0);

  const hideNativeScrollbarClass = useMemo(
    () => (topScrollbar ? "hide-native-scrollbar" : ""),
    [topScrollbar]
  );

  useEffect(() => {
    const el = scrollRef.current;
    const topBar = topScrollRef.current;
    if (!el) return;

    let isSyncing = false;

    const updateMetrics = () => {
      setScrollWidth(el.scrollWidth);
      const { scrollLeft, scrollWidth: width, clientWidth } = el;
      const maxScroll = width - clientWidth;
      setHasShadow((prev) => {
        const next = { left: scrollLeft > 0, right: scrollLeft < maxScroll };
        return prev.left === next.left && prev.right === next.right ? prev : next;
      });
    };

    const handleContentScroll = () => {
      if (isSyncing) return;
      isSyncing = true;
      if (topBar && topBar.scrollLeft !== el.scrollLeft) {
        topBar.scrollLeft = el.scrollLeft;
      }
      isSyncing = false;
      updateMetrics();
    };

    const handleTopScroll = () => {
      if (!topBar || !el || isSyncing) return;
      isSyncing = true;
      el.scrollLeft = topBar.scrollLeft;
      isSyncing = false;
      updateMetrics();
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateMetrics)
        : null;

    updateMetrics();
    if (topBar) topBar.scrollLeft = el.scrollLeft;

    el.addEventListener("scroll", handleContentScroll);
    topBar?.addEventListener("scroll", handleTopScroll);
    window.addEventListener("resize", updateMetrics);
    resizeObserver?.observe(el);

    return () => {
      el.removeEventListener("scroll", handleContentScroll);
      topBar?.removeEventListener("scroll", handleTopScroll);
      window.removeEventListener("resize", updateMetrics);
      resizeObserver?.disconnect();
    };
  }, [children, topScrollbar]);

  return (
    <div className={`relative ${containerClassName}`}>
      {topScrollbar && (
        <div
          ref={topScrollRef}
          className="overflow-x-auto overflow-y-hidden custom-scrollbar h-4 mb-2"
        >
          <div style={{ width: `${scrollWidth}px`, height: 1 }} />
        </div>
      )}

      <div
        ref={scrollRef}
        className={`overflow-auto custom-scrollbar ${hideNativeScrollbarClass} ${className}`}
      >
        {children}
      </div>

      {hasShadow.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-slate-950/80 via-slate-950/50 to-transparent" />
      )}
      {hasShadow.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-slate-950/80 via-slate-950/50 to-transparent" />
      )}
    </div>
  );
};

export default ScrollShadow;
