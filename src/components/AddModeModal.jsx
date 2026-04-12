import { useState } from "react";
import AddAppModal from "./AddAppModal";
import AppScannerModal from "./AppScannerModal";
import AppRow from "./AppRow";

const ICON_CATEGORIES = [
  { label: "Work & Study", icons: ["💼", "📚", "🔬", "📝", "🖥️", "📊", "🗂️", "📌", "✉️", "🖊️"] },
  { label: "Creative", icons: ["🎨", "✍️", "🎵", "🎬", "📷", "🎭", "🎤", "🎸", "🖌️", "📐"] },
  { label: "Gaming", icons: ["🎮", "🕹️", "👾", "🏆", "🎲", "⚔️", "🛡️", "🎯", "🃏", "🧩"] },
  { label: "Health & Life", icons: ["🏋️", "🧘", "🏃", "🍎", "💤", "🧠", "❤️", "🌿", "💊", "🚴"] },
  { label: "Social & Fun", icons: ["☕", "🍕", "🎉", "🌍", "✈️", "🏠", "🎁", "🤝", "📱", "🌙"] },
];

// Pass `mode` prop to edit an existing mode; omit it to create a new one.
export default function AddModeModal({ onAdd, onSave, onClose, mode }) {
  const editing = Boolean(mode);
  const [name, setName] = useState(mode?.name ?? "");
  const [icon, setIcon] = useState(mode?.icon ?? "🎮");
  const [apps, setApps] = useState(mode?.apps ?? []);
  const [showAddApp, setShowAddApp] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  function handleAddApp(app) {
    const toAdd = Array.isArray(app) ? app : [app];
    setApps((prev) => [...prev, ...toAdd]);
  }

  function handleDeleteApp(appId) {
    setApps((prev) => prev.filter((a) => a.id !== appId));
  }

  function handleMoveApp(index, direction) {
    setApps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      onSave({ ...mode, name: name.trim(), icon, apps });
    } else {
      onAdd({ id: crypto.randomUUID(), name: name.trim(), icon, apps: [] });
    }
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div
          className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4"
          style={{ maxHeight: "85vh", overflowY: "auto" }}
        >
          <h3 className="text-lg font-semibold text-white">
            {editing ? (
              <>Edit <span className="text-indigo-400">{mode.name}</span></>
            ) : (
              "Add Mode"
            )}
          </h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Creative"
                className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-2 block">Icon</label>
              {/* Custom emoji input */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-3xl w-10 text-center select-none">{icon}</span>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => {
                    const val = [...e.target.value].slice(-2).join("");
                    if (val) setIcon(val.trim() || icon);
                  }}
                  placeholder="Paste any emoji…"
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 text-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              {/* Categorised quick-pick */}
              {ICON_CATEGORIES.map((cat) => (
                <div key={cat.label} className="mb-2">
                  <p className="text-xs text-white/30 mb-1">{cat.label}</p>
                  <div className="flex flex-wrap gap-1">
                    {cat.icons.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcon(emoji)}
                        className={`text-xl p-1 rounded-lg transition-colors ${
                          icon === emoji ? "bg-indigo-600" : "hover:bg-white/10"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {editing && (
              <div>
                <label className="text-xs text-white/50 mb-2 block">Apps</label>
                <div className="flex flex-col gap-2">
                  {apps.length === 0 && (
                    <p className="text-xs text-white/20">No apps yet.</p>
                  )}
                  {apps.map((app, appIndex) => (
                    <AppRow
                      key={app.id}
                      app={app}
                      onDelete={handleDeleteApp}
                      onUpdate={(updatedApp) =>
                        setApps((prev) =>
                          prev.map((a) => (a.id === updatedApp.id ? updatedApp : a))
                        )
                      }
                      onMoveUp={appIndex > 0 ? () => handleMoveApp(appIndex, -1) : null}
                      onMoveDown={appIndex < apps.length - 1 ? () => handleMoveApp(appIndex, 1) : null}
                    />
                  ))}
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddApp(true)}
                      className="flex-1 rounded-lg border border-dashed border-white/20 hover:border-indigo-500 text-white/40 hover:text-indigo-400 py-2 text-sm transition-colors"
                    >
                      + Add Manually
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="flex-1 rounded-lg border border-dashed border-white/20 hover:border-indigo-500 text-white/40 hover:text-indigo-400 py-2 text-sm transition-colors"
                    >
                      Browse Installed
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium py-2 text-sm transition-colors"
              >
                {editing ? "Save" : "Add"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAddApp && (
        <AddAppModal
          modeName={name}
          onAdd={handleAddApp}
          onClose={() => setShowAddApp(false)}
        />
      )}
      {showScanner && (
        <AppScannerModal
          modeName={name}
          onAdd={handleAddApp}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
