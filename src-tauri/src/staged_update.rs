//! Automatic updates, the NetsuCast way: download in the background during one session, install
//! at the start of the next, before anything plays. Nothing is interrupted, and the next launch
//! simply opens on the new version.
//!
//! The installer is checked twice against the updater key of tauri.conf.json: by the updater
//! plugin when it downloads, and again here right before it runs, since the file waited on disk
//! in between.

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

const INSTALLER: &str = "installer.exe";
const MANIFEST: &str = "staged.json";

#[derive(Serialize, Deserialize)]
struct Staged {
    version: String,
    /// The release signature, as latest.json gives it (base64 of the minisign text).
    signature: String,
}

fn staging_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_cache_dir().ok().map(|dir| dir.join("update"))
}

fn read_staged(app: &AppHandle) -> Option<(PathBuf, Staged)> {
    let dir = staging_dir(app)?;
    let staged: Staged = serde_json::from_str(&fs::read_to_string(dir.join(MANIFEST)).ok()?).ok()?;
    dir.join(INSTALLER).is_file().then_some((dir, staged))
}

fn discard(app: &AppHandle) {
    if let Some(dir) = staging_dir(app) {
        let _ = fs::remove_dir_all(dir);
    }
}

/// Looks for a newer release and, when there is one, downloads its installer (the plugin checks
/// the signature) into the cache. Returns the version now waiting for the next launch.
#[tauri::command]
pub async fn stage_update(app: AppHandle) -> Result<Option<String>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let Some(update) = update else { return Ok(None) };
    if read_staged(&app).is_some_and(|(_, staged)| staged.version == update.version) {
        return Ok(Some(update.version));
    }
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    let dir = staging_dir(&app).ok_or("No cache directory")?;
    discard(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(INSTALLER), &bytes).map_err(|e| e.to_string())?;
    let staged = Staged { version: update.version.clone(), signature: update.signature.clone() };
    fs::write(dir.join(MANIFEST), serde_json::to_string(&staged).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(Some(update.version))
}

/// "Update now" on an update already downloaded: same path as the next launch would take.
#[tauri::command]
pub fn install_staged_update(app: AppHandle) -> Result<(), String> {
    match run_staged(&app)? {
        true => Ok(()),
        false => Err("No update is waiting".into()),
    }
}

/// Called at startup. Returns only when there was nothing to install; otherwise the installer
/// takes over and this process exits.
pub fn install_at_launch(app: &AppHandle) {
    if let Err(error) = run_staged(app) {
        eprintln!("staged update not installed: {error}");
        discard(app);
    }
}

fn run_staged(app: &AppHandle) -> Result<bool, String> {
    let Some((dir, staged)) = read_staged(app) else { return Ok(false) };
    let current = &app.package_info().version;
    let waiting = semver::Version::parse(&staged.version).map_err(|e| e.to_string())?;
    if waiting <= *current {
        discard(app); // installed by now, or older than what runs
        return Ok(false);
    }
    let installer = dir.join(INSTALLER);
    let bytes = fs::read(&installer).map_err(|e| e.to_string())?;
    verify(app, &bytes, &staged.signature)?;
    // The same arguments the updater plugin gives the NSIS installer: passive UI, update mode
    // (keeps settings, skips the maintenance page), and relaunch NetsuCast once done.
    std::process::Command::new(&installer)
        .args(["/P", "/UPDATE", "/R"])
        .spawn()
        .map_err(|e| e.to_string())?;
    std::process::exit(0);
}

fn verify(app: &AppHandle, bytes: &[u8], signature: &str) -> Result<(), String> {
    let pubkey = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .ok_or("No updater public key")?;
    verify_with(pubkey, bytes, signature)
}

/// minisign check, as the updater plugin does it: both the key and the signature arrive as base64
/// of the minisign text.
fn verify_with(pubkey: &str, bytes: &[u8], signature: &str) -> Result<(), String> {
    let b64 = base64::engine::general_purpose::STANDARD;
    let text = |value: &str| -> Result<String, String> {
        String::from_utf8(b64.decode(value.trim()).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
    };
    let key = PublicKey::decode(&text(pubkey)?).map_err(|e| e.to_string())?;
    let signature = Signature::decode(&text(signature)?).map_err(|e| e.to_string())?;
    key.verify(bytes, &signature, true).map_err(|e| e.to_string())
}

/// Automatic updates turned off: what was downloaded does not install at the next launch.
#[tauri::command]
pub fn discard_staged_update(app: AppHandle) {
    discard(&app);
}
