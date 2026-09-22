mod receiver;
mod settings;
mod tools;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_mpv::init())
        .manage(receiver::ReceiverState(Mutex::new(Default::default())))
        .setup(|app| {
            let settings = settings::load(app.handle());
            receiver::start(app.handle().clone(), settings.receiver_port);
            app.manage(settings::SettingsState(Mutex::new(settings)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            tools::get_environment,
            tools::update_ytdlp,
            tools::list_browsers,
            tools::open_browser_extensions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
