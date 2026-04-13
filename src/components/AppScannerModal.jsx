import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

const BROWSER_NAMES = ["chrome", "chromium", "firefox", "safari", "edge", "brave", "opera", "vivaldi", "arc", "zen"];

function isBrowser(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return BROWSER_NAMES.some((b) => lower.includes(b));
}

export default function AppScannerModal({ onAdd, onClose, modeName, existingApps = [] }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apps, setApps] = useState([]);
  const [search, setSearch] = useState("");
  // Pre-select apps already in the mode so the user can see what's been added.
  const [selected, setSelected] = useState(
    () => new Set(existingApps.map((a) => a.path))
  );
  // Pre-populate browser URL state from existing apps.
  const [browserUrls, setBrowserUrls] = useState(
    () => Object.fromEntries(
      existingApps
        .filter((a) => isBrowser(a.path) && a.args?.length > 0)
        .map((a) => [a.path, [...a.args]])
    )
  ); // { [path]: string[] }

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
      if (next.has(path)) {
        next.delete(path);
        setBrowserUrls((u) => {
          const n = { ...u };
          delete n[path];
          return n;
        });
      } else {
        next.add(path);
        if (isBrowser(path)) {
          setBrowserUrls((u) => ({ ...u, [path]: [""] }));
        }
      }
      return next;
    });
  }

  function addUrlForApp(path) {
    setBrowserUrls((u) => ({ ...u, [path]: [...(u[path] || []), ""] }));
  }

  function updateUrlForApp(path, i, value) {
    setBrowserUrls((u) => ({
      ...u,
      [path]: u[path].map((v, idx) => (idx === i ? value : v)),
    }));
  }

  function removeUrlForApp(path, i) {
    setBrowserUrls((u) => ({
      ...u,
      [path]: u[path].filter((_, idx) => idx !== i),
    }));
  }

  function handleAdd() {
    const existingPaths = new Set(existingApps.map((a) => a.path));
    const toAdd = apps
      .filter((a) => selected.has(a.path) && !existingPaths.has(a.path))
      .map((a) => {
        const urls = (browserUrls[a.path] || []).map((u) => u.trim()).filter(Boolean);
        return { id: crypto.randomUUID(), name: a.name, path: a.path, args: urls };
      });
    onAdd(toAdd);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl flex flex-col w-full max-w-md mx-4" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-semibold text-white mb-3">
            Add installed apps{modeName ? <> for <span className="text-indigo-400">{modeName}</span></> : ""}
          </h3>
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
              const showUrls = checked && isBrowser(app.path);
              const urls = browserUrls[app.path] || [];
              return (
                <div
                  key={app.path}
                  className={`rounded-lg mb-0.5 transition-colors ${checked ? "bg-indigo-600/20" : ""}`}
                >
                  <button
                    onClick={() => toggleApp(app.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      checked ? "" : "hover:bg-white/5"
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

                  {showUrls && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-white/40 mb-2">URLs to open in tabs <span className="text-white/20">(optional)</span></p>
                      {urls.map((url, i) => (
                        <div key={i} className="flex gap-2 mb-2">
                          <input
                            value={url}
                            onChange={(e) => updateUrlForApp(app.path, i, e.target.value)}
                            placeholder="https://..."
                            className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
                          />
                          <button
                            onClick={() => removeUrlForApp(app.path, i)}
                            className="shrink-0 w-7 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors text-lg leading-none"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addUrlForApp(app.path)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 hover:border-indigo-500 text-white/30 hover:text-indigo-400 py-1.5 text-xs transition-colors"
                      >
                        <span className="text-sm leading-none">+</span>
                        <span>{urls.length === 0 ? "Add a tab URL" : "Add another tab"}</span>
                      </button>
                    </div>
                  )}
                </div>
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
