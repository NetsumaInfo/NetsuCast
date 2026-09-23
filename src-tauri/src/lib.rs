mod child_job;
mod compare;
mod gpu;
mod receiver;
mod settings;
mod staged_update;
mod tools;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_mpv::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(receiver::ReceiverState(Mutex::new(Default::default())))
        .setup(|app| {
            // An update downloaded last session installs now, before anything plays.
            staged_update::install_at_launch(app.handle());
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
            compare::compare_shader,
            staged_update::stage_update,
            staged_update::install_staged_update,
            staged_update::discard_staged_update,
            child_job::bind_to_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
