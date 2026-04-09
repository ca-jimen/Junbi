/// Verifies the build output directory is not inside a OneDrive-synced folder.
///
/// Windows Application Control (WDAC) blocks execution of compiled build scripts
/// placed in cloud-synced directories, causing cryptic os error 4551 failures.
/// This project lives in OneDrive, so .cargo/config.toml must redirect target-dir
/// to a local (non-synced) path.
#[test]
fn target_dir_is_not_in_onedrive() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR must be set by cargo");

    let in_onedrive = manifest_dir
        .to_lowercase()
        .contains("onedrive");

    if !in_onedrive {
        // Project is not in OneDrive; no redirect needed.
        return;
    }

    // Project IS in OneDrive. Verify that either:
    // 1. CARGO_TARGET_DIR env var is set to a non-OneDrive path, OR
    // 2. src-tauri/.cargo/config.toml exists with a target-dir setting
    let cargo_target_dir = std::env::var("CARGO_TARGET_DIR").unwrap_or_default();
    let target_dir_redirected = !cargo_target_dir.is_empty()
        && !cargo_target_dir.to_lowercase().contains("onedrive");

    let config_path = std::path::Path::new(&manifest_dir)
        .join(".cargo")
        .join("config.toml");
    let config_has_redirect = if config_path.exists() {
        let contents = std::fs::read_to_string(&config_path).unwrap_or_default();
        contents.contains("target-dir")
            && contents
                .lines()
                .find(|l| l.contains("target-dir"))
                .map(|l| !l.to_lowercase().contains("onedrive"))
                .unwrap_or(false)
    } else {
        false
    };

    assert!(
        target_dir_redirected || config_has_redirect,
        "Project is inside OneDrive ({manifest_dir}) but cargo target-dir is not redirected \
         to a local path. Windows Application Control will block build scripts (os error 4551). \
         Fix: ensure src-tauri/.cargo/config.toml contains:\n\
         [build]\n\
         target-dir = \"C:/cargo-target/junbi\""
    );
}
