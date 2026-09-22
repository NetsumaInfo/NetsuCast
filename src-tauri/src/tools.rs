use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};

use crate::receiver::ReceiverState;
use crate::settings::SettingsState;

/// What the player needs to start mpv. Paths are `None` when nothing was found, so the UI can
/// say what is missing instead of failing inside mpv.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub mpv_path: Option<String>,
    pub ytdlp_path: Option<String>,
    pub shaders_dir: Option<String>,
    pub receiver_port: u16,
    pub receiver_error: Option<String>,
}

/// Folders that may hold `tools\mpv\`: next to the executable (installed app), then the
/// repository root in debug builds (`pnpm tauri dev` runs from src-tauri\target\debug).
fn tool_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
        dirs.push(exe_dir.join("tools").join("mpv"));
    }
    if cfg!(debug_assertions) {
        dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("tools").join("mpv"));
    }
    dirs
}

fn find_tool(override_path: &str, file_name: &str) -> Option<PathBuf> {
    if !override_path.trim().is_empty() {
        let path = PathBuf::from(override_path.trim());
        return path.is_file().then_some(path);
    }
    tool_dirs()
        .into_iter()
        .map(|dir| dir.join(file_name))
        .find(|p| p.is_file())
        .or_else(|| find_in_path(file_name))
}

fn find_in_path(file_name: &str) -> Option<PathBuf> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(file_name))
            .find(|p| p.is_file())
    })
}

fn display(path: PathBuf) -> String {
    // canonicalize() on Windows yields `\\?\C:\…`, which mpv's path options do not accept.
    let canonical = path.canonicalize().unwrap_or(path);
    let text = canonical.to_string_lossy();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}

#[tauri::command]
pub fn get_environment(
    app: AppHandle,
    settings: State<SettingsState>,
    receiver: State<ReceiverState>,
) -> Environment {
    let settings = settings.0.lock().unwrap().clone();
    let shaders_dir = app
        .path()
        .resolve("resources/shaders", BaseDirectory::Resource)
        .ok()
        .filter(|p| p.is_dir());
    let receiver = receiver.0.lock().unwrap().clone();

    Environment {
        mpv_path: find_tool(&settings.mpv_path, "mpv.exe").map(display),
        ytdlp_path: find_tool(&settings.ytdlp_path, "yt-dlp.exe").map(display),
        shaders_dir: shaders_dir.map(display),
        receiver_port: receiver.port,
        receiver_error: receiver.error,
    }
}

/// yt-dlp breaks whenever a site changes its player; `-U` pulls the fix.
#[tauri::command]
pub async fn update_ytdlp(settings: State<'_, SettingsState>) -> Result<String, String> {
    let override_path = settings.0.lock().unwrap().ytdlp_path.clone();
    let path = find_tool(&override_path, "yt-dlp.exe").ok_or("yt-dlp introuvable")?;
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(path);
        cmd.arg("-U");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        Ok(text.lines().last().unwrap_or("OK").to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
