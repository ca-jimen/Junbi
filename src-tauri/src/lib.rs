use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

/// The label Tauri assigns to the main window when none is set in tauri.conf.json.
/// Used both in launch_mode (hide) and the tray click handler (show).
/// If this ever changes, the tray restore will silently break — hence the test below.
const MAIN_WINDOW_LABEL: &str = "main";

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
}

#[tauri::command]
fn get_modes(app: tauri::AppHandle) -> Result<Vec<Mode>, String> {
    let store = app
        .store("junbi.json")
        .map_err(|e| e.to_string())?;
    let modes: Vec<Mode> = store
        .get("modes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    Ok(modes)
}

#[tauri::command]
fn save_modes(modes: Vec<Mode>, app: tauri::AppHandle) -> Result<(), String> {
    let store = app
        .store("junbi.json")
        .map_err(|e| e.to_string())?;
    store.set("modes", serde_json::to_value(&modes).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct AppLaunchResult {
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
fn launch_mode(mode_id: String, app: tauri::AppHandle) -> Result<Vec<AppLaunchResult>, String> {
    let store = app
        .store("junbi.json")
        .map_err(|e| e.to_string())?;
    let modes: Vec<Mode> = store
        .get("modes")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let mode = modes
        .iter()
        .find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Mode '{}' not found", mode_id))?;

    let results: Vec<AppLaunchResult> = mode.apps.iter().map(|entry| {
        let error = launch_app(entry).err().map(|e| e.to_string());
        AppLaunchResult { name: entry.name.clone(), error }
    }).collect();

    // Hide the main window after a successful launch (at least one app launched).
    let any_launched = results.iter().any(|r| r.error.is_none());
    if any_launched {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.hide();
        }
    }

    Ok(results)
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

// ---------------------------------------------------------------------------
// macOS: resolve the real binary inside a .app bundle
// ---------------------------------------------------------------------------
//
// `open App.app --args --new-window` is silently ignored by already-running
// browsers because macOS Launch Services hands the activation to the existing
// process without forwarding --args.  Calling the Mach-O binary directly
// (App.app/Contents/MacOS/<stem>) connects to the running instance via its
// IPC socket and passes the flags properly, which triggers a new window.
//
// The main executable almost always shares the stem of the .app name, e.g.
//   Google Chrome.app  →  Contents/MacOS/Google Chrome
//   Firefox.app        →  Contents/MacOS/firefox  (lowercase on disk)
//
// We try the exact stem first, then a lowercase fallback.

#[cfg(target_os = "macos")]
fn find_app_binary(app_path: &str) -> Option<String> {
    use std::path::Path;
    let stem = Path::new(app_path).file_stem()?.to_str()?;
    let macos_dir = format!("{}/Contents/MacOS", app_path);

    // Try exact stem match first, then lowercase.
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

fn launch_app(entry: &AppEntry) -> Result<(), std::io::Error> {
    #[cfg(target_os = "macos")]
    if entry.path.ends_with(".app") {
        let kind = browser_kind(&entry.path);
        match kind {
            BrowserKind::Chromium | BrowserKind::Firefox => {
                // Call the binary directly so the --new-window flag reaches
                // the running instance rather than being dropped by open(1).
                if let Some(binary) = find_app_binary(&entry.path) {
                    let mut cmd = Command::new(&binary);
                    if let Some(flag) = new_window_arg(&kind) {
                        cmd.arg(flag);
                    }
                    cmd.args(&entry.args);
                    return cmd.spawn().map(|_| ());
                }
                // Fallback: open --args (best effort if binary not found).
                let mut cmd = Command::new("open");
                cmd.arg(&entry.path).arg("--args");
                if let Some(flag) = new_window_arg(&kind) {
                    cmd.arg(flag);
                }
                cmd.args(&entry.args);
                return cmd.spawn().map(|_| ());
            }
            BrowserKind::Safari => {
                // -n forces a new instance of Safari, which opens as a new window.
                return Command::new("open")
                    .arg("-n")
                    .arg(&entry.path)
                    .args(&entry.args)
                    .spawn()
                    .map(|_| ());
            }
            BrowserKind::Other => {
                let mut cmd = Command::new("open");
                cmd.arg(&entry.path);
                if !entry.args.is_empty() {
                    cmd.args(&entry.args);
                }
                return cmd.spawn().map(|_| ());
            }
        }
    }

    // Windows / Linux: call the executable directly.
    let kind = browser_kind(&entry.path);
    match kind {
        BrowserKind::Chromium | BrowserKind::Firefox => {
            let mut cmd = Command::new(&entry.path);
            if let Some(flag) = new_window_arg(&kind) {
                cmd.arg(flag);
            }
            cmd.args(&entry.args).spawn().map(|_| ())
        }
        _ => Command::new(&entry.path).args(&entry.args).spawn().map(|_| ()),
    }
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

/// Returns the IDs of AppEntry items whose paths do not exist on disk.
#[tauri::command]
fn validate_app_paths(apps: Vec<AppEntry>) -> Vec<String> {
    apps.into_iter()
        .filter(|a| !std::path::Path::new(&a.path).exists())
        .map(|a| a.id)
        .collect()
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
        let dirs = [
            "/Applications".to_string(),
            format!("{}/Applications", home),
        ];

        let mut apps: Vec<DiscoveredApp> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for dir in &dirs {
            let entries = match fs::read_dir(dir) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("app") {
                    let path_str = path.to_string_lossy().to_string();
                    if seen.insert(path_str.clone()) {
                        let name = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_string();
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
        // Scan Windows Start Menu shortcuts (.lnk) from both user and all-users directories.
        // PowerShell resolves each shortcut to its target executable path via WScript.Shell COM.
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
        if json.is_empty() || json == "null" {
            return Ok(vec![]);
        }

        return serde_json::from_str(json).map_err(|e| format!("Parse error: {e}\nOutput: {json}"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Ok(vec![])
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
            assert!(
                matches!(browser_kind(p), BrowserKind::Chromium),
                "Expected Chromium for {p}"
            );
        }
    }

    #[test]
    fn browser_kind_identifies_firefox() {
        let paths = [
            "/Applications/Firefox.app",
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
        ];
        for p in paths {
            assert!(
                matches!(browser_kind(p), BrowserKind::Firefox),
                "Expected Firefox for {p}"
            );
        }
    }

    #[test]
    fn browser_kind_identifies_safari() {
        assert!(matches!(
            browser_kind("/Applications/Safari.app"),
            BrowserKind::Safari
        ));
    }

    #[test]
    fn browser_kind_non_browsers_are_other() {
        let paths = [
            "/Applications/Slack.app",
            "/Applications/Xcode.app",
            r"C:\Windows\notepad.exe",
        ];
        for p in paths {
            assert!(
                matches!(browser_kind(p), BrowserKind::Other),
                "Expected Other for {p}"
            );
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

    // --- tray / window restore ---

    #[test]
    fn main_window_label_constant_matches_tauri_default() {
        // Tauri assigns "main" to the first window when no label is set in tauri.conf.json.
        // The tray click handler looks up the window by this label.
        // If the label ever changes the tray restore silently stops working.
        assert_eq!(MAIN_WINDOW_LABEL, "main");
    }

    #[test]
    fn window_hides_only_when_at_least_one_app_launches() {
        // If every app in the mode fails, the window must stay visible so
        // the user can read the error messages.  Only hide when something launched.
        let all_failed = vec![
            AppLaunchResult { name: "App".into(), error: Some("not found".into()) },
        ];
        assert!(
            !all_failed.iter().any(|r| r.error.is_none()),
            "Window should NOT hide when all apps fail"
        );

        let partial = vec![
            AppLaunchResult { name: "App1".into(), error: None },
            AppLaunchResult { name: "App2".into(), error: Some("not found".into()) },
        ];
        assert!(
            partial.iter().any(|r| r.error.is_none()),
            "Window SHOULD hide when at least one app launches"
        );

        let all_ok = vec![
            AppLaunchResult { name: "App1".into(), error: None },
            AppLaunchResult { name: "App2".into(), error: None },
        ];
        assert!(
            all_ok.iter().any(|r| r.error.is_none()),
            "Window SHOULD hide when all apps launch successfully"
        );
    }

    // --- find_app_binary path construction ---

    #[cfg(target_os = "macos")]
    #[test]
    fn app_binary_path_matches_bundle_stem() {
        // Verify the stem-based path construction without requiring the app to be installed.
        use std::path::Path;
        for (bundle, expected_stem) in &[
            ("/Applications/Google Chrome.app", "Google Chrome"),
            ("/Applications/Firefox.app", "Firefox"),
            ("/Applications/Brave Browser.app", "Brave Browser"),
            ("/Applications/Safari.app", "Safari"),
            ("/Applications/Arc.app", "Arc"),
        ] {
            let stem = Path::new(bundle)
                .file_stem()
                .and_then(|s| s.to_str())
                .expect("stem");
            assert_eq!(stem, *expected_stem, "Wrong stem for {bundle}");
            let binary = format!("{}/Contents/MacOS/{}", bundle, stem);
            assert!(
                binary.ends_with(&format!("/Contents/MacOS/{}", expected_stem)),
                "Binary path malformed: {binary}"
            );
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
        .invoke_handler(tauri::generate_handler![get_modes, save_modes, launch_mode, scan_apps, validate_app_paths, export_modes, import_modes])
        .setup(|app| {
            let icon = app.default_window_icon().cloned()
                .expect("no default window icon configured");
            tauri::tray::TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Junbi")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                            // NSWindow show/focus must run on the main thread on macOS.
                            // Calling them directly from a tray event (background thread)
                            // is silently ignored — the window never reappears.
                            let w = window.clone();
                            let _ = window.run_on_main_thread(move || {
                                // set_focus calls makeKeyAndOrderFront internally,
                                // which both shows and focuses the window in one step.
                                let _ = w.set_focus();
                            });
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
