import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function ModeCard({ mode }) {
  const [status, setStatus] = useState(null); // null | "launching" | "launched" | { failures: [] }

  async function handleLaunch() {
    setStatus("launching");
    try {
      const results = await invoke("launch_mode", { modeId: mode.id });
      const failures = results.filter((r) => r.error !== null);
      if (failures.length === 0) {
        setStatus("launched");
        setTimeout(() => setStatus(null), 2500);
      } else {
        setStatus({ failures });
        setTimeout(() => setStatus(null), 6000);
      }
    } catch (err) {
      setStatus({ failures: [{ name: "Unknown", error: String(err) }] });
      setTimeout(() => setStatus(null), 6000);
    }
  }

  const appCount = mode.apps.length;
  const hasFailures = status?.failures?.length > 0;

  return (
    <div className="w-52 flex flex-col items-center gap-4 rounded-2xl bg-white/5 border border-white/10 p-8 hover:bg-white/10 transition-colors">
      <span className="text-6xl select-none">{mode.icon}</span>
      <h2 className="text-xl font-semibold text-white text-center">{mode.name}</h2>
      <p className="text-sm text-white/50">
        {appCount === 0 ? "No apps configured" : `${appCount} app${appCount !== 1 ? "s" : ""}`}
      </p>

      <button
        onClick={handleLaunch}
        disabled={appCount === 0 || status === "launching"}
        className="mt-2 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium py-2 px-4 transition-colors"
      >
        {status === "launching"
          ? "Launching…"
          : status === "launched"
          ? "Launched!"
          : "Launch"}
      </button>

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
        </div>
      )}
    </div>
  );
}
