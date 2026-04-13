import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppRow from "./AppRow";
import AddAppModal from "./AddAppModal";
import AddModeModal from "./AddModeModal";
import AppScannerModal from "./AppScannerModal";

export default function SettingsView({
  modes, onSave, pendingScanModeId, onClearPendingScan,
  preferences, onSavePreferences,
}) {
  const [localModes, setLocalModes] = useState(modes);
  const [expandedId, setExpandedId] = useState(null);
  const [invalidAppIds, setInvalidAppIds] = useState(new Set());
  const [editingMode, setEditingMode] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [addAppForMode, setAddAppForMode] = useState(null);
  const [scanForMode, setScanForMode] = useState(null);

  // Drag-and-drop state for mode reordering
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  // Autostart state (read from OS registry, not from preferences store)
  const [autostart, setAutostart] = useState(false);
  const [autostartLoaded, setAutostartLoaded] = useState(false);

  // Per-preference shortcut validation feedback
  const [shortcutError, setShortcutError] = useState("");

  useEffect(() => { setLocalModes(modes); }, [modes]);

  useEffect(() => {
    if (pendingScanModeId) {
      setExpandedId(pendingScanModeId);
      setScanForMode(pendingScanModeId);
      onClearPendingScan();
    }
  }, [pendingScanModeId]);

  useEffect(() => {
    invoke("get_autostart")
      .then((v) => { setAutostart(v); setAutostartLoaded(true); })
      .catch(() => setAutostartLoaded(true));
  }, []);

  // ---- mode helpers ----

  function toggleExpand(id) {
    const opening = expandedId !== id;
    setExpandedId((prev) => (prev === id ? null : id));
    if (opening) {
      const mode = localModes.find((m) => m.id === id);
      if (mode?.apps.length > 0) {
        invoke("validate_app_paths", { apps: mode.apps })
          .then((ids) => setInvalidAppIds((prev) => new Set([...prev, ...ids])))
          .catch(() => {});
      }
    }
  }

  function handleSaveMode(updated) {
    const next = localModes.map((m) => (m.id === updated.id ? updated : m));
    setLocalModes(next);
    onSave(next);
  }

  function handleDeleteMode(modeId) {
    const updated = localModes.filter((m) => m.id !== modeId);
    setLocalModes(updated);
    onSave(updated);
  }

  function handleDuplicateMode(mode) {
    const copy = {
      ...mode,
      id: crypto.randomUUID(),
      name: `${mode.name} (copy)`,
      apps: mode.apps.map((a) => ({ ...a, id: crypto.randomUUID() })),
    };
    const updated = [...localModes, copy];
    setLocalModes(updated);
    onSave(updated);
  }

  function handleAddApp(modeId, app) {
    const appsToAdd = Array.isArray(app) ? app : [app];
    const updated = localModes.map((m) =>
      m.id === modeId ? { ...m, apps: [...m.apps, ...appsToAdd] } : m
    );
    setLocalModes(updated);
    onSave(updated);
  }

  function handleDeleteApp(modeId, appId) {
    const updated = localModes.map((m) =>
      m.id === modeId ? { ...m, apps: m.apps.filter((a) => a.id !== appId) } : m
    );
    setLocalModes(updated);
    onSave(updated);
  }

  function handleMoveApp(modeId, appIndex, direction) {
    const updated = localModes.map((m) => {
      if (m.id !== modeId) return m;
      const apps = [...m.apps];
      const target = appIndex + direction;
      if (target < 0 || target >= apps.length) return m;
      [apps[appIndex], apps[target]] = [apps[target], apps[appIndex]];
      return { ...m, apps };
    });
    setLocalModes(updated);
    onSave(updated);
  }

  function handleUpdateApp(modeId, updatedApp) {
    const updated = localModes.map((m) =>
      m.id === modeId
        ? { ...m, apps: m.apps.map((a) => (a.id === updatedApp.id ? updatedApp : a)) }
        : m
    );
    setLocalModes(updated);
    onSave(updated);
  }

  function handleUpdateDelay(modeId, delayMs) {
    const updated = localModes.map((m) =>
      m.id === modeId ? { ...m, delay_ms: delayMs } : m
    );
    setLocalModes(updated);
    onSave(updated);
  }

  function handleUpdateHotkey(modeId, hotkey) {
    const updated = localModes.map((m) =>
      m.id === modeId ? { ...m, hotkey } : m
    );
    setLocalModes(updated);
    onSave(updated);
  }

  // ---- drag-and-drop mode reordering ----
  // Uses pointer capture so events are reliably delivered to the drag handle
  // even when the cursor moves outside it, then uses getBoundingClientRect
  // for hit-testing — both required for Tauri's WKWebView on macOS.

  function startDrag(e, index) {
    e.preventDefault();
    const handle = e.currentTarget;
    // Capture the pointer: all future pointermove/pointerup for this pointer
    // are sent to `handle` regardless of what element is under the cursor.
    handle.setPointerCapture(e.pointerId);
    setDragIndex(index);

    function getCardIndex(clientY) {
      const cards = document.querySelectorAll("[data-mode-index]");
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return parseInt(card.dataset.modeIndex, 10);
        }
      }
      return null;
    }

    function onMove(ev) {
      const idx = getCardIndex(ev.clientY);
      if (idx !== null) setOverIndex(idx);
    }

    function onUp(ev) {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.releasePointerCapture(ev.pointerId);

      const dropIdx = getCardIndex(ev.clientY);
      setDragIndex(null);
      setOverIndex(null);

      if (dropIdx !== null && dropIdx !== index) {
        setLocalModes((prev) => {
          const next = [...prev];
          const [removed] = next.splice(index, 1);
          next.splice(dropIdx, 0, removed);
          onSave(next);
          return next;
        });
      }
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  // ---- autostart ----

  function handleAutostartChange(e) {
    const enabled = e.target.checked;
    setAutostart(enabled);
    invoke("set_autostart", { enabled }).catch(() => setAutostart(!enabled));
  }

  // ---- global shortcut ----

  function handleShortcutBlur(e) {
    const shortcut = e.target.value.trim();
    setShortcutError("");
    onSavePreferences({ ...preferences, globalShortcut: shortcut });
    // Error feedback is surfaced via App.jsx's invoke catch — show nothing on success,
    // let App.jsx handle it. If the field is re-focused with an old value on error,
    // the user sees no change and knows the shortcut was invalid.
  }

  return (
    <div className="flex flex-col gap-3 p-6">
      {localModes.map((mode, index) => (
        <div
          key={mode.id}
          data-mode-index={index}
          className={`rounded-xl bg-white/5 overflow-hidden transition-colors border ${
            overIndex === index && dragIndex !== index
              ? "border-indigo-500 bg-indigo-500/5"
              : "border-white/10"
          } ${dragIndex === index ? "opacity-40" : ""}`}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Drag handle */}
            <span
              onPointerDown={(e) => startDrag(e, index)}
              className="shrink-0 text-white/20 hover:text-white/60 cursor-grab active:cursor-grabbing select-none text-base px-0.5"
              title="Drag to reorder"
            >
              ⠿
            </span>
            <button
              onClick={() => toggleExpand(mode.id)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <span className="text-2xl">{mode.icon}</span>
              <span className="text-white font-medium">{mode.name}</span>
              <span className="text-white/40 text-sm ml-1">
                {mode.apps.length > 0 ? `${mode.apps.length} app${mode.apps.length !== 1 ? "s" : ""}` : "No apps"}
              </span>
              <span className="ml-auto text-white/30 text-sm">
                {expandedId === mode.id ? "▲" : "▼"}
              </span>
            </button>
            <button
              onClick={() => handleDuplicateMode(mode)}
              className="shrink-0 text-white/20 hover:text-white transition-colors text-sm leading-none px-1"
              title="Duplicate mode"
            >
              ⊕
            </button>
            <button
              onClick={() => setEditingMode(mode)}
              className="shrink-0 text-white/20 hover:text-white transition-colors text-sm leading-none px-1"
              title="Edit mode"
            >
              ✎
            </button>
            {confirmDeleteId === mode.id ? (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-white/50 mr-1">Delete?</span>
                <button
                  onClick={() => { handleDeleteMode(mode.id); setConfirmDeleteId(null); }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors px-1"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-xs text-white/30 hover:text-white transition-colors px-1"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(mode.id)}
                className="shrink-0 text-white/20 hover:text-red-400 transition-colors text-xl leading-none"
                title="Delete mode"
              >
                ×
              </button>
            )}
          </div>

          {expandedId === mode.id && (
            <div className="border-t border-white/10 px-4 pb-4 pt-3 flex flex-col gap-2">
              {mode.apps.length === 0 && (
                <p className="text-white/30 text-sm">No apps yet.</p>
              )}
              {mode.apps.map((app, appIndex) => (
                <AppRow
                  key={app.id}
                  app={app}
                  invalid={invalidAppIds.has(app.id)}
                  onDelete={(appId) => handleDeleteApp(mode.id, appId)}
                  onUpdate={(updatedApp) => handleUpdateApp(mode.id, updatedApp)}
                  onMoveUp={appIndex > 0 ? () => handleMoveApp(mode.id, appIndex, -1) : null}
                  onMoveDown={appIndex < mode.apps.length - 1 ? () => handleMoveApp(mode.id, appIndex, 1) : null}
                />
              ))}
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setAddAppForMode(mode.id)}
                  className="flex-1 rounded-lg border border-dashed border-white/20 hover:border-indigo-500 text-white/40 hover:text-indigo-400 py-2 text-sm transition-colors"
                >
                  + Add Manually
                </button>
                <button
                  onClick={() => setScanForMode(mode.id)}
                  className="flex-1 rounded-lg border border-dashed border-white/20 hover:border-indigo-500 text-white/40 hover:text-indigo-400 py-2 text-sm transition-colors"
                >
                  Browse Installed
                </button>
              </div>

              {/* Per-mode settings */}
              <div className="mt-1 pt-2 border-t border-white/5 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-white/40 flex-1">Delay between apps</label>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    step="100"
                    value={mode.delay_ms ?? 0}
                    onChange={(e) => handleUpdateDelay(mode.id, Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-20 rounded-lg bg-white/5 border border-white/10 text-white px-2 py-1 text-sm outline-none focus:border-indigo-500 text-right"
                  />
                  <span className="text-xs text-white/30">ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-white/40 flex-1">Hotkey</label>
                  <input
                    type="text"
                    defaultValue={mode.hotkey ?? ""}
                    onBlur={(e) => handleUpdateHotkey(mode.id, e.target.value.trim())}
                    placeholder="e.g. Ctrl+Shift+W"
                    className="w-36 rounded-lg bg-white/5 border border-white/10 text-white px-2 py-1 text-sm outline-none focus:border-indigo-500 font-mono placeholder-white/20"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Preferences */}
      {preferences && (
        <div className="rounded-xl bg-white/5 border border-white/10 px-5 py-4 mt-1">
          <p className="text-xs text-white/30 uppercase tracking-wider mb-4">Preferences</p>
          <div className="flex flex-col gap-4">

            {/* Minimize on launch */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.hideOnLaunch ?? true}
                onChange={(e) => onSavePreferences({ ...preferences, hideOnLaunch: e.target.checked })}
                className="mt-0.5 accent-indigo-500 w-4 h-4 cursor-pointer"
              />
              <div>
                <p className="text-sm text-white leading-snug">Minimize window on launch</p>
                <p className="text-xs text-white/40 mt-0.5">
                  Minimizes Junbi to the taskbar when a mode is launched.
                </p>
              </div>
            </label>

            {/* Launch on startup */}
            {autostartLoaded && (
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={handleAutostartChange}
                  className="mt-0.5 accent-indigo-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <p className="text-sm text-white leading-snug">Launch on startup</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Start Junbi automatically when you log in.
                  </p>
                </div>
              </label>
            )}

            {/* Global shortcut */}
            <div>
              <p className="text-sm text-white leading-snug mb-1">Global shortcut</p>
              <p className="text-xs text-white/40 mb-2">
                Open Junbi from anywhere. Format: <span className="text-white/60">Ctrl+Shift+J</span>
              </p>
              <input
                type="text"
                defaultValue={preferences.globalShortcut ?? ""}
                onBlur={handleShortcutBlur}
                placeholder="e.g. Ctrl+Shift+J — leave blank to disable"
                className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              {shortcutError && (
                <p className="text-xs text-red-400 mt-1">{shortcutError}</p>
              )}
            </div>

          </div>
        </div>
      )}

      {editingMode && (
        <AddModeModal
          mode={editingMode}
          onSave={handleSaveMode}
          onClose={() => setEditingMode(null)}
        />
      )}
      {addAppForMode && (
        <AddAppModal
          onAdd={(app) => handleAddApp(addAppForMode, app)}
          onClose={() => setAddAppForMode(null)}
          modeName={localModes.find((m) => m.id === addAppForMode)?.name}
        />
      )}
      {scanForMode && (
        <AppScannerModal
          onAdd={(apps) => handleAddApp(scanForMode, apps)}
          onClose={() => setScanForMode(null)}
          modeName={localModes.find((m) => m.id === scanForMode)?.name}
          existingApps={localModes.find((m) => m.id === scanForMode)?.apps ?? []}
        />
      )}
    </div>
  );
}
