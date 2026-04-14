import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useCallback } from "react";


const PALETTE = ["#6366f1","#10b981","#8b5cf6","#0ea5e9","#f43f5e","#f59e0b","#14b8a6","#d946ef"];

export default function ModeListRow({ mode, hideOnLaunch, colorIndex = 0, invalidAppIds = new Set() }) {
  const accent = PALETTE[colorIndex % PALETTE.length];
  const [isLaunching, setIsLaunching] = useState(false);
  const [isStopping, setIsStopping]   = useState(false);
  const [isRunning,  setIsRunning]    = useState(false);
  const [launched,   setLaunched]     = useState(false);

  const syncRunning = useCallback(() => {
    invoke("get_running_mode_ids")
      .then((ids) => { if (ids.includes(mode.id)) setIsRunning(true); })
      .catch(() => {});
  }, [mode.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run once on mount (restores state after window close/reopen).
  useEffect(() => { syncRunning(); }, [syncRunning]);

  // Re-run on every modes-updated so tray/shortcut launches are reflected immediately.
  useEffect(() => {
    let unlisten;
    listen("modes-updated", syncRunning).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [syncRunning]);

  const appCount    = mode.apps.length;
  const hasBadPaths = mode.apps.some((a) => invalidAppIds.has(a.id));
  const appSummary  = mode.apps.map((a) => a.name).join("  ·  ");

  async function handleLaunch() {
    setIsLaunching(true);
    setLaunched(false);
    try {
      await invoke("launch_mode", {
        modeId: mode.id,
        hideOnLaunch: hideOnLaunch ?? true,
      });
      setIsRunning(true);
      setLaunched(true);
      setTimeout(() => setLaunched(false), 2500);
    } catch (_) {}
    setIsLaunching(false);
  }

  async function handleStop() {
    setIsStopping(true);
    try { await invoke("stop_mode", { modeId: mode.id }); } catch (_) {}
    setIsStopping(false);
    setIsRunning(false);
  }

  return (
    <div className="relative flex items-center gap-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-colors overflow-hidden pl-5 pr-4 py-3">
      {/* Left accent stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />

      {/* Emoji icon */}
      <span className="text-2xl select-none shrink-0">{mode.icon}</span>

      {/* Name + app summary */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{mode.name}</span>
          {hasBadPaths && (
            <span className="text-amber-500 text-xs shrink-0" title="One or more app paths are invalid">⚠</span>
          )}
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)] shrink-0" title="Running" />
          )}
        </div>
        {appCount > 0 ? (
          <span className="text-xs text-gray-500 dark:text-white/40 truncate">{appSummary}</span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-white/25 italic">No apps configured</span>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleLaunch}
          disabled={appCount === 0 || isLaunching || isStopping}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium py-1.5 px-3 text-xs transition-colors"
        >
          {isLaunching ? "Launching…" : launched ? "Launched!" : "Launch"}
        </button>
        <button
          onClick={handleStop}
          disabled={!isRunning || isLaunching || isStopping}
          title="Stop all apps in this mode"
          className="rounded-lg bg-black/10 dark:bg-white/10 hover:bg-red-500/30 hover:text-red-500 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-white/60 py-1.5 px-3 text-xs transition-colors"
        >
          {isStopping ? "…" : "■"}
        </button>
      </div>
    </div>
  );
}
