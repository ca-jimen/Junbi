import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getModes, saveModes, getPreferences, savePreferences } from "./store";
import HomeView from "./components/HomeView";
import SettingsView from "./components/SettingsView";
import AddModeModal from "./components/AddModeModal";

export default function App() {
  const [view, setView] = useState("home");
  const [modes, setModes] = useState([]);
  const [preferences, setPreferences] = useState({ hideOnLaunch: true });
  const [showAddMode, setShowAddMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingScanModeId, setPendingScanModeId] = useState(null);
  const [invalidAppIds, setInvalidAppIds] = useState(new Set());

  useEffect(() => {
    Promise.all([getModes(), getPreferences()]).then(([m, p]) => {
      setModes(m);
      setPreferences(p);
      setLoading(false);
    });
  }, []);

  // Validate all app paths whenever modes change — runs on load and after any edit.
  useEffect(() => {
    const allApps = modes.flatMap((m) => m.apps);
    if (allApps.length === 0) { setInvalidAppIds(new Set()); return; }
    invoke("validate_app_paths", { apps: allApps })
      .then((ids) => setInvalidAppIds(new Set(ids)))
      .catch(() => {});
  }, [modes]);

  // Refresh modes when the backend emits a modes-updated event
  // (e.g. after usage_count / last_launched is updated on launch).
  useEffect(() => {
    let unlisten;
    listen("modes-updated", () => {
      getModes().then(setModes);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  async function handleSaveModes(updated) {
    setModes(updated);
    await saveModes(updated);
  }

  async function handleSavePreferences(updated) {
    setPreferences(updated);
    await savePreferences(updated);
    // Keep the OS-level shortcut registration in sync whenever preferences change.
    try {
      await invoke("set_global_shortcut", { shortcut: updated.globalShortcut ?? "" });
    } catch (_) {
      // Best-effort — invalid shortcut strings are surfaced in the settings UI instead.
    }
  }

  async function handleAddMode(mode) {
    const updated = [...modes, mode];
    await handleSaveModes(updated);
    setView("settings");
    setPendingScanModeId(mode.id);
  }

  async function handleExport() {
    const path = await save({
      defaultPath: "junbi-modes.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    await invoke("export_modes", { path, modes });
  }

  async function handleImport() {
    const path = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    const imported = await invoke("import_modes", { path });
    const merged = [
      ...modes,
      ...imported.map((m) => ({ ...m, id: crypto.randomUUID() })),
    ];
    await handleSaveModes(merged);
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
            <>
              <button
                onClick={handleImport}
                className="rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm px-3 py-1.5 transition-colors"
                title="Import modes from JSON"
              >
                Import
              </button>
              <button
                onClick={handleExport}
                className="rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm px-3 py-1.5 transition-colors"
                title="Export modes to JSON"
              >
                Export
              </button>
              <button
                onClick={() => setShowAddMode(true)}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 transition-colors"
              >
                + Add Mode
              </button>
            </>
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
      <main className="flex-1 overflow-y-auto flex flex-col">
        {view === "home" ? (
          <HomeView
            modes={modes}
            hideOnLaunch={preferences.hideOnLaunch}
            onOpenSettings={() => setView("settings")}
            onAddMode={() => setShowAddMode(true)}
            invalidAppIds={invalidAppIds}
          />
        ) : (
          <SettingsView
            modes={modes}
            onSave={handleSaveModes}
            pendingScanModeId={pendingScanModeId}
            onClearPendingScan={() => setPendingScanModeId(null)}
            preferences={preferences}
            onSavePreferences={handleSavePreferences}
          />
        )}
      </main>

      {showAddMode && (
        <AddModeModal onAdd={handleAddMode} onClose={() => setShowAddMode(false)} />
      )}
    </div>
  );
}
