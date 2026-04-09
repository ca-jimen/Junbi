import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function AppScannerModal({ onAdd, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apps, setApps] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    invoke("scan_apps")
      .then((result) => setApps(result))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      apps.filter((a) =>
        a.name.toLowerCase().includes(search.toLowerCase())
      ),
    [apps, search]
  );

  function toggleApp(path) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function handleAdd() {
    const toAdd = apps
      .filter((a) => selected.has(a.path))
      .map((a) => ({ id: crypto.randomUUID(), name: a.name, path: a.path, args: [] }));
    onAdd(toAdd);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col w-full max-w-md mx-4" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-semibold text-white mb-3">Browse Installed Apps</h3>
          {!loading && !error && (
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps…"
              className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-2 py-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-white/40 text-sm">
              Scanning installed apps…
            </div>
          )}
          {error && (
            <div className="px-3 py-4 text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-4 text-white/30 text-sm text-center">
              {search ? "No apps match your search." : "No apps found."}
            </div>
          )}
          {!loading &&
            !error &&
            filtered.map((app) => {
              const checked = selected.has(app.path);
              return (
                <button
                  key={app.path}
                  onClick={() => toggleApp(app.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    checked ? "bg-indigo-600/20" : "hover:bg-white/5"
                  }`}
                >
                  <span
                    className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-xs ${
                      checked
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-white/20"
                    }`}
                  >
                    {checked && "✓"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{app.name}</p>
                    <p className="text-xs text-white/30 truncate">{app.path}</p>
                  </div>
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2 text-sm transition-colors"
          >
            {selected.size === 0
              ? "Add Apps"
              : `Add ${selected.size} App${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
