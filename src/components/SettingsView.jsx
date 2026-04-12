import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import AppRow from "./AppRow";
import AddAppModal from "./AddAppModal";
import AddModeModal from "./AddModeModal";
import AppScannerModal from "./AppScannerModal";

export default function SettingsView({ modes, onSave, pendingScanModeId, onClearPendingScan }) {
  const [localModes, setLocalModes] = useState(modes);
  const [expandedId, setExpandedId] = useState(null);
  const [invalidAppIds, setInvalidAppIds] = useState(new Set());
  const [editingMode, setEditingMode] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [addAppForMode, setAddAppForMode] = useState(null);
  const [scanForMode, setScanForMode] = useState(null);

  useEffect(() => {
    setLocalModes(modes);
  }, [modes]);

  useEffect(() => {
    if (pendingScanModeId) {
      setExpandedId(pendingScanModeId);
      setScanForMode(pendingScanModeId);
      onClearPendingScan();
    }
  }, [pendingScanModeId]);

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

  function handleMoveMode(index, direction) {
    const next = [...localModes];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLocalModes(next);
    onSave(next);
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

  return (
    <div className="flex flex-col gap-3 p-6">
      {localModes.map((mode, index) => (
        <div key={mode.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Reorder buttons */}
            <div className="flex flex-col shrink-0 gap-0.5">
              <button
                onClick={() => handleMoveMode(index, -1)}
                disabled={index === 0}
                className="text-white/20 hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors text-xs leading-none"
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => handleMoveMode(index, 1)}
                disabled={index === localModes.length - 1}
                className="text-white/20 hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors text-xs leading-none"
                title="Move down"
              >
                ▼
              </button>
            </div>
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
                  title="Confirm delete"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-xs text-white/30 hover:text-white transition-colors px-1"
                  title="Cancel"
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
            </div>
          )}
        </div>
      ))}

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
        />
      )}
    </div>
  );
}
