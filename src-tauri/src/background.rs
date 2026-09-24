//! NetsuCast stays ready for the extension. With "Start with Windows" (on by default) it starts
//! hidden at login, closing the window hides it instead of quitting, and a tray icon opens it or
//! quits. A cast, a second launch or a `netsucast://` link from the extension brings the window
//! back (single instance, see lib.rs).

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Window, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

use crate::settings::SettingsState;

/// Passed by the login entry: start without showing the window.
pub const BACKGROUND_ARG: &str = "--background";

/// The tray menu entries, kept to translate them once the interface language is known.
pub struct TrayItems(Mutex<Option<(MenuItem<tauri::Wry>, MenuItem<tauri::Wry>)>>);

impl TrayItems {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Shows the window unless Windows started NetsuCast at login.
pub fn show_unless_background(app: &AppHandle) {
    if !std::env::args().any(|arg| arg == BACKGROUND_ARG) {
        show_main(app);
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    // English until the interface sends its own words (set_tray_labels).
    let open = MenuItem::with_id(app, "open", "Open NetsuCast", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("NetsuCast")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    *app.state::<TrayItems>().0.lock().unwrap() = Some((open, quit));
    Ok(())
}

#[tauri::command]
pub fn set_tray_labels(items: State<TrayItems>, open: String, quit: String) {
    if let Some((open_item, quit_item)) = items.0.lock().unwrap().as_ref() {
        let _ = open_item.set_text(open);
        let _ = quit_item.set_text(quit);
    }
}

/// Closing the window while NetsuCast starts with Windows hides it: the extension can still
/// cast. The interface is told, so it stops the video and goes home.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else { return };
    let keep_running = window.app_handle().state::<SettingsState>().0.lock().unwrap().launch_at_login;
    if keep_running {
        api.prevent_close();
        let _ = window.hide();
        let _ = window.emit("went-background", ());
    }
}

/// Mirrors the setting in the Windows login entry. Installed builds only: a development build
/// must never register its target\debug executable to start with Windows.
pub fn apply_launch_at_login(app: &AppHandle, enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let autolaunch = app.autolaunch();
    let _ = if enabled { autolaunch.enable() } else { autolaunch.disable() };
}
