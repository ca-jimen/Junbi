import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DISPLAY_MS = 9000;

export default function StoicQuoteModal({ quote, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  // Keep a stable ref to onDismiss so the timer closure never goes stale.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  // Fade in on mount (tiny delay so the CSS transition fires).
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  // Countdown timer — updates progress bar and auto-dismisses.
  useEffect(() => {
    const start = Date.now();
    let raf;
    function tick() {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 1 - elapsed / DISPLAY_MS);
      setProgress(remaining * 100);
      if (remaining > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    setVisible(false);
    // Let the fade-out finish before unmounting.
    setTimeout(() => onDismissRef.current?.(), 300);
  }

  if (!quote) return null;

  // Portal renders directly into document.body — bypasses every ancestor's
  // overflow/stacking context, including Tauri's WKWebView flex containers.
  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-6 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={dismiss}
    >
      <div
        className={`relative max-w-lg w-full rounded-2xl bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 shadow-2xl px-8 py-7 transition-all duration-300 ${
          visible ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white/80 transition-colors text-xl leading-none"
          title="Dismiss"
        >
          ×
        </button>

        {/* Decorative quote mark */}
        <div className="text-6xl leading-none text-indigo-300 dark:text-indigo-500/40 select-none mb-2 font-serif">
          "
        </div>

        {/* Quote text */}
        <p className="text-gray-800 dark:text-white/90 text-base leading-relaxed font-medium pr-4">
          {quote.quote}
        </p>

        {/* Attribution */}
        <div className="mt-5 pt-4 border-t border-black/8 dark:border-white/8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{quote.author}</p>
            <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{quote.period}</p>
          </div>
          <span className="text-2xl select-none opacity-50">🏛</span>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl overflow-hidden">
          <div
            className="h-full bg-indigo-500"
            style={{ width: `${progress}%`, transition: "width 100ms linear" }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
