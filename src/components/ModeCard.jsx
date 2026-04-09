import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function ModeCard({ mode }) {
  const [status, setStatus] = useState(null);

  async function handleLaunch() {
    setStatus("launching");
    try {
      await invoke("launch_mode", { modeId: mode.id });
      setStatus("launched");
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus("error");
      alert(err);
      setTimeout(() => setStatus(null), 3000);
    }
  }

  const appCount = mode.apps.length;

  return (
    <div className="w-52 flex flex-col items-center gap-4 rounded-2xl bg-white/5 border border-white/10 p-8 hover:bg-white/10 transition-colors">
      <span className="text-6xl select-none">{mode.icon}</span>
      <h2 className="text-xl font-semibold text-white">{mode.name}</h2>
      <p className="text-sm text-white/50">
        {appCount === 0 ? "No apps configured" : `${appCount} app${appCount !== 1 ? "s" : ""}`}
      </p>
      <button
        onClick={handleLaunch}
        disabled={appCount === 0 || status === "launching"}
        className="mt-2 w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium py-2 px-4 transition-colors"
      >
        {status === "launching" ? "Launching…" : status === "launched" ? "Launched!" : "Launch"}
      </button>
    </div>
  );
}
