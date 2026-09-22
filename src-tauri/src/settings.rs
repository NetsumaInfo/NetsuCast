use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub const DEFAULT_RECEIVER_PORT: u16 = 47800;

/// Everything the settings window edits. Stored as JSON in the app config dir; a missing or
/// partial file falls back field by field to the defaults below.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "off" or an ArtCNN shader name without prefix/extension ("C4F32_DS"…).
    pub model: String,
    /// Upper bound on the source height requested from yt-dlp. 0 = best available.
    pub max_height: u32,
    /// "auto-safe" or "no".
    pub hwdec: String,
    /// "auto" or "nvidia" (forces the discrete GPU on hybrid laptops).
    pub gpu: String,
    /// Debanding smooths the colour steps that heavy web compression leaves behind.
    pub deband: bool,
    /// Preferred subtitle languages, comma separated ("fr,en"). Empty = never auto-select.
    pub sub_langs: String,
    /// Also fetch auto-generated captions (YouTube).
    pub auto_subs: bool,
    pub volume: f64,
    pub receiver_port: u16,
    /// Overrides for the bundled tools. Empty = auto-detect.
    pub mpv_path: String,
    pub ytdlp_path: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            model: "C4F32".into(),
            max_height: 2160,
            hwdec: "auto-safe".into(),
            gpu: "auto".into(),
            deband: true,
            sub_langs: "fr,en".into(),
            auto_subs: false,
            volume: 100.0,
            receiver_port: DEFAULT_RECEIVER_PORT,
            mpv_path: String::new(),
            ytdlp_path: String::new(),
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

fn settings_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    settings_file(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_settings(state: State<SettingsState>) -> Settings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<SettingsState>,
    settings: Settings,
) -> Result<(), String> {
    let path = settings_file(&app).ok_or("No config directory")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = settings;
    Ok(())
}
