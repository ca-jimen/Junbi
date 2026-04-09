import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

export default function AddAppModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");

  async function handleBrowse() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Executable", extensions: ["exe"] }],
    });
    if (selected) {
      setPath(selected);
      if (!name) {
        // Auto-fill name from filename (strip path and extension)
        const filename = selected.split(/[\\/]/).pop().replace(/\.exe$/i, "");
        setName(filename);
      }
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !path.trim()) return;
    onAdd({ id: crypto.randomUUID(), name: name.trim(), path: path.trim(), args: [] });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-lg font-semibold text-white mb-4">Add App</h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-white/50 mb-1 block">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Discord"
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1 block">Executable Path</label>
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\..."
                className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleBrowse}
                className="shrink-0 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 px-3 py-2 text-sm transition-colors"
              >
                Browse
              </button>
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
              disabled={!name.trim() || !path.trim()}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium py-2 text-sm transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
