import ModeCard from "./ModeCard";

export default function HomeView({ modes }) {
  return (
    <div className="flex flex-wrap gap-6 p-8 justify-center content-start">
      {modes.map((mode) => (
        <ModeCard key={mode.id} mode={mode} />
      ))}
    </div>
  );
}
