import { useState } from "react";
import ModeCard from "./ModeCard";
import ModeListRow from "./ModeListRow";

export default function HomeView({ modes, hideOnLaunch, onOpenSettings, onAddMode, invalidAppIds = new Set() }) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"

  if (modes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center" style={{ minHeight: "60vh" }}>
        <span className="text-6xl select-none">🗂️</span>
        <h2 className="text-xl font-semibold text-white">No modes yet</h2>
        <p className="text-sm text-white/40 max-w-xs">
          Create a mode to group your apps and launch them all at once.
        </p>
        <button
          onClick={onAddMode}
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

  // View-toggle button helper
  function ViewBtn({ value, label }) {
    return (
      <button
        onClick={() => setViewMode(value)}
        title={value === "grid" ? "Grid view" : "List view"}
        className={`rounded-lg px-2 py-1.5 text-base leading-none transition-colors ${
          viewMode === value
            ? "bg-indigo-600 text-white"
            : "bg-white/5 text-white/40 hover:text-white"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-8 pt-6 pb-2">
        {modes.length > 3 ? (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modes…"
            className="flex-1 max-w-xs rounded-xl bg-white/5 border border-white/10 text-white px-4 py-2 text-sm outline-none focus:border-indigo-500 placeholder-white/30"
          />
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex gap-1 shrink-0">
          <ViewBtn value="grid" label="▦" />
          <ViewBtn value="list" label="≡" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-8 text-center">
          <p className="text-white/30 text-sm">No modes match "{search}"</p>
          <button onClick={() => setSearch("")} className="text-xs text-indigo-400 hover:text-indigo-300">
            Clear search
          </button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="flex flex-wrap gap-6 p-8 justify-center content-start">
          {filtered.map((mode, i) => (
            <ModeCard
              key={mode.id}
              mode={mode}
              hideOnLaunch={hideOnLaunch}
              colorIndex={i}
              invalidAppIds={invalidAppIds}
            />
          ))}
          {!q && (
            <button
              onClick={onAddMode}
              className="w-52 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 hover:border-indigo-500/60 hover:bg-white/5 text-white/25 hover:text-indigo-400 transition-colors"
              style={{ minHeight: "200px" }}
            >
              <span className="text-3xl leading-none">+</span>
              <span className="text-sm font-medium">Add Mode</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-6">
          {filtered.map((mode, i) => (
            <ModeListRow
              key={mode.id}
              mode={mode}
              hideOnLaunch={hideOnLaunch}
              colorIndex={i}
              invalidAppIds={invalidAppIds}
            />
          ))}
          {!q && (
            <button
              onClick={onAddMode}
              className="rounded-xl border border-dashed border-white/15 hover:border-indigo-500/60 hover:bg-white/5 text-white/25 hover:text-indigo-400 transition-colors py-4 text-sm font-medium"
            >
              + Add Mode
            </button>
          )}
        </div>
      )}
    </div>
  );
}
