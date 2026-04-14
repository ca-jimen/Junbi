import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getModes, saveModes, getPreferences, savePreferences } from "./store";
import HomeView from "./components/HomeView";
import SettingsView from "./components/SettingsView";
import AddModeModal from "./components/AddModeModal";
import logo from "./assets/logo.svg";

export default function App() {
  const [view, setView] = useState("home");
  const [modes, setModes] = useState([]);
  const [preferences, setPreferences] = useState({ hideOnLaunch: true, theme: "dark", showStoicQuotes: true });
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

  // Apply theme class to <html> whenever preferences.theme changes.
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [preferences.theme]);

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

  function toggleTheme() {
    const next = preferences.theme === "dark" ? "light" : "dark";
    handleSavePreferences({ ...preferences, theme: next });
  }

  const isDark = preferences.theme === "dark";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-gray-400 dark:text-white/30 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          {view === "settings" && (
            <button
              onClick={() => setView("home")}
              className="text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white transition-colors text-lg leading-none mr-1"
              title="Back"
            >
              ←
            </button>
          )}
          {/* Logo + wordmark */}
          <div className="flex items-center gap-2">
            <img src={logo} alt="Junbi logo" width={28} height={28} className="rounded-lg shrink-0" />
            <h1 className="text-gray-900 dark:text-white font-bold text-lg tracking-tight">Junbi</h1>
          </div>
          {view === "settings" && (
            <span className="text-gray-400 dark:text-white/40 text-sm">Settings</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {view === "settings" && (
            <>
              <button
                onClick={handleImport}
                className="rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 text-sm px-3 py-1.5 transition-colors"
                title="Import modes from JSON"
              >
                Import
              </button>
              <button
                onClick={handleExport}
                className="rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 text-sm px-3 py-1.5 transition-colors"
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
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white text-base px-2.5 py-1.5 transition-colors leading-none"
          >
            {isDark ? "☀" : "☽"}
          </button>
          {view === "home" && (
            <button
              onClick={() => setView("settings")}
              className="text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors text-xl leading-none"
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
            showStoicQuotes={preferences.showStoicQuotes ?? true}
            showTimer={preferences.showTimer ?? true}
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
