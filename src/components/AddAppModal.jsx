import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

const BROWSER_NAMES = ["chrome", "chromium", "firefox", "safari", "edge", "brave", "opera", "vivaldi", "arc", "zen"];

function isBrowser(filePath) {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  return BROWSER_NAMES.some((b) => lower.includes(b));
}

export default function AddAppModal({ onAdd, onClose, modeName }) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [urls, setUrls] = useState([]);

  async function handleBrowse() {
    const selected = await open({ multiple: false });
    if (selected) {
      setPath(selected);
      if (!name) {
        const filename = selected
          .split(/[\\/]/)
          .pop()
          .replace(/\.(exe|app)$/i, "");
        setName(filename);
      }
      if (isBrowser(selected) && urls.length === 0) {
        setUrls([""]);
      }
    }
  }

  function handlePathChange(value) {
    setPath(value);
    if (isBrowser(value) && urls.length === 0) {
      setUrls([""]);
    }
  }

  function addUrl() {
    setUrls((prev) => [...prev, ""]);
  }

  function updateUrl(i, value) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }

  function removeUrl(i) {
    setUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !path.trim()) return;
    const filteredUrls = urls.map((u) => u.trim()).filter(Boolean);
    onAdd({ id: crypto.randomUUID(), name: name.trim(), path: path.trim(), args: filteredUrls });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-white">
          Add App{modeName ? <> to <span className="text-indigo-400">{modeName}</span></> : ""}
        </h3>
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
            <label className="text-xs text-white/50 mb-1 block">Path</label>
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => handlePathChange(e.target.value)}
                placeholder="/Applications/App.app or C:\..."
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

          {/* URLs / launch parameters section */}
          {(() => {
            const browser = isBrowser(path);
            const sectionLabel = browser ? "URLs to open in tabs" : "Launch parameters";
            const placeholder = browser ? "https://..." : "--flag or -arg";
            const addLabel = browser
              ? (urls.length === 0 ? "Add a tab URL" : "Add another tab")
              : (urls.length === 0 ? "Add a parameter" : "Add another parameter");
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-white/50">{sectionLabel}</label>
                  <span className="text-xs text-white/20">optional</span>
                </div>
                {urls.map((url, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      value={url}
                      onChange={(e) => updateUrl(i, e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeUrl(i)}
                      className="shrink-0 w-8 h-9 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addUrl}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 hover:border-indigo-500 text-white/30 hover:text-indigo-400 py-2 text-sm transition-colors"
                >
                  <span className="text-base leading-none">+</span>
                  <span>{addLabel}</span>
                </button>
              </div>
            );
          })()}

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
