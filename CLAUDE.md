# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Junbi is a desktop application built with **Tauri 2 + React 19 + Vite**. The frontend (React/JSX) runs in a WebView, and the backend is a Rust binary. They communicate via Tauri's IPC command system.

## Prerequisites (Windows)

Rust compilation requires **Visual Studio Build Tools** with the "Desktop development with C++" workload and Windows 10/11 SDK. Install from: https://aka.ms/vs/buildtools

Without these, all `cargo` commands and `npm run tauri dev` will fail with missing `kernel32.lib` / linker errors.

> **Note:** Git's `link.exe` (`C:\Program Files\Git\usr\bin\link.exe`) shadows MSVC's linker. This is automatically resolved once VS Build Tools are installed, as Rust locates MSVC's linker via the Windows registry.

> **Note:** This project lives in an OneDrive-synced folder. Windows Application Control blocks execution of compiled build scripts in cloud-synced paths. `src-tauri/.cargo/config.toml` redirects all build artifacts to `C:/cargo-target/junbi` to avoid this.

## Verification Checks

**Always run these before finishing any code changes:**

```bash
# 1. Check Rust backend (must pass with zero errors)
cd src-tauri && cargo check

# 2. Run Rust tests
cd src-tauri && cargo test

# 3. Check frontend (must build with zero errors)
npm run build

# 4. Verify full app starts (run and interrupt once the window opens or Rust compilation succeeds)
npm run tauri dev
```

All four must pass cleanly. `cargo check` catches Rust type/compile errors. `cargo test` runs integration tests (including the OneDrive build-env guard). `npm run build` catches all JS/JSX errors. `npm run tauri dev` catches integration issues (missing cargo in PATH, Tauri config errors, etc.) — run it and confirm the window launches, then interrupt with Ctrl+C.

## Commands

### Development
```bash
npm run tauri dev       # Start full app (launches Vite dev server + Rust backend)
npm run dev             # Frontend only (Vite at http://localhost:1420)
```

### Build
```bash
npm run tauri build     # Production build (bundles frontend, compiles Rust, packages installer)
npm run build           # Frontend only (outputs to dist/)
```

### Rust backend
```bash
cd src-tauri && cargo check     # Type-check Rust without full compile
cd src-tauri && cargo build     # Compile Rust backend only
```

## Architecture

### Frontend (`src/`)
- `main.jsx` — React entry point, imports `index.css` (Tailwind), mounts `<App>`
- `App.jsx` — Layout shell; manages `view` state (`"home"` | `"settings"`) and `modes` array
- `store.js` — Wrapper around `@tauri-apps/plugin-store`; `getModes()` seeds defaults on first run, `saveModes()` persists
- `components/` — `HomeView`, `ModeCard`, `SettingsView`, `AppRow`, `AddModeModal`, `AddAppModal`

### Backend (`src-tauri/src/`)
- `lib.rs` — All Tauri commands (`get_modes`, `save_modes`, `launch_mode`) and plugin initialization; register new commands in `invoke_handler!()`
- `main.rs` — Binary entry point; calls `tauri_app_lib::run()`

### Data model
Modes are stored via `tauri-plugin-store` in `junbi.json` (OS app data directory) under key `"modes"`:
```
Mode { id, name, icon (emoji), apps: AppEntry[] }
AppEntry { id, name, path (exe path), args }
```

### Configuration
- `src-tauri/tauri.conf.json` — Window config, app identifier, build hooks, bundle targets
- `src-tauri/Cargo.toml` — Rust dependencies
- `src-tauri/capabilities/default.json` — Tauri security permissions
- `vite.config.js` — Vite config; dev server locked to port 1420 (required by Tauri)

## Tauri IPC Pattern

To add a new backend command:
1. Define it in `src-tauri/src/lib.rs` with `#[tauri::command]`
2. Register it in `invoke_handler!(tauri::generate_handler![..., new_command])`
3. Call it from React: `await invoke("new_command", { arg1, arg2 })`

Store access in commands: inject `app: tauri::AppHandle`, then `app.store("junbi.json")?` (requires `use tauri_plugin_store::StoreExt`).
