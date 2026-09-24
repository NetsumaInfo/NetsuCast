mod background;
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
        // First, so a second launch (Start menu, a `netsucast://` link from the extension) is
        // caught before anything else starts: it only brings the running window back.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| background::show_main(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_mpv::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("NetsuCast")
                .args([background::BACKGROUND_ARG])
                .build(),
        )
        .manage(receiver::ReceiverState(Mutex::new(Default::default())))
        .manage(receiver::LinkState(Mutex::new(Default::default())))
        .manage(background::TrayItems::new())
        .setup(|app| {
            // An update downloaded last session installs now, before anything plays.
            staged_update::install_at_launch(app.handle());
            // The installer registers netsucast:// for installed builds; a development build
            // registers its own executable so the extension can start it too.
            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            let settings = settings::load(app.handle());
            receiver::start(app.handle().clone(), settings.receiver_port);
            background::apply_launch_at_login(app.handle(), settings.launch_at_login);
            app.manage(settings::SettingsState(Mutex::new(settings)));
            background::create_tray(app.handle())?;
            background::show_unless_background(app.handle());
            Ok(())
        })
        .on_window_event(background::on_window_event)
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
            background::set_tray_labels,
            receiver::frontend_ready,
            receiver::set_extension_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
