import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useRef, useCallback } from "react";

/** Format a Unix timestamp (seconds, as a string) into a human-readable "last used" label. */
function formatLastLaunched(ts) {
  if (!ts) return null;
  const secs = parseInt(ts, 10);
  if (!secs) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = now - secs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(secs * 1000).toLocaleDateString();
}

const PALETTE = ["#6366f1","#10b981","#8b5cf6","#0ea5e9","#f43f5e","#f59e0b","#14b8a6","#d946ef"];

export default function ModeCard({ mode, hideOnLaunch, colorIndex = 0, invalidAppIds = new Set() }) {
  const accent      = PALETTE[colorIndex % PALETTE.length];
  const [status,       setStatus]       = useState(null);
  const [isRunning,    setIsRunning]     = useState(false);
  // null = idle, [] = launch in progress (accumulating per-app events)
  const [progressItems, setProgressItems] = useState(null);
  // { [app.path]: "data:image/png;base64,..." | null }
  const [icons,        setIcons]         = useState({});
  const unlistenRef = useRef(null);

  // Clean up any dangling listener on unmount.
  useEffect(() => () => { if (unlistenRef.current) unlistenRef.current(); }, []);

  // Sync isRunning with backend state. Called on mount and after every launch
  // (modes-updated fires after every launch, including tray/shortcut launches
  // that bypass the React handleLaunch path entirely).
  const syncRunning = useCallback(() => {
    invoke("get_running_mode_ids")
      .then((ids) => { if (ids.includes(mode.id)) setIsRunning(true); })
      .catch(() => {});
  }, [mode.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run once on mount (restores state after window close/reopen).
  useEffect(() => { syncRunning(); }, [syncRunning]);

  // Re-run whenever any mode is launched so a tray/shortcut launch that happens
  // while the window is already open (or minimized) is reflected immediately.
  useEffect(() => {
    let unlisten;
    listen("modes-updated", syncRunning).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [syncRunning]);

  // Load app icons lazily when the mode's app list changes.
  const appPathsKey = mode.apps.map((a) => a.path).join("|");
  useEffect(() => {
    let cancelled = false;
    mode.apps.forEach((app) => {
      if (!app.path.endsWith(".app")) return;
      invoke("get_app_icon", { path: app.path })
        .then((icon) => {
          if (!cancelled) setIcons((prev) => ({ ...prev, [app.path]: icon ?? null }));
        })
        .catch(() => {
          if (!cancelled) setIcons((prev) => ({ ...prev, [app.path]: null }));
        });
    });
    return () => { cancelled = true; };
  }, [appPathsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLaunch() {
    setStatus("launching");
    setProgressItems([]);

    const unlisten = await listen("launch-progress", (event) => {
      const p = event.payload;
      if (p.mode_id !== mode.id) return;
      setProgressItems((prev) => [...(prev ?? []), p]);
    });
    unlistenRef.current = unlisten;

    try {
      const results = await invoke("launch_mode", {
        modeId: mode.id,
        hideOnLaunch: hideOnLaunch ?? true,
      });
      const failures    = results.filter((r) => r.error !== null && r.error !== undefined);
      const skippedNames = results.filter((r) => r.skipped).map((r) => r.name);
      if (failures.length === 0) {
        setStatus({ ok: true, skippedNames });
        setIsRunning(true);
        setTimeout(() => { setStatus(null); setProgressItems(null); }, 2500);
      } else {
        setStatus({ failures, skippedNames });
        setTimeout(() => { setStatus(null); setProgressItems(null); }, 6000);
      }
    } catch (err) {
      setStatus({ failures: [{ name: "Unknown", error: String(err) }], skippedNames: [] });
      setTimeout(() => { setStatus(null); setProgressItems(null); }, 6000);
    } finally {
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    }
  }

  async function handleStop() {
    setStatus("stopping");
    try { await invoke("stop_mode", { modeId: mode.id }); } catch (_) {}
    setStatus(null);
    setIsRunning(false);
  }

  const appCount     = mode.apps.length;
  const isLaunching  = status === "launching";
  const isStopping   = status === "stopping";
  const hasFailures  = Array.isArray(status?.failures) && status.failures.length > 0;
  const skippedNames = status?.skippedNames ?? [];
  const lastLaunched = formatLastLaunched(mode.last_launched);
  const hasBadPaths  = mode.apps.some((a) => invalidAppIds.has(a.id));

  return (
    <div
      className="group relative w-52 flex flex-col rounded-2xl bg-black/5 dark:bg-white/5 border overflow-hidden hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      style={{ borderColor: `${accent}55` }}
    >
      {/* Usage badge — absolute, shown on hover only, contributes zero height */}
      {(mode.usage_count > 0 || lastLaunched) && (
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          <span className="text-xs text-gray-500 dark:text-white/50 bg-black/10 dark:bg-black/50 rounded px-1.5 py-0.5 backdrop-blur-sm">
            {mode.usage_count > 0 && `${mode.usage_count}×`}
            {mode.usage_count > 0 && lastLaunched && " · "}
            {lastLaunched}
          </span>
        </div>
      )}

      {/* Invalid-paths warning badge */}
      {hasBadPaths && (
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <span className="text-amber-500 text-xs leading-none" title="One or more app paths are invalid">⚠</span>
        </div>
      )}

      {/* Colored top accent stripe */}
      <div className="w-full h-0.5 shrink-0" style={{ background: accent }} />

      {/* Card body: top grows, bottom stays pinned */}
      <div className="flex flex-col flex-1 px-5 pt-5 pb-5">

        {/* ── TOP: icon · name · description · app list ── */}
        <div className="flex flex-col items-center gap-3 flex-1">

          {/* Icon + running indicator */}
          <div className="relative w-full flex justify-center">
            <span className="text-5xl select-none">{mode.icon}</span>
            {isRunning && (
              <span
                className="absolute top-0 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]"
                title="Running"
              />
            )}
          </div>

          <h2 className="text-base font-semibold text-gray-900 dark:text-white text-center leading-snug">
            {mode.name}
          </h2>

          {mode.description && (
            <p className="text-xs text-gray-500 dark:text-white/40 text-center leading-relaxed line-clamp-2 -mt-1">
              {mode.description}
            </p>
          )}

          <div className="w-full border-t border-black/5 dark:border-white/5" />

          {/* App list — shows real-time progress while launching, static otherwise */}
          {progressItems !== null ? (
            <div className="w-full flex flex-col gap-1">
              {progressItems.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-white/30 text-center italic">Starting…</p>
              ) : (
                progressItems.slice(0, 4).map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className={`text-xs shrink-0 w-3 text-center ${
                      item.status === "launched" ? "text-emerald-500 dark:text-emerald-400" :
                      item.status === "skipped"  ? "text-gray-400 dark:text-white/30" :
                      item.status === "failed"   ? "text-red-500 dark:text-red-400" : "text-gray-300 dark:text-white/20"
                    }`}>
                      {item.status === "launched" ? "✓" :
                       item.status === "skipped"  ? "–" :
                       item.status === "failed"   ? "✗" : "·"}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-white/50 truncate">{item.name}</p>
                  </div>
                ))
              )}
              {progressItems.length > 4 && (
                <p className="text-xs text-gray-400 dark:text-white/25 text-center">+{progressItems.length - 4} more</p>
              )}
            </div>
          ) : appCount === 0 ? (
            <p className="text-xs text-gray-400 dark:text-white/25 italic">No apps configured</p>
          ) : (
            <div className="w-full flex flex-col gap-1">
              {mode.apps.slice(0, 4).map((app) => (
                <div key={app.id} className="flex items-center gap-1.5">
                  {icons[app.path] ? (
                    <img
                      src={icons[app.path]}
                      alt=""
                      width={14}
                      height={14}
                      className="rounded-sm shrink-0 object-contain"
                    />
                  ) : (
                    <span className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <p className={`text-xs truncate ${
                    invalidAppIds.has(app.id) ? "text-red-500 dark:text-red-400/80" : "text-gray-500 dark:text-white/50"
                  }`}>
                    {app.name}
                  </p>
                </div>
              ))}
              {appCount > 4 && (
                <p className="text-xs text-gray-400 dark:text-white/25 text-center">+{appCount - 4} more</p>
              )}
            </div>
          )}
        </div>

        {/* ── BOTTOM: hotkey · buttons · status ── always pinned */}
        <div className="flex flex-col gap-2 pt-4">
          {mode.hotkey && (
            <p className="text-xs text-gray-500 dark:text-white/30 font-mono bg-black/5 dark:bg-white/5 rounded px-2 py-0.5 text-center">
              {mode.hotkey}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleLaunch}
              disabled={appCount === 0 || isLaunching || isStopping}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium py-2 px-3 text-sm transition-colors"
            >
              {isLaunching ? "Launching…" : status?.ok ? "Launched!" : "Launch"}
            </button>
            <button
              onClick={handleStop}
              disabled={!isRunning || isLaunching || isStopping}
              title="Stop all apps in this mode"
              className="rounded-xl bg-black/10 dark:bg-white/10 hover:bg-red-500/30 hover:text-red-500 dark:hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500 dark:text-white/60 py-2 px-3 text-sm transition-colors"
            >
              {isStopping ? "…" : "■"}
            </button>
          </div>

          {/* Skipped apps notice */}
          {status?.ok && skippedNames.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-white/40 text-center">
              {skippedNames.length === 1
                ? `${skippedNames[0]} already running`
                : `${skippedNames.length} apps already running`}
            </p>
          )}

          {/* Per-app failure list */}
          {hasFailures && (
            <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-xs text-red-500 dark:text-red-400 font-medium mb-1">Failed to launch:</p>
              {status.failures.map((f, i) => (
                <p key={i} className="text-xs text-red-400 dark:text-red-300/80 truncate">
                  <span className="font-medium">{f.name}</span>
                  {f.error && <span className="text-red-400/60 dark:text-red-300/50"> — {f.error}</span>}
                </p>
              ))}
              {skippedNames.length > 0 && (
                <p className="text-xs text-gray-400 dark:text-white/30 mt-1">
                  {skippedNames.length} already running, skipped
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>

  );
}
