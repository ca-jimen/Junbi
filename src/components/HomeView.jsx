import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getRandomQuote } from "../data/stoicQuotes";
import ModeCard from "./ModeCard";
import ModeListRow from "./ModeListRow";

export default function HomeView({ modes, hideOnLaunch, showStoicQuotes = true, showTimer = true, onOpenSettings, onAddMode, invalidAppIds = new Set() }) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [currentQuote, setCurrentQuote] = useState(() => getRandomQuote(-1));

  // Timer state
  const [timerEndAt,   setTimerEndAt]   = useState(null); // ms timestamp
  const [timerDisplay, setTimerDisplay] = useState("");   // "MM:SS"
  const [timerDone,    setTimerDone]    = useState(false);
  const [timerInput,   setTimerInput]   = useState("25"); // custom minutes

  // Rotate the quote whenever any mode is launched.
  useEffect(() => {
    let unlisten;
    listen("modes-updated", () => {
      setCurrentQuote((prev) => getRandomQuote(prev?.index ?? -1));
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Live countdown — ticks every second while a timer is active.
  useEffect(() => {
    if (!timerEndAt) { setTimerDisplay(""); return; }
    function tick() {
      const remaining = Math.max(0, timerEndAt - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimerDisplay(`${mins}:${secs.toString().padStart(2, "0")}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerEndAt]);

  // Reset timer display when backend fires session-timer-expired.
  useEffect(() => {
    let unlisten;
    listen("session-timer-expired", () => {
      setTimerEndAt(null);
      setTimerDone(true);
      setTimeout(() => setTimerDone(false), 5000);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  async function handleStartTimer(minutes) {
    const mins = Math.round(minutes);
    if (!mins || mins < 1) return;
    const durationSecs = mins * 60;
    setTimerEndAt(Date.now() + durationSecs * 1000);
    setTimerDone(false);
    try { await invoke("start_session_timer", { durationSecs }); } catch (_) {}
  }

  async function handleCancelTimer() {
    setTimerEndAt(null);
    setTimerDone(false);
    try { await invoke("cancel_session_timer"); } catch (_) {}
  }

  if (modes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center" style={{ minHeight: "60vh" }}>
        <span className="text-6xl select-none">🗂️</span>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">No modes yet</h2>
        <p className="text-sm text-gray-500 dark:text-white/40 max-w-xs">
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
            : "bg-black/5 dark:bg-white/5 text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Quote + timer row — side by side when wide enough, stacked when narrow */}
      {(showStoicQuotes || showTimer) && (
        <div className="mx-6 mt-5 flex flex-wrap gap-3">

          {/* Stoic quote card */}
          {showStoicQuotes && currentQuote && (
            <div className="flex-1 min-w-64 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/15 dark:border-indigo-400/15 px-5 py-4">
              <p className="text-sm text-gray-700 dark:text-white/80 leading-relaxed italic">"{currentQuote.quote}"</p>
              <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400/80 font-medium">
                — {currentQuote.author}
                <span className="text-gray-400 dark:text-white/30 font-normal"> · {currentQuote.period}</span>
              </p>
            </div>
          )}

          {/* Timer card */}
          {showTimer && (
            <div className="flex-1 min-w-64 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wide mb-3">Timer</p>
              {timerEndAt ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-indigo-600 dark:text-indigo-400 flex-1 tabular-nums">
                    ⏱ {timerDisplay}
                  </span>
                  <button
                    onClick={handleCancelTimer}
                    className="text-xs text-gray-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 transition-colors px-1.5 py-0.5 rounded-md hover:bg-red-500/10"
                  >
                    Cancel
                  </button>
                </div>
              ) : timerDone ? (
                <p className="text-sm text-emerald-500 dark:text-emerald-400 font-medium">Session complete!</p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {[25, 50, 90].map((m) => (
                    <button
                      key={m}
                      onClick={() => handleStartTimer(m)}
                      className="text-xs rounded-lg bg-black/5 dark:bg-white/5 hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-400 text-gray-500 dark:text-white/40 px-2.5 py-1 transition-colors"
                    >
                      {m}m
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={timerInput}
                    onChange={(e) => setTimerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleStartTimer(parseInt(timerInput, 10))}
                    placeholder="min"
                    className="w-16 text-xs text-center rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-700 dark:text-white/60 py-1 px-2 outline-none focus:border-indigo-500 placeholder-gray-300 dark:placeholder-white/20"
                  />
                  <button
                    onClick={() => handleStartTimer(parseInt(timerInput, 10))}
                    disabled={!timerInput || parseInt(timerInput, 10) < 1}
                    className="text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white py-1 px-2.5 transition-colors"
                  >
                    Start
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Toolbar — three-column: phantom left balances the right toggle so the
           search input is always centred regardless of which side has buttons. */}
      <div className="flex items-center px-8 pt-4 pb-2">
        {/* Left phantom — same buttons, invisible, just reserves matching width */}
        <div className="flex gap-1 opacity-0 pointer-events-none" aria-hidden="true">
          <ViewBtn value="grid" label="▦" />
          <ViewBtn value="list" label="≡" />
        </div>

        {/* Centre: search input */}
        <div className="flex-1 flex justify-center px-3">
          {modes.length > 3 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search modes…"
              className="w-full max-w-xs rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white px-4 py-2 text-sm outline-none focus:border-indigo-500 placeholder-gray-400 dark:placeholder-white/30"
            />
          )}
        </div>

        {/* Right: actual toggle buttons */}
        <div className="flex gap-1 shrink-0">
          <ViewBtn value="grid" label="▦" />
          <ViewBtn value="list" label="≡" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-8 text-center">
          <p className="text-gray-400 dark:text-white/30 text-sm">No modes match "{search}"</p>
          <button onClick={() => setSearch("")} className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300">
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
              className="w-52 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 dark:border-white/15 hover:border-indigo-500/60 hover:bg-black/5 dark:hover:bg-white/5 text-gray-300 dark:text-white/25 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
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
              className="rounded-xl border border-dashed border-black/15 dark:border-white/15 hover:border-indigo-500/60 hover:bg-black/5 dark:hover:bg-white/5 text-gray-300 dark:text-white/25 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors py-4 text-sm font-medium"
            >
              + Add Mode
            </button>
          )}
        </div>
      )}
    </div>
  );
}
