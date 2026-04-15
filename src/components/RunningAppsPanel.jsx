import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useCallback } from "react";

export default function RunningAppsPanel() {
  const [apps, setApps] = useState([]);
  const [killing, setKilling] = useState(new Set()); // pids currently being killed

  const refresh = useCallback(() => {
    invoke("get_running_apps")
      .then(setApps)
      .catch(() => {});
  }, []);

  // Refresh on mount and whenever any mode changes.
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    let unlisten;
    listen("modes-updated", refresh).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [refresh]);

  // Periodic refresh to pick up apps that exit on their own.
  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleKill(app) {
    setKilling((prev) => new Set(prev).add(app.pid));
    try {
      await invoke("kill_running_app", { pid: app.pid, modeId: app.mode_id });
    } catch (_) {}
    setKilling((prev) => { const next = new Set(prev); next.delete(app.pid); return next; });
    refresh();
  }

  if (apps.length === 0) return null;

  // Group by mode for display.
  const groups = apps.reduce((acc, app) => {
    if (!acc[app.mode_id]) {
      acc[app.mode_id] = { icon: app.mode_icon, name: app.mode_name, apps: [] };
    }
    acc[app.mode_id].apps.push(app);
    return acc;
  }, {});

  return (
    <div className="mx-6 mt-4">
      <div className="rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5 dark:border-white/5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.45)] shrink-0" />
          <p className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider">
            Running Apps
          </p>
          <span className="ml-auto text-xs text-gray-400 dark:text-white/25">
            {apps.length} {apps.length === 1 ? "app" : "apps"}
          </span>
        </div>

        {/* App chips grouped by mode */}
        <div className="flex flex-col gap-3 p-4">
          {Object.entries(groups).map(([modeId, group]) => (
            <div key={modeId}>
              {/* Mode label */}
              <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-white/30 mb-2">
                <span className="text-sm leading-none">{group.icon}</span>
                <span>{group.name}</span>
              </p>
              {/* App chips */}
              <div className="flex flex-wrap gap-2">
                {group.apps.map((entry) => (
                  <div
                    key={`${entry.mode_id}-${entry.app_name}`}
                    className="flex items-center gap-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 pl-3 pr-2 py-1.5"
                  >
                    <span className="text-xs font-medium text-gray-700 dark:text-white/70">
                      {entry.app_name}
                    </span>
                    {entry.pid > 0 && (
                      <>
                        <span className="text-xs text-gray-300 dark:text-white/20 font-mono select-none">
                          {entry.pid}
                        </span>
                        <button
                          onClick={() => handleKill(entry)}
                          disabled={killing.has(entry.pid)}
                          title={`Kill ${entry.app_name}`}
                          className="text-gray-300 dark:text-white/20 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-base leading-none ml-0.5"
                        >
                          {killing.has(entry.pid) ? "…" : "×"}
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
