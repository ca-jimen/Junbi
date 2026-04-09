use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri_plugin_store::StoreExt;

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

#[tauri::command]
fn launch_mode(mode_id: String, app: tauri::AppHandle) -> Result<(), String> {
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

    let mut errors: Vec<String> = Vec::new();
    for entry in &mode.apps {
        if let Err(e) = Command::new(&entry.path).args(&entry.args).spawn() {
            errors.push(format!("{}: {}", entry.name, e));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("Some apps failed to launch:\n{}", errors.join("\n")))
    }
}

#[tauri::command]
fn scan_apps() -> Result<Vec<DiscoveredApp>, String> {
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

    serde_json::from_str(json).map_err(|e| format!("Parse error: {e}\nOutput: {json}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_modes, save_modes, launch_mode, scan_apps])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
