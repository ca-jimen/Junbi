import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

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

export default function ModeCard({ mode, hideOnLaunch }) {
  const [status, setStatus] = useState(null);
  // status: null | "launching" | "stopping"
  //       | { ok: true, skippedNames: string[] }
  //       | { failures: {name,error}[], skippedNames: string[] }

  /** Whether this mode's apps are currently running (tracked locally this session). */
  const [isRunning, setIsRunning] = useState(false);

  async function handleLaunch() {
    setStatus("launching");
    try {
      const results = await invoke("launch_mode", { modeId: mode.id, hideOnLaunch: hideOnLaunch ?? true });
      const failures = results.filter((r) => r.error !== null && r.error !== undefined);
      const skippedNames = results.filter((r) => r.skipped).map((r) => r.name);
      if (failures.length === 0) {
        setStatus({ ok: true, skippedNames });
        setIsRunning(true);
        setTimeout(() => setStatus(null), 2500);
      } else {
        setStatus({ failures, skippedNames });
        setTimeout(() => setStatus(null), 6000);
      }
    } catch (err) {
      setStatus({ failures: [{ name: "Unknown", error: String(err) }], skippedNames: [] });
      setTimeout(() => setStatus(null), 6000);
    }
  }

  async function handleStop() {
    setStatus("stopping");
    try {
      await invoke("stop_mode", { modeId: mode.id });
    } catch (_) {}
    setStatus(null);
    setIsRunning(false);
  }

  const appCount = mode.apps.length;
  const isLaunching = status === "launching";
  const isStopping = status === "stopping";
  const hasFailures = Array.isArray(status?.failures) && status.failures.length > 0;
  const skippedNames = status?.skippedNames ?? [];
  const lastLaunched = formatLastLaunched(mode.last_launched);

  return (
    <div className="w-52 flex flex-col items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-colors">
      <div className="relative w-full flex justify-center">
        <span className="text-6xl select-none">{mode.icon}</span>
        {/* Running indicator */}
        {isRunning && (
          <span
            className="absolute top-0 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]"
            title="Running"
          />
        )}
      </div>

      <h2 className="text-xl font-semibold text-white text-center leading-snug">{mode.name}</h2>

      {mode.description && (
        <p className="text-xs text-white/40 text-center leading-relaxed line-clamp-2 -mt-1">
          {mode.description}
        </p>
      )}

      <p className="text-sm text-white/50">
        {appCount === 0 ? "No apps configured" : `${appCount} app${appCount !== 1 ? "s" : ""}`}
      </p>

      {/* Hotkey badge */}
      {mode.hotkey && (
        <p className="text-xs text-white/30 font-mono bg-white/5 rounded px-2 py-0.5 -mt-1">
          {mode.hotkey}
        </p>
      )}

      <div className="w-full flex gap-2">
        <button
          onClick={handleLaunch}
          disabled={appCount === 0 || isLaunching || isStopping}
          className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium py-2 px-3 text-sm transition-colors"
        >
          {isLaunching ? "Launching…" : status?.ok ? "Launched!" : "Launch"}
        </button>
        <button
          onClick={handleStop}
          disabled={appCount === 0 || isLaunching || isStopping}
          title="Stop all apps in this mode"
          className="rounded-xl bg-white/10 hover:bg-red-500/30 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed text-white/60 py-2 px-3 text-sm transition-colors"
        >
          {isStopping ? "…" : "■"}
        </button>
      </div>

      {/* Skipped apps notice */}
      {status?.ok && skippedNames.length > 0 && (
        <p className="text-xs text-white/40 text-center">
          {skippedNames.length === 1
            ? `${skippedNames[0]} already running`
            : `${skippedNames.length} apps already running`}
        </p>
      )}

      {/* Per-app failure list */}
      {hasFailures && (
        <div className="w-full rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
          <p className="text-xs text-red-400 font-medium mb-1">Failed to launch:</p>
          {status.failures.map((f, i) => (
            <p key={i} className="text-xs text-red-300/80 truncate">
              <span className="font-medium">{f.name}</span>
              {f.error && <span className="text-red-300/50"> — {f.error}</span>}
            </p>
          ))}
          {skippedNames.length > 0 && (
            <p className="text-xs text-white/30 mt-1">
              {skippedNames.length} already running, skipped
            </p>
          )}
        </div>
      )}

      {/* Usage info */}
      {(mode.usage_count > 0 || lastLaunched) && (
        <p className="text-xs text-white/20 text-center -mt-1">
          {mode.usage_count > 0 && `${mode.usage_count}×`}
          {mode.usage_count > 0 && lastLaunched && " · "}
          {lastLaunched}
        </p>
      )}
    </div>
  );
}
