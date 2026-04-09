import { useState, useEffect } from "react";
import { getModes, saveModes } from "./store";
import HomeView from "./components/HomeView";
import SettingsView from "./components/SettingsView";
import AddModeModal from "./components/AddModeModal";

export default function App() {
  const [view, setView] = useState("home");
  const [modes, setModes] = useState([]);
  const [showAddMode, setShowAddMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getModes().then((m) => {
      setModes(m);
      setLoading(false);
    });
  }, []);

  async function handleSaveModes(updated) {
    setModes(updated);
    await saveModes(updated);
  }

  async function handleAddMode(mode) {
    const updated = [...modes, mode];
    await handleSaveModes(updated);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="text-white/30 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          {view === "settings" && (
            <button
              onClick={() => setView("home")}
              className="text-white/50 hover:text-white transition-colors text-lg leading-none mr-1"
              title="Back"
            >
              ←
            </button>
          )}
          <h1 className="text-white font-bold text-lg tracking-tight">Junbi</h1>
          {view === "settings" && (
            <span className="text-white/40 text-sm">Settings</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view === "settings" && (
            <button
              onClick={() => setShowAddMode(true)}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 transition-colors"
            >
              + Add Mode
            </button>
          )}
          {view === "home" && (
            <button
              onClick={() => setView("settings")}
              className="text-white/40 hover:text-white transition-colors text-xl leading-none"
              title="Settings"
            >
              ⚙
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {view === "home" ? (
          <HomeView modes={modes} />
        ) : (
          <SettingsView modes={modes} onSave={handleSaveModes} />
        )}
      </main>

      {showAddMode && (
        <AddModeModal onAdd={handleAddMode} onClose={() => setShowAddMode(false)} />
      )}
    </div>
  );
}
