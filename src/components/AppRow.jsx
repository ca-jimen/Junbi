import { useState } from "react";

const BROWSER_NAMES = ["chrome", "chromium", "firefox", "safari", "edge", "brave", "opera", "vivaldi", "arc", "zen"];
function isBrowser(path) {
  if (!path) return false;
  return BROWSER_NAMES.some((b) => path.toLowerCase().includes(b));
}

export default function AppRow({ app, onDelete, onUpdate, onMoveUp, onMoveDown, invalid }) {
  const [expanded, setExpanded] = useState(false);
  const [urls, setUrls] = useState(app.args ?? []);

  function save(nextUrls) {
    setUrls(nextUrls);
    if (onUpdate) {
      onUpdate({ ...app, args: nextUrls.map((u) => u.trim()).filter(Boolean) });
    }
  }

  function updateUrl(i, value) {
    const next = urls.map((u, idx) => (idx === i ? value : u));
    setUrls(next);
  }

  function commitUrl(i) {
    // Persist on blur so we don't save on every keystroke.
    save(urls);
  }

  function addUrl() {
    const next = [...urls, ""];
    setUrls(next);
  }

  function removeUrl(i) {
    save(urls.filter((_, idx) => idx !== i));
  }

  const argCount = (app.args ?? []).length;
  const browser = isBrowser(app.path);
  const argLabel = browser ? "URL" : "param";
  const argLabelPlural = browser ? "URLs" : "params";
  const argPlaceholder = browser ? "https://..." : "--flag or -arg";
  const addLabel = browser
    ? (urls.length === 0 ? "Add a tab URL" : "Add another tab")
    : (urls.length === 0 ? "Add a parameter" : "Add another parameter");

  return (
    <div className={`rounded-lg overflow-hidden ${invalid ? "bg-red-500/10 border border-red-500/20" : "bg-white/5"}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Reorder buttons */}
        {(onMoveUp || onMoveDown) && (
          <div className="flex flex-col shrink-0 gap-0.5">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              className="text-white/20 hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors text-xs leading-none"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              className="text-white/20 hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors text-xs leading-none"
            >
              ▼
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-white truncate">{app.name}</p>
            {invalid && (
              <span className="shrink-0 text-xs text-red-400" title="App not found at this path">⚠</span>
            )}
          </div>
          <p className="text-xs text-white/40 truncate">{app.path}</p>
        </div>

        {/* Args toggle — show count if collapsed, hide label if expanded */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs text-indigo-400/70 hover:text-indigo-300 transition-colors px-1"
          title={expanded ? `Hide ${argLabelPlural}` : `Edit ${argLabelPlural}`}
        >
          {expanded
            ? `hide ${argLabelPlural}`
            : argCount > 0
            ? `${argCount} ${argCount !== 1 ? argLabelPlural : argLabel} ✎`
            : `+ ${argLabelPlural}`}
        </button>

        <button
          type="button"
          onClick={() => onDelete(app.id)}
          className="shrink-0 text-white/30 hover:text-red-400 transition-colors text-lg leading-none"
          title="Remove app"
        >
          ×
        </button>
      </div>

      {/* Inline args editor */}
      {expanded && (
        <div className="border-t border-white/5 px-4 pb-3 pt-2 flex flex-col gap-2">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={url}
                onChange={(e) => updateUrl(i, e.target.value)}
                onBlur={() => commitUrl(i)}
                placeholder={argPlaceholder}
                className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => removeUrl(i)}
                className="shrink-0 w-7 flex items-center justify-center text-white/30 hover:text-red-400 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addUrl}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 hover:border-indigo-500 text-white/30 hover:text-indigo-400 py-1.5 text-xs transition-colors"
          >
            <span className="text-sm leading-none">+</span>
            <span>{addLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
