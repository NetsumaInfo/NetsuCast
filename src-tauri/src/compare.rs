//! Before/after comparison: see src/shaders/compare.glsl for why the line position is baked
//! into the file instead of being a shader parameter.

use std::fs;
use tauri::{AppHandle, Manager};

const TEMPLATE: &str = include_str!("shaders/compare.glsl");

/// Writes the comparison shader for a line at `split` (0 to 1 across the picture) and returns
/// its path. Positions are rounded to 0.5 %: each distinct file costs mpv one small compile, and
/// files already written are reused.
#[tauri::command]
pub fn compare_shader(app: AppHandle, split: f64) -> Result<String, String> {
    let step = (split.clamp(0.0, 1.0) * 200.0).round() as u32;
    let value = format!("{:.3}", step as f64 / 200.0);
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("shaders-compare");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(format!("compare_{step:03}.glsl"));
    if !target.is_file() {
        fs::write(&target, TEMPLATE.replace("NC_SPLIT", &value)).map_err(|e| e.to_string())?;
    }
    let text = target.to_string_lossy();
    Ok(text.strip_prefix(r"\\?\").unwrap_or(&text).to_string())
}
