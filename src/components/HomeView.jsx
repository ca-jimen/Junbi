import { useState } from "react";
import ModeCard from "./ModeCard";

export default function HomeView({ modes, hideOnLaunch, onOpenSettings }) {
  const [search, setSearch] = useState("");

  if (modes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center" style={{ minHeight: "60vh" }}>
        <span className="text-6xl select-none">🗂️</span>
        <h2 className="text-xl font-semibold text-white">No modes yet</h2>
        <p className="text-sm text-white/40 max-w-xs">
          Create a mode to group your apps and launch them all at once.
        </p>
        <button
          onClick={onOpenSettings}
          className="mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2 text-sm transition-colors"
        >
          Create your first mode
        </button>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? modes.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.description || "").toLowerCase().includes(q)
      )
    : modes;

  return (
    <div className="flex flex-col flex-1">
      {/* Search bar — only shown when there are enough modes to warrant it */}
      {modes.length > 3 && (
        <div className="px-8 pt-6 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modes…"
            className="w-full max-w-xs rounded-xl bg-white/5 border border-white/10 text-white px-4 py-2 text-sm outline-none focus:border-indigo-500 placeholder-white/30"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-8 text-center">
          <p className="text-white/30 text-sm">No modes match "{search}"</p>
          <button onClick={() => setSearch("")} className="text-xs text-indigo-400 hover:text-indigo-300">
            Clear search
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6 p-8 justify-center content-start">
          {filtered.map((mode) => (
            <ModeCard key={mode.id} mode={mode} hideOnLaunch={hideOnLaunch} />
          ))}
        </div>
      )}
    </div>
  );
}
