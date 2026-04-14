import { useEffect, useRef, useState } from "react";

const DURATION = 7000; // ms before auto-dismiss

export default function Toast({ id, message, subtext, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef(Date.now());
  const rafRef = useRef(null);

  function dismiss() {
    setExiting(true);
    // Let the slide-out animation finish before removing from DOM.
    setTimeout(onDismiss, 280);
  }

  useEffect(() => {
    function tick() {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(pct);
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        dismiss();
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        opacity: exiting ? 0 : 1,
        transform: exiting ? "translateX(110%)" : "translateX(0)",
        transition: exiting
          ? "opacity 0.28s ease, transform 0.28s ease"
          : "opacity 0.22s ease, transform 0.22s ease",
      }}
      className="w-80 rounded-2xl shadow-xl border border-indigo-500/30 bg-white dark:bg-zinc-900 overflow-hidden"
    >
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className="text-2xl leading-none shrink-0 mt-0.5" role="img" aria-label="timer">⏱</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{message}</p>
          {subtext && (
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5 leading-snug">{subtext}</p>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-gray-300 dark:text-white/25 hover:text-gray-500 dark:hover:text-white/60 transition-colors text-xl leading-none mt-0.5 px-0.5"
        >
          ×
        </button>
      </div>
      {/* Countdown progress bar */}
      <div className="h-1 bg-black/5 dark:bg-white/5">
        <div
          className="h-full bg-indigo-500 rounded-full"
          style={{ width: `${progress}%`, transition: "width 0.1s linear" }}
        />
      </div>
    </div>
  );
}
