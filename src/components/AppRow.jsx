export default function AppRow({ app, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{app.name}</p>
        <p className="text-xs text-white/40 truncate">{app.path}</p>
      </div>
      <button
        onClick={() => onDelete(app.id)}
        className="shrink-0 text-white/30 hover:text-red-400 transition-colors text-lg leading-none"
        title="Remove app"
      >
        ×
      </button>
    </div>
  );
}
