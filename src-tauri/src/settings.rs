use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub const DEFAULT_RECEIVER_PORT: u16 = 47800;
/// Bumped when a default changes in a way existing settings files must pick up.
const DEFAULTS_VERSION: u32 = 2;

/// Everything the settings window edits. Stored as JSON in the app config dir; a missing or
/// partial file falls back field by field to the defaults below.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub defaults_version: u32,
    /// "off" or an ArtCNN shader name without prefix/extension ("C4F32_DS"…).
    pub model: String,
    /// Run ArtCNN even when the window is not bigger than the video: the 2x result is then
    /// scaled back down, which still denoises and sharpens.
    pub force_upscale: bool,
    /// "auto": a second ArtCNN pass (x4) when the window is still much bigger than the x2
    /// result; "x2": one pass only.
    pub upscale_scale: String,
    /// Upper bound on the source height requested from yt-dlp. 0 = best available.
    pub max_height: u32,
    /// "auto-safe" or "no".
    pub hwdec: String,
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
            defaults_version: DEFAULTS_VERSION,
            model: "C4F32_DS".into(),
            force_upscale: true,
            upscale_scale: "auto".into(),
            max_height: 1080,
            hwdec: "auto-safe".into(),
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
    let mut settings: Settings = settings_file(app)
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    // Files written before v2 predate the 1080p source + DS model + forced upscale defaults.
    if settings.defaults_version < DEFAULTS_VERSION {
        let fresh = Settings::default();
        settings.model = fresh.model;
        settings.force_upscale = fresh.force_upscale;
        settings.max_height = fresh.max_height;
        settings.defaults_version = DEFAULTS_VERSION;
    }
    settings
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
