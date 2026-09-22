//! Local "cast" receiver. The NetsuCast Chrome extension POSTs the stream it detected to
//! http://127.0.0.1:<port>/cast and the player picks it up through the `cast` event.
//!
//! Only loopback is bound, and only extension origins (or no origin at all, e.g. curl) are
//! accepted: a web page must not be able to make the player open a URL of its choosing.

use serde::{Deserialize, Serialize};
use std::io::Read;
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Response, Server};

const MAX_BODY: u64 = 256 * 1024;

#[derive(Debug, Clone, Default, Serialize)]
pub struct ReceiverStatus {
    pub port: u16,
    pub error: Option<String>,
}

pub struct ReceiverState(pub Mutex<ReceiverStatus>);

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CastHeaders {
    pub referer: Option<String>,
    pub user_agent: Option<String>,
    pub cookie: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastRequest {
    pub url: String,
    /// "stream" = play `url` directly, "page" = let yt-dlp resolve it.
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub headers: CastHeaders,
    /// Position (seconds) the video had in the browser, to resume there.
    #[serde(default)]
    pub start: Option<f64>,
}

fn default_kind() -> String {
    "stream".into()
}

pub fn start(app: AppHandle, port: u16) {
    let server = match Server::http(("127.0.0.1", port)) {
        Ok(server) => server,
        Err(e) => {
            let message = format!("Port {port} indisponible : {e}");
            *app.state::<ReceiverState>().0.lock().unwrap() = ReceiverStatus { port, error: Some(message) };
            return;
        }
    };
    *app.state::<ReceiverState>().0.lock().unwrap() = ReceiverStatus { port, error: None };

    thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let response = handle(&app, &mut request);
            let _ = request.respond(response);
        }
    });
}

fn json(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
}

fn origin_allowed(request: &tiny_http::Request) -> bool {
    match request.headers().iter().find(|h| h.field.equiv("Origin")) {
        None => true,
        Some(h) => {
            let origin = h.value.as_str();
            origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://")
        }
    }
}

fn handle(app: &AppHandle, request: &mut tiny_http::Request) -> Response<std::io::Cursor<Vec<u8>>> {
    if !origin_allowed(request) {
        return json(403, r#"{"error":"origin not allowed"}"#);
    }

    match (request.method(), request.url()) {
        (Method::Get, "/ping") => json(
            200,
            &format!(r#"{{"app":"NetsuCast","version":"{}"}}"#, env!("CARGO_PKG_VERSION")),
        ),
        // Sent by the extension when it is installed or Chrome starts: lets the app know the
        // extension exists, so it can stop showing the install guide.
        (Method::Post, "/hello") => {
            let _ = app.emit("extension-hello", ());
            json(200, r#"{"ok":true}"#)
        }
        (Method::Post, "/cast") => {
            let mut body = String::new();
            if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
                return json(400, r#"{"error":"unreadable body"}"#);
            }
            let cast: CastRequest = match serde_json::from_str(&body) {
                Ok(cast) => cast,
                Err(_) => return json(400, r#"{"error":"invalid JSON"}"#),
            };
            // Network URLs only: a local path or an mpv protocol (`av://`, `lavfi://`…) has no
            // business arriving from a browser.
            let lower = cast.url.to_ascii_lowercase();
            if !(lower.starts_with("http://") || lower.starts_with("https://")) {
                return json(400, r#"{"error":"only http(s) URLs"}"#);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("cast", cast);
            json(200, r#"{"ok":true}"#)
        }
        _ => json(404, r#"{"error":"not found"}"#),
    }
}
