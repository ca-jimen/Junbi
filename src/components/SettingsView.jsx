import { useState } from "react";
import AppRow from "./AppRow";
import AddAppModal from "./AddAppModal";
import AppScannerModal from "./AppScannerModal";

export default function SettingsView({ modes, onSave }) {
  const [localModes, setLocalModes] = useState(modes);
  const [expandedId, setExpandedId] = useState(null);
  const [editingMode, setEditingMode] = useState(null);
  const [addAppForMode, setAddAppForMode] = useState(null);
  const [scanForMode, setScanForMode] = useState(null);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
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

  return (
    <div className="flex flex-col gap-3 p-6">
      {localModes.map((mode) => (
        <div key={mode.id} className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
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
              onClick={() => setEditingMode(mode)}
              className="shrink-0 text-white/20 hover:text-white transition-colors text-sm leading-none px-1"
              title="Edit mode"
            >
              ✎
            </button>
            <button
              onClick={() => handleDeleteMode(mode.id)}
              className="shrink-0 text-white/20 hover:text-red-400 transition-colors text-xl leading-none"
              title="Delete mode"
            >
              ×
            </button>
          </div>

          {expandedId === mode.id && (
            <div className="border-t border-white/10 px-4 pb-4 pt-3 flex flex-col gap-2">
              {mode.apps.length === 0 && (
                <p className="text-white/30 text-sm">No apps yet.</p>
              )}
              {mode.apps.map((app) => (
                <AppRow
                  key={app.id}
                  app={app}
                  onDelete={(appId) => handleDeleteApp(mode.id, appId)}
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
        />
      )}
      {scanForMode && (
        <AppScannerModal
          onAdd={(apps) => handleAddApp(scanForMode, apps)}
          onClose={() => setScanForMode(null)}
        />
      )}
    </div>
  );
}
