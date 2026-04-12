import ModeCard from "./ModeCard";

export default function HomeView({ modes, onOpenSettings }) {
  if (modes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center" style={{ minHeight: "60vh" }}>
        <span className="text-6xl select-none">🗂️</span>
        <h2 className="text-xl font-semibold text-white">No modes yet</h2>
        <p className="text-sm text-white/40 max-w-xs">
          Create a mode to group your apps and launch them all at once.
        </p>
        <button
          onClick={onOpenSettings}
          className="mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2 text-sm transition-colors"
        >
          Create your first mode
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-6 p-8 justify-center content-start">
      {modes.map((mode) => (
        <ModeCard key={mode.id} mode={mode} />
      ))}
    </div>
  );
}
