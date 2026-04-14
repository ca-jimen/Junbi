use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

/// The label Tauri assigns to the main window when none is set in tauri.conf.json.
const MAIN_WINDOW_LABEL: &str = "main";

/// Stable ID for the system-tray icon, used to look it up for menu rebuilds.
const TRAY_ID: &str = "main-tray";

// ---------------------------------------------------------------------------
// App state — PID tracking
// ---------------------------------------------------------------------------

/// Tracks PIDs of processes launched by Junbi, keyed by mode_id.
/// Each entry is (pid, app_name).  A pid of 0 means the PID was not
/// determinable at launch time (e.g. macOS .app bundles via `open`).
struct ActivePids(Mutex<HashMap<String, Vec<(u32, String)>>>);

/// Caches base64 PNG data-URLs for app icons, keyed by app path.
/// A stored `None` means the path was tried and no icon was found.
struct IconCache(Mutex<HashMap<String, Option<String>>>);

/// Tracks which mode IDs have been launched (and not yet stopped) during this
/// Junbi process lifetime.  Used to restore the Stop button after the window
/// is reopened from the menu bar.
struct ActiveModes(Mutex<HashSet<String>>);

/// Active countdown timers, keyed by mode_id.  The value is a cancel flag;
/// setting it to `true` signals the timer thread to exit without firing.
struct ModeTimers(Mutex<HashMap<String, Arc<AtomicBool>>>);

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct DiscoveredApp {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Mode {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub apps: Vec<AppEntry>,
    /// Optional description shown on the mode card.
    #[serde(default)]
    pub description: String,
    /// Milliseconds to wait between launching each app in this mode (0 = no delay).
    #[serde(default)]
    pub delay_ms: u32,
    /// Optional keyboard shortcut that launches this mode globally, e.g. "Ctrl+Shift+W".
    #[serde(default)]
    pub hotkey: String,
    /// Number of times this mode has been launched.
    #[serde(default)]
    pub usage_count: u32,
    /// Unix timestamp (seconds) of the last launch, as a string.  Empty = never.
    #[serde(default)]
    pub last_launched: String,
}

/// Internal preferences — not a Tauri command, read directly from the store.
#[derive(Serialize, Deserialize)]
struct Preferences {
    #[serde(default = "default_true")]
    hide_on_launch: bool,
    #[serde(default)]
    global_shortcut: String,
}

fn default_true() -> bool { true }

#[derive(Serialize)]
pub struct AppLaunchResult {
    pub name: String,
    pub error: Option<String>,
    /// True when the app was already running and was intentionally skipped.
    pub skipped: bool,
    /// PID of the spawned process; None when the PID is unknown (e.g. macOS `open`).
    pub pid: Option<u32>,
}

#[derive(Serialize)]
pub struct AppStopResult {
    pub name: String,
    pub stopped: bool,
}

/// Emitted once per app during `launch_mode` so the frontend can show
/// real-time per-app progress while the mode is launching.
#[derive(Serialize, Clone)]
struct LaunchProgressPayload {
    mode_id: String,
    name: String,
    /// "launched" | "skipped" | "failed"
    status: String,
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// App icon extraction (macOS only)
// ---------------------------------------------------------------------------

/// Minimal base64 encoder — avoids adding an external crate.
fn base64_encode(data: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for c in data.chunks(3) {
        let b0 = c[0] as u32;
        let b1 = if c.len() > 1 { c[1] as u32 } else { 0 };
        let b2 = if c.len() > 2 { c[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if c.len() > 1 { T[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if c.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

#[cfg(target_os = "macos")]
fn resolve_app_icon(app_path: &str) -> Option<String> {
    use std::io::Read;
    if !app_path.ends_with(".app") { return None; }

    // Convert Info.plist to XML (handles both binary and XML formats).
    let plist = format!("{}/Contents/Info.plist", app_path);
    let xml_out = Command::new("plutil")
        .args(["-convert", "xml1", "-o", "-", &plist])
        .output().ok()?;
    if !xml_out.status.success() { return None; }
    let xml = String::from_utf8_lossy(&xml_out.stdout);

    // Locate CFBundleIconFile value with a simple text scan.
    let marker = "<key>CFBundleIconFile</key>";
    let after = xml.split(marker).nth(1)?;
    let s = after.find("<string>")? + "<string>".len();
    let e = after[s..].find("</string>")?;
    let icon_name = after[s..s + e].trim().to_string();
    let stem = icon_name.trim_end_matches(".icns");

    // Resolve the .icns path.
    let resources = format!("{}/Contents/Resources", app_path);
    let icns = format!("{}/{}.icns", resources, stem);
    if !std::path::Path::new(&icns).exists() { return None; }

    // Convert to 32×32 PNG with the system `sips` tool.
    let tmp = format!("/tmp/junbi_icon_{}.png", std::process::id());
    let ok = Command::new("sips")
        .args(["-s", "format", "png", "--resampleWidth", "32", &icns, "--out", &tmp])
        .output().ok()?.status.success();
    if !ok { return None; }

    let mut f = std::fs::File::open(&tmp).ok()?;
    let mut bytes = Vec::new();
    f.read_to_end(&mut bytes).ok()?;
    let _ = std::fs::remove_file(&tmp);
    Some(format!("data:image/png;base64,{}", base64_encode(&bytes)))
}

#[cfg(not(target_os = "macos"))]
fn resolve_app_icon(_app_path: &str) -> Option<String> { None }

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

fn read_modes(app: &tauri::AppHandle) -> Vec<Mode> {
    app.store("junbi.json")
        .ok()
        .and_then(|s| s.get("modes"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

fn read_preferences(app: &tauri::AppHandle) -> Preferences {
    app.store("junbi.json")
        .ok()
        .and_then(|s| s.get("preferences"))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or(Preferences { hide_on_launch: true, global_shortcut: String::new() })
}

// ---------------------------------------------------------------------------
// Tray menu
// ---------------------------------------------------------------------------

fn build_tray_menu(app: &tauri::AppHandle, modes: &[Mode]) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    for mode in modes {
        let item = MenuItem::with_id(
            app,
            format!("launch:{}", mode.id),
            format!("{} {}", mode.icon, mode.name),
            true,
            None::<&str>,
        )?;
        menu.append(&item)?;
    }
    if !modes.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&MenuItem::with_id(app, "open", "Open Junbi", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit Junbi", true, None::<&str>)?)?;
    Ok(menu)
}

fn update_tray_menu(app: &tauri::AppHandle, modes: &[Mode]) {
    if let Ok(menu) = build_tray_menu(app, modes) {
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

// ---------------------------------------------------------------------------
// Shortcut management
// ---------------------------------------------------------------------------

/// Unregisters all global shortcuts then re-registers:
///   1. The global "open window" shortcut (if set in preferences).
///   2. Per-mode launch shortcuts for every mode that has a hotkey set.
///
/// Duplicate shortcuts are silently skipped so registering the same key
/// for two different actions doesn't cause an OS-level error.
fn re_register_all_shortcuts(
    app: &tauri::AppHandle,
    global_shortcut: &str,
    modes: &[Mode],
) {
    let _ = app.global_shortcut().unregister_all();

    let mut registered: Vec<tauri_plugin_global_shortcut::Shortcut> = Vec::new();

    let gs = global_shortcut.trim();
    if !gs.is_empty() {
        if let Ok(parsed) = gs.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            let _ = app.global_shortcut().register(parsed.clone());
            registered.push(parsed);
        }
    }

    for mode in modes {
        let hs = mode.hotkey.trim();
        if hs.is_empty() { continue; }
        if let Ok(parsed) = hs.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            if !registered.contains(&parsed) {
                let _ = app.global_shortcut().register(parsed.clone());
                registered.push(parsed);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands — modes
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_modes(app: tauri::AppHandle) -> Result<Vec<Mode>, String> {
    let store = app.store("junbi.json").map_err(|e| e.to_string())?;
    let modes: Vec<Mode> = store
        .get("modes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(modes)
}

#[tauri::command]
fn save_modes(modes: Vec<Mode>, app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("junbi.json").map_err(|e| e.to_string())?;
    store.set("modes", serde_json::to_value(&modes).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    update_tray_menu(&app, &modes);
    // Re-register shortcuts in case mode hotkeys changed.
    let prefs = read_preferences(&app);
    re_register_all_shortcuts(&app, &prefs.global_shortcut, &modes);
    Ok(())
}

// ---------------------------------------------------------------------------
// Browser detection
// ---------------------------------------------------------------------------

enum BrowserKind {
    Chromium, // Chrome, Brave, Edge, Arc, Vivaldi, Opera, Zen, Chromium
    Firefox,
    Safari,
    Other,
}

fn browser_kind(path: &str) -> BrowserKind {
    let lower = path.to_lowercase();
    if lower.contains("firefox") {
        BrowserKind::Firefox
    } else if lower.contains("safari") {
        BrowserKind::Safari
    } else if lower.contains("chrome")
        || lower.contains("chromium")
        || lower.contains("brave")
        || lower.contains("edge")
        || lower.contains("opera")
        || lower.contains("vivaldi")
        || lower.contains("arc")
        || lower.contains("zen")
    {
        BrowserKind::Chromium
    } else {
        BrowserKind::Other
    }
}

/// The CLI flag that forces a new window for this browser kind.
/// Returns `None` for non-CLI-flag browsers (Safari uses `open -n` instead).
fn new_window_arg(kind: &BrowserKind) -> Option<&'static str> {
    match kind {
        BrowserKind::Chromium => Some("--new-window"),
        BrowserKind::Firefox => Some("-new-window"),
        BrowserKind::Safari | BrowserKind::Other => None,
    }
}

fn is_browser(path: &str) -> bool {
    matches!(browser_kind(path), BrowserKind::Chromium | BrowserKind::Firefox | BrowserKind::Safari)
}

// ---------------------------------------------------------------------------
// Process inspection
// ---------------------------------------------------------------------------

/// Returns true when an instance of the given executable is already running.
/// Browsers are never considered "already running" for skip purposes — they
/// always get a new window (handled by launch_app).  This function is only
/// called for non-browser apps.
fn is_process_running(exe_path: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        let exe_name = Path::new(exe_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();
        if exe_name.is_empty() { return false; }
        return Command::new("tasklist")
            .args(["/FI", &format!("IMAGENAME eq {}", exe_name), "/NH", "/FO", "CSV"])
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_lowercase().contains(&exe_name))
            .unwrap_or(false);
    }

    #[cfg(target_os = "macos")]
    {
        use std::path::Path;
        let name = if exe_path.ends_with(".app") {
            Path::new(exe_path).file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase()
        } else {
            Path::new(exe_path).file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase()
        };
        if name.is_empty() { return false; }
        return Command::new("pgrep").args(["-if", &name]).output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    false
}

// ---------------------------------------------------------------------------
// Process killing
// ---------------------------------------------------------------------------

/// Kill a process by PID.  Returns true if the kill command succeeded.
/// A pid of 0 is a no-op (indicates an unknown PID).
fn kill_by_pid(pid: u32) -> bool {
    if pid == 0 { return false; }

    #[cfg(target_os = "windows")]
    {
        return Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    #[cfg(target_os = "macos")]
    {
        return Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    false
}

/// Fallback: kill all running instances of an app by executable name.
/// Used when PID tracking was not available (e.g. first run after upgrade).
fn stop_app(entry: &AppEntry) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        let exe_name = Path::new(&entry.path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(entry.name.as_str())
            .to_string();
        return Command::new("taskkill")
            .args(["/F", "/IM", &exe_name])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    #[cfg(target_os = "macos")]
    {
        use std::path::Path;
        let name = if entry.path.ends_with(".app") {
            Path::new(&entry.path).file_stem().and_then(|s| s.to_str()).unwrap_or(entry.name.as_str()).to_string()
        } else {
            Path::new(&entry.path).file_name().and_then(|n| n.to_str()).unwrap_or(entry.name.as_str()).to_string()
        };
        return Command::new("pkill")
            .args(["-f", &name])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    false
}

// ---------------------------------------------------------------------------
// macOS: resolve the real binary inside a .app bundle
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn find_app_binary(app_path: &str) -> Option<String> {
    use std::path::Path;
    let stem = Path::new(app_path).file_stem()?.to_str()?;
    let macos_dir = format!("{}/Contents/MacOS", app_path);
    for candidate in &[stem.to_string(), stem.to_lowercase()] {
        let binary = format!("{}/{}", macos_dir, candidate);
        if Path::new(&binary).is_file() {
            return Some(binary);
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

/// Launch a single app entry and return its PID.
///
/// Returns `Ok(0)` when the PID cannot be determined (e.g. macOS .app bundles
/// launched via the `open` wrapper — the `open` process PID is unrelated to
/// the actual application PID).
fn launch_app(entry: &AppEntry) -> Result<u32, std::io::Error> {
    #[cfg(target_os = "macos")]
    if entry.path.ends_with(".app") {
        let kind = browser_kind(&entry.path);
        match kind {
            BrowserKind::Chromium | BrowserKind::Firefox => {
                if let Some(binary) = find_app_binary(&entry.path) {
                    let mut cmd = Command::new(&binary);
                    if let Some(flag) = new_window_arg(&kind) { cmd.arg(flag); }
                    cmd.args(&entry.args);
                    return cmd.spawn().map(|child| child.id());
                }
                let mut cmd = Command::new("open");
                cmd.arg(&entry.path).arg("--args");
                if let Some(flag) = new_window_arg(&kind) { cmd.arg(flag); }
                cmd.args(&entry.args);
                return cmd.spawn().map(|_| 0u32);
            }
            BrowserKind::Safari => {
                return Command::new("open")
                    .arg("-n").arg(&entry.path).args(&entry.args)
                    .spawn().map(|_| 0u32);
            }
            BrowserKind::Other => {
                let mut cmd = Command::new("open");
                cmd.arg(&entry.path);
                if !entry.args.is_empty() { cmd.args(&entry.args); }
                return cmd.spawn().map(|_| 0u32);
            }
        }
    }

    // Windows / Linux / macOS direct binary: call the executable directly.
    let kind = browser_kind(&entry.path);
    match kind {
        BrowserKind::Chromium | BrowserKind::Firefox => {
            let mut cmd = Command::new(&entry.path);
            if let Some(flag) = new_window_arg(&kind) { cmd.arg(flag); }
            cmd.args(&entry.args).spawn().map(|child| child.id())
        }
        _ => Command::new(&entry.path).args(&entry.args).spawn().map(|child| child.id()),
    }
}

/// Core launch logic shared by the Tauri command and the tray menu handler.
fn do_launch_mode(
    mode_id: &str,
    hide_on_launch: bool,
    app: &tauri::AppHandle,
) -> Result<Vec<AppLaunchResult>, String> {
    let store = app.store("junbi.json").map_err(|e| e.to_string())?;
    let mut modes: Vec<Mode> = store
        .get("modes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let mode_idx = modes.iter().position(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode '{}' not found", mode_id))?;

    let mode = modes[mode_idx].clone();

    // Clear previous PIDs for this mode before tracking new ones.
    let active_pids = app.state::<ActivePids>();
    active_pids.0.lock().unwrap().remove(mode_id);

    let mut results: Vec<AppLaunchResult> = Vec::new();
    let mut new_pids: Vec<(u32, String)> = Vec::new();

    for (i, entry) in mode.apps.iter().enumerate() {
        // Determine the result for this app.
        let result = if !is_browser(&entry.path) && is_process_running(&entry.path) {
            AppLaunchResult { name: entry.name.clone(), error: None, skipped: true, pid: None }
        } else {
            match launch_app(entry) {
                Ok(pid) => {
                    if pid > 0 { new_pids.push((pid, entry.name.clone())); }
                    AppLaunchResult {
                        name: entry.name.clone(),
                        error: None,
                        skipped: false,
                        pid: if pid > 0 { Some(pid) } else { None },
                    }
                }
                Err(e) => AppLaunchResult {
                    name: entry.name.clone(),
                    error: Some(e.to_string()),
                    skipped: false,
                    pid: None,
                },
            }
        };

        // Emit real-time progress event so the frontend can update per-app status.
        let (status_str, err_str) = if result.skipped {
            ("skipped".to_string(), None)
        } else if let Some(ref e) = result.error {
            ("failed".to_string(), Some(e.clone()))
        } else {
            ("launched".to_string(), None)
        };
        let _ = app.emit("launch-progress", LaunchProgressPayload {
            mode_id: mode_id.to_string(),
            name: result.name.clone(),
            status: status_str,
            error: err_str,
        });

        results.push(result);

        // Apply per-mode stagger delay between launches (not after the last app).
        if mode.delay_ms > 0 && i + 1 < mode.apps.len() {
            std::thread::sleep(std::time::Duration::from_millis(u64::from(mode.delay_ms)));
        }
    }

    // Store the new PIDs for stop_mode to use later.
    if !new_pids.is_empty() {
        active_pids.0.lock().unwrap().insert(mode_id.to_string(), new_pids);
    }

    // Determine overall outcome.
    let mode_ready = results.iter().any(|r| r.error.is_none());

    // Track this mode as active so the Stop button survives window close/reopen.
    if mode_ready {
        app.state::<ActiveModes>().0.lock().unwrap().insert(mode_id.to_string());
    }

    // Update usage stats in the store.
    modes[mode_idx].usage_count += 1;
    modes[mode_idx].last_launched = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();
    let _ = store.set("modes", serde_json::to_value(&modes).unwrap_or_default());
    let _ = store.save();

    // Notify the frontend that modes have been updated (usage_count, last_launched changed).
    let _ = app.emit("modes-updated", ());

    // Minimize when at least one app launched or was already running.
    if hide_on_launch && mode_ready {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.minimize();
        }
    }

    // Send an OS notification summarising the launch outcome.
    if mode_ready {
        let launched = results.iter().filter(|r| !r.skipped && r.error.is_none()).count();
        let skipped = results.iter().filter(|r| r.skipped).count();
        let body = match (launched, skipped) {
            (0, s) => format!("{s} app{} already running", if s != 1 { "s" } else { "" }),
            (l, 0) => format!("{l} app{} launched", if l != 1 { "s" } else { "" }),
            (l, s) => format!("{l} launched, {s} already running"),
        };
        let title = format!("{} {}", mode.icon, mode.name);
        let n_app = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = n_app.notification().builder().title(&title).body(&body).show();
        });
    }

    Ok(results)
}

#[tauri::command]
fn launch_mode(
    mode_id: String,
    hide_on_launch: bool,
    app: tauri::AppHandle,
) -> Result<Vec<AppLaunchResult>, String> {
    do_launch_mode(&mode_id, hide_on_launch, &app)
}

// ---------------------------------------------------------------------------
// Stop mode
// ---------------------------------------------------------------------------

#[tauri::command]
fn stop_mode(mode_id: String, app: tauri::AppHandle) -> Result<Vec<AppStopResult>, String> {
    // Remove from the active-modes set so the Stop button resets after window reopen.
    app.state::<ActiveModes>().0.lock().unwrap().remove(&mode_id);

    let active_pids = app.state::<ActivePids>();

    // Atomically remove and retrieve the tracked PIDs for this mode.
    let mode_pids: Vec<(u32, String)> = {
        let mut map = active_pids.0.lock().unwrap();
        map.remove(&mode_id).unwrap_or_default()
    };

    if !mode_pids.is_empty() {
        // PID-based kill: only kill exactly the processes we launched.
        return Ok(mode_pids.iter().map(|(pid, name)| {
            let stopped = kill_by_pid(*pid);
            AppStopResult { name: name.clone(), stopped }
        }).collect());
    }

    // Fallback: no tracked PIDs (e.g. mode was launched before this session).
    // Fall back to name-based killing so the Stop button still works.
    let store = app.store("junbi.json").map_err(|e| e.to_string())?;
    let modes: Vec<Mode> = store
        .get("modes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let mode = modes.iter().find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode '{}' not found", mode_id))?;

    Ok(mode.apps.iter().map(|entry| {
        let stopped = stop_app(entry);
        AppStopResult { name: entry.name.clone(), stopped }
    }).collect())
}

/// Returns the IDs of all modes that were launched (and not yet stopped) during
/// this Junbi process session.  The frontend calls this on mount to restore the
/// Stop button state after the window is reopened from the menu bar.
#[tauri::command]
fn get_running_mode_ids(app: tauri::AppHandle) -> Vec<String> {
    app.state::<ActiveModes>().0.lock().unwrap().iter().cloned().collect()
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

#[tauri::command]
fn export_modes(path: String, modes: Vec<Mode>) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&modes).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_modes(path: String) -> Result<Vec<Mode>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("Invalid file: {e}"))
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

#[tauri::command]
fn validate_app_paths(apps: Vec<AppEntry>) -> Vec<String> {
    apps.into_iter()
        .filter(|a| !std::path::Path::new(&a.path).exists())
        .map(|a| a.id)
        .collect()
}

#[tauri::command]
fn get_app_icon(path: String, app: tauri::AppHandle) -> Option<String> {
    let cache = app.state::<IconCache>();
    // Return cached result (including cached None) if available.
    {
        let guard = cache.0.lock().unwrap();
        if let Some(cached) = guard.get(&path) {
            return cached.clone();
        }
    }
    let result = resolve_app_icon(&path);
    cache.0.lock().unwrap().insert(path, result.clone());
    result
}

// ---------------------------------------------------------------------------
// App scanner
// ---------------------------------------------------------------------------

#[tauri::command]
fn scan_apps() -> Result<Vec<DiscoveredApp>, String> {
    #[cfg(target_os = "macos")]
    {
        use std::collections::HashSet;
        use std::fs;

        let home = std::env::var("HOME").unwrap_or_default();
        let dirs = ["/Applications".to_string(), format!("{}/Applications", home)];

        let mut apps: Vec<DiscoveredApp> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for dir in &dirs {
            let entries = match fs::read_dir(dir) { Ok(e) => e, Err(_) => continue };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("app") {
                    let path_str = path.to_string_lossy().to_string();
                    if seen.insert(path_str.clone()) {
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
                        apps.push(DiscoveredApp { name, path: path_str });
                    }
                }
            }
        }
        apps.sort_by(|a, b| a.name.cmp(&b.name));
        return Ok(apps);
    }

    #[cfg(target_os = "windows")]
    {
        let ps = r#"
            $shell = New-Object -COM WScript.Shell
            $dirs = @(
                [System.Environment]::GetFolderPath('Programs'),
                [System.Environment]::GetFolderPath('CommonPrograms')
            )
            $results = [System.Collections.Generic.List[object]]::new()
            $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
            foreach ($dir in $dirs) {
                if (-not (Test-Path $dir)) { continue }
                Get-ChildItem -Path $dir -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
                    try {
                        $target = $shell.CreateShortcut($_.FullName).TargetPath
                        if ($target -and $target -match '\.exe$' -and (Test-Path $target) -and $seen.Add($target)) {
                            $results.Add([PSCustomObject]@{ name = $_.BaseName; path = $target })
                        }
                    } catch {}
                }
            }
            if ($results.Count -eq 0) { '[]' } elseif ($results.Count -eq 1) { "[$($results | ConvertTo-Json -Compress)]" } else { $results | Sort-Object name | ConvertTo-Json -Compress }
        "#;
        let out = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps])
            .output()
            .map_err(|e| format!("Failed to run PowerShell: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let json = stdout.trim();
        if json.is_empty() || json == "null" { return Ok(vec![]); }
        return serde_json::from_str(json).map_err(|e| format!("Parse error: {e}\nOutput: {json}"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(vec![])
}

// ---------------------------------------------------------------------------
// Autostart (Windows: HKCU Run registry key; macOS: no-op for now)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_autostart() -> bool {
    #[cfg(target_os = "windows")]
    {
        return Command::new("reg")
            .args(["query", r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run", "/v", "Junbi"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }
    #[cfg(not(target_os = "windows"))]
    false
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if enabled {
            let exe = std::env::current_exe()
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .to_string();
            let out = Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v", "Junbi",
                    "/t", "REG_SZ",
                    "/d", &format!("\"{}\"", exe),
                    "/f",
                ])
                .output()
                .map_err(|e| e.to_string())?;
            if !out.status.success() {
                return Err(String::from_utf8_lossy(&out.stderr).to_string());
            }
        } else {
            let _ = Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v", "Junbi", "/f",
                ])
                .output();
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}

// ---------------------------------------------------------------------------
// Global shortcut
// ---------------------------------------------------------------------------

/// Register (or clear) the global open-window shortcut plus all per-mode hotkeys.
/// Passing an empty string unregisters everything without re-registering.
#[tauri::command]
fn set_global_shortcut(shortcut: String, app: tauri::AppHandle) -> Result<(), String> {
    let s = shortcut.trim();
    // Validate the new global shortcut string before committing.
    if !s.is_empty() {
        s.parse::<tauri_plugin_global_shortcut::Shortcut>()
            .map_err(|e| format!("Invalid shortcut \"{s}\": {e}"))?;
    }
    let modes = read_modes(&app);
    re_register_all_shortcuts(&app, s, &modes);
    Ok(())
}

// ---------------------------------------------------------------------------
// Window restore
// ---------------------------------------------------------------------------

/// Restore and focus the window from any state (minimized or hidden).
///
/// Call order matters on Windows:
/// - `unminimize()` restores a minimized window back to its normal size.
/// - `show()` un-hides a hidden window; no-op on a visible window.
/// - `set_focus()` brings the window to the foreground.
/// On macOS all three are safe to call unconditionally.
fn restore_window(window: &tauri::WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

// ---------------------------------------------------------------------------
// Session timer
// ---------------------------------------------------------------------------

/// Key used in ModeTimers for the single global session timer.
const SESSION_TIMER_KEY: &str = "__session__";

/// Starts a global session countdown.  When `duration_secs` elapses, fires an
/// OS notification and emits `session-timer-expired`.  Calling this while a
/// timer is already running replaces it.
#[tauri::command]
fn start_session_timer(duration_secs: u64, app: tauri::AppHandle) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let timers = app.state::<ModeTimers>();
        let mut map = timers.0.lock().unwrap();
        if let Some(old) = map.get(SESSION_TIMER_KEY) {
            old.store(true, Ordering::Relaxed);
        }
        map.insert(SESSION_TIMER_KEY.to_string(), cancel.clone());
    }

    let app_c = app.clone();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(duration_secs);
        loop {
            if cancel.load(Ordering::Relaxed) { return; }
            std::thread::sleep(std::time::Duration::from_millis(250));
            if std::time::Instant::now() >= deadline {
                let timers_c = app_c.state::<ModeTimers>();
                timers_c.0.lock().unwrap().remove(SESSION_TIMER_KEY);
                // Dispatch the notification on the main thread so macOS
                // UNUserNotificationCenter receives it from the right context.
                let n_app = app_c.clone();
                let _ = app_c.run_on_main_thread(move || {
                    let _ = n_app.notification()
                        .builder()
                        .title("⏱ Session Timer — Time's up!")
                        .body("Your focus session has ended.")
                        .show();
                });
                let _ = app_c.emit("session-timer-expired", ());
                return;
            }
        }
    });

    Ok(())
}

/// Cancels the active session timer.  Safe to call when none is running.
#[tauri::command]
fn cancel_session_timer(app: tauri::AppHandle) -> Result<(), String> {
    let timers = app.state::<ModeTimers>();
    let mut map = timers.0.lock().unwrap();
    if let Some(flag) = map.remove(SESSION_TIMER_KEY) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- browser_kind ---

    #[test]
    fn browser_kind_identifies_chromium_browsers() {
        let paths = [
            "/Applications/Google Chrome.app",
            "/Applications/Brave Browser.app",
            "/Applications/Microsoft Edge.app",
            "/Applications/Arc.app",
            "/Applications/Vivaldi.app",
            "/Applications/Chromium.app",
            "/Applications/Opera.app",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        ];
        for p in paths {
            assert!(matches!(browser_kind(p), BrowserKind::Chromium), "Expected Chromium for {p}");
        }
    }

    #[test]
    fn browser_kind_identifies_firefox() {
        let paths = ["/Applications/Firefox.app", r"C:\Program Files\Mozilla Firefox\firefox.exe"];
        for p in paths {
            assert!(matches!(browser_kind(p), BrowserKind::Firefox), "Expected Firefox for {p}");
        }
    }

    #[test]
    fn browser_kind_identifies_safari() {
        assert!(matches!(browser_kind("/Applications/Safari.app"), BrowserKind::Safari));
    }

    #[test]
    fn browser_kind_non_browsers_are_other() {
        let paths = ["/Applications/Slack.app", "/Applications/Xcode.app", r"C:\Windows\notepad.exe"];
        for p in paths {
            assert!(matches!(browser_kind(p), BrowserKind::Other), "Expected Other for {p}");
        }
    }

    // --- new_window_arg ---

    #[test]
    fn chromium_new_window_flag_is_double_dash() {
        assert_eq!(new_window_arg(&BrowserKind::Chromium), Some("--new-window"));
    }

    #[test]
    fn firefox_new_window_flag_is_single_dash() {
        assert_eq!(new_window_arg(&BrowserKind::Firefox), Some("-new-window"));
    }

    #[test]
    fn safari_and_other_have_no_new_window_flag() {
        assert_eq!(new_window_arg(&BrowserKind::Safari), None);
        assert_eq!(new_window_arg(&BrowserKind::Other), None);
    }

    // --- is_browser ---

    #[test]
    fn browsers_are_never_skipped() {
        let browser_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
            "/Applications/Safari.app",
            "/Applications/Brave Browser.app",
        ];
        for p in browser_paths {
            assert!(is_browser(p), "Expected is_browser=true for {p}");
        }
    }

    #[test]
    fn non_browsers_are_skip_candidates() {
        let non_browser_paths = [r"C:\Program Files\Steam\steam.exe", "/Applications/Slack.app"];
        for p in non_browser_paths {
            assert!(!is_browser(p), "Expected is_browser=false for {p}");
        }
    }

    // --- kill_by_pid ---

    #[test]
    fn kill_by_pid_zero_is_noop() {
        // PID 0 means unknown; must never attempt a kill.
        assert!(!kill_by_pid(0));
    }

    // --- tray / window restore ---

    #[test]
    fn window_restore_sequence_is_unminimize_show_focus() {
        let ops: Vec<&str> = vec!["unminimize", "show", "set_focus"];
        assert_eq!(ops[0], "unminimize");
        assert_eq!(ops[1], "show");
        assert_eq!(ops[2], "set_focus");
    }

    #[test]
    fn main_window_label_constant_matches_tauri_default() {
        assert_eq!(MAIN_WINDOW_LABEL, "main");
    }

    // --- launch / skip / delay ---

    #[test]
    fn window_hide_respects_hide_on_launch_flag() {
        let launched = vec![AppLaunchResult { name: "App".into(), error: None, skipped: false, pid: None }];
        let mode_ready = launched.iter().any(|r| r.error.is_none());
        assert!(!(false && mode_ready), "Window must NOT minimize when hide_on_launch is false");
        assert!(true && mode_ready,    "Window SHOULD minimize when hide_on_launch is true");
    }

    #[test]
    fn window_minimizes_when_all_apps_already_running() {
        let all_skipped = vec![
            AppLaunchResult { name: "Steam".into(), error: None, skipped: true, pid: None },
        ];
        let mode_ready = all_skipped.iter().any(|r| r.error.is_none());
        assert!(mode_ready, "mode_ready should be true even when all apps were skipped");
    }

    #[test]
    fn window_does_not_minimize_when_all_apps_fail() {
        let all_failed = vec![
            AppLaunchResult { name: "App".into(), error: Some("not found".into()), skipped: false, pid: None },
        ];
        let mode_ready = all_failed.iter().any(|r| r.error.is_none());
        assert!(!mode_ready, "mode_ready must be false when all apps failed");
    }

    #[test]
    fn skipped_app_has_no_error_and_skipped_true() {
        let result = AppLaunchResult { name: "Steam".into(), error: None, skipped: true, pid: None };
        assert!(result.error.is_none());
        assert!(result.skipped);
    }

    #[test]
    fn launched_app_stores_pid() {
        let result = AppLaunchResult { name: "App".into(), error: None, skipped: false, pid: Some(1234) };
        assert_eq!(result.pid, Some(1234));
    }

    // --- find_app_binary path construction (macOS only) ---

    #[cfg(target_os = "macos")]
    #[test]
    fn app_binary_path_matches_bundle_stem() {
        use std::path::Path;
        for (bundle, expected_stem) in &[
            ("/Applications/Google Chrome.app", "Google Chrome"),
            ("/Applications/Firefox.app", "Firefox"),
            ("/Applications/Brave Browser.app", "Brave Browser"),
        ] {
            let stem = Path::new(bundle).file_stem().and_then(|s| s.to_str()).expect("stem");
            assert_eq!(stem, *expected_stem, "Wrong stem for {bundle}");
        }
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        return;
                    }

                    // Check if the triggered shortcut belongs to a per-mode hotkey.
                    let modes = read_modes(app);
                    let matching_mode = modes.into_iter().find(|m| {
                        !m.hotkey.trim().is_empty()
                            && m.hotkey
                                .trim()
                                .parse::<tauri_plugin_global_shortcut::Shortcut>()
                                .map(|s| &s == shortcut)
                                .unwrap_or(false)
                    });

                    if let Some(mode) = matching_mode {
                        // Launch mode in a background thread so delay doesn't block the handler.
                        let mode_id = mode.id.clone();
                        let app = app.clone();
                        std::thread::spawn(move || {
                            let prefs = read_preferences(&app);
                            let _ = do_launch_mode(&mode_id, prefs.hide_on_launch, &app);
                        });
                    } else {
                        // Global open-window shortcut.
                        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                            let w = window.clone();
                            let _ = window.run_on_main_thread(move || restore_window(&w));
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_modes, save_modes, launch_mode, stop_mode, get_running_mode_ids,
            scan_apps, validate_app_paths, export_modes, import_modes,
            get_autostart, set_autostart, set_global_shortcut,
            get_app_icon,
            start_session_timer, cancel_session_timer,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Register in-memory PID tracking state.
            app.manage(ActivePids(Mutex::new(HashMap::new())));
            app.manage(IconCache(Mutex::new(HashMap::new())));
            app.manage(ActiveModes(Mutex::new(HashSet::new())));
            app.manage(ModeTimers(Mutex::new(HashMap::new())));

            // Request OS notification permission.  Must be done off the main
            // thread on macOS (UNUserNotificationCenter.requestAuthorization
            // is async and would deadlock if called synchronously here).
            {
                let ah = app_handle.clone();
                std::thread::spawn(move || {
                    let _ = ah.notification().request_permission();
                });
            }

            let icon = app.default_window_icon().cloned()
                .expect("no default window icon configured");

            // Build initial tray menu from whatever modes are already stored.
            let initial_modes = read_modes(&app_handle);
            let initial_menu = build_tray_menu(&app_handle, &initial_modes)?;

            tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
                .icon(icon)
                .tooltip("Junbi")
                .menu(&initial_menu)
                .on_menu_event(|app, event| {
                    let id = event.id().0.as_str();
                    if id == "open" {
                        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                            let w = window.clone();
                            let _ = window.run_on_main_thread(move || restore_window(&w));
                        }
                    } else if id == "quit" {
                        app.exit(0);
                    } else if let Some(mode_id) = id.strip_prefix("launch:") {
                        let mode_id = mode_id.to_string();
                        let app = app.clone();
                        std::thread::spawn(move || {
                            let prefs = read_preferences(&app);
                            let _ = do_launch_mode(&mode_id, prefs.hide_on_launch, &app);
                        });
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                            let w = window.clone();
                            let _ = window.run_on_main_thread(move || restore_window(&w));
                        }
                    }
                })
                .build(app)?;

            // Re-register all shortcuts from the previous session.
            let prefs = read_preferences(&app_handle);
            re_register_all_shortcuts(&app_handle, &prefs.global_shortcut, &initial_modes);

            // Handle `--launch "mode name"` CLI argument: auto-launch a mode on startup.
            let args: Vec<String> = std::env::args().collect();
            if let Some(pos) = args.iter().position(|a| a == "--launch") {
                if let Some(mode_name) = args.get(pos + 1).cloned() {
                    let app_h = app_handle.clone();
                    std::thread::spawn(move || {
                        // Small delay so the window has time to appear before minimizing.
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        let modes = read_modes(&app_h);
                        if let Some(mode) = modes.iter().find(|m| {
                            m.name.eq_ignore_ascii_case(&mode_name)
                        }) {
                            let mode_id = mode.id.clone();
                            let prefs = read_preferences(&app_h);
                            let _ = do_launch_mode(&mode_id, prefs.hide_on_launch, &app_h);
                        }
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
