import { load } from "@tauri-apps/plugin-store";

const DEFAULT_MODES = [
  { id: crypto.randomUUID(), name: "Gaming", icon: "🎮", apps: [] },
  { id: crypto.randomUUID(), name: "Studying", icon: "📚", apps: [] },
  { id: crypto.randomUUID(), name: "Working", icon: "💼", apps: [] },
];

let _store = null;

async function getStore() {
  if (!_store) {
    _store = await load("junbi.json", { autoSave: false });
  }
  return _store;
}

export async function getModes() {
  const store = await getStore();
  let modes = await store.get("modes");
  if (!modes || modes.length === 0) {
    modes = DEFAULT_MODES;
    await store.set("modes", modes);
    await store.save();
  }
  return modes;
}

export async function saveModes(modes) {
  const store = await getStore();
  await store.set("modes", modes);
  await store.save();
}

const PREFERENCE_DEFAULTS = {
  hideOnLaunch: true,
  globalShortcut: "",
  theme: "dark",
  showStoicQuotes: true,
  showTimer: true,
};

export async function getPreferences() {
  const store = await getStore();
  const prefs = await store.get("preferences");
  // Merge with defaults so new keys always appear even for existing users.
  return { ...PREFERENCE_DEFAULTS, ...(prefs ?? {}) };
}

export async function savePreferences(prefs) {
  const store = await getStore();
  await store.set("preferences", prefs);
  await store.save();
}
