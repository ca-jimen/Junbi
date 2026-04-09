import { useState } from "react";

const ICON_OPTIONS = ["🎮", "📚", "💼", "🎵", "🎨", "🏋️", "☕", "✍️", "🧘", "🔬"];

// Pass `mode` prop to edit an existing mode; omit it to create a new one.
export default function AddModeModal({ onAdd, onSave, onClose, mode }) {
  const editing = Boolean(mode);
  const [name, setName] = useState(mode?.name ?? "");
  const [icon, setIcon] = useState(mode?.icon ?? "🎮");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      onSave({ ...mode, name: name.trim(), icon });
    } else {
      onAdd({ id: crypto.randomUUID(), name: name.trim(), icon, apps: [] });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-lg font-semibold text-white mb-4">
          {editing ? "Edit Mode" : "Add Mode"}
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
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`text-2xl p-1 rounded-lg transition-colors ${
                    icon === emoji ? "bg-indigo-600" : "hover:bg-white/10"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
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
  );
}
